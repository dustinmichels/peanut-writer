<script setup lang="ts">
import { ref } from "vue";
import { ChevronDown, FileDown, FileText, Redo2, Save, Undo2 } from "lucide-vue-next";
import { exportDocx, exportPdf, menu, save } from "../lib/actions";
import { state } from "../lib/store";

const exportOpen = ref(false);
function pick(f: () => unknown) {
  exportOpen.value = false;
  f();
}
</script>

<template>
  <header class="titlebar">
    <div class="quick">
      <button class="icon" title="Save (⌘S)" @click="save"><Save :size="15" /></button>
      <button class="icon" title="Undo (⌘Z)" @click="menu('undo')"><Undo2 :size="15" /></button>
      <button class="icon" title="Redo (⇧⌘Z)" @click="menu('redo')"><Redo2 :size="15" /></button>
    </div>
    <div class="title">
      <img src="/peanut.svg" alt="" class="logo" />
      <span class="name">{{ state.name }}</span>
      <span v-if="state.dirty" class="edited">— Edited</span>
      <span v-else-if="state.path" class="saved">— Saved</span>
    </div>
    <div class="right">
      <div class="export" @mouseleave="exportOpen = false">
        <button class="btn primary" @click="exportOpen = !exportOpen">
          <FileDown :size="15" /> Export <ChevronDown :size="13" />
        </button>
        <div v-if="exportOpen" class="menu">
          <button @click="pick(exportPdf)">
            <FileDown :size="16" /> <span><b>PDF</b><small>Exactly as previewed · ⌘E</small></span>
          </button>
          <button @click="pick(exportDocx)">
            <FileText :size="16" /> <span
              ><b>Word document</b><small>Editable .docx · ⇧⌘E</small></span
            >
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  --wails-draggable: drag;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 44px;
  padding: 0 12px 0 84px; /* the window's traffic lights sit on the left */
  background: linear-gradient(180deg, #fbf3e8, #f6ecdf);
}
button,
.menu {
  --wails-draggable: no-drag;
}
.quick {
  display: flex;
  gap: 2px;
}
.icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 26px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--quote);
}
.icon:hover {
  background: var(--hover);
}
.title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--rounded);
  font-size: 14px;
  font-weight: 600;
  color: var(--roast);
  white-space: nowrap;
}
.logo {
  width: 18px;
  height: 26px;
  animation: idle 5s ease-in-out infinite;
}
@keyframes idle {
  0%,
  100% {
    transform: rotate(0);
  }
  30% {
    transform: rotate(-6deg);
  }
  60% {
    transform: rotate(5deg);
  }
}
.edited,
.saved {
  font-weight: 500;
  color: var(--muted);
}
.right {
  display: flex;
  justify-content: flex-end;
}
.export {
  position: relative;
}
.menu {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 50;
  min-width: 250px;
  margin-top: 2px;
  padding: 6px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.menu::before {
  content: "";
  position: absolute;
  inset: -8px 0 auto;
  height: 8px;
}
.menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  color: var(--accent-ink);
}
.menu button:hover {
  background: var(--hover);
}
.menu span {
  display: flex;
  flex-direction: column;
  color: var(--ink);
}
.menu small {
  color: var(--muted);
}
</style>
