<script setup lang="ts">
import type { Project } from "../types";

defineProps<{
  project: Project | null;
  showSettings: boolean;
  showCaddyfile: boolean;
}>();

const emit = defineEmits<{
  init: [];
  configure: [];
  cancelSettings: [];
  saveSettings: [];
  cancelCaddyfile: [];
  saveCaddyfile: [];
  start: [];
  stop: [];
  openSettings: [];
  openCaddyfile: [];
  openFolder: [];
  remove: [];
}>();
</script>

<template>
  <div v-if="project" class="action-bar">
    <!-- Not configured view -->
    <template v-if="!project.hasConfig && !showSettings && !showCaddyfile">
      <button class="btn-primary" @click="emit('init')">Initialize</button>
      <button class="btn-outline" @click="emit('configure')">Configure</button>
    </template>

    <!-- Settings view -->
    <template v-else-if="showSettings">
      <button class="btn-outline" @click="emit('cancelSettings')">Cancel</button>
      <div class="action-spacer"></div>
      <button class="btn-primary" @click="emit('saveSettings')">Save</button>
    </template>

    <!-- Caddyfile view -->
    <template v-else-if="showCaddyfile">
      <button class="btn-outline" @click="emit('cancelCaddyfile')">Cancel</button>
      <div class="action-spacer"></div>
      <button class="btn-primary" @click="emit('saveCaddyfile')">Save</button>
    </template>

    <!-- Project info view -->
    <template v-else>
      <button
        v-if="!project.isRunning"
        class="btn-primary"
        @click="emit('start')"
      >Start</button>
      <button
        v-else
        class="btn-danger"
        @click="emit('stop')"
      >Stop</button>
      <button class="btn-outline" @click="emit('openSettings')">Settings</button>
      <button class="btn-outline" @click="emit('openCaddyfile')">Caddyfile</button>
      <div class="action-spacer"></div>
      <button class="btn-icon" @click="emit('openFolder')" title="Open Folder">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 4v9a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3H3a1 1 0 00-1 1z"/>
        </svg>
      </button>
      <button class="btn-icon btn-icon-danger" @click="emit('remove')" title="Remove">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4"/>
        </svg>
      </button>
    </template>
  </div>
</template>

<style scoped>
.action-bar {
  height: 65px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.action-spacer {
  flex: 1;
}

.btn-primary {
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

.btn-outline {
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

.btn-danger {
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

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.btn-icon-danger:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}
</style>
