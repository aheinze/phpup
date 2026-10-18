import { ref, computed } from "vue";
import { readWorkspaceState } from "../lib/workspace";
import { Command } from "@tauri-apps/plugin-shell";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { resolveResource } from "@tauri-apps/api/path";
import type { Project, Group, RunningProcess, ProjectSettings } from "../types";

import { shellEscape, defaultSettings, parseSettings, serializeSettings, validateProjectSettings, launchArgs, validationCommand, atomicWriteCommand } from "../lib/projectConfig";

// Maximum output lines to keep per process
const MAX_OUTPUT_LINES = 1000;

function capOutput(output: string[]) {
  if (output.length > MAX_OUTPUT_LINES) {
    output.splice(0, output.length - MAX_OUTPUT_LINES);
  }
}

interface PhpupListedInstance { pid: string; path: string; port: string; url: string; }

// Global state
const groups = ref<Group[]>([]);
const projects = ref<Project[]>([]);
const selectedProject = ref<Project | null>(null);
const runningProcesses = ref<Map<string, RunningProcess>>(new Map());
const runningPids = ref<Map<string, string>>(new Map()); // projectId -> pid
const projectOutput = ref<string[]>([]);
const searchQuery = ref("");
const sidebarWidth = ref(220);
const lastSelectedProjectId = ref<string | null>(null);
const restartRequests = new Map<string, symbol>();
const restartingProjects = ref(new Set<string>());

// View state
const showSettings = ref(false);
const showCaddyfile = ref(false);
const showAddGroup = ref(false);
const showTools = ref(false);

// Caddyfile state
const caddyfileContent = ref("");
const caddyfileList = ref<string[]>([]);
const selectedCaddyfile = ref("");

// Settings state
const settings = ref<ProjectSettings>(defaultSettings());
const projectLogs = new Map<string, string[]>();
const pendingStarts = new Set<string>();
let selecting = 0;
let refreshing: Promise<void> | null = null;
let savingData = Promise.resolve();

// Notifications
const notifications = ref<Array<{ id: string; message: string; type: "error" | "warning" | "info" }>>([]);

// PHP extensions cache
const phpExtensions = ref<string[]>([]);

// Phpup state
const phpupCommand = ref("phpup");
const phpupReady = ref(false);

// Config paths
// Tests and portable launches can isolate state without replacing the user's HOME.
const configDir = '"${PHPUP_DESKTOP_CONFIG_DIR:-$HOME/.config/phpup-desktop}"';
const configFile = `${configDir}/projects.json`;

function useStore() {
  // Computed
  const filteredProjects = computed(() => {
    if (!searchQuery.value) return projects.value;
    const query = searchQuery.value.trim().toLowerCase();
    return projects.value.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.path.toLowerCase().includes(query)
    );
  });

  const ungroupedProjects = computed(() =>
    filteredProjects.value.filter((p) => !p.groupId)
  );

  const projectsByGroup = computed(() => {
    const map = new Map<string, Project[]>();
    for (const group of groups.value) {
      map.set(
        group.id,
        filteredProjects.value.filter((p) => p.groupId === group.id)
      );
    }
    return map;
  });

  // Phpup detection
  async function detectPhpup(): Promise<string> {
    try {
      const path = await resolveResource("phpup");
      const result = await Command.create("run-bash", ["-c", `test -f ${shellEscape(path)} && { test -x ${shellEscape(path)} || chmod +x ${shellEscape(path)}; }`]).execute();
      if (result.code === 0) return path;
    } catch { /* Fall back to a system installation. */ }
    const result = await Command.create("run-bash", ["-c", "command -v phpup"]).execute();
    if (result.code !== 0) throw new Error("phpup is unavailable. Install or rebuild the desktop bundle.");
    return result.stdout.trim();
  }

  // Data persistence
  async function loadProjects() {
    try {
      const command = Command.create("run-bash", [
        "-c",
        `if [ -f ${configFile} ]; then cat ${configFile}; else exit 44; fi`,
      ]);
      const result = await command.execute();
      if (result.code === 44) return;
      if (result.code !== 0) throw new Error(result.stderr || "Cannot read project list");
      if (result.stdout.trim()) {
        const data = JSON.parse(result.stdout);
        const items = Array.isArray(data) ? data : data.projects;
        const savedGroups = Array.isArray(data) ? [] : data.groups;
        if (!Array.isArray(items) || !items.every(p => p && typeof p.id === "string" && typeof p.name === "string" && typeof p.path === "string" && p.path.startsWith("/") && !/[\x00-\x1f\x7f]/.test(p.path)) || !Array.isArray(savedGroups) || !savedGroups.every(g => g && typeof g.id === "string" && typeof g.name === "string")) {
          throw new Error("Invalid project list format");
        }
        projects.value = items.map((p: Project) => ({ ...p, isRunning: false, status: "stopped", url: undefined }));
        groups.value = savedGroups;
        const workspace = readWorkspaceState(data.ui);
        lastSelectedProjectId.value = workspace.selectedProjectId;
        sidebarWidth.value = workspace.sidebarWidth;
        for (const project of projects.value) {
          const resolved = await Command.create("run-bash", ["-c", `cd ${shellEscape(project.path)} && pwd -P`]).execute();
          if (resolved.code === 0) project.path = resolved.stdout.trim();
        }
        refreshFavicons();
      } else throw new Error("Project list is empty or corrupt");
    } catch (e) {
      throw new Error(`Could not load ${configFile}. Existing data has been preserved. ${e}`);
    }
  }

  async function saveData() {
    if (!phpupReady.value) return;
    const json = JSON.stringify({ groups: groups.value, projects: projects.value, ui: { selectedProjectId: lastSelectedProjectId.value, sidebarWidth: sidebarWidth.value } }, null, 2);
    const write = async () => {
      const command = Command.create("run-bash", ["-c", `mkdir -p ${configDir} && tmp=$(mktemp ${configFile}.XXXXXX) && trap 'rm -f "$tmp"' EXIT && printf '%s' ${shellEscape(json)} > "$tmp" && chmod 600 "$tmp" && mv -f "$tmp" ${configFile}`]);
      try {
        const result = await command.execute();
        if (result.code !== 0) throw new Error(result.stderr);
      } catch (error) { addNotification("Could not save the project list: " + error, "error"); }
    };
    savingData = savingData.then(write, write);
    await savingData;
  }

  // Favicon detection
  async function detectFavicon(projectPath: string): Promise<string | undefined> {
    const faviconNames = [
      "favicon.ico",
      "favicon.png",
      "favicon.svg",
      "favicon.gif",
      "favicon.webp",
      "apple-touch-icon.png",
      "icon.png",
      "icon.ico",
    ];
    const publicDirs = ["public", "web", "www", "htdocs", "dist", "build", ""];

    for (const dir of publicDirs) {
      const basePath = dir ? `${projectPath}/${dir}` : projectPath;
      for (const name of faviconNames) {
        const cmd = Command.create("run-bash", [
          "-c",
          `test -f ${shellEscape(basePath + "/" + name)} && echo "found"`,
        ]);
        const result = await cmd.execute();
        if (result.stdout.trim() === "found") {
          return `${basePath}/${name}`;
        }
      }
    }
    return undefined;
  }

  async function refreshFavicons() {
    let updated = false;
    for (const project of projects.value) {
      if (!project.favicon) {
        const favicon = await detectFavicon(project.path);
        if (favicon) {
          project.favicon = favicon;
          updated = true;
        }
      }
    }
    if (updated) {
      saveData();
    }
  }

  // Project config
  async function readProjectSettings(project: Pick<Project, "path">): Promise<{ config: string; hasConfig: boolean; settings: ProjectSettings }> {
    const result = await Command.create("run-bash", ["-c", `if [ -f ${shellEscape(project.path + "/.phpup/config")} ]; then cat ${shellEscape(project.path + "/.phpup/config")}; else exit 44; fi`]).execute();
    if (result.code !== 0 && result.code !== 44) throw new Error("Cannot read project configuration: " + result.stderr);
    const defaults = defaultSettings();
    const docroot = await Command.create("run-bash", ["-c", `cd ${shellEscape(project.path)} && for d in public web www .; do [ -d "$d" ] && printf '%s' "$d" && break; done`]).execute();
    if (docroot.code !== 0) throw new Error("Project folder is unavailable");
    defaults.docroot = docroot.stdout.trim() || ".";
    return { config: result.stdout, hasConfig: result.code === 0, settings: parseSettings(result.stdout, defaults) };
  }

  async function checkProjectConfig(path: string) {
    const result = await readProjectSettings({ path });
    return { hasConfig: result.hasConfig, port: result.settings.port, docroot: result.settings.docroot };
  }

  // Project management
  async function addProject() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select PHP Project Folder",
    });

    if (!selected) return;

    const resolved = await Command.create("run-bash", ["-c", `cd ${shellEscape(selected as string)} && pwd -P`]).execute();
    if (resolved.code !== 0) { addNotification("Project folder is unavailable", "error"); return; }
    const path = resolved.stdout.trim();
    const name = path.split("/").pop() || path;

    if (projects.value.some((p) => p.path === path)) {
      alert("Project already exists");
      return;
    }

    const { hasConfig, port: configPort, docroot: configDocroot } =
      await checkProjectConfig(path);
    const favicon = await detectFavicon(path);

    const project: Project = {
      id: Date.now().toString(),
      name,
      path,
      port: configPort,
      isRunning: false,
      status: "stopped",
      hasConfig,
      docroot: configDocroot,
      favicon,
    };

    projects.value.push(project);
    saveData();
    selectProject(project);
  }

  function renameProject(project: Project, name: string) {
    project.name = name;
    saveData();
  }

  async function removeProject(project: Project) {
    if (project.isRunning || project.status === "starting" || project.status === "stopping") {
      if (!await stopProject(project)) return;
    }
    projects.value = projects.value.filter((p) => p.id !== project.id);
    if (selectedProject.value?.id === project.id) {
      selectedProject.value = null;
    }
    saveData();
  }

  async function loadProjectSettings(project: Project) {
    const result = await readProjectSettings(project);
    if (selectedProject.value?.id === project.id) settings.value = result.settings;
    return result.settings;
  }

  async function selectProject(project: Project) {
    const request = ++selecting;
    selectedProject.value = project;
    lastSelectedProjectId.value = project.id;
    void saveData();
    showSettings.value = false; showCaddyfile.value = false; showTools.value = false;
    settings.value = defaultSettings();
    caddyfileContent.value = ""; caddyfileList.value = []; selectedCaddyfile.value = "";
    projectOutput.value = projectLogs.get(project.id) || [];
    try {
      const result = await readProjectSettings(project);
      if (request !== selecting) return;
      settings.value = result.settings;
      project.hasConfig = result.hasConfig;
      if (!project.isRunning) project.port = result.settings.port;
      project.docroot = result.settings.docroot;
    } catch (error) { if (request === selecting) addNotification(String(error), "error"); }
  }

  async function initProject(project: Project) {
    const result = await Command.create("run-bash", ["-c", `cd ${shellEscape(project.path)} && ${shellEscape(phpupCommand.value)} --init 2>&1`]).execute();
    const output = [result.stdout || result.stderr];
    projectLogs.set(project.id, output);
    if (result.code !== 0) {
      if (selectedProject.value?.id === project.id) projectOutput.value = output;
      addNotification("Initialization failed: " + output.join(""), "error");
      return false;
    }
    if (selectedProject.value?.id === project.id) await selectProject(project);
    await saveData();
    return true;
  }

  async function saveSettings(): Promise<boolean> {
    const project = selectedProject.value;
    if (!project) return false;
    const snapshot = { ...settings.value };
    const errors = validateProjectSettings(snapshot);
    if (errors.length) { addNotification(errors.join("; "), "error"); return false; }
    try {
      const existing = await readProjectSettings(project);
      const path = project.path + "/.phpup/config";
      const result = await Command.create("run-bash", ["-c", `mkdir -p ${shellEscape(project.path + "/.phpup")} && ${atomicWriteCommand(path, serializeSettings(snapshot, existing.config))}`]).execute();
      if (result.code !== 0) throw new Error(result.stderr || "Configuration write failed");
      if (!project.isRunning) project.port = snapshot.port;
      project.docroot = snapshot.docroot; project.hasConfig = true;
      await saveData();
      if (selectedProject.value?.id === project.id) {
        showSettings.value = false;
        projectOutput.value.push(project.isRunning ? "Settings saved. Restart the server to apply them.\n" : "Settings saved.\n");
      }
      return true;
    } catch (error) { addNotification(String(error), "error"); return false; }
  }

  // Caddyfile management
  async function loadCaddyfile() {
    const project = selectedProject.value;
    if (!project) return;

    const phpupDir = project.path + "/.phpup/";
    const listCmd = Command.create("run-bash", [
      "-c",
      `for file in ${shellEscape(phpupDir)}Caddyfile*; do [ ! -f "$file" ] || basename "$file"; done`,
    ]);
    const listResult = await listCmd.execute();
    if (selectedProject.value?.id !== project.id) return;
    const files = listResult.stdout.trim().split("\n").filter((f) => /^Caddyfile(\.[a-zA-Z0-9_-]+)?$/.test(f));

    caddyfileList.value = files.length > 0 ? files : ["Caddyfile"];
    selectedCaddyfile.value = caddyfileList.value[0];

    await loadSelectedCaddyfile();
    if (selectedProject.value?.id !== project.id) return;
    showCaddyfile.value = true;
    showSettings.value = false;
  }

  async function loadSelectedCaddyfile() {
    const project = selectedProject.value;
    const name = selectedCaddyfile.value;
    if (!project || !name) return;

    // Validate Caddyfile name to prevent path traversal
    if (!/^Caddyfile(\.[a-zA-Z0-9_-]+)?$/.test(selectedCaddyfile.value)) {
      console.error("Invalid Caddyfile name:", selectedCaddyfile.value);
      return;
    }

    const caddyfilePath = project.path + "/.phpup/" + name;
    const command = Command.create("run-bash", [
      "-c",
      `cat ${shellEscape(caddyfilePath)} 2>/dev/null`,
    ]);
    const result = await command.execute();
    if (selectedProject.value?.id === project.id && selectedCaddyfile.value === name) caddyfileContent.value = result.stdout || "";
  }

  async function saveCaddyfile(): Promise<boolean> {
    const project = selectedProject.value;
    const name = selectedCaddyfile.value;
    const content = caddyfileContent.value;
    if (!project || !/^Caddyfile(\.[a-zA-Z0-9_-]+)?$/.test(name)) return false;
    const validation = await validateCaddyfile(project, name, content);
    if (!validation.valid) { addNotification(validation.error, "error"); return false; }
    try {
      const result = await Command.create("run-bash", ["-c", atomicWriteCommand(project.path + "/.phpup/" + name, content)]).execute();
      if (result.code !== 0) throw new Error(result.stderr || "Write failed");
    } catch (error) { addNotification("Could not save Caddyfile: " + error, "error"); return false; }
    if (selectedProject.value?.id === project.id && caddyfileContent.value === content) {
      showCaddyfile.value = false;
      projectOutput.value.push(`${name} saved.\n`);
    }
    return true;
  }

  function validateSettings(): string[] { return validateProjectSettings(settings.value); }

  // Notification helpers
  function addNotification(message: string, type: "error" | "warning" | "info" = "info") {
    const id = crypto.randomUUID();
    notifications.value.push({ id, message, type });
    if (type !== "error") setTimeout(() => {
      notifications.value = notifications.value.filter((n) => n.id !== id);
    }, 8000);
  }

  function dismissNotification(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  const portConflict = ref<{ project: Project; suggestedPort: string } | null>(null);

  function clearOutput() {
    const project = selectedProject.value;
    if (!project) return;
    const lines = projectLogs.get(project.id);
    if (lines) lines.splice(0);
    projectOutput.value = [];
  }

  async function startProject(project: Project, overridePort?: string, restartToken?: symbol) {
    if (restartRequests.has(project.id) && restartRequests.get(project.id) !== restartToken) return;
    if (project.isRunning || project.status === "starting" || pendingStarts.has(project.id) || project.status === "stopping") return;
    pendingStarts.add(project.id);
    project.status = "starting";
    try {
      if (showSettings.value && selectedProject.value?.id === project.id && !await saveSettings()) {
        project.status = "stopped";
        return;
      }
      const snapshot = (await readProjectSettings(project)).settings;
      if ((project.status as string) === "stopping") return;
      if (overridePort) snapshot.port = overridePort;
      const errors = validateProjectSettings(snapshot);
      if (errors.length) throw new Error(errors.join("; "));
      const args = [...launchArgs(snapshot), "--verbose"];
      const cmdString = `cd ${shellEscape(project.path)} && exec ${shellEscape(phpupCommand.value)} ${args.map(shellEscape).join(" ")}`;
      const output: string[] = ["Starting server...\n"];
      projectLogs.set(project.id, output);
      if (selectedProject.value?.id === project.id) projectOutput.value = [...output];
      const append = (data: string) => {
        output.push(data.endsWith("\n") ? data : data + "\n");
        capOutput(output);
        if (selectedProject.value?.id === project.id) projectOutput.value = [...output];
      };
      const command = Command.create("run-bash", ["-c", cmdString]);
      let ended = false;
      command.stdout.on("data", (data: string) => {
        append(data);
        const ready = /^\[phpup:ready\] (https?:\/\/\S+)/m.exec(data);
        if (ready && project.status !== "stopping") {
          const url = new URL(ready[1]);
          project.url = url.origin;
          project.port = url.port || (url.protocol === "https:" ? "443" : "80");
          project.isRunning = true;
          project.status = "running";
        }
      });
      command.stderr.on("data", append);
      command.on("close", (payload) => {
        ended = true;
        const expected = project.status === "stopping";
        project.isRunning = false;
        project.url = undefined;
        runningProcesses.value.delete(project.id);
        runningPids.value.delete(project.id);
        project.status = !expected && payload.code !== 0 ? "crashed" : "stopped";
        append(project.status === "crashed" ? `[Server failed: exit ${payload.code}]` : "[Server stopped]");
        if (project.status === "crashed") addNotification(`${project.name} failed. See its server log.`, "error");
      });
      command.on("error", (error) => {
        ended = true;
        project.status = "crashed"; project.isRunning = false;
        runningProcesses.value.delete(project.id);
        append(`[Error: ${error}]`);
        addNotification(`${project.name}: ${error}`, "error");
      });
      const child = await command.spawn();
      if (!ended) {
        runningProcesses.value.set(project.id, { project, child, output });
        if ((project.status as string) === "stopping") await signalChild(child.pid);
      }
    } catch (error) {
      project.isRunning = false; project.status = "crashed";
      addNotification(`Could not start ${project.name}: ${error}`, "error");
    } finally { pendingStarts.delete(project.id); }
  }

  async function restartProject(project: Project) {
    if (project.status !== "running" || restartRequests.has(project.id)) return;
    const token = Symbol(project.id);
    restartRequests.set(project.id, token);
    restartingProjects.value.add(project.id);
    try {
      // Validate first so invalid settings never take a working server offline.
      if (showSettings.value && selectedProject.value?.id === project.id && !await saveSettings()) return;
      const snapshot = (await readProjectSettings(project)).settings;
      const errors = validateProjectSettings(snapshot);
      if (errors.length) throw new Error(errors.join("; "));
      const preflight = await Command.create("run-bash", ["-c",
        `cd ${shellEscape(project.path)} && ${shellEscape(phpupCommand.value)} ${[...launchArgs(snapshot), "--dry-run"].map(shellEscape).join(" ")}`
      ]).execute();
      if (preflight.code !== 0) throw new Error(preflight.stderr || preflight.stdout || "Restart preflight failed");
      if (restartRequests.get(project.id) !== token) return;
      if (await stopProject(project, token) && restartRequests.get(project.id) === token) {
        await startProject(project, undefined, token);
      }
    } catch (error) { addNotification(`Could not restart ${project.name}: ${error}`, "error"); }
    finally {
      if (restartRequests.get(project.id) === token) restartRequests.delete(project.id);
      restartingProjects.value.delete(project.id);
    }
  }

  async function signalChild(pid: number) {
    if (!Number.isSafeInteger(pid) || pid < 2) throw new Error("Invalid managed process ID");
    const result = await Command.create("run-bash", ["-c", `kill -TERM ${pid} 2>/dev/null`]).execute();
    return result.code === 0;
  }

  async function listPhpupInstances(): Promise<PhpupListedInstance[]> {
    const result = await Command.create("run-bash", ["-c", `${shellEscape(phpupCommand.value)} --list --json`]).execute();
    if (result.code !== 0) throw new Error("Cannot read phpup status. Rebuild the desktop bundle or update the installed phpup.");
    const data: unknown = JSON.parse(result.stdout);
    if (!Array.isArray(data)) throw new Error("Invalid phpup status response");
    return data.filter((instance): instance is PhpupListedInstance =>
      instance && typeof instance.path === "string" && typeof instance.url === "string" &&
      typeof instance.pid === "string" && /^\d+$/.test(instance.pid) &&
      typeof instance.port === "string" && /^\d+$/.test(instance.port));
  }

  async function stopProject(project: Project, restartToken?: symbol): Promise<boolean> {
    if (restartRequests.get(project.id) !== restartToken) restartRequests.delete(project.id);
    const previousStatus = project.status;
    project.status = "stopping";
    try {
      const proc = runningProcesses.value.get(project.id);
      // This handle belongs to the child we launched, including before readiness.
      if (proc) await signalChild(proc.child.pid);
      const result = await Command.create("run-bash", ["-c", `cd ${shellEscape(project.path)} && ${shellEscape(phpupCommand.value)} --stop`]).execute();
      if (result.code !== 0) throw new Error(result.stderr || "Stop failed");
      for (let attempt = 0; attempt < 60; attempt++) {
        const instances = await listPhpupInstances();
        if (!instances.some(instance => instance.path === project.path) && !runningProcesses.value.has(project.id) && !pendingStarts.has(project.id)) {
          project.isRunning = false; project.status = "stopped"; project.url = undefined;
          runningPids.value.delete(project.id);
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error("The server has not stopped yet. Its process is still tracked; try again.");
    } catch (error) {
      project.status = previousStatus;
      addNotification(`Could not stop ${project.name}: ${error}`, "error");
      await refreshAllStatuses();
      return false;
    }
  }

  async function refreshAllStatuses() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const instances = await listPhpupInstances();
        for (const project of projects.value) {
          if (pendingStarts.has(project.id) || project.status === "starting" || project.status === "stopping") continue;
          const instance = instances.find(item => item.path === project.path);
          if (instance) {
            runningPids.value.set(project.id, instance.pid);
            project.port = instance.port; project.url = instance.url;
            project.isRunning = true; project.status = "running";
          } else if (!runningProcesses.value.has(project.id)) {
            runningPids.value.delete(project.id);
            project.isRunning = false; project.url = undefined;
            if (project.status !== "crashed") project.status = "stopped";
          }
        }
      } catch (error) { console.error(error); }
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function openInBrowser(project: Project) {
    if (project.status !== "running" || !project.url) return;
    try { await openUrl(project.url); }
    catch (error) { addNotification(`Could not open ${project.name}: ${error}`, "error"); }
  }

  async function openFolder(project: Project) {
    const escapedPath = shellEscape(project.path);
    const command = Command.create("run-bash", [
      "-c",
      `xdg-open ${escapedPath} 2>/dev/null || open ${escapedPath} 2>/dev/null`,
    ]);
    await command.execute();
  }

  // Group management
  function addGroup(name: string) {
    if (!name.trim()) return;
    const group: Group = {
      id: Date.now().toString(),
      name: name.trim(),
      collapsed: false,
    };
    groups.value.push(group);
    saveData();
  }

  function renameGroup(group: Group, newName: string) {
    group.name = newName;
    saveData();
  }

  function deleteGroup(group: Group) {
    for (const project of projects.value) {
      if (project.groupId === group.id) {
        project.groupId = undefined;
      }
    }
    groups.value = groups.value.filter((g) => g.id !== group.id);
    saveData();
  }

  function toggleGroup(group: Group) {
    group.collapsed = !group.collapsed;
    saveData();
  }

  // Open in IDE
  async function openInIde(project: Project) {
    // Try VS Code first, then PHPStorm, then generic xdg-open
    const escapedPath = shellEscape(project.path);
    const cmd = Command.create("run-bash", [
      "-c",
      `command -v code >/dev/null 2>&1 && exec code ${escapedPath} || ` +
      `command -v phpstorm >/dev/null 2>&1 && exec phpstorm ${escapedPath} || ` +
      `command -v subl >/dev/null 2>&1 && exec subl ${escapedPath} || ` +
      `echo "no-ide"`,
    ]);
    const result = await cmd.execute();
    if (result.stdout.trim() === "no-ide") {
      addNotification("No IDE found (tried: code, phpstorm, subl)", "warning");
    }
  }

  async function detectIde(): Promise<string | null> {
    const checks = [
      { cmd: "code", name: "VS Code" },
      { cmd: "phpstorm", name: "PhpStorm" },
      { cmd: "subl", name: "Sublime Text" },
    ];
    for (const { cmd, name } of checks) {
      const result = await Command.create("run-bash", ["-c", `command -v ${cmd} 2>/dev/null`]).execute();
      if (result.code === 0) return name;
    }
    return null;
  }

  // PHP extensions
  async function loadPhpExtensions() {
    try {
      const cmd = Command.create("run-bash", [
        "-c",
        `frankenphp php-cli -r 'echo implode("\\n", get_loaded_extensions());' 2>/dev/null`,
      ]);
      const result = await cmd.execute();
      if (result.code === 0) {
        phpExtensions.value = result.stdout
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("["));
      }
    } catch {
      phpExtensions.value = [];
    }
  }

  // Caddyfile validation
  async function validateCaddyfile(project = selectedProject.value, name = selectedCaddyfile.value, content = caddyfileContent.value): Promise<{ valid: boolean; error: string }> {
    if (!project || !/^Caddyfile(\.[a-zA-Z0-9_-]+)?$/.test(name)) return { valid: false, error: "No valid file selected" };
    try {
      const snapshot = await readProjectSettings(project);
      const result = await Command.create("run-bash", ["-c", validationCommand(project.path + "/.phpup/" + name, content, snapshot.settings, project.path)]).execute();
      return { valid: result.code === 0, error: result.code === 0 ? "" : result.stdout + result.stderr };
    } catch (error) { return { valid: false, error: String(error) }; }
  }

  const xdebugAvailable = computed(() =>
    phpExtensions.value.some((ext) => ext.toLowerCase() === "xdebug")
  );

  // Initialize
  async function initialize() {
    try {
    phpupCommand.value = await detectPhpup();
    await loadProjects();
    phpupReady.value = true;
    await refreshAllStatuses();
    const previous = projects.value.find(p => p.id === lastSelectedProjectId.value) || projects.value[0];
    if (previous) await selectProject(previous);
    loadPhpExtensions();
    } catch (error) { phpupReady.value = false; addNotification(String(error), "error"); }
  }

  return {
    // State
    groups,
    projects,
    selectedProject,
    projectOutput,
    searchQuery,
    sidebarWidth,
    restartingProjects,
    showSettings,
    showCaddyfile,
    showAddGroup,
    showTools,
    caddyfileContent,
    caddyfileList,
    selectedCaddyfile,
    settings,
    phpupReady,
    phpupCommand,
    notifications,
    phpExtensions,
    portConflict,

    // Computed
    filteredProjects,
    ungroupedProjects,
    projectsByGroup,
    xdebugAvailable,

    // Methods
    initialize,
    refreshAllStatuses,
    addProject,
    renameProject,
    removeProject,
    selectProject,
    initProject,
    saveSettings,
    loadProjectSettings,
    validateSettings,
    loadCaddyfile,
    loadSelectedCaddyfile,
    saveCaddyfile,
    validateCaddyfile,
    startProject,
    stopProject,
    restartProject,
    clearOutput,
    openInBrowser,
    openInIde,
    detectIde,
    openFolder,
    addGroup,
    renameGroup,
    deleteGroup,
    toggleGroup,
    saveData,
    addNotification,
    dismissNotification,
    loadPhpExtensions,
  };
}

// Create singleton instance
let storeInstance: ReturnType<typeof useStore> | null = null;

export function getStore() {
  if (!storeInstance) {
    storeInstance = useStore();
  }
  return storeInstance;
}
