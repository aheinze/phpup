import { ref, computed } from "vue";
import { Command } from "@tauri-apps/plugin-shell";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { resolveResource } from "@tauri-apps/api/path";
import type { Project, Group, RunningProcess, ProjectSettings } from "../types";

// Shell escape function to prevent command injection
function shellEscape(str: string): string {
  // Wrap in single quotes and escape any single quotes within
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

// Validate port is numeric
function isValidPort(port: string): boolean {
  const num = parseInt(port, 10);
  return !isNaN(num) && num > 0 && num <= 65535 && port === num.toString();
}

// Global state
const groups = ref<Group[]>([]);
const projects = ref<Project[]>([]);
const selectedProject = ref<Project | null>(null);
const runningProcesses = ref<Map<string, RunningProcess>>(new Map());
const projectOutput = ref<string[]>([]);
const searchQuery = ref("");

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
const settings = ref<ProjectSettings>({
  host: "127.0.0.1",
  port: "8000",
  domain: "",
  docroot: "./public",
  httpsMode: "off",
  workerMode: false,
  watchMode: false,
  compression: true,
  openBrowser: true,
});

// Phpup state
const phpupCommand = ref("phpup");
const phpupReady = ref(false);

// Config paths
const configDir = "~/.config/phpup-desktop";
const configFile = `${configDir}/projects.json`;

export function useStore() {
  // Computed
  const filteredProjects = computed(() => {
    if (!searchQuery.value) return projects.value;
    const query = searchQuery.value.toLowerCase();
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
    const globalCheck = Command.create("run-bash", ["-c", "command -v phpup"]);
    const globalResult = await globalCheck.execute();
    if (globalResult.code === 0 && globalResult.stdout.trim()) {
      console.log("Using global phpup:", globalResult.stdout.trim());
      return "phpup";
    }

    try {
      const resourcePath = await resolveResource("phpup");
      const chmodCmd = Command.create("run-bash", [
        "-c",
        `chmod +x ${shellEscape(resourcePath)}`,
      ]);
      await chmodCmd.execute();
      console.log("Using bundled phpup:", resourcePath);
      return resourcePath;
    } catch (e) {
      console.error("Failed to resolve bundled phpup:", e);
      return "/home/artur/DEV/phpup/phpup";
    }
  }

  // Data persistence
  async function loadProjects() {
    try {
      const command = Command.create("run-bash", [
        "-c",
        `cat ${configFile} 2>/dev/null`,
      ]);
      const result = await command.execute();
      if (result.code === 0 && result.stdout.trim()) {
        const data = JSON.parse(result.stdout);
        if (Array.isArray(data)) {
          projects.value = data;
          groups.value = [];
        } else {
          projects.value = data.projects || [];
          groups.value = data.groups || [];
        }
        refreshFavicons();
      }
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }

  async function saveData() {
    try {
      const data = { groups: groups.value, projects: projects.value };
      const json = JSON.stringify(data, null, 2);
      const command = Command.create("run-bash", [
        "-c",
        `mkdir -p ${configDir} && cat > ${configFile} << 'EOF'\n${json}\nEOF`,
      ]);
      await command.execute();
    } catch (e) {
      console.error("Failed to save data:", e);
    }
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
  async function checkProjectConfig(
    path: string
  ): Promise<{ hasConfig: boolean; port: string; docroot: string }> {
    const configCmd = Command.create("run-bash", [
      "-c",
      `cat ${shellEscape(path + "/.phpup/config")} 2>/dev/null`,
    ]);
    const configResult = await configCmd.execute();

    if (configResult.code === 0 && configResult.stdout.trim()) {
      const config = configResult.stdout;
      const portMatch = config.match(/PORT=["']?(\d+)["']?/);
      const docrootMatch = config.match(/DOCROOT=["']?([^"'\n]+)["']?/);
      return {
        hasConfig: true,
        port: portMatch ? portMatch[1] : "8000",
        docroot: docrootMatch ? docrootMatch[1] : "./public",
      };
    }

    const dirCmd = Command.create("run-bash", [
      "-c",
      `ls ${shellEscape(path + "/.phpup/")}'Caddyfile'* 2>/dev/null | head -1`,
    ]);
    const dirResult = await dirCmd.execute();

    if (dirResult.code === 0 && dirResult.stdout.trim()) {
      const docrootCmd = Command.create("run-bash", [
        "-c",
        `cd ${shellEscape(path)} && for d in public web www htdocs dist build .; do [ -d "$d" ] && echo "$d" && break; done`,
      ]);
      const docrootResult = await docrootCmd.execute();
      const docroot = docrootResult.stdout.trim() || ".";

      return {
        hasConfig: true,
        port: "8000",
        docroot: docroot === "." ? "." : `./${docroot}`,
      };
    }

    return { hasConfig: false, port: "8000", docroot: "./public" };
  }

  // Project management
  async function addProject() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select PHP Project Folder",
    });

    if (!selected) return;

    const path = selected as string;
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
      hasConfig,
      docroot: configDocroot,
      favicon,
    };

    projects.value.push(project);
    saveData();
    selectProject(project);
  }

  function removeProject(project: Project) {
    if (project.isRunning) {
      stopProject(project);
    }
    projects.value = projects.value.filter((p) => p.id !== project.id);
    if (selectedProject.value?.id === project.id) {
      selectedProject.value = null;
    }
    saveData();
  }

  async function selectProject(project: Project) {
    selectedProject.value = project;
    showSettings.value = false;
    showCaddyfile.value = false;
    showTools.value = false;
    projectOutput.value = [];

    const { hasConfig, port: configPort, docroot: configDocroot } =
      await checkProjectConfig(project.path);
    project.hasConfig = hasConfig;
    project.port = configPort;
    project.docroot = configDocroot;

    settings.value.port = project.port;
    settings.value.docroot = project.docroot;

    if (hasConfig) {
      const command = Command.create("run-bash", [
        "-c",
        `cat ${shellEscape(project.path + "/.phpup/config")} 2>/dev/null`,
      ]);
      const result = await command.execute();
      if (result.code === 0) {
        const config = result.stdout;
        const hostMatch = config.match(/HOST=["']?([^"'\n]+)["']?/);
        const domainMatch = config.match(/DOMAIN=["']?([^"'\n]+)["']?/);
        const httpsMatch = config.match(/HTTPS_MODE=["']?([^"'\n]+)["']?/);
        const workerMatch = config.match(/WORKER_MODE=["']?(true|false|1|0)["']?/i);
        const watchMatch = config.match(/WATCH_MODE=["']?(true|false|1|0)["']?/i);
        const compressionMatch = config.match(/COMPRESSION=["']?(true|false|1|0)["']?/i);
        const browserMatch = config.match(/OPEN_BROWSER=["']?(true|false|1|0)["']?/i);

        if (hostMatch) settings.value.host = hostMatch[1];
        if (domainMatch) settings.value.domain = domainMatch[1];
        if (httpsMatch) settings.value.httpsMode = httpsMatch[1] as "off" | "local" | "on";
        if (workerMatch) settings.value.workerMode = ["true", "1"].includes(workerMatch[1].toLowerCase());
        if (watchMatch) settings.value.watchMode = ["true", "1"].includes(watchMatch[1].toLowerCase());
        if (compressionMatch) settings.value.compression = ["true", "1"].includes(compressionMatch[1].toLowerCase());
        if (browserMatch) settings.value.openBrowser = ["true", "1"].includes(browserMatch[1].toLowerCase());
      }
    }

    const proc = runningProcesses.value.get(project.id);
    if (proc) {
      projectOutput.value = proc.output;
    }
  }

  async function initProject(project: Project) {
    projectOutput.value = ["Initializing phpup configuration..."];

    const command = Command.create("run-bash", [
      "-c",
      `cd ${shellEscape(project.path)} && ${shellEscape(phpupCommand.value)} --init 2>&1`,
    ]);
    const result = await command.execute();

    projectOutput.value.push(result.stdout || result.stderr);
    project.hasConfig = true;

    await selectProject(project);
    saveData();
  }

  async function saveSettings() {
    if (!selectedProject.value) return;

    const config = `# phpup configuration
HOST="${settings.value.host}"
PORT="${settings.value.port}"
DOMAIN="${settings.value.domain}"
DOCROOT="${settings.value.docroot}"
HTTPS_MODE="${settings.value.httpsMode}"
WORKER_MODE="${settings.value.workerMode ? 1 : 0}"
WATCH_MODE="${settings.value.watchMode ? 1 : 0}"
COMPRESSION="${settings.value.compression ? 1 : 0}"
OPEN_BROWSER="${settings.value.openBrowser ? 1 : 0}"
`;

    const phpupDir = selectedProject.value.path + "/.phpup";
    const configPath = phpupDir + "/config";
    const command = Command.create("run-bash", [
      "-c",
      `mkdir -p ${shellEscape(phpupDir)} && cat > ${shellEscape(configPath)} << 'EOF'\n${config}\nEOF`,
    ]);
    await command.execute();

    selectedProject.value.port = settings.value.port;
    selectedProject.value.docroot = settings.value.docroot;
    selectedProject.value.hasConfig = true;
    saveData();
    showSettings.value = false;

    projectOutput.value.push("Settings saved.");
  }

  // Caddyfile management
  async function loadCaddyfile() {
    if (!selectedProject.value) return;

    const phpupDir = selectedProject.value.path + "/.phpup/";
    const listCmd = Command.create("run-bash", [
      "-c",
      `ls -1 ${shellEscape(phpupDir)}'Caddyfile'* 2>/dev/null | xargs -n1 basename 2>/dev/null`,
    ]);
    const listResult = await listCmd.execute();
    const files = listResult.stdout.trim().split("\n").filter((f) => f);

    caddyfileList.value = files.length > 0 ? files : ["Caddyfile"];
    selectedCaddyfile.value = caddyfileList.value[0];

    await loadSelectedCaddyfile();
    showCaddyfile.value = true;
    showSettings.value = false;
  }

  async function loadSelectedCaddyfile() {
    if (!selectedProject.value || !selectedCaddyfile.value) return;

    // Validate Caddyfile name to prevent path traversal
    if (!/^Caddyfile(\.[a-zA-Z0-9_-]+)?$/.test(selectedCaddyfile.value)) {
      console.error("Invalid Caddyfile name:", selectedCaddyfile.value);
      return;
    }

    const caddyfilePath = selectedProject.value.path + "/.phpup/" + selectedCaddyfile.value;
    const command = Command.create("run-bash", [
      "-c",
      `cat ${shellEscape(caddyfilePath)} 2>/dev/null`,
    ]);
    const result = await command.execute();
    caddyfileContent.value = result.stdout || "";
  }

  async function saveCaddyfile() {
    if (!selectedProject.value || !selectedCaddyfile.value) return;

    // Validate Caddyfile name to prevent path traversal
    if (!/^Caddyfile(\.[a-zA-Z0-9_-]+)?$/.test(selectedCaddyfile.value)) {
      console.error("Invalid Caddyfile name:", selectedCaddyfile.value);
      return;
    }

    const caddyfilePath = selectedProject.value.path + "/.phpup/" + selectedCaddyfile.value;
    const command = Command.create("run-bash", [
      "-c",
      `cat > ${shellEscape(caddyfilePath)} << 'CADDYFILE_EOF'\n${caddyfileContent.value}\nCADDYFILE_EOF`,
    ]);
    await command.execute();

    showCaddyfile.value = false;
    projectOutput.value.push(`${selectedCaddyfile.value} saved.`);
  }

  // Server management
  async function startProject(project: Project) {
    if (project.isRunning) return;

    projectOutput.value = ["Starting server..."];

    const args: string[] = [];
    args.push("--port", project.port);
    args.push("--docroot", project.docroot);
    if (settings.value.host !== "127.0.0.1") args.push("--host", settings.value.host);
    if (settings.value.domain) args.push("--domain", settings.value.domain);
    if (settings.value.httpsMode !== "off") args.push("--https", settings.value.httpsMode);
    if (settings.value.workerMode) args.push("--worker");
    if (settings.value.watchMode) args.push("--watch");
    if (!settings.value.compression) args.push("--no-compression");
    if (!settings.value.openBrowser) args.push("--no-browser");

    const cmdString = `cd ${shellEscape(project.path)} && ${shellEscape(phpupCommand.value)} ${args.map(shellEscape).join(" ")} 2>&1`;
    projectOutput.value.push(`Running: ${cmdString}`);

    try {
      const command = Command.create("run-bash", ["-c", cmdString]);
      const output: string[] = ["Starting server...", `Running: ${cmdString}`];

      command.stdout.on("data", (data) => {
        output.push(data);
        if (selectedProject.value?.id === project.id) {
          projectOutput.value = [...output];
        }
      });

      command.stderr.on("data", (data) => {
        output.push(data);
        if (selectedProject.value?.id === project.id) {
          projectOutput.value = [...output];
        }
      });

      command.on("close", () => {
        project.isRunning = false;
        runningProcesses.value.delete(project.id);
        output.push("\n[Server stopped]");
        if (selectedProject.value?.id === project.id) {
          projectOutput.value = [...output];
        }
      });

      command.on("error", (err) => {
        output.push(`\n[Error: ${err}]`);
        if (selectedProject.value?.id === project.id) {
          projectOutput.value = [...output];
        }
      });

      const child = await command.spawn();
      runningProcesses.value.set(project.id, { project, child, output });
      project.isRunning = true;
    } catch (err) {
      projectOutput.value.push(`\n[Failed to start: ${err}]`);
      console.error("Failed to start project:", err);
    }

    projectOutput.value.push("Server starting...");
  }

  async function stopProject(project: Project) {
    const proc = runningProcesses.value.get(project.id);
    if (proc) {
      await proc.child.kill();
      runningProcesses.value.delete(project.id);
    }

    // Validate port is numeric to prevent command injection
    if (isValidPort(project.port)) {
      const command = Command.create("run-bash", [
        "-c",
        `fuser -k ${project.port}/tcp 2>/dev/null || lsof -ti:${project.port} | xargs -r kill 2>/dev/null || true`,
      ]);
      await command.execute();
    }

    project.isRunning = false;
    projectOutput.value.push("[Server stopped]");
  }

  async function refreshAllStatuses() {
    const command = Command.create("run-bash", [
      "-c",
      `${shellEscape(phpupCommand.value)} --list 2>&1`,
    ]);
    const result = await command.execute();
    const output = result.stdout + result.stderr;

    const runningProjects: Array<{ pathFragment: string; port: string }> = [];
    const lines = output.split("\n");
    for (const line of lines) {
      const serverPortMatch = line.match(/\*:(\d+)/);
      if (serverPortMatch) {
        const port = serverPortMatch[1];
        const pathMatch = line.match(/\s+(\S*\/.+?)\s+\.phpup/);
        if (pathMatch) {
          let pathFragment = pathMatch[1];
          if (pathFragment.startsWith("...")) {
            pathFragment = pathFragment.substring(3);
          }
          runningProjects.push({ pathFragment, port });
        }
      }
    }

    for (const project of projects.value) {
      let isRunning = false;
      const projectParts = project.path.split("/").filter(Boolean);
      const projectSuffix = projectParts.slice(-2).join("/");
      for (const { pathFragment, port } of runningProjects) {
        const fragmentParts = pathFragment.split("/").filter(Boolean);
        const fragmentSuffix = fragmentParts.slice(-2).join("/");
        if (
          project.path.endsWith(pathFragment) ||
          project.path.includes(pathFragment) ||
          pathFragment.endsWith(projectSuffix) ||
          projectSuffix === fragmentSuffix
        ) {
          isRunning = true;
          project.port = port;
          break;
        }
      }
      project.isRunning = isRunning;
    }
  }

  // Utilities
  async function openInBrowser(project: Project) {
    const protocol = settings.value.httpsMode !== "off" ? "https" : "http";
    const url = settings.value.domain || `${settings.value.host}:${project.port}`;
    await openUrl(`${protocol}://${url}`);
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

  // Initialize
  async function initialize() {
    phpupCommand.value = await detectPhpup();
    phpupReady.value = true;
    await loadProjects();
    await refreshAllStatuses();
  }

  return {
    // State
    groups,
    projects,
    selectedProject,
    projectOutput,
    searchQuery,
    showSettings,
    showCaddyfile,
    showAddGroup,
    showTools,
    caddyfileContent,
    caddyfileList,
    selectedCaddyfile,
    settings,
    phpupReady,

    // Computed
    filteredProjects,
    ungroupedProjects,
    projectsByGroup,

    // Methods
    initialize,
    refreshAllStatuses,
    addProject,
    removeProject,
    selectProject,
    initProject,
    saveSettings,
    loadCaddyfile,
    loadSelectedCaddyfile,
    saveCaddyfile,
    startProject,
    stopProject,
    openInBrowser,
    openFolder,
    addGroup,
    renameGroup,
    deleteGroup,
    toggleGroup,
    saveData,
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
