<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";

const emit = defineEmits<{
  close: [];
}>();

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
let lastClickTime = 0;
let unlistenResize: (() => void) | null = null;

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

function close() {
  emit("close");
}

onMounted(async () => {
  unlistenResize = await appWindow.onResized(checkMaximized);
});

onUnmounted(() => {
  unlistenResize?.();
});
</script>

<template>
  <div class="titlebar" @mousedown="handleMouseDown">
    <div class="titlebar-controls" @mousedown.stop>
      <button class="traffic-btn close" @click="close" title="Close">
        <svg width="8" height="8" viewBox="0 0 8 8">
          <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" stroke-width="1.2" fill="none"/>
        </svg>
      </button>
      <button class="traffic-btn minimize" @click="minimize" title="Minimize">
        <svg width="8" height="8" viewBox="0 0 8 8">
          <path d="M1 4h6" stroke="currentColor" stroke-width="1.2" fill="none"/>
        </svg>
      </button>
      <button class="traffic-btn maximize" @click="toggleMaximize" :title="isMaximized ? 'Restore' : 'Maximize'">
        <svg v-if="!isMaximized" width="8" height="8" viewBox="0 0 8 8">
          <path d="M1 3l3-2 3 2v3L4 8 1 6z" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
        <svg v-else width="8" height="8" viewBox="0 0 8 8">
          <rect x="1" y="1" width="6" height="6" rx="0.5" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
    </div>
    <div class="titlebar-label">
      <span class="titlebar-app">PHPUp</span>
    </div>
    <div class="titlebar-end"></div>
  </div>
</template>

<style scoped>
.titlebar {
  height: 40px;
  display: flex;
  align-items: center;
  background: transparent;
  user-select: none;
  flex-shrink: 0;
  padding: 0 14px;
}

.titlebar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.titlebar-label {
  flex: 1;
  text-align: center;
}

.titlebar-end {
  width: 56px;
}

.titlebar-app {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: -0.01em;
}

.traffic-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
  color: transparent;
}

.traffic-btn svg {
  opacity: 0;
  transition: opacity 0.1s;
}

.titlebar-controls:hover .traffic-btn svg {
  opacity: 1;
}

.traffic-btn.close {
  background: #ff5f57;
  color: #4a0002;
}

.traffic-btn.close:hover {
  background: #ff3b30;
}

.traffic-btn.minimize {
  background: #febc2e;
  color: #5a3e00;
}

.traffic-btn.minimize:hover {
  background: #ffc600;
}

.traffic-btn.maximize {
  background: #28c840;
  color: #003a00;
}

.traffic-btn.maximize:hover {
  background: #30d158;
}

/* When window is not focused (inactive state) */
.titlebar:not(:hover) .traffic-btn:not(:hover) {
  /* Keep colors but muted when not hovering titlebar */
}
</style>
