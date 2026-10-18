<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Command } from "@tauri-apps/plugin-shell";
import { openUrl } from "@tauri-apps/plugin-opener";

import { getStore } from "../composables/useStore";
import { shellEscape } from "../lib/projectConfig";

const store = getStore();
interface RunningProcess { pid: string; port: string; cwd: string; command: string; }
const runningProcesses = ref<RunningProcess[]>([]);
const loadingProcesses = ref(false);
let processInterval: ReturnType<typeof setInterval> | null = null;

async function checkRunningProcesses() {
  if (loadingProcesses.value) return;
  loadingProcesses.value = true;
  try {
    const result = await Command.create("run-bash", ["-c", `${shellEscape(store.phpupCommand.value)} --list --json`]).execute();
    if (result.code !== 0) throw new Error(result.stderr || "Cannot read server status");
    const instances = JSON.parse(result.stdout);
    if (!Array.isArray(instances)) throw new Error("Invalid server status response");
    runningProcesses.value = instances.filter(instance =>
      typeof instance.pid === "string" && /^\d+$/.test(instance.pid) &&
      typeof instance.path === "string" && typeof instance.port === "string"
    ).map(instance => ({ pid: instance.pid, port: instance.port, cwd: instance.path, command: "phpup" }));
  } catch (error) {
    console.error("Cannot refresh managed servers:", error);
  } finally { loadingProcesses.value = false; }
}

async function killProcess(pid: string) {
  const instance = runningProcesses.value.find(item => item.pid === pid);
  if (!instance) return;
  await stopManaged(`cd ${shellEscape(instance.cwd)} && ${shellEscape(store.phpupCommand.value)} --stop`);
}

async function killAllProcesses() {
  await stopManaged(`${shellEscape(store.phpupCommand.value)} --stop --all`);
}

async function stopManaged(command: string) {
  try {
    const result = await Command.create("run-bash", ["-c", command]).execute();
    if (result.code !== 0) throw new Error(result.stderr || "Stop failed");
    await checkRunningProcesses();
    await store.refreshAllStatuses();
  } catch (error) { store.addNotification(String(error), "error"); }
}

// FrankenPHP state
const frankenphpInstalled = ref<boolean | null>(null);
const frankenphpVersion = ref("");
const frankenphpPhpVersion = ref("");
const installingFrankenphp = ref(false);
const frankenphpOutput = ref<string[]>([]);

// PHP Extensions
const phpExtensions = ref<string[]>([]);
const showExtensions = ref(false);

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
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith("["));
    }
  } catch {
    phpExtensions.value = [];
  }
}

// Composer state
const composerInstalled = ref<boolean | null>(null);
const composerVersion = ref("");
const installingComposer = ref(false);
const composerOutput = ref<string[]>([]);

async function checkFrankenPhp() {
  try {
    const cmd = Command.create("run-bash", ["-c", "frankenphp version 2>&1"]);
    const output = await cmd.execute();
    if (output.code === 0) {
      frankenphpInstalled.value = true;
      const lines = output.stdout.trim().split("\n");
      frankenphpVersion.value = lines[0] || "";
      // Extract PHP version
      const phpMatch = output.stdout.match(/PHP\s+([\d.]+)/i);
      if (phpMatch) {
        frankenphpPhpVersion.value = phpMatch[1];
      }
    } else {
      frankenphpInstalled.value = false;
    }
  } catch {
    frankenphpInstalled.value = false;
  }
}

async function installFrankenPhp() {
  if (installingFrankenphp.value) return;
  installingFrankenphp.value = true;
  frankenphpOutput.value = ["Downloading the official FrankenPHP installer..."];
  try {
    const command = Command.create("run-bash", ["-c", `set -eu
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL --connect-timeout 15 --max-time 180 https://frankenphp.dev/install.sh -o "$work/install.sh"
export BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
cd "$work"
sh ./install.sh
if command -v frankenphp >/dev/null 2>&1; then
  frankenphp version
else
  echo 'FrankenPHP is not available in the desktop PATH. Add ~/.local/bin to PATH and restart the desktop.' >&2
  exit 1
fi`]);
    command.stdout.on("data", (line: string) => frankenphpOutput.value.push(line));
    command.stderr.on("data", (line: string) => frankenphpOutput.value.push(line));
    const result = await command.execute();
    frankenphpOutput.value.push(result.code === 0 ? "✓ FrankenPHP installed and verified." : "✗ Installation or verification failed. If system authentication is needed, run phpup --install from a terminal with administrator privileges.");
    await checkFrankenPhp();
  } catch (error) { frankenphpOutput.value.push(`Error: ${error}`); }
  finally { installingFrankenphp.value = false; }
}

// Composer paths
const composerLocalPath = ref("");

async function getComposerPath(): Promise<string> {
  // Check for local composer.phar in ~/.local/bin
  const homeDir = await Command.create("run-bash", ["-c", "echo $HOME"]).execute();
  const home = homeDir.stdout.trim();
  return `${home}/.local/bin/composer.phar`;
}

async function checkComposer() {
  try {
    composerLocalPath.value = await getComposerPath();

    // First check for local composer.phar with frankenphp
    if (frankenphpInstalled.value) {
      const escapedPath = shellEscape(composerLocalPath.value);
      const localCheck = await Command.create("run-bash", [
        "-c",
        `test -f ${escapedPath} && frankenphp php-cli ${escapedPath} --version 2>&1`
      ]).execute();

      if (localCheck.code === 0) {
        composerInstalled.value = true;
        const match = localCheck.stdout.match(/Composer\s+version\s+([\d.]+)/i);
        composerVersion.value = match ? match[1] : localCheck.stdout.trim().split("\n")[0];
        return;
      }
    }

    // Fall back to system composer
    const cmd = Command.create("run-bash", ["-c", "composer --version 2>&1"]);
    const output = await cmd.execute();
    if (output.code === 0) {
      composerInstalled.value = true;
      const match = output.stdout.match(/Composer\s+version\s+([\d.]+)/i);
      composerVersion.value = match ? match[1] : output.stdout.trim().split("\n")[0];
    } else {
      composerInstalled.value = false;
    }
  } catch {
    composerInstalled.value = false;
  }
}

async function installComposer() {
  if (installingComposer.value) return;
  installingComposer.value = true;
  composerOutput.value = [];
  try {
    if (!frankenphpInstalled.value) throw new Error("Install FrankenPHP before Composer.");
    const composerPath = await getComposerPath();
    const composerDir = composerPath.substring(0, composerPath.lastIndexOf("/"));
    composerOutput.value.push("Downloading and verifying the Composer installer...");
    const command = Command.create("run-bash", ["-c", `set -eu
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
curl -fsSL --connect-timeout 15 --max-time 180 https://getcomposer.org/installer -o installer.php
expected=$(curl -fsSL --connect-timeout 15 --max-time 30 https://composer.github.io/installer.sig)
actual=$(frankenphp php-cli -r 'echo hash_file("sha384", "installer.php");')
if [[ ! "$expected" =~ ^[a-fA-F0-9]{96}$ ]] || [ "$expected" != "$actual" ]; then
  echo 'Composer installer checksum verification failed.' >&2
  exit 1
fi
mkdir -p ${shellEscape(composerDir)}
frankenphp php-cli installer.php --install-dir=${shellEscape(composerDir)} --filename=composer.phar
frankenphp php-cli ${shellEscape(composerPath)} --version`]);
    command.stdout.on("data", (line: string) => composerOutput.value.push(line));
    command.stderr.on("data", (line: string) => composerOutput.value.push(line));
    const result = await command.execute();
    composerOutput.value.push(result.code === 0 ? `✓ Composer installed and verified at ${composerPath}` : "✗ Composer installation failed. See the output above.");
    await checkComposer();
  } catch (error) { composerOutput.value.push(`Error: ${error}`); }
  finally { installingComposer.value = false; }
}

async function refreshAll() {
  // Check FrankenPHP first since Composer depends on it
  await checkFrankenPhp();
  await checkComposer();
  await checkRunningProcesses();
  if (frankenphpInstalled.value) {
    await loadPhpExtensions();
  }
}

onMounted(() => {
  refreshAll();
  // Check processes every 5 seconds
  processInterval = setInterval(checkRunningProcesses, 5000);
});

onUnmounted(() => {
  if (processInterval) {
    clearInterval(processInterval);
  }
});
</script>

<template>
  <div class="content-section">
    <div class="section-header">
      <h2>Tools</h2>
      <button class="btn-outline btn-small" @click="refreshAll">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M1.5 7a5.5 5.5 0 1 0 1-3.1"/>
          <path d="M1.5 1v3h3"/>
        </svg>
        Refresh All
      </button>
    </div>

    <!-- FrankenPHP -->
    <div class="tool-card">
      <div class="tool-header">
        <div class="tool-info">
          <h3>FrankenPHP</h3>
          <p class="tool-description">Modern PHP app server with built-in worker mode, HTTP/3, and early hints support.</p>
        </div>
        <div class="tool-status">
          <span v-if="frankenphpInstalled === null" class="status-checking">Checking...</span>
          <span v-else-if="frankenphpInstalled" class="status-installed">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
              <path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
            Installed
          </span>
          <span v-else class="status-not-installed">Not installed</span>
        </div>
      </div>

      <div v-if="frankenphpInstalled" class="tool-details">
        <span v-if="frankenphpVersion" class="tool-version">{{ frankenphpVersion }}</span>
        <span v-if="frankenphpPhpVersion" class="tool-tag">PHP {{ frankenphpPhpVersion }}</span>
      </div>

      <!-- PHP Extensions -->
      <div v-if="frankenphpInstalled && phpExtensions.length > 0" class="extensions-section">
        <button class="extensions-toggle" @click="showExtensions = !showExtensions">
          <svg class="chevron" :class="{ collapsed: !showExtensions }" width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 3l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          <span>PHP Extensions ({{ phpExtensions.length }})</span>
        </button>
        <div v-if="showExtensions" class="extensions-list">
          <span v-for="ext in phpExtensions" :key="ext" class="extension-tag">{{ ext }}</span>
        </div>
      </div>

      <div class="tool-actions">
        <button
          v-if="!frankenphpInstalled"
          class="btn-primary"
          :disabled="installingFrankenphp"
          @click="installFrankenPhp"
        >
          <span v-if="installingFrankenphp">Installing...</span>
          <span v-else>Install</span>
        </button>
        <button class="btn-outline" @click="openUrl('https://frankenphp.dev/docs/')">Docs</button>
      </div>

      <div v-if="frankenphpOutput.length > 0" class="install-output">
        <div class="output-header">
          <span>Output</span>
          <button class="clear-btn" @click="frankenphpOutput = []">Clear</button>
        </div>
        <div class="output-content">
          <div v-for="(line, i) in frankenphpOutput" :key="i">{{ line }}</div>
        </div>
      </div>
    </div>

    <!-- Composer -->
    <div class="tool-card">
      <div class="tool-header">
        <div class="tool-info">
          <h3>Composer</h3>
          <p class="tool-description">Dependency manager for PHP. Required for most modern PHP projects.</p>
        </div>
        <div class="tool-status">
          <span v-if="composerInstalled === null" class="status-checking">Checking...</span>
          <span v-else-if="composerInstalled" class="status-installed">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
              <path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
            Installed
          </span>
          <span v-else class="status-not-installed">Not installed</span>
        </div>
      </div>

      <div v-if="composerInstalled && composerVersion" class="tool-details">
        <span class="tool-version">v{{ composerVersion }}</span>
      </div>

      <div class="tool-actions">
        <button
          v-if="!composerInstalled"
          class="btn-primary"
          :disabled="installingComposer"
          @click="installComposer"
        >
          <span v-if="installingComposer">Installing...</span>
          <span v-else>Install</span>
        </button>
        <button class="btn-outline" @click="openUrl('https://getcomposer.org/doc/')">Docs</button>
      </div>

      <div v-if="composerOutput.length > 0" class="install-output">
        <div class="output-header">
          <span>Output</span>
          <button class="clear-btn" @click="composerOutput = []">Clear</button>
        </div>
        <div class="output-content">
          <div v-for="(line, i) in composerOutput" :key="i">{{ line }}</div>
        </div>
      </div>
    </div>

    <!-- Running Processes Monitor -->
    <div class="monitor-section">
      <div class="section-header">
        <h3>Servers managed by phpup</h3>
        <div class="header-actions">
          <button
            v-if="runningProcesses.length > 0"
            class="btn-danger btn-small"
            @click="killAllProcesses"
          >
            Stop All
          </button>
          <button class="btn-outline btn-small" @click="checkRunningProcesses">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M1.5 7a5.5 5.5 0 1 0 1-3.1"/>
              <path d="M1.5 1v3h3"/>
            </svg>
          </button>
        </div>
      </div>

      <div v-if="loadingProcesses && runningProcesses.length === 0" class="empty-monitor">
        <span class="loading-text">Checking...</span>
      </div>

      <div v-else-if="runningProcesses.length === 0" class="empty-monitor">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="6" rx="1.5"/>
          <rect x="3" y="14" width="18" height="6" rx="1.5"/>
          <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" opacity="0.3"/>
          <circle cx="7" cy="17" r="1" fill="currentColor" stroke="none" opacity="0.3"/>
        </svg>
        <span>No servers running</span>
      </div>

      <div v-else class="process-list">
        <div v-for="process in runningProcesses" :key="process.pid" class="process-item">
          <div class="process-indicator"></div>
          <div class="process-info">
            <div class="process-main">
              <span v-if="process.port !== 'unknown'" class="process-port">:{{ process.port }}</span>
              <span v-else class="process-name">{{ process.cwd.split('/').pop() }}</span>
              <span class="process-pid">PID {{ process.pid }}</span>
            </div>
            <div class="process-path">{{ process.cwd }}</div>
          </div>
          <button class="btn-icon-danger" @click="killProcess(process.pid)" title="Stop">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="3" y="3" width="8" height="8" rx="1"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.content-section {
  flex: 1;
  padding: 18px;
  overflow-y: auto;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-header h2 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tool-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px;
  margin-bottom: 12px;
  background: var(--surface-subtle);
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.tool-info h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 3px;
  letter-spacing: -0.01em;
}

.tool-description {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.tool-status {
  flex-shrink: 0;
}

.status-checking {
  font-size: 12px;
  color: var(--text-muted);
}

.status-installed {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--success);
}

.status-not-installed {
  font-size: 12px;
  color: var(--text-muted);
}

.tool-details {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.tool-version {
  font-size: 11px;
  font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
  color: var(--text-secondary);
  background: var(--bg-inset);
  padding: 3px 8px;
  border-radius: 20px;
}

.tool-tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-light);
  padding: 3px 8px;
  border-radius: 20px;
}

.tool-actions {
  display: flex;
  gap: 6px;
  margin-top: 14px;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: var(--accent-glow);
}

.btn-primary:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: var(--btn-outline-bg);
  color: var(--text);
  border: 1px solid var(--btn-outline-border);
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
}

.btn-outline:hover {
  background: var(--btn-outline-hover-bg);
}

.btn-small {
  padding: 5px 10px;
  font-size: 12px;
}

.install-output {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.output-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--surface-tint);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.clear-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  text-transform: uppercase;
  font-family: inherit;
  transition: color 0.1s;
}

.clear-btn:hover {
  color: var(--text);
}

.output-content {
  padding: 12px 14px;
  font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
  font-size: 11px;
  line-height: 1.7;
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg-inset-deep);
  color: var(--console-text);
}

.output-content div {
  white-space: pre-wrap;
  word-break: break-all;
}

/* Monitor Section */
.monitor-section {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  background: var(--surface-subtle);
}

.monitor-section .section-header {
  margin-bottom: 10px;
}

.monitor-section .section-header h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  gap: 6px;
}

.empty-monitor {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-muted);
  font-size: 12px;
}

.loading-text {
  color: var(--text-secondary);
}

.process-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.process-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--process-item-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  transition: all 0.15s ease;
}

.process-item:hover {
  background: var(--surface-tint);
}

.process-indicator {
  width: 7px;
  height: 7px;
  background: var(--success);
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(48, 209, 88, 0.5);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.process-info {
  flex: 1;
  min-width: 0;
}

.process-main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.process-port {
  font-weight: 600;
  font-size: 13px;
}

.process-name {
  font-weight: 600;
  font-size: 13px;
}

.process-pid {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
  background: var(--btn-outline-bg);
  padding: 1px 6px;
  border-radius: 20px;
}

.process-path {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.btn-icon-danger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-icon-danger:hover {
  background: var(--danger-light);
  color: var(--danger);
}

.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: var(--danger);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-danger:hover {
  background: var(--danger-hover);
  box-shadow: var(--danger-glow);
}

.btn-danger.btn-small {
  padding: 5px 10px;
  font-size: 12px;
}

/* Extensions */
.extensions-section {
  margin-top: 10px;
}

.extensions-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 3px 0;
  transition: color 0.1s;
}

.extensions-toggle:hover {
  color: var(--text);
}

.chevron {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.extensions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.extension-tag {
  font-size: 10px;
  font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
  padding: 3px 8px;
  background: var(--bg-inset);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text-secondary);
}
</style>
