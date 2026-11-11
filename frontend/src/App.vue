<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Events } from "@wailsio/runtime";
import { Link, Unlink } from "lucide-vue-next";
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
import { revealLine, revealSource } from "./lib/editor";
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

// The customize pane needs the preview to show its changes, so it stays open then.
const previewShown = computed(() => state.previewOpen || state.customizing);

const side = "clamp(150px, 16%, 240px) ";
const columns = computed(
  () =>
    `${state.outlineOpen ? side : ""}${state.versionsOpen ? side : ""}` +
    (previewShown.value ? `${split.value}fr 6px ${1 - split.value}fr` : "1fr"),
);

// Hidden, the preview can't scroll; shown again, it lines up with the editor.
watch(
  previewShown,
  (shown) => {
    if (shown && state.scrollLinked) sync?.link();
  },
  { flush: "post" },
);

// jump shows a heading from the outline in the editor, and the preview
// follows (linked again if it wasn't).
function jump(line: number) {
  if (!editor.value) return;
  sync?.link();
  revealLine(editor.value, line);
}

// pick shows where a click on the preview is in the editor.
function pick(line: number, next: number, t: number) {
  if (editor.value) revealSource(editor.value, line, next, t);
}

const preview = ref<InstanceType<typeof PreviewPane>>();
let offMenu: (() => void) | undefined;
let offRecent: (() => void) | undefined;
let offBackup: (() => void) | undefined;
let sync: ReturnType<typeof syncScroll> | undefined;
onMounted(async () => {
  // The panes mount first, so both scrollers exist.
  sync = syncScroll(editor.value!, preview.value!.scroller!, preview.value!.headingTops);
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
    // Unless Finder opened a document, offer what to open.
    if (!info.document.path) state.dialog = { kind: "start", files: info.recent ?? [] };
  } catch (e) {
    toast(`Couldn't start: ${errorText(e)}`, "error");
  }
});
onUnmounted(() => {
  offMenu?.();
  offRecent?.();
  offBackup?.();
  sync?.stop();
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
      <div v-show="previewShown" class="splitter" @pointerdown="startResize">
        <button
          v-if="!state.customizing"
          class="link"
          :class="{ linked: state.scrollLinked }"
          :title="
            state.scrollLinked
              ? 'The panes scroll together. Click to unlink them'
              : 'Scroll the panes together again'
          "
          :aria-pressed="state.scrollLinked"
          @pointerdown.stop
          @click="state.scrollLinked ? sync?.unlink() : sync?.link()"
        >
          <Link v-if="state.scrollLinked" :size="13" />
          <Unlink v-else :size="13" />
        </button>
        <span v-else />
      </div>
      <PreviewPane v-show="previewShown" ref="preview" @pick="pick" />
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
/* Wider than the splitter, centered on it. Unlinked, it stands out. */
.link {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  padding: 0;
  border: 1px solid var(--accent);
  border-radius: 50%;
  background: var(--cream);
  color: var(--accent);
  box-shadow: var(--shadow);
  cursor: pointer;
}
.link.linked {
  border-color: var(--border);
  background: var(--panel);
  color: var(--quote);
}
.link:hover {
  background: var(--hover);
  color: var(--roast);
}
</style>
