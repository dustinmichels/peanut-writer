<script setup lang="ts">
import { ref } from "vue";
import {
  ChevronDown,
  FileDown,
  FileText,
  FolderOpen,
  Redo2,
  RefreshCw,
  Save,
  Undo2,
} from "lucide-vue-next";
import { exportDocx, exportPdf, menu, save, showInFolder, syncFiles } from "../lib/actions";
import { canSave, canSync, state } from "../lib/store";

const exportOpen = ref(false);
function pick(f: () => unknown) {
  exportOpen.value = false;
  f();
}
</script>

<template>
  <header class="titlebar">
    <div class="quick">
      <button
        class="icon"
        :class="{ pending: state.dirty }"
        :title="state.dirty ? 'Save unsaved changes (⌘S)' : 'Save (⌘S)'"
        :disabled="!canSave"
        @click="save"
      >
        <Save :size="15" />
      </button>
      <button class="icon" title="Undo (⌘Z)" @click="menu('undo')"><Undo2 :size="15" /></button>
      <button class="icon" title="Redo (⇧⌘Z)" @click="menu('redo')"><Redo2 :size="15" /></button>
    </div>
    <div class="title">
      <img src="/peanut.svg" alt="" class="logo" />
      <span class="name">{{ state.name }}</span>
      <span v-if="state.dirty" class="edited">— Edited</span>
      <Transition name="flash" mode="out-in">
        <span v-if="!state.dirty && state.autosaved" class="autosaved">— Auto-saved</span>
        <span v-else-if="!state.dirty && state.path" class="saved">— Saved</span>
      </Transition>
    </div>
    <div class="right">
      <button class="icon" title="Show in Finder" :disabled="!state.path" @click="showInFolder">
        <FolderOpen :size="15" />
      </button>
      <button
        class="btn"
        :title="
          canSync
            ? 'Save, then write PDF and Word copies beside the file (⇧⌘Y)'
            : 'The PDF and Word copies are up to date'
        "
        :disabled="!canSync"
        @click="syncFiles"
      >
        <RefreshCw :size="15" /> Sync files
      </button>
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
.icon:disabled {
  opacity: 0.4;
  background: transparent;
}
/* Unsaved changes: the save button stands out, with a dot. */
.icon.pending {
  position: relative;
  background: var(--active);
  color: var(--accent);
}
.icon.pending::after {
  content: "";
  position: absolute;
  top: 3px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
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
.saved,
.autosaved {
  font-weight: 500;
  color: var(--muted);
}
.edited {
  color: var(--accent-ink);
}
.autosaved {
  color: var(--accent-ink);
}
.flash-enter-active,
.flash-leave-active {
  transition: opacity 0.25s;
}
.flash-enter-from,
.flash-leave-to {
  opacity: 0;
}
.right {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
