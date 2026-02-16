<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
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
onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);
  await store.initialize();
  detectedIde.value = await store.detectIde();

  // Periodically check running status
  const interval = setInterval(store.refreshAllStatuses, 5000);
  onUnmounted(() => {
    clearInterval(interval);
    window.removeEventListener("keydown", handleKeydown);
  });
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
  <TitleBar />

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
  --bg-canvas: #16171a;
  --bg: #1e1f22;
  --bg-secondary: #2b2d30;
  --bg-hover: #35373b;
  --bg-active: #3c3f41;
  --bg-elevated: #393b40;
  --text: #bcbec4;
  --text-secondary: #8c8e94;
  --text-muted: #5e6068;
  --border: #393b40;
  --accent: #548af7;
  --accent-light: rgba(84, 138, 247, 0.12);
  --success: #57a64a;
  --success-light: rgba(87, 166, 74, 0.15);
  --danger: #e05555;
  --danger-light: rgba(224, 85, 85, 0.12);
  --warning: #c78b31;
  --warning-light: rgba(199, 139, 49, 0.15);
}

html, body, #app {
  height: 100%;
  background: var(--bg-canvas);
  color: var(--text);
  font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

#app {
  display: flex;
  flex-direction: column;
}

.app {
  display: flex;
  flex: 1;
  gap: 6px;
  padding: 0 8px 8px;
  background: var(--bg-canvas);
  min-height: 0;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
  border-radius: 8px;
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
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  border-radius: 8px 8px 0 0;
}

.project-header h1 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
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
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.1s;
}

.header-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.header-icon-btn.active {
  background: var(--bg-active);
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
  border-radius: 6px;
  padding: 24px;
  text-align: center;
  background: var(--bg-secondary);
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
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--text);
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s;
  font-family: inherit;
}

.btn-primary:hover {
  background: #6d9df8;
}

.btn-large {
  padding: 10px 20px;
}

/* Notifications */
.notification-container {
  position: fixed;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 1000;
  max-width: 380px;
}

.notification-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  animation: slide-in 0.15s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border);
}

.notification-toast.error {
  background: #3c2020;
  color: #e88;
  border-color: #5a2d2d;
}

.notification-toast.warning {
  background: #3c3420;
  color: #e8c36a;
  border-color: #5a4d2d;
}

.notification-toast.info {
  background: #1e2a3c;
  color: #7ab0e8;
  border-color: #2d3d5a;
}

@keyframes slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>
