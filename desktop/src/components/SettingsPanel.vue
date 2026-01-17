<script setup lang="ts">
import type { ProjectSettings } from "../types";

const props = defineProps<{
  settings: ProjectSettings;
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

.section-header:not(:first-child) {
  margin-top: 32px;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-row label {
  font-size: 13px;
  color: var(--text-secondary);
}

.setting-row input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}

.setting-row input:focus {
  border-color: var(--text-muted);
}

.options-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.option-row:last-child {
  border-bottom: none;
}

.segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.segmented button {
  padding: 6px 12px;
  background: var(--bg);
  border: none;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.segmented button:not(:last-child) {
  border-right: 1px solid var(--border);
}

.segmented button.active {
  background: var(--text);
  color: var(--bg);
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.toggle-row:last-child {
  border-bottom: none;
}

.toggle-row input {
  display: none;
}

.toggle {
  width: 44px;
  height: 24px;
  background: var(--border);
  border-radius: 12px;
  position: relative;
  transition: background 0.2s;
}

.toggle::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.toggle-row input:checked + .toggle {
  background: var(--success);
}

.toggle-row input:checked + .toggle::after {
  transform: translateX(20px);
}
</style>
