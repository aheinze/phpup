<script setup lang="ts">
defineProps<{
  files: string[];
  selectedFile: string;
  content: string;
}>();

const emit = defineEmits<{
  "update:selectedFile": [file: string];
  "update:content": [content: string];
  load: [file: string];
}>();

function selectFile(file: string) {
  emit("update:selectedFile", file);
  emit("load", file);
}
</script>

<template>
  <div class="content-section">
    <div class="section-header">
      <h2>Caddyfiles</h2>
    </div>

    <!-- File tabs -->
    <div class="tabs-container">
      <div class="tabs-pills">
        <button
          v-for="file in files"
          :key="file"
          class="tab-pill"
          :class="{ active: selectedFile === file }"
          @click="selectFile(file)"
        >
          <svg class="tab-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 1H3.5a1 1 0 00-1 1v10a1 1 0 001 1h7a1 1 0 001-1V4.5L8 1z"/>
            <path d="M8 1v3.5h3.5"/>
          </svg>
          {{ file }}
        </button>
      </div>
    </div>

    <div class="caddyfile-editor">
      <textarea
        :value="content"
        @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
        class="caddyfile-textarea"
        spellcheck="false"
        :placeholder="`# ${selectedFile} content...`"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.content-section {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.section-header {
  margin-bottom: 16px;
}

.section-header h2 {
  font-size: 16px;
  font-weight: 600;
}

.tabs-container {
  margin-bottom: 16px;
}

.tabs-pills {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-secondary);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  border: none;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-pill:hover:not(.active) {
  color: var(--text);
  background: var(--bg-hover);
}

.tab-pill.active {
  background: var(--bg);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.tab-pill.active .tab-icon {
  opacity: 1;
}

.caddyfile-editor {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.caddyfile-textarea {
  width: 100%;
  min-height: 400px;
  padding: 16px;
  border: none;
  background: var(--bg-secondary);
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  resize: vertical;
  outline: none;
}

.caddyfile-textarea::placeholder {
  color: var(--text-muted);
}
</style>
