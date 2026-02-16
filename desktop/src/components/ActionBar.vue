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
  </div>
</template>

<style scoped>
.action-bar {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  border-radius: 0 0 8px 8px;
}

.action-spacer {
  flex: 1;
}

.btn-primary {
  padding: 6px 14px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s;
}

.btn-primary:hover {
  background: #6d9df8;
}

.btn-outline {
  padding: 6px 14px;
  background: var(--bg-elevated);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.1s;
}

.btn-outline:hover {
  background: var(--bg-hover);
}
</style>
