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
</style>
