<script setup lang="ts">
import { ref } from "vue";
import type { Project, Group } from "../types";
import ProjectItem from "./ProjectItem.vue";

defineProps<{
  groups: Group[];
  projects: Project[];
  ungroupedProjects: Project[];
  projectsByGroup: Map<string, Project[]>;
  selectedProject: Project | null;
  searchQuery: string;
  width: number;
}>();

const emit = defineEmits<{
  "update:searchQuery": [query: string];
  "update:width": [width: number];
  selectProject: [project: Project];
  startProject: [project: Project];
  stopProject: [project: Project];
  addProject: [];
  addGroup: [];
  toggleGroup: [group: Group];
  renameGroup: [group: Group, name: string];
  deleteGroup: [group: Group];
  moveProject: [project: Project, groupId: string | undefined];
  reorderProjects: [fromId: string, toId: string];
  reorderGroups: [fromId: string, toId: string];
  openTools: [];
}>();

// Resize state
const isResizing = ref(false);
const minWidth = 160;
const maxWidth = 400;

function startResize() {
  isResizing.value = true;
  document.addEventListener("mousemove", handleResize);
  document.addEventListener("mouseup", stopResize);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function handleResize(e: MouseEvent) {
  if (!isResizing.value) return;
  const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
  emit("update:width", newWidth);
}

function stopResize() {
  isResizing.value = false;
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

// Drag state
const editingGroup = ref<Group | null>(null);
const draggedProject = ref<Project | null>(null);
const draggedGroup = ref<Group | null>(null);
const dragOverGroupId = ref<string | null>(null);
const dragOverProjectId = ref<string | null>(null);
const dragOverUngrouped = ref(false);

function onProjectDragStart(e: DragEvent, project: Project) {
  draggedProject.value = project;
  draggedGroup.value = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", project.id);
  }
}

function onGroupDragStart(e: DragEvent, group: Group) {
  draggedGroup.value = group;
  draggedProject.value = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", group.id);
  }
}

function onDragEnd() {
  draggedProject.value = null;
  draggedGroup.value = null;
  dragOverGroupId.value = null;
  dragOverProjectId.value = null;
  dragOverUngrouped.value = false;
}

function onGroupDragOver(e: DragEvent, groupId: string) {
  e.preventDefault();
  if (draggedProject.value) {
    dragOverGroupId.value = groupId;
  } else if (draggedGroup.value && draggedGroup.value.id !== groupId) {
    dragOverGroupId.value = groupId;
  }
}

function onUngroupedDragOver(e: DragEvent) {
  e.preventDefault();
  if (draggedProject.value) {
    dragOverUngrouped.value = true;
    dragOverGroupId.value = null;
  }
}

function onProjectDragOver(e: DragEvent, project: Project) {
  e.preventDefault();
  if (draggedProject.value && draggedProject.value.id !== project.id) {
    dragOverProjectId.value = project.id;
  }
}

function onDragLeave() {
  dragOverGroupId.value = null;
  dragOverProjectId.value = null;
  dragOverUngrouped.value = false;
}

function onGroupDrop(e: DragEvent, targetGroupId: string) {
  e.preventDefault();
  if (draggedProject.value) {
    emit("moveProject", draggedProject.value, targetGroupId);
  } else if (draggedGroup.value && draggedGroup.value.id !== targetGroupId) {
    emit("reorderGroups", draggedGroup.value.id, targetGroupId);
  }
  onDragEnd();
}

function onUngroupedDrop(e: DragEvent) {
  e.preventDefault();
  if (draggedProject.value) {
    emit("moveProject", draggedProject.value, undefined);
  }
  onDragEnd();
}

function onProjectDrop(e: DragEvent, targetProject: Project) {
  e.preventDefault();
  if (draggedProject.value && draggedProject.value.id !== targetProject.id) {
    emit("moveProject", draggedProject.value, targetProject.groupId);
    emit("reorderProjects", draggedProject.value.id, targetProject.id);
  }
  onDragEnd();
}

function handleRenameGroup(group: Group, newName: string) {
  emit("renameGroup", group, newName);
  editingGroup.value = null;
}
</script>

<template>
  <aside class="sidebar" :style="{ width: width + 'px' }">
    <div class="sidebar-header">
      <h2 class="sidebar-title">Projects</h2>
    </div>
    <div v-if="projects.length > 5" class="sidebar-search">
      <div class="search-wrapper">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="7" cy="7" r="5"/>
          <path d="M11 11l3 3"/>
        </svg>
        <input
          type="text"
          :value="searchQuery"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          placeholder="Filter projects..."
          class="search-input"
        >
      </div>
    </div>

    <div class="project-list">
      <!-- Groups -->
      <div v-for="group in groups" :key="group.id" class="group">
        <div
          class="group-header"
          :class="{ 'drag-over': dragOverGroupId === group.id }"
          draggable="true"
          @click="emit('toggleGroup', group)"
          @dragstart="onGroupDragStart($event, group)"
          @dragend="onDragEnd"
          @dragover="onGroupDragOver($event, group.id)"
          @dragleave="onDragLeave"
          @drop="onGroupDrop($event, group.id)"
        >
          <svg class="chevron" :class="{ collapsed: group.collapsed }" width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 3l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          <span v-if="editingGroup?.id !== group.id" class="group-name" @dblclick.stop="editingGroup = group">
            {{ group.name }}
          </span>
          <input
            v-else
            type="text"
            class="group-name-input"
            :value="group.name"
            @blur="handleRenameGroup(group, ($event.target as HTMLInputElement).value)"
            @keyup.enter="handleRenameGroup(group, ($event.target as HTMLInputElement).value)"
            @keyup.escape="editingGroup = null"
            @click.stop
            autofocus
          >
          <button class="icon-btn delete-btn" @click.stop="emit('deleteGroup', group)">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
          </button>
        </div>
        <div v-if="!group.collapsed" class="group-projects">
          <ProjectItem
            v-for="project in projectsByGroup.get(group.id)"
            :key="project.id"
            :project="project"
            :is-active="selectedProject?.id === project.id"
            :is-drag-over="dragOverProjectId === project.id"
            @select="emit('selectProject', $event)"
            @start="emit('startProject', $event)"
            @stop="emit('stopProject', $event)"
            @dragstart="onProjectDragStart"
            @dragend="onDragEnd"
            @dragover="onProjectDragOver"
            @dragleave="onDragLeave"
            @drop="onProjectDrop"
          />
        </div>
      </div>

      <!-- Ungrouped Projects -->
      <div
        v-if="ungroupedProjects.length > 0 || groups.length > 0"
        class="ungrouped"
        :class="{ 'drag-over': dragOverUngrouped }"
        @dragover="onUngroupedDragOver"
        @dragleave="onDragLeave"
        @drop="onUngroupedDrop"
      >
        <ProjectItem
          v-for="project in ungroupedProjects"
          :key="project.id"
          :project="project"
          :is-active="selectedProject?.id === project.id"
          :is-drag-over="dragOverProjectId === project.id"
          @select="emit('selectProject', $event)"
          @start="emit('startProject', $event)"
          @stop="emit('stopProject', $event)"
          @dragstart="onProjectDragStart"
          @dragend="onDragEnd"
          @dragover="onProjectDragOver"
          @dragleave="onDragLeave"
          @drop="onProjectDrop"
        />
      </div>

      <div v-if="projects.length === 0" class="empty-state">
        <p>No projects</p>
      </div>
    </div>

    <div class="sidebar-footer">
      <button class="icon-btn" @click="emit('addProject')" title="Add Project">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 3v10M3 8h10"/>
        </svg>
      </button>
      <button class="icon-btn" @click="emit('addGroup')" title="Add Group">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="12" height="10" rx="1"/>
          <path d="M2 6h12"/>
        </svg>
      </button>
      <div class="footer-spacer"></div>
      <button class="icon-btn" @click="emit('openTools')" title="Tools">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 2a4 4 0 00-3.8 5.2L2 11.5V14h2.5l4.3-4.2A4 4 0 1010 2z"/>
          <circle cx="11" cy="5" r="1" fill="currentColor"/>
        </svg>
      </button>
    </div>
  </aside>

  <!-- Resize Handle -->
  <div
    class="resize-handle"
    @mousedown="startResize"
    :class="{ resizing: isResizing }"
  ></div>
</template>

<style scoped>
.sidebar {
  min-width: 160px;
  max-width: 400px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--bg);
  flex-shrink: 0;
}

.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
}

.resize-handle:hover,
.resize-handle.resizing {
  background: var(--border);
}

.sidebar-header {
  padding: 16px 16px 8px;
}

.sidebar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-search {
  padding: 0 16px 8px;
}

.search-wrapper {
  position: relative;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 6px 10px 6px 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-secondary);
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: var(--text-muted);
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.sidebar-footer {
  height: 65px;
  padding: 0 16px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.footer-spacer {
  flex: 1;
}

.group {
  margin-bottom: 4px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.group-header:hover {
  background: var(--bg-hover);
}

.group-header.drag-over {
  background: var(--accent-light);
}

.chevron {
  transition: transform 0.2s;
  flex-shrink: 0;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.group-name {
  flex: 1;
}

.group-name-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  outline: none;
}

.group-projects {
  margin-left: 24px;
}

.delete-btn {
  opacity: 0;
}

.group-header:hover .delete-btn {
  opacity: 0.5;
}

.delete-btn:hover {
  opacity: 1 !important;
}

.ungrouped.drag-over {
  background: var(--accent-light);
  border-radius: 6px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.group-header[draggable="true"] {
  cursor: grab;
}

.group-header[draggable="true"]:active {
  cursor: grabbing;
}
</style>
