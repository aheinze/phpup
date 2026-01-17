<script setup lang="ts">
defineProps<{
  output: string[];
}>();

const emit = defineEmits<{
  clear: [];
}>();
</script>

<template>
  <div v-if="output.length > 0" class="console">
    <div class="console-header">
      <span>Logs</span>
      <button class="icon-btn" @click="emit('clear')">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 2l10 10M12 2L2 12"/>
        </svg>
      </button>
    </div>
    <pre class="console-output">{{ output.join("") }}</pre>
  </div>
</template>

<style scoped>
.console {
  margin-top: 24px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-secondary);
}

.console-output {
  padding: 16px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bg-secondary);
  margin: 0;
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
</style>
