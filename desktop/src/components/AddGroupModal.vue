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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 20px;
  width: 320px;
  max-width: 90%;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
}

.modal h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 14px;
}

.modal input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  background: var(--bg);
  color: var(--text);
  outline: none;
}

.modal input:focus {
  border-color: var(--accent);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.btn-primary {
  padding: 6px 14px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s;
}

.btn-primary:hover {
  background: #6d9df8;
}

.btn-outline {
  padding: 6px 14px;
  background: var(--bg-elevated);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.1s;
}

.btn-outline:hover {
  background: var(--bg-hover);
}
</style>
