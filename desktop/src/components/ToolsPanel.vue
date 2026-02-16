<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Command } from "@tauri-apps/plugin-shell";
import { openUrl } from "@tauri-apps/plugin-opener";

// Shell escape function to prevent command injection
function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

// Validate PID is numeric only
function isValidPid(pid: string): boolean {
  return /^\d+$/.test(pid) && parseInt(pid, 10) > 0;
}

// Validate port is numeric
function isValidPort(port: string): boolean {
  const num = parseInt(port, 10);
  return !isNaN(num) && num > 0 && num <= 65535;
}

// Process monitoring
interface RunningProcess {
  pid: string;
  port: string;
  cwd: string;
  command: string;
}

const runningProcesses = ref<RunningProcess[]>([]);
const loadingProcesses = ref(false);
let processInterval: ReturnType<typeof setInterval> | null = null;

async function checkRunningProcesses() {
  loadingProcesses.value = true;
  try {
    // Find frankenphp processes (run or php-server)
    const cmd = Command.create("run-bash", [
      "-c",
      `ps aux | grep -E "frankenphp (run|php-server)" | grep -v grep | awk '{print $2}'`
    ]);
    const result = await cmd.execute();

    const processes: RunningProcess[] = [];
    const pids = result.stdout.trim().split("\n").filter(Boolean);

    for (const pid of pids) {
      // Validate PID is numeric to prevent path traversal
      if (!isValidPid(pid)) {
        console.warn("Invalid PID detected:", pid);
        continue;
      }

      // Get working directory
      const cwdCmd = await Command.create("run-bash", [
        "-c",
        `readlink -f /proc/${pid}/cwd 2>/dev/null || echo "unknown"`
      ]).execute();
      const cwd = cwdCmd.stdout.trim();

      // Get command line
      const cmdlineCmd = await Command.create("run-bash", [
        "-c",
        `cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' ' || echo ""`
      ]).execute();
      const cmdline = cmdlineCmd.stdout.trim();

      let port = "unknown";

      // Try to extract port from --listen flag
      const listenMatch = cmdline.match(/--listen[=\s]+[^:]*:(\d+)/);
      if (listenMatch && isValidPort(listenMatch[1])) {
        port = listenMatch[1];
      } else {
        // Try to read PORT from process environment
        const envCmd = await Command.create("run-bash", [
          "-c",
          `cat /proc/${pid}/environ 2>/dev/null | tr '\\0' '\\n' | grep "^PORT=" | cut -d= -f2`
        ]).execute();
        const envPort = envCmd.stdout.trim();
        if (envPort && isValidPort(envPort)) {
          port = envPort;
        }
      }

      processes.push({
        pid,
        port,
        cwd,
        command: cmdline.includes("php-server") ? "frankenphp php-server" : "frankenphp run"
      });
    }

    runningProcesses.value = processes;
  } catch {
    runningProcesses.value = [];
  } finally {
    loadingProcesses.value = false;
  }
}

async function killProcess(pid: string) {
  // Validate PID is numeric to prevent command injection
  if (!isValidPid(pid)) {
    console.error("Invalid PID:", pid);
    return;
  }

  try {
    await Command.create("run-bash", ["-c", `kill ${pid}`]).execute();
    // Wait a moment then refresh
    setTimeout(checkRunningProcesses, 500);
  } catch (err) {
    console.error("Failed to kill process:", err);
  }
}

async function killAllProcesses() {
  try {
    await Command.create("run-bash", [
      "-c",
      `pkill -f "frankenphp (run|php-server)" 2>/dev/null || true`
    ]).execute();
    setTimeout(checkRunningProcesses, 500);
  } catch {
    // Ignore errors
  }
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
      `frankenphp php-cli -m 2>/dev/null || php -m 2>/dev/null`,
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
  installingFrankenphp.value = true;
  frankenphpOutput.value = [];

  try {
    // Download installer to temp file first (safer than piping to sh)
    frankenphpOutput.value.push("Downloading FrankenPHP installer...");

    const downloadCmd = Command.create("run-bash", [
      "-c",
      "curl -fsSL https://frankenphp.dev/install.sh -o /tmp/frankenphp-install.sh"
    ]);

    const downloadResult = await downloadCmd.execute();
    if (downloadResult.code !== 0) {
      frankenphpOutput.value.push("✗ Failed to download installer");
      return;
    }

    frankenphpOutput.value.push("Running installer...");

    const cmd = Command.create("run-bash", [
      "-c",
      "chmod +x /tmp/frankenphp-install.sh && sh /tmp/frankenphp-install.sh && rm -f /tmp/frankenphp-install.sh"
    ]);

    cmd.stdout.on("data", (line: string) => {
      frankenphpOutput.value.push(line);
    });

    cmd.stderr.on("data", (line: string) => {
      frankenphpOutput.value.push(line);
    });

    const result = await cmd.execute();

    // Cleanup installer
    await Command.create("run-bash", ["-c", "rm -f /tmp/frankenphp-install.sh"]).execute();

    if (result.code === 0) {
      // Verify the binary works
      const verifyCmd = await Command.create("run-bash", ["-c", "frankenphp version 2>&1"]).execute();
      if (verifyCmd.code === 0) {
        frankenphpOutput.value.push("✓ FrankenPHP installed and verified successfully!");
      } else {
        frankenphpOutput.value.push("✓ FrankenPHP installed (verification pending)");
      }
      await checkFrankenPhp();
    } else {
      frankenphpOutput.value.push("✗ Installation failed. You may need to run with sudo.");
    }
  } catch (err) {
    frankenphpOutput.value.push(`Error: ${err}`);
  } finally {
    installingFrankenphp.value = false;
  }
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
  installingComposer.value = true;
  composerOutput.value = [];

  try {
    // Check if FrankenPHP is available
    if (!frankenphpInstalled.value) {
      composerOutput.value.push("✗ FrankenPHP is required to install Composer. Please install FrankenPHP first.");
      return;
    }

    const composerPath = await getComposerPath();
    const composerDir = composerPath.substring(0, composerPath.lastIndexOf("/"));
    const escapedDir = shellEscape(composerDir);

    // Create ~/.local/bin if it doesn't exist
    composerOutput.value.push("Setting up local bin directory...");
    await Command.create("run-bash", ["-c", `mkdir -p ${escapedDir}`]).execute();

    // Download composer installer
    composerOutput.value.push("Downloading Composer installer...");

    const downloadCmd = Command.create("run-bash", [
      "-c",
      "curl -sS https://getcomposer.org/installer -o /tmp/composer-setup.php"
    ]);

    downloadCmd.stderr.on("data", (line: string) => {
      composerOutput.value.push(line);
    });

    const downloadResult = await downloadCmd.execute();

    if (downloadResult.code !== 0) {
      composerOutput.value.push("✗ Failed to download Composer installer");
      return;
    }

    // Verify the installer with checksum
    composerOutput.value.push("Verifying installer checksum...");

    const verifyCmd = await Command.create("run-bash", [
      "-c",
      `EXPECTED_CHECKSUM="$(curl -sS https://composer.github.io/installer.sig)" && ` +
      `ACTUAL_CHECKSUM="$(frankenphp php-cli -r "echo hash_file('sha384', '/tmp/composer-setup.php');")" && ` +
      `if [ "$EXPECTED_CHECKSUM" = "$ACTUAL_CHECKSUM" ]; then echo "verified"; else echo "failed"; fi`
    ]).execute();

    if (verifyCmd.stdout.trim() !== "verified") {
      composerOutput.value.push("✗ Installer checksum verification failed. Aborting for security.");
      await Command.create("run-bash", ["-c", "rm -f /tmp/composer-setup.php"]).execute();
      return;
    }

    composerOutput.value.push("✓ Checksum verified");

    // Run installer with FrankenPHP
    composerOutput.value.push("Installing Composer using FrankenPHP...");

    const installCmd = Command.create("run-bash", [
      "-c",
      `frankenphp php-cli /tmp/composer-setup.php --install-dir=${escapedDir} --filename=composer.phar 2>&1`
    ]);

    installCmd.stdout.on("data", (line: string) => {
      composerOutput.value.push(line);
    });

    installCmd.stderr.on("data", (line: string) => {
      composerOutput.value.push(line);
    });

    const installResult = await installCmd.execute();

    // Cleanup installer
    await Command.create("run-bash", ["-c", "rm -f /tmp/composer-setup.php"]).execute();

    if (installResult.code === 0) {
      composerOutput.value.push(`✓ Composer installed to ${composerPath}`);
      await checkComposer();
    } else {
      composerOutput.value.push("✗ Installation failed.");
    }
  } catch (err) {
    composerOutput.value.push(`Error: ${err}`);
  } finally {
    installingComposer.value = false;
  }
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
        <h3>Running Servers</h3>
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
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 12h8"/>
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
  padding: 24px;
  overflow-y: auto;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.section-header h2 {
  font-size: 16px;
  font-weight: 600;
}

.tool-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.tool-info h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.tool-description {
  font-size: 13px;
  color: var(--text-secondary);
}

.tool-status {
  flex-shrink: 0;
}

.status-checking {
  font-size: 13px;
  color: var(--text-muted);
}

.status-installed {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--success);
}

.status-not-installed {
  font-size: 13px;
  color: var(--text-muted);
}

.tool-details {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.tool-version {
  font-size: 12px;
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 4px 8px;
  border-radius: 4px;
}

.tool-tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-light);
  padding: 3px 8px;
  border-radius: 4px;
}

.tool-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--text);
  color: var(--bg);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;
}

.btn-outline:hover {
  background: var(--bg-hover);
}

.btn-small {
  padding: 6px 12px;
  font-size: 13px;
}

.install-output {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.output-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}

.clear-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}

.clear-btn:hover {
  color: var(--text);
}

.output-content {
  padding: 12px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg);
}

.output-content div {
  white-space: pre-wrap;
  word-break: break-all;
}

/* Monitor Section */
.monitor-section {
  margin-top: 24px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.monitor-section .section-header {
  margin-bottom: 12px;
}

.monitor-section .section-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.empty-monitor {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
}

.loading-text {
  color: var(--text-secondary);
}

.process-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.process-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  transition: background 0.15s;
}

.process-item:hover {
  background: var(--bg-hover);
}

.process-indicator {
  width: 8px;
  height: 8px;
  background: var(--success);
  border-radius: 50%;
  flex-shrink: 0;
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
  gap: 8px;
}

.process-port {
  font-weight: 600;
  font-size: 14px;
}

.process-name {
  font-weight: 600;
  font-size: 14px;
}

.process-pid {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 4px;
}

.process-path {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'SF Mono', Monaco, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 4px;
}

.btn-icon-danger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.btn-icon-danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
}

.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--danger);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-danger:hover {
  opacity: 0.9;
}

.btn-danger.btn-small {
  padding: 6px 12px;
  font-size: 13px;
}

/* Extensions */
.extensions-section {
  margin-top: 12px;
}

.extensions-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 0;
}

.extensions-toggle:hover {
  color: var(--text);
}

.chevron {
  transition: transform 0.2s;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.extensions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.extension-tag {
  font-size: 11px;
  font-family: 'SF Mono', Monaco, monospace;
  padding: 3px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
}
</style>
