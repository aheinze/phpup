<script setup lang="ts">
import { ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
let lastClickTime = 0;

async function checkMaximized() {
  isMaximized.value = await appWindow.isMaximized();
}

function handleMouseDown(e: MouseEvent) {
  // Only handle left mouse button
  if (e.button !== 0) return;

  const now = Date.now();
  if (now - lastClickTime < 300) {
    // Double-click: toggle maximize
    lastClickTime = 0;
    toggleMaximize();
  } else {
    // Single click: start drag
    lastClickTime = now;
    appWindow.startDragging();
  }
}

async function minimize() {
  await appWindow.minimize();
}

async function toggleMaximize() {
  await appWindow.toggleMaximize();
  await checkMaximized();
}

async function close() {
  await appWindow.close();
}

// Listen for resize to update maximize state
appWindow.onResized(checkMaximized);
</script>

<template>
  <div class="titlebar" @mousedown="handleMouseDown">
    <div class="titlebar-label">
      <span class="titlebar-app">PHPUp</span>
    </div>
    <div class="titlebar-controls" @mousedown.stop>
      <button class="titlebar-btn" @click="minimize" title="Minimize">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 6h8" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
      <button class="titlebar-btn" @click="toggleMaximize" :title="isMaximized ? 'Restore' : 'Maximize'">
        <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12">
          <path d="M4 2h5a1 1 0 011 1v5" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <rect x="2" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
      <button class="titlebar-btn titlebar-close" @click="close" title="Close">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-canvas);
  user-select: none;
  flex-shrink: 0;
  padding-left: 12px;
}

.titlebar-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.titlebar-app {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.titlebar-controls {
  display: flex;
  align-items: center;
  height: 100%;
}

.titlebar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.titlebar-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.titlebar-close:hover {
  background: var(--danger);
  color: #fff;
}
</style>
