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
  padding: 18px;
  overflow-y: auto;
}

.section-header {
  margin-bottom: 12px;
}

.section-header h2 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tabs-container {
  margin-bottom: 12px;
}

.tabs-pills {
  display: inline-flex;
  gap: 2px;
  background: var(--bg-inset);
  border-radius: var(--radius-xs);
  padding: 2px;
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: transparent;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-pill:hover:not(.active) {
  color: var(--text);
  background: var(--btn-outline-bg);
}

.tab-pill.active {
  background: var(--btn-outline-hover-bg);
  color: var(--accent);
}

.tab-icon {
  flex-shrink: 0;
  opacity: 0.5;
}

.tab-pill.active .tab-icon {
  opacity: 1;
}

.caddyfile-editor {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.caddyfile-textarea {
  width: 100%;
  min-height: 400px;
  padding: 14px;
  border: none;
  background: var(--bg-inset-deep);
  font-family: 'SF Mono', 'JetBrains Mono', Monaco, 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text);
  resize: vertical;
  outline: none;
  tab-size: 2;
}

.caddyfile-textarea:focus {
  background: var(--bg-inset-deep);
}

.caddyfile-textarea::placeholder {
  color: var(--text-muted);
}
</style>
