<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Events } from "@wailsio/runtime";
import { DocService } from "../bindings/peanut-writer";
import TitleBar from "./components/TitleBar.vue";
import Ribbon from "./components/Ribbon.vue";
import EditorPane from "./components/EditorPane.vue";
import CustomizePane from "./components/CustomizePane.vue";
import OutlinePane from "./components/OutlinePane.vue";
import PreviewPane from "./components/PreviewPane.vue";
import StatusBar from "./components/StatusBar.vue";
import VersionsPane from "./components/VersionsPane.vue";
import Dialogs from "./components/Dialogs.vue";
import Toasts from "./components/Toasts.vue";
import { loadDoc, menu, openRecent } from "./lib/actions";
import { revealLine } from "./lib/editor";
import { syncScroll } from "./lib/scrollsync";
import { editor, errorText, state, toast } from "./lib/store";

const split = ref(Number(localStorage.getItem("split")) || 0.5);
const main = ref<HTMLElement>();

function startResize(e: PointerEvent) {
  const el = main.value;
  if (!el) return;
  const target = e.currentTarget as HTMLElement; // the splitter, which captures the pointer
  target.setPointerCapture(e.pointerId);
  const rect = el.getBoundingClientRect();
  // The split is between editor and preview; the outline and versions, when shown, are left of both.
  const left = (target.previousElementSibling as HTMLElement).getBoundingClientRect().left;
  const move = (ev: PointerEvent) => {
    split.value = Math.min(0.75, Math.max(0.28, (ev.clientX - left) / (rect.right - left)));
  };
  // Fires after pointerup and pointercancel alike.
  const done = () => {
    target.removeEventListener("pointermove", move);
    localStorage.setItem("split", String(split.value));
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("lostpointercapture", done, { once: true });
}

const side = "clamp(150px, 16%, 240px) ";
const columns = computed(
  () =>
    `${state.outlineOpen ? side : ""}${state.versionsOpen ? side : ""}${split.value}fr 6px ${1 - split.value}fr`,
);

// jump shows a heading from the outline in the editor; the preview follows.
function jump(line: number) {
  if (editor.value) revealLine(editor.value, line);
}

const preview = ref<InstanceType<typeof PreviewPane>>();
let offMenu: (() => void) | undefined;
let offRecent: (() => void) | undefined;
let offBackup: (() => void) | undefined;
let offSync: (() => void) | undefined;
onMounted(async () => {
  // The panes mount first, so both scrollers exist.
  offSync = syncScroll(editor.value!, preview.value!.scroller!, preview.value!.headingTops);
  offMenu = Events.On("menu", (e: { data: string }) => menu(e.data));
  offRecent = Events.On("openRecent", (e: { data: string }) => openRecent(e.data));
  offBackup = Events.On("backupFailed", (e: { data: string }) =>
    toast(`Backup: ${e.data}`, "error"),
  );
  // A file dropped outside the editor mustn't replace the page.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  try {
    const info = await DocService.Startup();
    state.templates = info.templates ?? [];
    state.typstError = info.typstError;
    state.version = info.version;
    loadDoc(info.document);
    if (info.recent?.length) state.dialog = { kind: "recent", files: info.recent };
  } catch (e) {
    toast(`Couldn't start: ${errorText(e)}`, "error");
  }
});
onUnmounted(() => {
  offMenu?.();
  offRecent?.();
  offBackup?.();
  offSync?.();
});
</script>

<template>
  <div class="app">
    <TitleBar />
    <Ribbon />
    <main ref="main" class="main" :style="{ gridTemplateColumns: columns }">
      <OutlinePane v-if="state.outlineOpen" @jump="jump" />
      <VersionsPane v-if="state.versionsOpen" />
      <!-- The editor stays mounted (hidden) while the template is customized. -->
      <EditorPane v-show="!state.customizing" />
      <CustomizePane v-if="state.customizing" />
      <div class="splitter" @pointerdown="startResize"><span /></div>
      <PreviewPane ref="preview" />
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
