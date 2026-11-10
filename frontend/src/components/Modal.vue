<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { X } from "lucide-vue-next";

defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: []; submit: [] }>();

function key(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
  else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) emit("submit");
}
onMounted(() => window.addEventListener("keydown", key));
onUnmounted(() => window.removeEventListener("keydown", key));
</script>

<template>
  <div class="scrim" @mousedown.self="emit('close')">
    <form class="modal" :class="{ wide }" @submit.prevent="emit('submit')">
      <header>
        <img src="/peanut.svg" alt="" />
        <h2>{{ title }}</h2>
        <button type="button" class="x" @click="emit('close')"><X :size="16" /></button>
      </header>
      <div class="body"><slot /></div>
      <footer><slot name="footer" /></footer>
    </form>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(60, 38, 20, 0.28);
  backdrop-filter: blur(2px);
  animation: fade 0.15s ease-out;
}
.modal {
  width: min(500px, calc(100vw - 40px));
  max-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 30px 70px -20px rgba(80, 40, 10, 0.45);
  animation: pop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal.wide {
  width: min(860px, calc(100vw - 40px));
}
header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px 18px;
}
header img {
  width: 16px;
}
h2 {
  flex: 1;
  margin: 0;
  font-family: var(--rounded);
  font-size: 17px;
  color: var(--roast);
}
.x {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
}
.x:hover {
  background: var(--hover);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 6px 18px 16px;
  overflow: auto;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
}
</style>
