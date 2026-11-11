<script lang="ts">
// The open modals, latest (on top) last: only the top one answers keys.
const stack: symbol[] = [];
</script>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from "vue";
import { X } from "lucide-vue-next";

defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: []; submit: [] }>();
const me = Symbol();
const form = useTemplateRef("form");
// Set while Tab moves the focus: 1 forward, -1 back.
let tabbing = 0;
// What had the focus before the dialog took it.
let before: HTMLElement | null = null;

function key(e: KeyboardEvent) {
  if (stack.at(-1) !== me) return;
  if (e.key === "Tab") {
    tabbing = e.shiftKey ? -1 : 1;
    setTimeout(() => (tabbing = 0));
  } else if (e.key === "Escape") emit("close");
  else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault(); // or a focused field submits the form as well
    emit("submit");
  }
}

// The focus stays in the dialog: typing in the document under it would
// change what the dialog is about to replace. Tab past either end comes
// round to the other.
function focusOut(e: FocusEvent) {
  const by = tabbing;
  if (!by || form.value?.contains(e.relatedTarget as Node | null)) return;
  setTimeout(() => {
    const all = form.value?.querySelectorAll<HTMLElement>(
      "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])",
    );
    if (all?.length) all[by > 0 ? 0 : all.length - 1].focus();
  });
}

onMounted(() => {
  stack.push(me);
  window.addEventListener("keydown", key);
  const f = form.value;
  if (f && !f.contains(document.activeElement)) {
    if (document.activeElement instanceof HTMLElement) before = document.activeElement;
    f.focus({ preventScroll: true });
  }
});
onUnmounted(() => {
  stack.splice(stack.indexOf(me), 1);
  window.removeEventListener("keydown", key);
  // Back where it was, unless the focus went somewhere (the cheat sheet
  // closing over a dialog leaves it nowhere).
  const now = document.activeElement;
  if (before?.isConnected && (!now || now === document.body)) before.focus({ preventScroll: true });
});
</script>

<template>
  <div class="scrim" @mousedown.self="emit('close')">
    <form
      ref="form"
      class="modal"
      :class="{ wide }"
      tabindex="-1"
      @submit.prevent="emit('submit')"
      @focusout="focusOut"
    >
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
.modal:focus {
  outline: none;
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
  flex-wrap: wrap;
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
