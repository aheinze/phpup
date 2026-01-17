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
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg);
  border-radius: 12px;
  padding: 24px;
  width: 320px;
  max-width: 90%;
  box-shadow: 0 20px 40px rgba(0,0,0,0.15);
}

.modal h3 {
  font-size: 18px;
  margin-bottom: 16px;
}

.modal input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}

.modal input:focus {
  border-color: var(--text-muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn-primary {
  padding: 8px 16px;
  background: var(--text);
  color: var(--bg);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-outline {
  padding: 8px 16px;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-outline:hover {
  background: var(--bg-hover);
}
</style>
