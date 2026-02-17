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

// Maximum output lines to keep per process
const MAX_OUTPUT_LINES = 1000;

function capOutput(output: string[]) {
  if (output.length > MAX_OUTPUT_LINES) {
    output.splice(0, output.length - MAX_OUTPUT_LINES);
  }
}

// Validate port is numeric
function isValidPort(port: string): boolean {
  const num = parseInt(port, 10);
  return !isNaN(num) && num > 0 && num <= 65535 && port === num.toString();
}

interface PhpupListedInstance {
  pid: string;
  port: string | null;
  pathFragment: string | null;
}

function getPathSuffix(path: string, depth = 2): string {
  return path.split("/").filter(Boolean).slice(-depth).join("/");
}

function projectPathMatchesFragment(projectPath: string, pathFragment: string): boolean {
  const projectSuffix = getPathSuffix(projectPath);
  const fragmentSuffix = getPathSuffix(pathFragment);
  return (
    projectPath.endsWith(pathFragment) ||
    projectPath.includes(pathFragment) ||
    pathFragment.endsWith(projectSuffix) ||
    projectSuffix === fragmentSuffix
  );
}

function parsePhpupListOutput(output: string): PhpupListedInstance[] {
  const instances: PhpupListedInstance[] = [];
  for (const line of output.split("\n")) {
    const pidMatch = line.match(/^(\d+)\s+/);
    if (!pidMatch) continue;

    const pid = pidMatch[1];
    const portMatch = line.match(/\*:(\d+)/);
    const port = portMatch ? portMatch[1] : null;

    let pathFragment: string | null = null;
    const pathMatch = line.match(/\s+(\S*\/.+?)\s+\.phpup/);
    if (pathMatch) {
      pathFragment = pathMatch[1];
      if (pathFragment.startsWith("...")) {
        pathFragment = pathFragment.substring(3);
      }
    }

    instances.push({ pid, port, pathFragment });
  }
  return instances;
}

// Global state
const groups = ref<Group[]>([]);
const projects = ref<Project[]>([]);
const selectedProject = ref<Project | null>(null);
const runningProcesses = ref<Map<string, RunningProcess>>(new Map());
const runningPids = ref<Map<string, string>>(new Map()); // projectId -> pid
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
  phpThreads: "auto",
  httpsMode: "off",
  workerMode: false,
  watchMode: false,
  compression: true,
  openBrowser: true,
  xdebug: false,
});

// Notifications
const notifications = ref<Array<{ id: string; message: string; type: "error" | "warning" | "info" }>>([]);

// PHP extensions cache
const phpExtensions = ref<string[]>([]);

// Phpup state
const phpupCommand = ref("phpup");
const phpupReady = ref(false);

// Config paths
const configDir = "~/.config/phpup-desktop";
const configFile = `${configDir}/projects.json`;

function useStore() {
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
      // Fall back to looking in common locations
      const fallbackCheck = Command.create("run-bash", [
        "-c",
        "command -v phpup || test -x ./phpup && echo ./phpup",
      ]);
      const fallbackResult = await fallbackCheck.execute();
      if (fallbackResult.code === 0 && fallbackResult.stdout.trim()) {
        return fallbackResult.stdout.trim();
      }
      console.error("phpup not found anywhere");
      return "phpup";
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
          projects.value = data.map((p: Project) => ({ ...p, status: p.status || "stopped" }));
          groups.value = [];
        } else {
          projects.value = (data.projects || []).map((p: Project) => ({ ...p, status: p.status || "stopped" }));
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
      // Use printf to avoid heredoc delimiter collision issues
      const command = Command.create("run-bash", [
        "-c",
        `mkdir -p ${configDir} && printf '%s' ${shellEscape(json)} > ${configFile}`,
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
        const threadsMatch = config.match(/PHP_THREADS=["']?([^"'\n]+)["']?/);
        const httpsMatch = config.match(/HTTPS_MODE=["']?([^"'\n]+)["']?/);
        const workerMatch = config.match(/WORKER_MODE=["']?(true|false|1|0)["']?/i);
        const watchMatch = config.match(/WATCH_MODE=["']?(true|false|1|0)["']?/i);
        const compressionMatch = config.match(/COMPRESSION=["']?(true|false|1|0)["']?/i);
        const browserMatch = config.match(/OPEN_BROWSER=["']?(true|false|1|0)["']?/i);

        if (hostMatch) settings.value.host = hostMatch[1];
        if (domainMatch) settings.value.domain = domainMatch[1];
        if (threadsMatch) settings.value.phpThreads = threadsMatch[1];
        if (httpsMatch) settings.value.httpsMode = httpsMatch[1] as "off" | "local" | "on";
        if (workerMatch) settings.value.workerMode = ["true", "1"].includes(workerMatch[1].toLowerCase());
        if (watchMatch) settings.value.watchMode = ["true", "1"].includes(watchMatch[1].toLowerCase());
        if (compressionMatch) settings.value.compression = ["true", "1"].includes(compressionMatch[1].toLowerCase());
        if (browserMatch) settings.value.openBrowser = ["true", "1"].includes(browserMatch[1].toLowerCase());

        const xdebugMatch = config.match(/XDEBUG=["']?(true|false|1|0)["']?/i);
        if (xdebugMatch) settings.value.xdebug = ["true", "1"].includes(xdebugMatch[1].toLowerCase());
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
PHP_THREADS="${settings.value.phpThreads}"
HTTPS_MODE="${settings.value.httpsMode}"
WORKER_MODE="${settings.value.workerMode ? 1 : 0}"
WATCH_MODE="${settings.value.watchMode ? 1 : 0}"
COMPRESSION="${settings.value.compression ? 1 : 0}"
OPEN_BROWSER="${settings.value.openBrowser ? 1 : 0}"
XDEBUG="${settings.value.xdebug ? 1 : 0}"
`;

    const phpupDir = selectedProject.value.path + "/.phpup";
    const configPath = phpupDir + "/config";
    const command = Command.create("run-bash", [
      "-c",
      `mkdir -p ${shellEscape(phpupDir)} && printf '%s' ${shellEscape(config)} > ${shellEscape(configPath)}`,
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
      `printf '%s' ${shellEscape(caddyfileContent.value)} > ${shellEscape(caddyfilePath)}`,
    ]);
    await command.execute();

    showCaddyfile.value = false;
    projectOutput.value.push(`${selectedCaddyfile.value} saved.`);
  }

  // Config validation
  function validateSettings(): string[] {
    const errors: string[] = [];
    const port = parseInt(settings.value.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push(`Invalid port: ${settings.value.port} (must be 1-65535)`);
    }
    if (settings.value.host && !/^[\w.-]+$/.test(settings.value.host)) {
      errors.push(`Invalid host: ${settings.value.host}`);
    }
    if (settings.value.domain && !/^[\w.-]+$/.test(settings.value.domain)) {
      errors.push(`Invalid domain: ${settings.value.domain}`);
    }
    if (settings.value.phpThreads !== "auto") {
      const threads = parseInt(settings.value.phpThreads, 10);
      if (isNaN(threads) || threads < 1 || threads > 256) {
        errors.push(`Invalid PHP threads: ${settings.value.phpThreads} (must be 1-256 or "auto")`);
      }
    }
    return errors;
  }

  // Notification helpers
  function addNotification(message: string, type: "error" | "warning" | "info" = "info") {
    const id = Date.now().toString();
    notifications.value.push({ id, message, type });
    setTimeout(() => {
      notifications.value = notifications.value.filter((n) => n.id !== id);
    }, 8000);
  }

  function dismissNotification(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  // Port check
  async function isPortInUse(port: string): Promise<boolean> {
    const cmd = Command.create("run-bash", [
      "-c",
      `ss -tlnp 2>/dev/null | grep -q ':${port}\b' || lsof -i:${port} -sTCP:LISTEN -t 2>/dev/null | grep -qm1 .`,
    ]);
    const result = await cmd.execute();
    return result.code === 0;
  }

  async function findAvailablePort(startPort: string): Promise<string> {
    let port = parseInt(startPort, 10);
    for (let i = 0; i < 100; i++) {
      port++;
      if (port > 65535) break;
      if (!(await isPortInUse(port.toString()))) {
        return port.toString();
      }
    }
    return "";
  }

  // Port conflict state
  const portConflict = ref<{ project: Project; suggestedPort: string } | null>(null);

  // Server management
  async function startProject(project: Project, overridePort?: string) {
    if (project.isRunning) return;

    // Validate config before starting
    const errors = validateSettings();
    if (errors.length > 0) {
      projectOutput.value = ["Configuration errors:", ...errors.map((e) => `  - ${e}`)];
      addNotification(errors[0], "error");
      return;
    }

    const port = overridePort || project.port;

    // Check port availability
    if (isValidPort(port) && await isPortInUse(port)) {
      const suggested = await findAvailablePort(port);
      if (suggested) {
        portConflict.value = { project, suggestedPort: suggested };
      } else {
        addNotification(`Port ${port} is in use and no free port found nearby`, "error");
      }
      return;
    }

    // Apply override port if used
    if (overridePort) {
      project.port = overridePort;
      settings.value.port = overridePort;
    }

    projectOutput.value = ["Starting server..."];
    project.status = "starting";

    const args: string[] = [];
    args.push("--port", project.port);
    args.push("--docroot", project.docroot);
    if (settings.value.host !== "127.0.0.1") args.push("--host", settings.value.host);
    if (settings.value.domain) args.push("--domain", settings.value.domain);
    if (settings.value.phpThreads && settings.value.phpThreads !== "auto") args.push("--php-threads", settings.value.phpThreads);
    if (settings.value.httpsMode !== "off") args.push("--https", settings.value.httpsMode);
    if (settings.value.workerMode) args.push("--worker");
    if (settings.value.watchMode) args.push("--watch");
    if (!settings.value.compression) args.push("--no-compression");
    if (settings.value.openBrowser) args.push("--open");
    else args.push("--no-open");
    if (settings.value.xdebug) args.push("--xdebug");

    const cmdString = `cd ${shellEscape(project.path)} && ${shellEscape(phpupCommand.value)} ${args.map(shellEscape).join(" ")} 2>&1`;
    projectOutput.value.push(`Running: ${cmdString}`);

    try {
      const command = Command.create("run-bash", ["-c", cmdString]);
      const output: string[] = ["Starting server...", `Running: ${cmdString}`];
      let serverReady = false;

      command.stdout.on("data", (data) => {
        output.push(data);
        capOutput(output);
        // Detect when server is actually listening
        const lower = data.toLowerCase();
        if (!serverReady && (lower.includes("started") || lower.includes("listening") || lower.includes("serving") || lower.includes("running") || lower.includes("ready"))) {
          serverReady = true;
          project.status = "running";
        }
        if (selectedProject.value?.id === project.id) {
          projectOutput.value = [...output];
        }
      });

      command.stderr.on("data", (data) => {
        output.push(data);
        capOutput(output);
        const lower = data.toLowerCase();
        if (!serverReady && (lower.includes("started") || lower.includes("listening") || lower.includes("serving") || lower.includes("running") || lower.includes("ready"))) {
          serverReady = true;
          project.status = "running";
        }
        if (selectedProject.value?.id === project.id) {
          projectOutput.value = [...output];
        }
      });

      command.on("close", (payload) => {
        const wasRunning = project.isRunning;
        project.isRunning = false;
        runningProcesses.value.delete(project.id);

        // Detect crash: exited with error while it was supposed to be running
        if (wasRunning && payload && typeof payload === "object" && "code" in payload && payload.code !== 0) {
          project.status = "crashed";
          output.push(`\n[Server crashed with exit code ${payload.code}]`);
          addNotification(`${project.name} crashed (exit code ${payload.code})`, "error");
        } else {
          project.status = "stopped";
          output.push("\n[Server stopped]");
        }
        if (selectedProject.value?.id === project.id) {
          projectOutput.value = [...output];
        }
      });

      command.on("error", (err) => {
        project.status = "crashed";
        project.isRunning = false;
        output.push(`\n[Error: ${err}]`);
        addNotification(`${project.name}: ${err}`, "error");
        if (selectedProject.value?.id === project.id) {
          projectOutput.value = [...output];
        }
      });

      const child = await command.spawn();
      runningProcesses.value.set(project.id, { project, child, output });
      project.isRunning = true;

      // Auto-transition to running after timeout if no signal detected
      setTimeout(() => {
        if (project.status === "starting" && project.isRunning) {
          project.status = "running";
        }
      }, 3000);
    } catch (err) {
      project.status = "crashed";
      projectOutput.value.push(`\n[Failed to start: ${err}]`);
      addNotification(`Failed to start ${project.name}: ${err}`, "error");
      console.error("Failed to start project:", err);
    }

    projectOutput.value.push("Server starting...");
  }

  async function killPid(pid: string): Promise<boolean> {
    await Command.create("run-bash", [
      "-c",
      `kill -TERM ${pid} 2>/dev/null; sleep 1; kill -0 ${pid} 2>/dev/null && kill -KILL ${pid} 2>/dev/null || true`,
    ]).execute();
    const check = await Command.create("run-bash", [
      "-c",
      `kill -0 ${pid} 2>/dev/null; echo $?`,
    ]).execute();
    return check.stdout.trim() !== "0";
  }

  async function listPhpupInstances(): Promise<PhpupListedInstance[]> {
    const command = Command.create("run-bash", [
      "-c",
      `${shellEscape(phpupCommand.value)} --list 2>&1`,
    ]);
    const result = await command.execute();
    return parsePhpupListOutput(result.stdout + result.stderr);
  }

  async function getProjectNetworkHints(project: Project): Promise<{
    hosts: string[];
    protocols: Array<"http" | "https">;
  }> {
    const hosts = new Set<string>(["127.0.0.1", "localhost"]);
    let httpsMode: string | null = null;

    // Selected project may have unsaved UI settings - include them.
    if (selectedProject.value?.id === project.id) {
      if (settings.value.host) hosts.add(settings.value.host);
      if (settings.value.domain) hosts.add(settings.value.domain);
      httpsMode = settings.value.httpsMode;
    }

    try {
      const configCmd = Command.create("run-bash", [
        "-c",
        `cat ${shellEscape(project.path + "/.phpup/config")} 2>/dev/null`,
      ]);
      const configResult = await configCmd.execute();
      if (configResult.code === 0 && configResult.stdout.trim()) {
        const config = configResult.stdout;
        const hostMatch = config.match(/HOST=["']?([^"'\n]+)["']?/);
        const domainMatch = config.match(/DOMAIN=["']?([^"'\n]+)["']?/);
        const httpsMatch = config.match(/HTTPS_MODE=["']?([^"'\n]+)["']?/);
        if (hostMatch?.[1]) hosts.add(hostMatch[1]);
        if (domainMatch?.[1]) hosts.add(domainMatch[1]);
        if (httpsMatch?.[1]) httpsMode = httpsMatch[1];
      }
    } catch {
      // Best effort only; keep defaults.
    }

    if (httpsMode === "off") {
      return { hosts: [...hosts], protocols: ["http"] };
    }
    if (httpsMode === "local" || httpsMode === "on") {
      return { hosts: [...hosts], protocols: ["https", "http"] };
    }
    return { hosts: [...hosts], protocols: ["http", "https"] };
  }

  async function isProjectServingFrankenphp(project: Project): Promise<boolean> {
    if (!isValidPort(project.port)) return false;

    const { hosts, protocols } = await getProjectNetworkHints(project);
    for (const protocol of protocols) {
      for (const host of hosts) {
        const url = `${protocol}://${host}:${project.port}/`;
        try {
          const result = await Command.create("run-bash", [
            "-c",
            `curl -skI --max-time 1 ${shellEscape(url)} 2>/dev/null`,
          ]).execute();
          if ((result.stdout + result.stderr).toLowerCase().includes("frankenphp")) {
            return true;
          }
        } catch {
          // Try next URL candidate.
        }
      }
    }
    return false;
  }

  async function isPortServingFrankenphp(project: Project): Promise<boolean> {
    try {
      return await isProjectServingFrankenphp(project);
    } catch {
      return false;
    }
  }

  async function stopProject(project: Project) {
    const proc = runningProcesses.value.get(project.id);
    if (proc) {
      await proc.child.kill();
      runningProcesses.value.delete(project.id);
    }

    let killed = false;

    // Try killing by tracked PID first (works even with cap_net_bind_service)
    const pid = runningPids.value.get(project.id);
    if (pid) {
      killed = await killPid(pid);
      runningPids.value.delete(project.id);
    }

    // Fallback: kill by port (works when process is dumpable)
    if (!killed && isValidPort(project.port)) {
      await Command.create("run-bash", [
        "-c",
        `fuser -k ${project.port}/tcp 2>/dev/null || lsof -ti:${project.port} | xargs -r kill 2>/dev/null || true`,
      ]).execute();
      killed = !await isPortServingFrankenphp(project);
    }

    // Last resort: only try safe candidate PIDs for this project.
    if (!killed) {
      const instances = await listPhpupInstances();
      const candidatePids = new Set<string>();

      // Port match is authoritative when available.
      if (isValidPort(project.port)) {
        for (const instance of instances) {
          if (instance.port === project.port) {
            candidatePids.add(instance.pid);
          }
        }
      }

      // Path fallback only when unambiguous.
      const pathMatches = instances.filter(
        (instance) =>
          instance.pathFragment && projectPathMatchesFragment(project.path, instance.pathFragment)
      );
      if (pathMatches.length === 1) {
        candidatePids.add(pathMatches[0].pid);
      }

      for (const candidatePid of candidatePids) {
        if (candidatePid === pid) continue;
        const pidKilled = await killPid(candidatePid);
        if (!pidKilled) continue;
        if (!await isProjectServingFrankenphp(project)) {
          killed = true;
          break;
        }
      }
    }

    project.isRunning = false;
    project.status = "stopped";
    projectOutput.value.push(
      killed ? "[Server stopped]" : "[Stop requested, verifying process state...]"
    );

    await refreshAllStatuses();
    if (project.isRunning) {
      projectOutput.value.push("[Server may still be running]");
      addNotification(`${project.name} is still running`, "warning");
    }
  }

  async function refreshAllStatuses() {
    const instances = await listPhpupInstances();

    const matchedProjectIds = new Set<string>();
    const matchedInstanceIdxs = new Set<number>();

    // First pass: match instances that have path info
    for (const project of projects.value) {
      for (let i = 0; i < instances.length; i++) {
        if (matchedInstanceIdxs.has(i)) continue;
        const { pathFragment, port } = instances[i];
        if (!pathFragment) continue;

        if (projectPathMatchesFragment(project.path, pathFragment)) {
          matchedProjectIds.add(project.id);
          matchedInstanceIdxs.add(i);
          runningPids.value.set(project.id, instances[i].pid);
          if (port) project.port = port;
          break;
        }
      }
    }

    // Second pass: for unmatched instances, verify by probing each project URL.
    const unmatchedInstances = instances.filter((_, i) => !matchedInstanceIdxs.has(i));
    if (unmatchedInstances.length > 0) {
      for (const project of projects.value) {
        if (matchedProjectIds.has(project.id)) continue;
        if (!isValidPort(project.port)) continue;

        if (await isProjectServingFrankenphp(project)) {
          matchedProjectIds.add(project.id);

          // Prefer exact port-to-instance PID when unique.
          const samePort = unmatchedInstances.filter(
            (instance) => instance.port && instance.port === project.port
          );
          if (samePort.length === 1) {
            runningPids.value.set(project.id, samePort[0].pid);
          } else if (unmatchedInstances.length === 1) {
            runningPids.value.set(project.id, unmatchedInstances[0].pid);
          }
        }
      }
    }

    for (const project of projects.value) {
      const isRunning = matchedProjectIds.has(project.id);
      project.isRunning = isRunning;
      if (!isRunning) runningPids.value.delete(project.id);
      // Only update status if not managed by a running process handler
      if (!runningProcesses.value.has(project.id)) {
        if (isRunning && project.status !== "running") {
          project.status = "running";
        } else if (!isRunning && project.status !== "crashed") {
          project.status = "stopped";
        }
      }
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
        `frankenphp php-cli -m 2>/dev/null || php -m 2>/dev/null`,
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
  async function validateCaddyfile(): Promise<{ valid: boolean; error: string }> {
    if (!selectedProject.value || !selectedCaddyfile.value) {
      return { valid: false, error: "No file selected" };
    }

    // Write content to a temp file for validation
    const tmpFile = `/tmp/phpup-validate-${Date.now()}.caddyfile`;
    const writeCmd = Command.create("run-bash", [
      "-c",
      `printf '%s' ${shellEscape(caddyfileContent.value)} > ${shellEscape(tmpFile)}`,
    ]);
    await writeCmd.execute();

    const cmd = Command.create("run-bash", [
      "-c",
      `frankenphp validate --config ${shellEscape(tmpFile)} 2>&1; rm -f ${shellEscape(tmpFile)}`,
    ]);
    const result = await cmd.execute();

    if (result.code === 0) {
      return { valid: true, error: "" };
    }
    return { valid: false, error: result.stdout + result.stderr };
  }

  const xdebugAvailable = computed(() =>
    phpExtensions.value.some((ext) => ext.toLowerCase() === "xdebug")
  );

  // Initialize
  async function initialize() {
    phpupCommand.value = await detectPhpup();
    phpupReady.value = true;
    await loadProjects();
    await refreshAllStatuses();
    loadPhpExtensions();
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
    validateSettings,
    loadCaddyfile,
    loadSelectedCaddyfile,
    saveCaddyfile,
    validateCaddyfile,
    startProject,
    stopProject,
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
