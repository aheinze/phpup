<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Command } from "@tauri-apps/plugin-shell";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getStore } from "../composables/useStore";
import { shellEscape } from "../lib/projectConfig";
import { parseDoctorReport, type DoctorReport } from "../lib/doctor";

const props = defineProps<{ path: string; revision?: number }>();
const emit = defineEmits<{ report: [report: DoctorReport | null] }>();
const store = getStore();
const report = ref<DoctorReport | null>(null);
const loading = ref(false);
const error = ref("");
const copied = ref("");
const refresh = ref(0);
const issues = computed(() => (report.value?.checks.filter(check => check.status !== "pass") || []).sort((a, b) => Number(b.status === "error") - Number(a.status === "error")));
const passed = computed(() => report.value?.checks.filter(check => check.status === "pass") || []);
const summary = computed(() => {
  if (!report.value) return "";
  const { errors, warnings } = report.value.summary;
  return errors ? `${errors} ${errors === 1 ? "error" : "errors"}${warnings ? ` · ${warnings} ${warnings === 1 ? "warning" : "warnings"}` : ""}`
    : warnings ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}` : "Checks passed";
});

watch(() => [props.path, props.revision, refresh.value, store.phpupCommand.value], async (_, __, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  const path = props.path;
  report.value = null;
  emit("report", null);
  error.value = "";
  copied.value = "";
  loading.value = true;
  try {
    const result = await Command.create("run-bash", ["-c",
      `cd ${shellEscape(path)} && ${shellEscape(store.phpupCommand.value)} doctor --json`
    ]).execute();
    if (!current) return;
    if (!result.stdout.trim()) throw new Error(result.stderr.trim() || "PHPUp returned no diagnostics.");
    report.value = parseDoctorReport(result.stdout, result.code, path);
    emit("report", report.value);
  } catch (reason) {
    if (current) error.value = String(reason);
  } finally {
    if (current) loading.value = false;
  }
}, { immediate: true });

async function copyReport() {
  if (!report.value) return;
  const text = [`PHPUp doctor — ${report.value.project}`, summary.value,
    ...report.value.checks.map(c => `[${c.status}] ${c.title}: ${c.message}${c.fix ? `\n  Fix: ${c.fix}` : ""}`)].join("\n");
  try { await writeText(text); copied.value = "Report copied"; }
  catch { copied.value = "Could not copy. Run phpup doctor in a terminal to view the report."; }
}
</script>

<template>
  <section class="doctor-panel" aria-label="Project diagnostics" :aria-busy="loading">
    <div class="doctor-header">
      <h3>Diagnostics</h3>
      <button type="button" :disabled="loading" @click="refresh++">{{ loading ? "Checking…" : "Check again" }}</button>
    </div>
    <p v-if="loading" class="doctor-note" role="status">Checking runtime and saved project settings…</p>
    <div v-else-if="error" class="doctor-error" role="alert">
      <strong>Diagnostics unavailable</strong>
      <p>{{ error }}</p>
      <p>Run <code>phpup doctor</code> from this project to inspect it in a terminal.</p>
    </div>
    <template v-else-if="report">
      <p class="doctor-summary" :class="report.ok ? 'ready' : 'blocked'" role="status">{{ summary }}</p>
      <ul v-if="issues.length" class="doctor-issues">
        <li v-for="check in issues" :key="check.id" :class="check.status">
          <strong><span class="check-status">{{ check.status }}</span> {{ check.title }}</strong>
          <p>{{ check.message }}</p>
          <p v-if="check.fix" class="doctor-fix">{{ check.fix }}</p>
        </li>
      </ul>
      <details v-if="passed.length" class="doctor-passed">
        <summary>{{ passed.length }} passed checks</summary>
        <ul><li v-for="check in passed" :key="check.id"><strong>{{ check.title }}</strong><p>{{ check.message }}</p></li></ul>
      </details>
      <div class="doctor-footer">
        <span class="doctor-note">Read-only · uses saved settings</span>
        <button type="button" @click="copyReport">Copy report</button>
      </div>
      <p v-if="copied" class="doctor-note" role="status">{{ copied }}</p>
    </template>
  </section>
</template>

<style scoped>
.doctor-panel { margin-top: 20px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; font-size: 12px; line-height: 1.5; }
.doctor-header, .doctor-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h3 { font-size: 12px; margin: 0; font-weight: 600; }
button { font: inherit; color: var(--text); border: 1px solid var(--btn-outline-border); background: var(--btn-outline-bg); border-radius: var(--radius-xs); padding: 5px 9px; cursor: pointer; }
button:hover { background: var(--btn-outline-hover-bg); }
button:disabled { opacity: .6; cursor: wait; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
p { margin: 5px 0; overflow-wrap: anywhere; white-space: pre-line; }
.doctor-note { color: var(--text-secondary); font-size: 11px; }
.doctor-summary { font-weight: 600; margin: 10px 0; }
.blocked, .doctor-error { color: var(--danger); }
.doctor-issues, .doctor-passed ul { padding: 0; margin: 0; list-style: none; }
li { padding: 10px 0; border-top: 1px solid var(--border); }
.check-status { font-size: 10px; text-transform: uppercase; margin-right: 5px; color: var(--text-secondary); }
.error .check-status { color: var(--danger); }
.doctor-fix { color: var(--text-secondary); }
.doctor-passed { margin-top: 10px; }
summary { cursor: pointer; width: fit-content; }
.doctor-passed ul { margin-top: 8px; }
.doctor-passed p { color: var(--text-secondary); font-size: 11px; }
.doctor-footer { margin-top: 14px; }
</style>
