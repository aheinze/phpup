<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { logEntries, filterLogs } from "../lib/logs";

const props = defineProps<{ output: string[] }>();
const emit = defineEmits<{ clear: [] }>();
const query = ref("");
const issuesOnly = ref(false);
const following = ref(true);
const viewport = ref<HTMLElement | null>(null);
const feedback = ref("");
const entries = computed(() => logEntries(props.output));
const visible = computed(() => filterLogs(entries.value, query.value, issuesOnly.value));

async function scrollToLatest() {
  await nextTick();
  if (following.value && viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight;
}
watch(visible, scrollToLatest);
function onScroll() {
  const el = viewport.value;
  if (el && el.scrollHeight - el.clientHeight - el.scrollTop > 16) following.value = false;
}
function toggleFollow() {
  feedback.value = "";
  following.value = !following.value;
  if (following.value) scrollToLatest();
}
async function copyToClipboard() {
  try {
    await writeText(visible.value.map(entry => entry.raw).join("\n"));
    feedback.value = "Visible logs copied";
  } catch { feedback.value = "Could not copy logs. Select the text to copy it manually."; }
}
watch([query, issuesOnly, () => props.output], () => { feedback.value = ""; });
</script>

<template>
  <section class="console" aria-label="Server logs">
    <div class="console-header">
      <h3>Logs <span class="log-count">{{ visible.length }} / {{ entries.length }}</span></h3>
      <div class="console-actions">
        <button type="button" :aria-pressed="following" :class="{ active: following }" @click="toggleFollow" title="Follow new log messages">{{ following ? "Following" : "Follow" }}</button>
        <button type="button" @click="copyToClipboard" :disabled="!visible.length" title="Copy visible logs">Copy</button>
        <button type="button" @click="emit('clear')" :disabled="!entries.length" title="Clear captured logs">Clear</button>
      </div>
    </div>
    <div class="console-filters">
      <input v-model="query" type="search" aria-label="Search logs" placeholder="Search logs…" @keydown.esc="query = ''">
      <label><input v-model="issuesOnly" type="checkbox"> Errors &amp; warnings</label>
    </div>
    <div ref="viewport" class="console-output" tabindex="0" aria-label="Log output" @scroll="onScroll">
      <p v-if="!entries.length" class="log-empty">Server output from launches in this window appears here.</p>
      <p v-else-if="!visible.length" class="log-empty">No matching log messages. Change the search or filter.</p>
      <div v-for="(entry, index) in visible" :key="index" class="log-line" :class="entry.level"><span v-if="entry.level !== 'info'" class="log-level">{{ entry.level }}</span>{{ entry.message }}</div>
    </div>
    <p v-if="feedback" class="log-feedback" role="status">{{ feedback }}</p>
    <p v-else-if="!following && entries.length" class="log-feedback">Following paused. New messages are still captured.</p>
  </section>
</template>

<style scoped>
.console { margin-top: 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
.console-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 9px 12px; background: var(--surface-tint); }
h3 { font-size: 12px; font-weight: 600; margin: 0; }
.log-count { font-weight: 400; font-variant-numeric: tabular-nums; color: var(--text-secondary); margin-left: 6px; }
.console-actions { display: flex; gap: 5px; }
button { font: inherit; font-size: 11px; padding: 4px 7px; border: 1px solid var(--border); background: transparent; color: var(--text); border-radius: var(--radius-xs); cursor: pointer; }
button:hover { background: var(--bg-hover); }
button.active { background: var(--accent-light); }
button:disabled { opacity: .45; cursor: default; }
.console-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 0 12px 10px; border-bottom: 1px solid var(--border); }
input[type="search"] { flex: 1; min-width: 130px; width: 100%; background: var(--bg-inset-deep); border: 1px solid var(--border); padding: 6px 8px; color: var(--text); font: inherit; font-size: 12px; border-radius: var(--radius-xs); }
input::placeholder { color: var(--text-secondary); }
label { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-secondary); cursor: pointer; }
input[type="checkbox"] { accent-color: var(--accent); }
.console-output { padding: 12px; font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace; font-size: 11px; line-height: 1.7; max-height: 260px; overflow-y: auto; overflow-wrap: anywhere; background: var(--bg-inset-deep); color: var(--console-text); }
.log-line { white-space: pre-wrap; }
.log-line.error { color: var(--danger); }
.log-level { font-family: inherit; font-size: 10px; text-transform: uppercase; margin-right: 8px; }
.log-line.warning .log-level { color: var(--text); font-weight: 700; }
.log-empty, .log-feedback { color: var(--text-secondary); font-family: inherit; font-size: 12px; margin: 0; }
.log-feedback { padding: 8px 12px; font-size: 11px; border-top: 1px solid var(--border); }
button:focus-visible, input:focus-visible, .console-output:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
