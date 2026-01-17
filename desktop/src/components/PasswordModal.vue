<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  show: boolean;
  title?: string;
  message?: string;
}>();

const emit = defineEmits<{
  submit: [password: string];
  cancel: [];
}>();

const password = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

watch(() => props.show, (show) => {
  if (show) {
    password.value = "";
    setTimeout(() => inputRef.value?.focus(), 50);
  }
});

function handleSubmit() {
  if (password.value) {
    emit("submit", password.value);
    password.value = "";
  }
}

function handleCancel() {
  password.value = "";
  emit("cancel");
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="handleCancel">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ title || 'Authentication Required' }}</h3>
      </div>
      <div class="modal-body">
        <p class="modal-message">{{ message || 'Enter your password to continue:' }}</p>
        <div class="password-field">
          <svg class="lock-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="7" width="10" height="7" rx="1"/>
            <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
          </svg>
          <input
            ref="inputRef"
            v-model="password"
            type="password"
            placeholder="Password"
            class="password-input"
            @keyup.enter="handleSubmit"
            @keyup.escape="handleCancel"
          >
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="handleCancel">Cancel</button>
        <button class="btn-submit" :disabled="!password" @click="handleSubmit">Authenticate</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg);
  border-radius: 12px;
  width: 360px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-header {
  padding: 20px 20px 0;
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 16px 20px 20px;
}

.modal-message {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.password-field {
  position: relative;
}

.lock-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.password-input {
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  background: var(--bg);
  outline: none;
  transition: border-color 0.15s;
}

.password-input:focus {
  border-color: var(--accent);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
}

.btn-cancel {
  padding: 8px 16px;
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-cancel:hover {
  background: var(--bg-hover);
}

.btn-submit {
  padding: 8px 16px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-submit:hover {
  opacity: 0.9;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
