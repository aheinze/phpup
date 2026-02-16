<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Project } from "../types";

const props = defineProps<{
  project: Project;
  isActive: boolean;
  isDragOver: boolean;
}>();

const emit = defineEmits<{
  select: [project: Project];
  start: [project: Project];
  stop: [project: Project];
  dragstart: [event: DragEvent, project: Project];
  dragend: [];
  dragover: [event: DragEvent, project: Project];
  dragleave: [];
  drop: [event: DragEvent, project: Project];
}>();

function handleFaviconError() {
  props.project.favicon = undefined;
}
</script>

<template>
  <div
    class="project-item"
    :class="{
      active: isActive,
      running: project.isRunning,
      'drag-over': isDragOver
    }"
    draggable="true"
    @click="emit('select', project)"
    @dragstart="emit('dragstart', $event, project)"
    @dragend="emit('dragend')"
    @dragover="emit('dragover', $event, project)"
    @dragleave="emit('dragleave')"
    @drop="emit('drop', $event, project)"
  >
    <span v-if="project.status === 'running'" class="status-indicator running"></span>
    <span v-else-if="project.status === 'starting'" class="status-indicator starting"></span>
    <span v-else-if="project.status === 'crashed'" class="status-indicator crashed"></span>
    <img
      v-if="project.favicon"
      :src="convertFileSrc(project.favicon)"
      class="project-favicon"
      @error="handleFaviconError"
    />
    <span class="project-name">{{ project.name }}</span>
    <button
      v-if="project.isRunning"
      class="project-action-btn stop"
      @click.stop="emit('stop', project)"
      title="Stop"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <rect x="2" y="2" width="8" height="8" rx="1"/>
      </svg>
    </button>
    <button
      v-else-if="project.hasConfig"
      class="project-action-btn play"
      @click.stop="emit('start', project)"
      title="Start"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M3 1.5v9l7.5-4.5L3 1.5z"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.project-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.project-item:hover {
  background: var(--bg-hover);
}

.project-item.active {
  background: var(--bg-active);
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: -4px;
}

.status-indicator.running {
  background: var(--success);
}

.status-indicator.starting {
  background: #f59e0b;
  animation: pulse-dot 1.5s infinite;
}

.status-indicator.crashed {
  background: var(--danger);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.project-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 3px;
  object-fit: contain;
}

.project-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  line-height: 1;
}

.project-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

.project-item:hover .project-action-btn,
.project-action-btn.stop {
  opacity: 1;
}

.project-action-btn:hover {
  background: var(--bg-hover);
}

.project-action-btn.play:hover {
  color: var(--success);
}

.project-action-btn.stop:hover {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}

.project-item[draggable="true"] {
  cursor: grab;
}

.project-item[draggable="true"]:active {
  cursor: grabbing;
}

.project-item.drag-over {
  background: var(--accent-light);
  border-top: 2px solid var(--accent);
  margin-top: -2px;
}
</style>
