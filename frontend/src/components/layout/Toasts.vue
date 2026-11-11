<script setup lang="ts">
import { X } from "lucide-vue-next";
import { dismiss, state } from "@/lib/store";
</script>

<template>
  <TransitionGroup name="toast" tag="div" class="toasts">
    <div v-for="t in state.toasts" :key="t.id" class="toast" :class="t.tone">
      <span class="text">{{ t.text }}</span>
      <button v-if="t.action" class="act" @click="(t.action.run(), dismiss(t.id))">
        {{ t.action.label }}
      </button>
      <button class="x" @click="dismiss(t.id)"><X :size="13" /></button>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 16px;
  bottom: 40px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 460px;
  padding: 9px 10px 9px 14px;
  border-radius: 12px;
  background: var(--ink);
  color: #fff8ee;
  box-shadow: var(--shadow);
  user-select: text;
}
.toast.error {
  background: #8f2f22;
}
.toast.success {
  background: #4b3322;
}
.text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere; /* a long file or template name */
}
.act {
  border: 0;
  border-radius: 999px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.16);
  font-weight: 600;
}
.x {
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  opacity: 0.7;
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}
</style>
