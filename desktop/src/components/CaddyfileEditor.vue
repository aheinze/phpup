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
    <div class="caddyfile-tabs">
      <button
        v-for="file in files"
        :key="file"
        class="caddyfile-tab"
        :class="{ active: selectedFile === file }"
        @click="selectFile(file)"
      >
        {{ file }}
      </button>
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

.caddyfile-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.caddyfile-tab {
  padding: 6px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.caddyfile-tab:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.caddyfile-tab.active {
  background: var(--text);
  color: var(--bg);
  border-color: var(--text);
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
