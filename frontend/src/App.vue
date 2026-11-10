<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Events } from "@wailsio/runtime";
import { DocService } from "../bindings/peanut-writer";
import TitleBar from "./components/TitleBar.vue";
import Ribbon from "./components/Ribbon.vue";
import EditorPane from "./components/EditorPane.vue";
import PreviewPane from "./components/PreviewPane.vue";
import StatusBar from "./components/StatusBar.vue";
import Dialogs from "./components/Dialogs.vue";
import Toasts from "./components/Toasts.vue";
import { loadDoc, menu } from "./lib/actions";
import { errorText, state, toast } from "./lib/store";

const split = ref(Number(localStorage.getItem("split")) || 0.5);
const main = ref<HTMLElement>();

function startResize(e: PointerEvent) {
  const el = main.value;
  if (!el) return;
  const target = e.currentTarget as HTMLElement; // the splitter, which captures the pointer
  target.setPointerCapture(e.pointerId);
  const rect = el.getBoundingClientRect();
  const move = (ev: PointerEvent) => {
    split.value = Math.min(0.75, Math.max(0.28, (ev.clientX - rect.left) / rect.width));
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    localStorage.setItem("split", String(split.value));
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up, { once: true });
}

let offMenu: (() => void) | undefined;
onMounted(async () => {
  offMenu = Events.On("menu", (e: { data: string }) => menu(e.data));
  // A file dropped outside the editor mustn't replace the page.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  try {
    const info = await DocService.Startup();
    state.templates = info.templates ?? [];
    state.typstError = info.typstError;
    loadDoc(info.document);
  } catch (e) {
    toast(`Couldn't start: ${errorText(e)}`, "error");
  }
});
onUnmounted(() => offMenu?.());
</script>

<template>
  <div class="app">
    <TitleBar />
    <Ribbon />
    <main ref="main" class="main" :style="{ gridTemplateColumns: `${split}fr 6px ${1 - split}fr` }">
      <EditorPane />
      <div class="splitter" @pointerdown="startResize"><span /></div>
      <PreviewPane />
    </main>
    <StatusBar />
    <Dialogs />
    <Toasts />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  height: 100%;
}
.main {
  display: grid;
  min-height: 0;
  border-top: 1px solid var(--border);
}
.splitter {
  position: relative;
  background: var(--panel);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  cursor: col-resize;
}
.splitter span {
  position: absolute;
  top: 50%;
  left: 1px;
  width: 2px;
  height: 36px;
  margin-top: -18px;
  border-radius: 2px;
  background: var(--marks);
}
</style>
