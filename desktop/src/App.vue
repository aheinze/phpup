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

const store = getStore();

// Sidebar width
const sidebarWidth = ref(220);

// Initialize on mount
onMounted(async () => {
  await store.initialize();

  // Periodically check running status
  const interval = setInterval(store.refreshAllStatuses, 5000);
  onUnmounted(() => clearInterval(interval));
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
      @add-project="store.addProject"
      @add-group="store.showAddGroup.value = true"
      @toggle-group="store.toggleGroup"
      @rename-group="store.renameGroup"
      @delete-group="store.deleteGroup"
      @move-project="handleMoveProject"
      @reorder-projects="handleReorderProjects"
      @reorder-groups="handleReorderGroups"
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

    <!-- Main Content -->
    <main class="main">
      <!-- No project selected -->
      <div v-if="!store.selectedProject.value" class="empty-main">
        <p>Select a project to get started</p>
      </div>

      <!-- Project selected -->
      <template v-else>
        <div class="project-header">
          <h1>{{ store.selectedProject.value.name }}</h1>
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
          @open-browser="store.openInBrowser(store.selectedProject.value!)"
          @clear-output="store.projectOutput.value = []"
        />

        <!-- Action Bar -->
        <ActionBar
          :project="store.selectedProject.value"
          :show-settings="store.showSettings.value"
          :show-caddyfile="store.showCaddyfile.value"
          @init="store.initProject(store.selectedProject.value!)"
          @configure="store.showSettings.value = true"
          @cancel-settings="store.showSettings.value = false"
          @save-settings="store.saveSettings"
          @cancel-caddyfile="store.showCaddyfile.value = false"
          @save-caddyfile="store.saveCaddyfile"
          @start="store.startProject(store.selectedProject.value!)"
          @stop="store.stopProject(store.selectedProject.value!)"
          @open-settings="store.showSettings.value = true"
          @open-caddyfile="store.loadCaddyfile"
          @open-folder="store.openFolder(store.selectedProject.value!)"
          @remove="handleRemoveClick"
        />
      </template>
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg: #ffffff;
  --bg-secondary: #fafafa;
  --bg-hover: #f5f5f5;
  --bg-active: #f0f0f0;
  --text: #1a1a1a;
  --text-secondary: #666;
  --text-muted: #999;
  --border: #e5e5e5;
  --accent: #e11d48;
  --accent-light: #fef2f2;
  --success: #22c55e;
  --danger: #ef4444;
}

html, body, #app {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

.app {
  display: flex;
  height: 100%;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}

.empty-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.project-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.project-header h1 {
  font-size: 20px;
  font-weight: 600;
}

.content-section {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.init-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
}

.init-card p {
  color: var(--text-secondary);
}

.init-hint {
  font-size: 13px;
  margin-top: 8px;
  color: var(--text-muted);
}

/* Empty screen state */
.empty-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
}

.empty-content {
  text-align: center;
  max-width: 400px;
  padding: 40px;
}

.empty-content h1 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
  color: var(--text);
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-primary:hover {
  background: #be1b3f;
}

.btn-large {
  padding: 12px 24px;
  font-size: 15px;
}
</style>
