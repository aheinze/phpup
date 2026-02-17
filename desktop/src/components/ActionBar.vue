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
  height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  background: var(--surface-tint);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  border-radius: 0 0 var(--radius) var(--radius);
}

.action-spacer {
  flex: 1;
}

.btn-primary {
  padding: 10px 28px;
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: var(--accent-glow);
}

.btn-outline {
  padding: 10px 28px;
  background: var(--btn-outline-bg);
  color: var(--text);
  border: 1px solid var(--btn-outline-border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-outline:hover {
  background: var(--btn-outline-hover-bg);
}
</style>
