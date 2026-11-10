<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { DocService } from "../../bindings/peanut-writer";
import { contentChanged, insertImages } from "../lib/actions";
import { activeMarks, blockStyleAt, createEditor } from "../lib/editor";
import { editor, state } from "../lib/store";

const host = ref<HTMLElement>();
const dragging = ref(false);

onMounted(() => {
  editor.value = createEditor(host.value!, state.content, {
    editFigure: (item) => (state.dialog = { kind: "figure", item }),
    editTable: (item) => (state.dialog = { kind: "table", item }),
    editProperties: () => (state.dialog = { kind: "properties" }),
    dropImages: (files, pos) => {
      dragging.value = false;
      insertImages(files, pos);
    },
    imageURL: (src) => DocService.ImageURL(src),
    changed(s, docChanged) {
      if (docChanged) contentChanged(s.doc.toString());
      state.marks = activeMarks(s);
      state.block = blockStyleAt(s);
    },
  });
  editor.value.focus();
});

onBeforeUnmount(() => {
  editor.value?.destroy();
  editor.value = null;
});

function dragEnter(e: DragEvent) {
  if (e.dataTransfer?.types.includes("Files")) dragging.value = true;
}
function dragLeave(e: DragEvent) {
  if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) dragging.value = false;
}
</script>

<template>
  <section class="pane" @dragenter="dragEnter" @dragleave="dragLeave" @drop="dragging = false">
    <div ref="host" class="host" />
    <div v-if="dragging" class="drop">
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
.drop {
  position: absolute;
  inset: 12px;
  display: flex;
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
