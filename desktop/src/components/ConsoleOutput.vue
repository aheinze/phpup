<script setup lang="ts">
import { ref } from "vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const props = defineProps<{
  output: string[];
}>();

const emit = defineEmits<{
  clear: [];
}>();

const copied = ref(false);

async function copyToClipboard() {
  try {
    await writeText(props.output.join(""));
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch {
    // Fallback for environments without clipboard plugin
    try {
      await navigator.clipboard.writeText(props.output.join(""));
      copied.value = true;
      setTimeout(() => { copied.value = false; }, 1500);
    } catch {
      // ignore
    }
  }
}
</script>

<template>
  <div v-if="output.length > 0" class="console">
    <div class="console-header">
      <span>Logs</span>
      <div class="console-actions">
        <button class="icon-btn" @click="copyToClipboard" :title="copied ? 'Copied!' : 'Copy to clipboard'">
          <svg v-if="!copied" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="4" width="8" height="8" rx="1"/>
            <path d="M10 4V2.5A.5.5 0 009.5 2h-7a.5.5 0 00-.5.5v7a.5.5 0 00.5.5H4"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 7l3 3 5-5"/>
          </svg>
        </button>
        <button class="icon-btn" @click="emit('clear')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 2l10 10M12 2L2 12"/>
          </svg>
        </button>
      </div>
    </div>
    <pre class="console-output">{{ output.join("") }}</pre>
  </div>
</template>

<style scoped>
.console {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: var(--surface-tint);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.console-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.console-output {
  padding: 12px 14px;
  font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
  font-size: 11px;
  line-height: 1.7;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bg-inset-deep);
  color: var(--console-text);
  margin: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
</style>
