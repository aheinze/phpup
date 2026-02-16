<script setup lang="ts">
defineProps<{
  show: boolean;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal">
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
      <div class="modal-actions">
        <button class="btn-outline" @click="emit('cancel')">Cancel</button>
        <button
          :class="danger ? 'btn-danger' : 'btn-primary'"
          @click="emit('confirm')"
        >{{ confirmText || 'Confirm' }}</button>
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
  margin-bottom: 10px;
}

.modal p {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
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

.btn-danger {
  padding: 6px 14px;
  background: var(--danger);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.1s;
}

.btn-danger:hover {
  opacity: 0.85;
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
