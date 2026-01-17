<script setup lang="ts">
import type { Project } from "../types";
import ConsoleOutput from "./ConsoleOutput.vue";

defineProps<{
  project: Project;
  host: string;
  output: string[];
}>();

const emit = defineEmits<{
  openBrowser: [];
  clearOutput: [];
}>();
</script>

<template>
  <div class="content-section">
    <div class="info-table">
      <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-value">
          <span class="status-badge" :class="{ running: project.isRunning }">
            {{ project.isRunning ? 'Running' : 'Stopped' }}
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
</style>
