<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Command } from "@tauri-apps/plugin-shell";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Project, ProjectSettings } from "../types";
import { shellEscape } from "../lib/projectConfig";
import ConsoleOutput from "./ConsoleOutput.vue";
import DoctorPanel from "./DoctorPanel.vue";
import type { DoctorReport } from "../lib/doctor";
import { getStore } from "../composables/useStore";

const props = defineProps<{
  project: Project;
  settings: ProjectSettings;
  output: string[];
  detectedIde: string | null;
}>();

const emit = defineEmits<{
  openBrowser: [];
  clearOutput: [];
  openTools: [];
  openIde: [];
}>();

const serverUrl = computed(() => props.project.url || "");
const store = getStore();
const urlCopied = ref(false);

async function copyUrl() {
  const path = props.project.path;
  if (props.project.status !== "running" || !serverUrl.value) return;
  try {
    await writeText(serverUrl.value);
    if (props.project.path === path) urlCopied.value = true;
  } catch { store.addNotification("Could not copy the URL. Select the address to copy it manually.", "error"); }
}
watch(() => props.project.url, () => { urlCopied.value = false; });

const statusLabels: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting...",
  stopping: "Stopping...",
  running: "Running",
  crashed: "Crashed",
};

const statusClasses: Record<string, string> = {
  stopped: "",
  starting: "starting",
  stopping: "starting",
  running: "running",
  crashed: "crashed",
};

// Composer state
const hasComposer = ref(false);
const hasVendor = ref(false);
const composerAvailable = ref(false);
const runningComposer = ref(false);
const composerOutput = ref<string[]>([]);

const doctorRevision = ref(0);
function updateDiagnostics(report: DoctorReport | null) {
  hasComposer.value = !!report?.checks.some(c => c.id === "composer.manifest" && c.status === "pass");
  hasVendor.value = !!report?.checks.some(c => c.id === "composer.vendor" && c.status === "pass");
  composerAvailable.value = !!report?.checks.some(c => c.id === "composer" && c.status === "pass");
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
    const localCheck = await Command.create("run-bash", ["-c", `test -f ${shellEscape(localComposer)} && echo "exists"`]).execute();
    if (localCheck.stdout.trim() === "exists") {
      return `frankenphp php-cli ${shellEscape(localComposer)}`;
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
      `cd ${shellEscape(props.project.path)} && ${composerCmd} ${command} 2>&1`
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
      doctorRevision.value++;
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
  updateDiagnostics(null);
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
        <span class="info-label">Document root</span>
        <span class="info-value mono">{{ project.docroot }}</span>
      </div>
      <div v-if="project.status === 'running' && serverUrl" class="info-row">
        <span class="info-label">URL</span>
        <span class="info-value mono url-cell">
          <a
            href="#"
            class="url-link"
            @click.prevent="emit('openBrowser')"
          >{{ serverUrl }}</a>
          <button class="copy-btn" @click="copyUrl" :title="urlCopied ? 'Copied!' : 'Copy URL'">
            <svg v-if="!urlCopied" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="4" y="4" width="8" height="8" rx="1"/>
              <path d="M10 4V2.5A.5.5 0 009.5 2h-7a.5.5 0 00-.5.5v7a.5.5 0 00.5.5H4"/>
            </svg>
            <svg v-else width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 7l3 3 5-5"/>
            </svg>
          </button>
        </span>
      </div>
    </div>

    <!-- Quick Actions -->
    <div v-if="detectedIde || project.status === 'running'" class="quick-actions">
      <button v-if="project.status === 'running' && serverUrl" class="btn-outline btn-small" @click="emit('openBrowser')">Open in browser</button>
      <button v-if="detectedIde" class="btn-outline btn-small" @click="emit('openIde')">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 1H2.5a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 002.5 13h9a1.5 1.5 0 001.5-1.5V8"/>
          <path d="M8 1h5v5"/>
          <path d="M13 1L6 8"/>
        </svg>
        Open in {{ detectedIde }}
      </button>
    </div>

    <ConsoleOutput :key="project.id" :output="output" @clear="emit('clearOutput')" />

    <DoctorPanel :path="project.path" :revision="doctorRevision" @report="updateDiagnostics" />

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

  </div>
</template>

<style scoped>
.content-section {
  flex: 1;
  padding: 18px;
  overflow-y: auto;
}

.info-table {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface-subtle);
}

.info-row {
  display: flex;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  width: 96px;
  margin-right: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.info-value {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.info-value.mono {
  font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
  font-size: 12px;
}

.url-link {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.1s;
}

.url-link:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}

.url-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.copy-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  background: var(--btn-outline-bg);
  color: var(--text-secondary);
}

.status-badge.running {
  background: var(--success-light);
  color: var(--success);
}

.status-badge.starting {
  background: var(--warning-light);
  color: var(--warning);
  animation: pulse-badge 1.5s infinite;
}

.status-badge.crashed {
  background: var(--danger-light);
  color: var(--danger);
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

.composer-section {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  background: var(--surface-subtle);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.section-header h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.vendor-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.vendor-status.installed {
  color: var(--success);
}

.vendor-status.missing {
  color: var(--text-muted);
}

.composer-actions {
  display: flex;
  gap: 6px;
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
}

.btn-outline:hover {
  background: var(--btn-outline-hover-bg);
}

.btn-outline:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-small {
  padding: 5px 10px;
  font-size: 12px;
}

.composer-output {
  margin-top: 10px;
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
.url-cell { min-width: 0; align-items: flex-start; }
.url-link { min-width: 0; flex: 1; overflow-wrap: anywhere; }
</style>
