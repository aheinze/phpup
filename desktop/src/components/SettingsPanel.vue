<script setup lang="ts">
import type { ProjectSettings } from "../types";

const props = defineProps<{
  settings: ProjectSettings;
  xdebugAvailable: boolean;
}>();

const emit = defineEmits<{
  "update:settings": [settings: ProjectSettings];
}>();

function updateSetting<K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) {
  emit("update:settings", { ...props.settings, [key]: value });
}
</script>

<template>
  <div class="content-section">
    <div class="section-header">
      <h2>Settings</h2>
    </div>

    <div class="settings-grid">
      <div class="setting-row">
        <label>Host</label>
        <input
          type="text"
          :value="settings.host"
          @input="updateSetting('host', ($event.target as HTMLInputElement).value)"
          placeholder="127.0.0.1"
        >
      </div>
      <div class="setting-row">
        <label>Port</label>
        <input
          type="text"
          :value="settings.port"
          @input="updateSetting('port', ($event.target as HTMLInputElement).value)"
          placeholder="8000"
        >
      </div>
      <div class="setting-row">
        <label>Domain</label>
        <input
          type="text"
          :value="settings.domain"
          @input="updateSetting('domain', ($event.target as HTMLInputElement).value)"
          placeholder="myapp.test"
        >
      </div>
      <div class="setting-row">
        <label>Document Root</label>
        <input
          type="text"
          :value="settings.docroot"
          @input="updateSetting('docroot', ($event.target as HTMLInputElement).value)"
          placeholder="./public"
        >
      </div>
      <div class="setting-row">
        <label>PHP Threads</label>
        <input
          type="text"
          :value="settings.phpThreads"
          @input="updateSetting('phpThreads', ($event.target as HTMLInputElement).value)"
          placeholder="auto"
        >
      </div>
    </div>

    <div class="section-header">
      <h2>Options</h2>
    </div>

    <div class="options-list">
      <div class="option-row">
        <span>HTTPS</span>
        <div class="segmented">
          <button
            :class="{ active: settings.httpsMode === 'off' }"
            @click="updateSetting('httpsMode', 'off')"
          >Off</button>
          <button
            :class="{ active: settings.httpsMode === 'local' }"
            @click="updateSetting('httpsMode', 'local')"
          >Local</button>
          <button
            :class="{ active: settings.httpsMode === 'on' }"
            @click="updateSetting('httpsMode', 'on')"
          >On</button>
        </div>
      </div>
      <label class="toggle-row">
        <span>Worker Mode</span>
        <input
          type="checkbox"
          :checked="settings.workerMode"
          @change="updateSetting('workerMode', ($event.target as HTMLInputElement).checked)"
        >
        <span class="toggle"></span>
      </label>
      <label class="toggle-row">
        <span>Watch Mode</span>
        <input
          type="checkbox"
          :checked="settings.watchMode"
          @change="updateSetting('watchMode', ($event.target as HTMLInputElement).checked)"
        >
        <span class="toggle"></span>
      </label>
      <label class="toggle-row">
        <span>Compression</span>
        <input
          type="checkbox"
          :checked="settings.compression"
          @change="updateSetting('compression', ($event.target as HTMLInputElement).checked)"
        >
        <span class="toggle"></span>
      </label>
      <label class="toggle-row">
        <span>Open Browser</span>
        <input
          type="checkbox"
          :checked="settings.openBrowser"
          @change="updateSetting('openBrowser', ($event.target as HTMLInputElement).checked)"
        >
        <span class="toggle"></span>
      </label>
      <label v-if="xdebugAvailable" class="toggle-row">
        <span>Xdebug</span>
        <input
          type="checkbox"
          :checked="settings.xdebug"
          @change="updateSetting('xdebug', ($event.target as HTMLInputElement).checked)"
        >
        <span class="toggle"></span>
      </label>
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

.section-header:not(:first-child) {
  margin-top: 24px;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.setting-row label {
  font-size: 12px;
  color: var(--text-muted);
}

.setting-row input {
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-family: inherit;
  background: var(--bg-inset);
  color: var(--text);
  outline: none;
  transition: all 0.15s ease;
}

.setting-row input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.options-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface-subtle);
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
}

.option-row:last-child {
  border-bottom: none;
}

.segmented {
  display: flex;
  background: var(--bg-inset);
  border-radius: var(--radius-xs);
  padding: 2px;
  gap: 2px;
}

.segmented button {
  padding: 4px 12px;
  background: transparent;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.segmented button:not(:last-child) {
  border-right: none;
}

.segmented button.active {
  background: var(--accent);
  color: var(--text-on-accent);
  box-shadow: var(--accent-glow);
}

.segmented button:not(.active):hover {
  background: var(--btn-outline-bg);
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s;
}

.toggle-row:hover {
  background: var(--surface-subtle);
}

.toggle-row:last-child {
  border-bottom: none;
}

.toggle-row input {
  display: none;
}

.toggle {
  width: 38px;
  height: 22px;
  background: var(--toggle-bg);
  border-radius: 11px;
  position: relative;
  transition: background 0.2s ease;
}

.toggle::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: var(--toggle-knob);
  border-radius: 50%;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle-row input:checked + .toggle {
  background: var(--success);
}

.toggle-row input:checked + .toggle::after {
  transform: translateX(16px);
  background: var(--toggle-knob-active);
}
</style>
