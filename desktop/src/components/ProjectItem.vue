<script setup lang="ts">
import { ref } from "vue";
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
  rename: [project: Project, name: string];
  dragstart: [event: DragEvent, project: Project];
  dragend: [];
  dragover: [event: DragEvent, project: Project];
  dragleave: [];
  drop: [event: DragEvent, project: Project];
}>();

const editing = ref(false);

function startRename() {
  editing.value = true;
}

function finishRename(e: Event) {
  const value = (e.target as HTMLInputElement).value.trim();
  editing.value = false;
  if (value && value !== props.project.name) {
    emit("rename", props.project, value);
  }
}

function cancelRename() {
  editing.value = false;
}

function handleFaviconError() {
  props.project.favicon = undefined;
}
</script>

<template>
  <div
    class="project-item"
    :class="{
      active: isActive,
      running: project.status === 'running' || project.status === 'starting',
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
    <input
      v-if="editing"
      type="text"
      class="project-name-input"
      :value="project.name"
      @blur="finishRename"
      @keyup.enter="finishRename"
      @keyup.escape="cancelRename"
      @click.stop
      autofocus
    />
    <span v-else class="project-name" @dblclick.stop="startRename">{{ project.name }}</span>
    <button
      v-if="project.status === 'running' || project.status === 'starting'"
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
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all 0.15s ease;
}

.project-item:hover {
  background: var(--bg-hover);
}

.project-item.active {
  background: var(--accent-light);
}

.status-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: -2px;
}

.status-indicator.running {
  background: var(--success);
  box-shadow: 0 0 8px rgba(48, 209, 88, 0.5);
}

.status-indicator.starting {
  background: var(--warning);
  animation: pulse-dot 1.2s infinite;
}

.status-indicator.crashed {
  background: var(--danger);
  box-shadow: 0 0 6px rgba(255, 69, 58, 0.4);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.project-favicon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 3px;
  object-fit: contain;
}

.project-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 1;
  color: var(--text);
  letter-spacing: -0.01em;
}

.project-name-input {
  flex: 1;
  min-width: 0;
  background: var(--bg-inset-deep);
  border: 1px solid var(--accent);
  border-radius: var(--radius-xs);
  padding: 2px 6px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text);
  outline: none;
  box-shadow: var(--focus-ring);
}

.project-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
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
  background: var(--danger-light);
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
