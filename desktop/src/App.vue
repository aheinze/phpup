<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { Command } from "@tauri-apps/plugin-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getStore } from "./composables/useStore";
import Sidebar from "./components/Sidebar.vue";
import ProjectInfo from "./components/ProjectInfo.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import CaddyfileEditor from "./components/CaddyfileEditor.vue";
import ActionBar from "./components/ActionBar.vue";
import AddGroupModal from "./components/AddGroupModal.vue";
import ConfirmModal from "./components/ConfirmModal.vue";
import ToolsPanel from "./components/ToolsPanel.vue";
import TitleBar from "./components/TitleBar.vue";

const store = getStore();

// Theme detection — cross-platform (macOS, Windows, Linux/GNOME)
async function detectSystemTheme(): Promise<"dark" | "light"> {
  // matchMedia works reliably on macOS and Windows
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";

  // Linux/WebKitGTK workaround: matchMedia may not reflect GNOME dark preference
  try {
    const r = await Command.create("run-bash", ["-c",
      "gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null"
    ]).execute();
    if (r.code === 0 && r.stdout.includes("prefer-dark")) return "dark";
  } catch {}
  try {
    const r = await Command.create("run-bash", ["-c",
      "gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null"
    ]).execute();
    if (r.code === 0 && r.stdout.toLowerCase().includes("dark")) return "dark";
  } catch {}

  return "light";
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", theme);
}

// Sidebar width
const sidebarWidth = ref(220);

// IDE detection
const detectedIde = ref<string | null>(null);

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    if (store.showSettings.value) {
      store.saveSettings();
    } else if (store.showCaddyfile.value) {
      handleSaveCaddyfile();
    }
  }
}

// Initialize on mount
let unlistenClose: (() => void) | null = null;
let statusInterval: ReturnType<typeof setInterval> | null = null;

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeChangeHandler = async () => applyTheme(await detectSystemTheme());

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);
  mediaQuery.addEventListener("change", themeChangeHandler);
  statusInterval = setInterval(store.refreshAllStatuses, 5000);

  // Async work
  const theme = await detectSystemTheme();
  applyTheme(theme);

  unlistenClose = await appWindow.onCloseRequested((event) => {
    if (runningProjects.value.length > 0) {
      event.preventDefault();
      showCloseConfirm.value = true;
    }
  });

  await store.initialize();
  detectedIde.value = await store.detectIde();
});

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
  window.removeEventListener("keydown", handleKeydown);
  mediaQuery.removeEventListener("change", themeChangeHandler);
  unlistenClose?.();
  unlistenClose = null;
});

// Group management
function handleAddGroup(name: string) {
  store.addGroup(name);
  store.showAddGroup.value = false;
}

// Remove confirmation
const showRemoveConfirm = ref(false);

function handleRemoveClick() {
  showRemoveConfirm.value = true;
}

function handleRemoveConfirm() {
  if (store.selectedProject.value) {
    store.removeProject(store.selectedProject.value);
  }
  showRemoveConfirm.value = false;
}

// Port conflict
function handlePortConflictConfirm() {
  const conflict = store.portConflict.value;
  if (conflict) {
    store.portConflict.value = null;
    store.startProject(conflict.project, conflict.suggestedPort);
  }
}

function handlePortConflictCancel() {
  store.portConflict.value = null;
}

// Close confirmation
const showCloseConfirm = ref(false);
const appWindow = getCurrentWindow();

const runningProjects = computed(() =>
  store.projects.value.filter((p) => p.isRunning)
);

function handleRequestClose() {
  if (runningProjects.value.length > 0) {
    showCloseConfirm.value = true;
  } else {
    appWindow.destroy();
  }
}

async function handleStopAllAndClose() {
  showCloseConfirm.value = false;
  for (const project of runningProjects.value) {
    await store.stopProject(project);
  }
  appWindow.destroy();
}

function handleCloseWithoutStopping() {
  showCloseConfirm.value = false;
  appWindow.destroy();
}

function handleOpenTools() {
  store.selectedProject.value = null;
  store.showTools.value = true;
}

async function handleSaveCaddyfile() {
  const { valid, error } = await store.validateCaddyfile();
  if (!valid && error) {
    store.addNotification(`Caddyfile validation failed: ${error.split("\n")[0]}`, "warning");
    // Still save, but warn
  }
  await store.saveCaddyfile();
}

function handleOpenIde() {
  if (store.selectedProject.value) {
    store.openInIde(store.selectedProject.value);
  }
}

// Project reordering
function handleMoveProject(project: typeof store.selectedProject.value, groupId: string | undefined) {
  if (project) {
    project.groupId = groupId;
    store.saveData();
  }
}

function handleReorderProjects(fromId: string, toId: string) {
  const projects = store.projects.value;
  const fromIdx = projects.findIndex((p) => p.id === fromId);
  const toIdx = projects.findIndex((p) => p.id === toId);

  if (fromIdx !== -1 && toIdx !== -1) {
    const [removed] = projects.splice(fromIdx, 1);
    const newToIdx = projects.findIndex((p) => p.id === toId);
    projects.splice(newToIdx, 0, removed);
    store.saveData();
  }
}

function handleReorderGroups(fromId: string, toId: string) {
  const groups = store.groups.value;
  const fromIdx = groups.findIndex((g) => g.id === fromId);
  const toIdx = groups.findIndex((g) => g.id === toId);

  if (fromIdx !== -1 && toIdx !== -1) {
    const [removed] = groups.splice(fromIdx, 1);
    groups.splice(toIdx, 0, removed);
    store.saveData();
  }
}
</script>

<template>
  <TitleBar @close="handleRequestClose" />

  <!-- Empty state when no projects -->
  <div v-if="store.projects.value.length === 0" class="empty-screen">
    <div class="empty-content">
      <h1>Welcome to phpup</h1>
      <button class="btn-primary btn-large" @click="store.addProject">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3v10M3 8h10"/>
        </svg>
        Add Project
      </button>
    </div>
  </div>

  <div v-else class="app">
    <!-- Sidebar -->
    <Sidebar
      :groups="store.groups.value"
      :projects="store.projects.value"
      :ungrouped-projects="store.ungroupedProjects.value"
      :projects-by-group="store.projectsByGroup.value"
      :selected-project="store.selectedProject.value"
      :search-query="store.searchQuery.value"
      :width="sidebarWidth"
      @update:search-query="store.searchQuery.value = $event"
      @update:width="sidebarWidth = $event"
      @select-project="store.selectProject"
      @start-project="store.startProject"
      @stop-project="store.stopProject"
      @rename-project="store.renameProject"
      @add-project="store.addProject"
      @add-group="store.showAddGroup.value = true"
      @toggle-group="store.toggleGroup"
      @rename-group="store.renameGroup"
      @delete-group="store.deleteGroup"
      @move-project="handleMoveProject"
      @reorder-projects="handleReorderProjects"
      @reorder-groups="handleReorderGroups"
      @open-tools="handleOpenTools"
    />

    <!-- Add Group Modal -->
    <AddGroupModal
      :show="store.showAddGroup.value"
      @close="store.showAddGroup.value = false"
      @create="handleAddGroup"
    />

    <!-- Remove Confirmation Modal -->
    <ConfirmModal
      :show="showRemoveConfirm"
      title="Remove Project"
      :message="`Remove '${store.selectedProject.value?.name}' from the list?`"
      confirm-text="Remove"
      :danger="true"
      @confirm="handleRemoveConfirm"
      @cancel="showRemoveConfirm = false"
    />

    <!-- Port Conflict Modal -->
    <ConfirmModal
      :show="!!store.portConflict.value"
      title="Port In Use"
      :message="`Port ${store.portConflict.value?.project.port} is already in use. Start on port ${store.portConflict.value?.suggestedPort} instead?`"
      :confirm-text="`Use ${store.portConflict.value?.suggestedPort}`"
      @confirm="handlePortConflictConfirm"
      @cancel="handlePortConflictCancel"
    />

    <!-- Main Content -->
    <main class="main">
      <!-- Tools Panel -->
      <ToolsPanel v-if="store.showTools.value" />

      <!-- No project selected -->
      <div v-else-if="!store.selectedProject.value" class="empty-main">
        <p>Select a project to get started</p>
      </div>

      <!-- Project selected -->
      <template v-else>
        <div class="project-header">
          <h1>{{ store.selectedProject.value.name }}</h1>
          <div class="header-spacer"></div>

          <!-- Start/Stop -->
          <button
            v-if="store.selectedProject.value.hasConfig"
            class="header-icon-btn"
            :class="{ 'header-icon-success': store.selectedProject.value.status === 'stopped' || store.selectedProject.value.status === 'crashed', 'header-icon-danger': store.selectedProject.value.status === 'running' || store.selectedProject.value.status === 'starting' }"
            @click="(store.selectedProject.value.status === 'running' || store.selectedProject.value.status === 'starting') ? store.stopProject(store.selectedProject.value!) : store.startProject(store.selectedProject.value!)"
            :title="(store.selectedProject.value.status === 'running' || store.selectedProject.value.status === 'starting') ? 'Stop' : 'Start'"
          >
            <svg v-if="store.selectedProject.value.status === 'stopped' || store.selectedProject.value.status === 'crashed'" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5v11l9-5.5-9-5.5z"/>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="10" height="10" rx="1"/>
            </svg>
          </button>

          <!-- Settings -->
          <button
            v-if="store.selectedProject.value.hasConfig"
            class="header-icon-btn"
            :class="{ active: store.showSettings.value }"
            @click="store.showSettings.value = !store.showSettings.value; store.showCaddyfile.value = false"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 4h8M12 4h2M2 8h2M6 8h8M2 12h5M9 12h5"/>
              <circle cx="11" cy="4" r="1.5"/>
              <circle cx="5" cy="8" r="1.5"/>
              <circle cx="8" cy="12" r="1.5"/>
            </svg>
          </button>

          <!-- Caddyfile -->
          <button
            v-if="store.selectedProject.value.hasConfig"
            class="header-icon-btn"
            :class="{ active: store.showCaddyfile.value }"
            @click="store.showCaddyfile.value ? (store.showCaddyfile.value = false) : store.loadCaddyfile(); store.showSettings.value = false"
            title="Caddyfile"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5l-4-4z"/>
              <path d="M9 1v4h4M6 8h4M6 11h4"/>
            </svg>
          </button>

          <!-- Separator -->
          <div v-if="store.selectedProject.value.hasConfig" class="header-separator"></div>

          <!-- Open Folder -->
          <button class="header-icon-btn" @click="store.openFolder(store.selectedProject.value!)" title="Open Folder">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 4v9a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3H3a1 1 0 00-1 1z"/>
            </svg>
          </button>

          <!-- Remove -->
          <button class="header-icon-btn header-icon-danger" @click="handleRemoveClick" title="Remove">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4"/>
            </svg>
          </button>
        </div>

        <!-- Not configured state -->
        <div v-if="!store.selectedProject.value.hasConfig && !store.showSettings.value && !store.showCaddyfile.value" class="content-section">
          <div class="init-card">
            <p>This project hasn't been configured yet.</p>
            <p class="init-hint">Click Initialize to auto-detect settings, or Configure to set up manually.</p>
          </div>
        </div>

        <!-- Settings Panel -->
        <SettingsPanel
          v-else-if="store.showSettings.value"
          :settings="store.settings.value"
          :xdebug-available="store.xdebugAvailable.value"
          @update:settings="store.settings.value = $event"
        />

        <!-- Caddyfile Editor -->
        <CaddyfileEditor
          v-else-if="store.showCaddyfile.value"
          :files="store.caddyfileList.value"
          :selected-file="store.selectedCaddyfile.value"
          :content="store.caddyfileContent.value"
          @update:selected-file="store.selectedCaddyfile.value = $event"
          @update:content="store.caddyfileContent.value = $event"
          @load="store.loadSelectedCaddyfile"
        />

        <!-- Project Info -->
        <ProjectInfo
          v-else
          :project="store.selectedProject.value"
          :host="store.settings.value.host"
          :output="store.projectOutput.value"
          :detected-ide="detectedIde"
          @open-browser="store.openInBrowser(store.selectedProject.value!)"
          @clear-output="store.projectOutput.value = []"
          @open-ide="handleOpenIde"
        />

        <!-- Action Bar (only for unconfigured or editing mode) -->
        <ActionBar
          v-if="!store.selectedProject.value.hasConfig || store.showSettings.value || store.showCaddyfile.value"
          :project="store.selectedProject.value"
          :show-settings="store.showSettings.value"
          :show-caddyfile="store.showCaddyfile.value"
          @init="store.initProject(store.selectedProject.value!)"
          @configure="store.showSettings.value = true"
          @cancel-settings="store.showSettings.value = false"
          @save-settings="store.saveSettings"
          @cancel-caddyfile="store.showCaddyfile.value = false"
          @save-caddyfile="handleSaveCaddyfile"
        />
      </template>
    </main>

    <!-- Close Confirmation Modal -->
    <div v-if="showCloseConfirm" class="modal-overlay" @click.self="showCloseConfirm = false">
      <div class="modal">
        <h3>Running Servers</h3>
        <p>{{ runningProjects.length }} server{{ runningProjects.length > 1 ? 's are' : ' is' }} still running. What would you like to do?</p>
        <div class="modal-actions">
          <button class="btn-outline" @click="showCloseConfirm = false">Cancel</button>
          <button class="btn-outline" @click="handleCloseWithoutStopping">Keep Running</button>
          <button class="btn-danger" @click="handleStopAllAndClose">Stop All & Close</button>
        </div>
      </div>
    </div>

    <!-- Notifications -->
    <div v-if="store.notifications.value.length > 0" class="notification-container">
      <div
        v-for="notif in store.notifications.value"
        :key="notif.id"
        class="notification-toast"
        :class="notif.type"
        @click="store.dismissNotification(notif.id)"
      >
        <svg v-if="notif.type === 'error'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="8" cy="8" r="6.5"/>
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/>
        </svg>
        <svg v-else-if="notif.type === 'warning'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 2L1 14h14L8 2z"/>
          <path d="M8 6v4M8 12v1"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="8" cy="8" r="6.5"/>
          <path d="M8 5v3M8 10v1"/>
        </svg>
        <span>{{ notif.message }}</span>
      </div>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  /* Canvas & surfaces */
  --bg-canvas: #0d0d0f;
  --bg: rgba(28, 28, 32, 0.72);
  --bg-solid: #1c1c20;
  --bg-secondary: rgba(38, 38, 44, 0.65);
  --bg-secondary-solid: #26262c;
  --bg-hover: rgba(255, 255, 255, 0.06);
  --bg-active: rgba(255, 255, 255, 0.09);
  --bg-elevated: rgba(48, 48, 55, 0.7);

  /* Text */
  --text: #e5e5ea;
  --text-secondary: #98989f;
  --text-muted: #58585e;

  /* Borders — luminous white edges */
  --border: rgba(255, 255, 255, 0.08);
  --border-light: rgba(255, 255, 255, 0.05);

  /* Accent — Apple blue */
  --accent: #0a84ff;
  --accent-hover: #409cff;
  --accent-light: rgba(10, 132, 255, 0.15);

  /* Semantic */
  --success: #30d158;
  --success-light: rgba(48, 209, 88, 0.15);
  --danger: #ff453a;
  --danger-light: rgba(255, 69, 58, 0.15);
  --warning: #ffd60a;
  --warning-light: rgba(255, 214, 10, 0.12);

  /* Glass */
  --glass-blur: 24px;
  --glass-bg: rgba(30, 30, 36, 0.55);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.2);

  /* Radii */
  --radius: 12px;
  --radius-sm: 8px;
  --radius-xs: 6px;

  /* Surface tints */
  --surface-tint: rgba(255, 255, 255, 0.03);
  --surface-subtle: rgba(255, 255, 255, 0.02);

  /* Inset backgrounds */
  --bg-inset: rgba(0, 0, 0, 0.2);
  --bg-inset-deep: rgba(0, 0, 0, 0.3);

  /* Modal & overlay */
  --overlay-bg: rgba(0, 0, 0, 0.45);
  --modal-bg: rgba(40, 40, 48, 0.85);
  --modal-border: rgba(255, 255, 255, 0.12);
  --modal-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;

  /* Button outline */
  --btn-outline-bg: rgba(255, 255, 255, 0.06);
  --btn-outline-border: rgba(255, 255, 255, 0.1);
  --btn-outline-hover-bg: rgba(255, 255, 255, 0.1);
  --text-on-accent: #fff;

  /* Console & output */
  --console-text: rgba(255, 255, 255, 0.6);

  /* Info color */
  --info: #64d2ff;

  /* Toggle switch */
  --toggle-bg: rgba(255, 255, 255, 0.12);
  --toggle-knob: rgba(255, 255, 255, 0.5);
  --toggle-knob-active: #fff;

  /* Scrollbar */
  --scrollbar-thumb: rgba(255, 255, 255, 0.1);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.18);

  /* Misc */
  --drop-hint-border: rgba(255, 255, 255, 0.1);
  --process-item-bg: rgba(0, 0, 0, 0.15);
  --notification-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  --focus-ring: 0 0 0 3px rgba(10, 132, 255, 0.15);
  --accent-glow: 0 2px 12px rgba(10, 132, 255, 0.3);
  --danger-hover: #ff6961;
  --danger-glow: 0 2px 12px rgba(255, 69, 58, 0.3);
}

html, body, #app {
  height: 100%;
  background: var(--bg-canvas);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  display: flex;
  flex-direction: column;
}

.app {
  display: flex;
  flex: 1;
  gap: 1px;
  padding: 0 8px 8px;
  background: var(--bg-canvas);
  min-height: 0;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  overflow: hidden;
  border-radius: var(--radius);
  box-shadow: var(--glass-shadow);
}

.empty-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}

.project-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-tint);
  border-radius: var(--radius) var(--radius) 0 0;
}

.project-header h1 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.header-spacer {
  flex: 1;
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  color: var(--text-muted);
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.header-icon-btn.active {
  background: var(--accent-light);
  color: var(--accent);
}

.header-icon-danger:hover {
  color: var(--danger);
  background: var(--danger-light);
}

.header-icon-success:hover {
  color: var(--success);
  background: var(--success-light);
}

.header-separator {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 2px;
}

.content-section {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.init-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 28px;
  text-align: center;
  background: var(--surface-tint);
}

.init-card p {
  color: var(--text-secondary);
}

.init-hint {
  font-size: 12px;
  margin-top: 8px;
  color: var(--text-muted);
}

/* Empty screen state */
.empty-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-canvas);
}

.empty-content {
  text-align: center;
  max-width: 400px;
  padding: 40px;
}

.empty-content h1 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 24px;
  color: var(--text);
  letter-spacing: -0.02em;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
  letter-spacing: -0.01em;
}

.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: var(--accent-glow);
}

.btn-large {
  padding: 10px 22px;
  font-size: 14px;
}

/* Notifications */
.notification-container {
  position: fixed;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1000;
  max-width: 380px;
}

.notification-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  animation: slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--notification-shadow);
}

.notification-toast.error {
  background: var(--danger-light);
  color: var(--danger);
  border-color: var(--danger-light);
}

.notification-toast.warning {
  background: var(--warning-light);
  color: var(--warning);
  border-color: var(--warning-light);
}

.notification-toast.info {
  background: var(--accent-light);
  color: var(--info);
  border-color: var(--accent-light);
}

@keyframes slide-in {
  from { transform: translateY(8px) scale(0.96); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Close confirmation modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: overlay-in 0.15s ease;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--modal-bg);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid var(--modal-border);
  border-radius: var(--radius);
  padding: 22px;
  width: 380px;
  max-width: 90%;
  box-shadow: var(--modal-shadow);
  animation: modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modal-in {
  from { transform: scale(0.95) translateY(8px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

.modal h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
  letter-spacing: -0.02em;
}

.modal p {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.btn-outline {
  padding: 7px 16px;
  background: var(--btn-outline-bg);
  color: var(--text);
  border: 1px solid var(--btn-outline-border);
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-outline:hover {
  background: var(--btn-outline-hover-bg);
}

.btn-danger {
  padding: 7px 16px;
  background: var(--danger);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-danger:hover {
  background: var(--danger-hover);
  box-shadow: var(--danger-glow);
}

/* Light theme */
:root[data-theme="light"] {
  /* Canvas & surfaces */
  --bg-canvas: #f5f5f7;
  --bg: rgba(255, 255, 255, 0.72);
  --bg-solid: #ffffff;
  --bg-secondary: rgba(245, 245, 247, 0.65);
  --bg-secondary-solid: #f0f0f2;
  --bg-hover: rgba(0, 0, 0, 0.04);
  --bg-active: rgba(0, 0, 0, 0.07);
  --bg-elevated: rgba(255, 255, 255, 0.85);

  /* Text */
  --text: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-muted: #aeaeb2;

  /* Borders */
  --border: rgba(0, 0, 0, 0.1);
  --border-light: rgba(0, 0, 0, 0.06);

  /* Accent */
  --accent: #007aff;
  --accent-hover: #0066d6;
  --accent-light: rgba(0, 122, 255, 0.1);

  /* Semantic */
  --success: #34c759;
  --success-light: rgba(52, 199, 89, 0.12);
  --danger: #ff3b30;
  --danger-light: rgba(255, 59, 48, 0.1);
  --warning: #ff9500;
  --warning-light: rgba(255, 149, 0, 0.1);

  /* Glass */
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(0, 0, 0, 0.08);
  --glass-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.05);

  /* Surface tints */
  --surface-tint: rgba(0, 0, 0, 0.02);
  --surface-subtle: rgba(0, 0, 0, 0.015);

  /* Inset backgrounds */
  --bg-inset: rgba(0, 0, 0, 0.04);
  --bg-inset-deep: rgba(0, 0, 0, 0.06);

  /* Modal & overlay */
  --overlay-bg: rgba(0, 0, 0, 0.25);
  --modal-bg: rgba(255, 255, 255, 0.88);
  --modal-border: rgba(0, 0, 0, 0.1);
  --modal-shadow: 0 24px 80px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05) inset;

  /* Button outline */
  --btn-outline-bg: rgba(0, 0, 0, 0.04);
  --btn-outline-border: rgba(0, 0, 0, 0.12);
  --btn-outline-hover-bg: rgba(0, 0, 0, 0.07);

  /* Console text */
  --console-text: rgba(0, 0, 0, 0.55);

  /* Info */
  --info: #0055cc;

  /* Toggle switch */
  --toggle-bg: rgba(0, 0, 0, 0.12);
  --toggle-knob: rgba(255, 255, 255, 0.9);

  /* Scrollbar */
  --scrollbar-thumb: rgba(0, 0, 0, 0.12);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.2);

  /* Misc */
  --drop-hint-border: rgba(0, 0, 0, 0.15);
  --process-item-bg: rgba(0, 0, 0, 0.03);
  --notification-shadow: 0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
  --focus-ring: 0 0 0 3px rgba(0, 122, 255, 0.2);
  --accent-glow: 0 2px 12px rgba(0, 122, 255, 0.2);
  --danger-hover: #e0342b;
  --danger-glow: 0 2px 12px rgba(255, 59, 48, 0.2);
}
</style>
