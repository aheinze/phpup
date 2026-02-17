<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
  create: [name: string];
}>();

const newGroupName = ref("");

function handleCreate() {
  if (newGroupName.value.trim()) {
    emit("create", newGroupName.value.trim());
    newGroupName.value = "";
  }
}

function handleClose() {
  newGroupName.value = "";
  emit("close");
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="handleClose">
    <div class="modal">
      <h3>New Group</h3>
      <input
        type="text"
        v-model="newGroupName"
        placeholder="Group name"
        @keyup.enter="handleCreate"
        autofocus
      >
      <div class="modal-actions">
        <button class="btn-outline" @click="handleClose">Cancel</button>
        <button class="btn-primary" @click="handleCreate">Create</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: overlay-in 0.15s ease;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--modal-bg);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid var(--modal-border);
  border-radius: var(--radius);
  padding: 22px;
  width: 340px;
  max-width: 90%;
  box-shadow: var(--modal-shadow);
  animation: modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modal-in {
  from { transform: scale(0.95) translateY(8px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

.modal h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 14px;
  letter-spacing: -0.02em;
}

.modal input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--btn-outline-border);
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-family: inherit;
  background: var(--bg-inset-deep);
  color: var(--text);
  outline: none;
  transition: all 0.15s ease;
}

.modal input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.btn-primary {
  padding: 7px 16px;
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: var(--accent-glow);
}

.btn-outline {
  padding: 7px 16px;
  background: var(--btn-outline-bg);
  color: var(--text);
  border: 1px solid var(--btn-outline-border);
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-outline:hover {
  background: var(--btn-outline-hover-bg);
}
</style>
