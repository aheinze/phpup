<script setup lang="ts">
import { ref, watch } from "vue";
import { Command } from "@tauri-apps/plugin-shell";
import type { Project } from "../types";
import ConsoleOutput from "./ConsoleOutput.vue";

const props = defineProps<{
  project: Project;
  host: string;
  output: string[];
  detectedIde: string | null;
}>();

const emit = defineEmits<{
  openBrowser: [];
  clearOutput: [];
  openTools: [];
  openIde: [];
}>();

const statusLabels: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting...",
  running: "Running",
  crashed: "Crashed",
};

const statusClasses: Record<string, string> = {
  stopped: "",
  starting: "starting",
  running: "running",
  crashed: "crashed",
};

interface HealthCheck {
  name: string;
  status: "ok" | "warning" | "missing";
  message: string;
}

const healthChecks = ref<HealthCheck[]>([]);

// Composer state
const hasComposer = ref(false);
const hasVendor = ref(false);
const composerAvailable = ref(false);
const runningComposer = ref(false);
const composerOutput = ref<string[]>([]);

async function runHealthChecks() {
  const checks: HealthCheck[] = [];
  const projectPath = props.project.path;

  // Check for composer.json
  const composerCheck = await Command.create("run-bash", [
    "-c",
    `test -f "${projectPath}/composer.json" && echo "exists"`
  ]).execute();

  hasComposer.value = composerCheck.stdout.trim() === "exists";

  if (hasComposer.value) {
    const composerInstalled = await Command.create("run-bash", [
      "-c",
      "command -v composer"
    ]).execute();

    composerAvailable.value = composerInstalled.code === 0;

    if (composerAvailable.value) {
      // Get vendor directory from composer.json (default: vendor)
      const vendorDirResult = await Command.create("run-bash", [
        "-c",
        `cat "${projectPath}/composer.json" | grep -o '"vendor-dir"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/' | head -1`
      ]).execute();

      const vendorDir = vendorDirResult.stdout.trim() || "vendor";

      const vendorCheck = await Command.create("run-bash", [
        "-c",
        `test -d "${projectPath}/${vendorDir}" && echo "exists"`
      ]).execute();

      hasVendor.value = vendorCheck.stdout.trim() === "exists";

      if (!hasVendor.value) {
        checks.push({
          name: "Composer",
          status: "warning",
          message: "Run 'composer install' to install dependencies"
        });
      }
    } else {
      checks.push({
        name: "Composer",
        status: "missing",
        message: "Composer not installed"
      });
    }
  }

  // Check for package.json
  const packageCheck = await Command.create("run-bash", [
    "-c",
    `test -f "${projectPath}/package.json" && echo "exists"`
  ]).execute();

  if (packageCheck.stdout.trim() === "exists") {
    const nodeModulesCheck = await Command.create("run-bash", [
      "-c",
      `test -d "${projectPath}/node_modules" && echo "exists"`
    ]).execute();

    if (nodeModulesCheck.stdout.trim() !== "exists") {
      checks.push({
        name: "Node.js",
        status: "warning",
        message: "Run 'npm install' to install dependencies"
      });
    }
  }

  healthChecks.value = checks;
}

async function getComposerCommand(): Promise<string> {
  // Check for local composer.phar with frankenphp
  const homeDir = await Command.create("run-bash", ["-c", "echo $HOME"]).execute();
  const home = homeDir.stdout.trim();
  const localComposer = `${home}/.local/bin/composer.phar`;

  // Check if frankenphp is available
  const frankenCheck = await Command.create("run-bash", ["-c", "command -v frankenphp"]).execute();
  const hasFrankenphp = frankenCheck.code === 0;

  if (hasFrankenphp) {
    // Check for local composer.phar
    const localCheck = await Command.create("run-bash", ["-c", `test -f "${localComposer}" && echo "exists"`]).execute();
    if (localCheck.stdout.trim() === "exists") {
      return `frankenphp php-cli "${localComposer}"`;
    }
  }

  // Fall back to system composer
  return "composer";
}

async function runComposerCommand(command: string) {
  runningComposer.value = true;
  composerOutput.value = [`$ composer ${command}`];

  try {
    const composerCmd = await getComposerCommand();

    const cmd = Command.create("run-bash", [
      "-c",
      `cd "${props.project.path}" && ${composerCmd} ${command} 2>&1`
    ]);

    cmd.stdout.on("data", (line: string) => {
      composerOutput.value.push(line);
    });

    cmd.stderr.on("data", (line: string) => {
      composerOutput.value.push(line);
    });

    const result = await cmd.execute();

    if (result.code === 0) {
      composerOutput.value.push("✓ Done");
      await runHealthChecks();
    } else {
      composerOutput.value.push("✗ Command failed");
    }
  } catch (err) {
    composerOutput.value.push(`Error: ${err}`);
  } finally {
    runningComposer.value = false;
  }
}

watch(() => props.project.path, () => {
  composerOutput.value = [];
  runHealthChecks();
}, { immediate: true });
</script>

<template>
  <div class="content-section">
    <div class="info-table">
      <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-value">
          <span class="status-badge" :class="statusClasses[project.status || 'stopped']">
            {{ statusLabels[project.status || 'stopped'] }}
          </span>
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">Port</span>
        <span class="info-value">{{ project.port }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Path</span>
        <span class="info-value mono">{{ project.docroot }}</span>
      </div>
      <div v-if="project.isRunning" class="info-row">
        <span class="info-label">URL</span>
        <span class="info-value mono">
          <a
            href="#"
            class="url-link"
            @click.prevent="emit('openBrowser')"
          >http://{{ host }}:{{ project.port }}</a>
        </span>
      </div>
    </div>

    <!-- Quick Actions -->
    <div v-if="detectedIde" class="quick-actions">
      <button class="btn-outline btn-small" @click="emit('openIde')">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 1l3 3-8 8H2v-3l8-8z"/>
          <path d="M8 3l3 3"/>
        </svg>
        Open in {{ detectedIde }}
      </button>
    </div>

    <!-- Health Checks -->
    <div v-if="healthChecks.length > 0" class="health-checks">
      <div
        v-for="check in healthChecks"
        :key="check.name"
        class="health-check-item"
        :class="check.status"
      >
        <svg v-if="check.status === 'warning'" class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L1 13h12L7 1z" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <path d="M7 5v3M7 10v1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <svg v-else-if="check.status === 'missing'" class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
          <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <div class="check-content">
          <span class="check-name">{{ check.name }}</span>
          <span class="check-message">{{ check.message }}</span>
        </div>
      </div>
    </div>

    <!-- Composer Section -->
    <div v-if="hasComposer && composerAvailable" class="composer-section">
      <div class="section-header">
        <h3>Composer</h3>
        <span v-if="hasVendor" class="vendor-status installed">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M3.5 6l2 2 3-3" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
          Dependencies installed
        </span>
        <span v-else class="vendor-status missing">Dependencies not installed</span>
      </div>
      <div class="composer-actions">
        <button
          class="btn-outline btn-small"
          :disabled="runningComposer"
          @click="runComposerCommand('install')"
        >
          <span v-if="runningComposer">Running...</span>
          <span v-else>Install</span>
        </button>
        <button
          class="btn-outline btn-small"
          :disabled="runningComposer"
          @click="runComposerCommand('update')"
        >
          Update
        </button>
        <button
          class="btn-outline btn-small"
          :disabled="runningComposer"
          @click="runComposerCommand('dump-autoload')"
        >
          Dump Autoload
        </button>
      </div>
      <div v-if="composerOutput.length > 0" class="composer-output">
        <div class="output-header">
          <span>Output</span>
          <button class="clear-btn" @click="composerOutput = []">Clear</button>
        </div>
        <div class="output-content">
          <div v-for="(line, i) in composerOutput" :key="i">{{ line }}</div>
        </div>
      </div>
    </div>

    <ConsoleOutput :output="output" @clear="emit('clearOutput')" />
  </div>
</template>

<style scoped>
.content-section {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.info-table {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.info-row {
  display: flex;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  width: 120px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.info-value {
  flex: 1;
}

.info-value.mono {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
}

.url-link {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
}

.url-link:hover {
  text-decoration: underline;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.status-badge.running {
  background: #dcfce7;
  color: #166534;
}

.status-badge.starting {
  background: #fef3c7;
  color: #92400e;
  animation: pulse-badge 1.5s infinite;
}

.status-badge.crashed {
  background: #fee2e2;
  color: #991b1b;
}

@keyframes pulse-badge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.quick-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.health-checks {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.health-check-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 13px;
}

.health-check-item.warning {
  background: #fef3c7;
  color: #92400e;
}

.health-check-item.missing {
  background: #fee2e2;
  color: #991b1b;
}

.check-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.check-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.check-name {
  font-weight: 500;
}

.check-message {
  font-size: 12px;
  opacity: 0.85;
}

.composer-section {
  margin-top: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.section-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.vendor-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.vendor-status.installed {
  color: var(--success);
}

.vendor-status.missing {
  color: var(--text-muted);
}

.composer-actions {
  display: flex;
  gap: 8px;
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
}

.btn-outline:hover {
  background: var(--bg-hover);
}

.btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-small {
  padding: 6px 12px;
  font-size: 13px;
}

.composer-output {
  margin-top: 12px;
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
</style>
