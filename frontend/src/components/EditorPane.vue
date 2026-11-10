<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Events } from "@wailsio/runtime";
import { FileCode } from "lucide-vue-next";
import { DocService } from "../../bindings/peanut-writer";
import { contentChanged, insertImageFiles, insertImages, toggleMarkdown } from "../lib/actions";
import { activeMarks, blockStyleAt, createEditor } from "../lib/editor";
import { editor, state } from "../lib/store";

const host = ref<HTMLElement>();

// Files dropped on the pane (its data-file-drop-target) come from Wails with
// window coordinates; the picture goes where it was dropped.
function filesDropped(e: { data: { paths: string[]; x?: number; y?: number } }) {
  const v = editor.value;
  if (!v || !e.data.paths?.length) return;
  const { x, y } = e.data;
  const pos =
    (x !== undefined && y !== undefined ? v.posAtCoords({ x, y }) : null) ??
    v.state.selection.main.head;
  insertImageFiles(e.data.paths, pos);
}
let offDrop: (() => void) | undefined;

onMounted(() => {
  editor.value = createEditor(
    host.value!,
    state.content,
    {
      editFigure: (item) => (state.dialog = { kind: "figure", item }),
      editTable: (item) => (state.dialog = { kind: "table", item }),
      editProperties: () => (state.dialog = { kind: "properties" }),
      pasteImages: insertImages,
      imageURL: (src) => DocService.ImageURL(src),
      changed(s, docChanged) {
        if (docChanged) contentChanged(s.doc.toString());
        state.marks = activeMarks(s);
        state.block = blockStyleAt(s);
      },
    },
    state.showMarkdown,
  );
  editor.value.focus();
  offDrop = Events.On("filesDropped", filesDropped);
});

onBeforeUnmount(() => {
  offDrop?.();
  editor.value?.destroy();
  editor.value = null;
});
</script>

<template>
  <!-- Wails adds file-drop-target-active while files are dragged over the pane. -->
  <section class="pane" data-file-drop-target>
    <div ref="host" class="host" />
    <button
      class="mode"
      :class="{ on: state.showMarkdown }"
      title="Show and edit the Markdown behind the document (⌘/)"
      @mousedown.prevent
      @click="toggleMarkdown"
    >
      <FileCode :size="13" /> Markdown
    </button>
    <div class="drop">
      <img src="/peanut.svg" alt="" />
      <span>Drop a picture to add a figure</span>
    </div>
  </section>
</template>

<style scoped>
.pane {
  position: relative;
  min-width: 0;
  min-height: 0;
  background: var(--surface);
}
.host {
  height: 100%;
  user-select: text;
  -webkit-user-select: text;
}
.mode {
  position: absolute;
  top: 8px;
  right: 14px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 252, 247, 0.9);
  font-family: var(--ui);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--muted);
  opacity: 0.75;
  cursor: pointer;
}
.mode:hover {
  opacity: 1;
  color: var(--accent-ink);
}
.mode.on {
  opacity: 1;
  background: var(--active);
  border-color: var(--shell);
  color: var(--accent-ink);
}
.drop {
  position: absolute;
  inset: 12px;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 2.5px dashed var(--shell);
  border-radius: 18px;
  background: rgba(255, 248, 238, 0.82);
  font-family: var(--rounded);
  font-size: 16px;
  font-weight: 600;
  color: var(--roast);
  pointer-events: none;
}
.pane.file-drop-target-active .drop {
  display: flex;
}
.drop img {
  width: 44px;
  animation: bounce 0.9s ease-in-out infinite alternate;
}
@keyframes bounce {
  to {
    transform: translateY(-8px) rotate(6deg);
  }
}
</style>
