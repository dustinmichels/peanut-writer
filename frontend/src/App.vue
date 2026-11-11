<script setup lang="ts">
// The app: the title bar and ribbon over the panes, the editor beside the
// preview, and the status bar below.
import { computed, useTemplateRef, watch } from "vue";
import { Link, Unlink } from "lucide-vue-next";
import DialogHost from "@/components/dialogs/DialogHost.vue";
import PaneRail from "@/components/layout/PaneRail.vue";
import StatusBar from "@/components/layout/StatusBar.vue";
import TitleBar from "@/components/layout/TitleBar.vue";
import Toasts from "@/components/layout/Toasts.vue";
import CustomizePane from "@/components/panes/CustomizePane.vue";
import EditorPane from "@/components/panes/EditorPane.vue";
import OutlinePane from "@/components/panes/OutlinePane.vue";
import PreviewPane from "@/components/panes/PreviewPane.vue";
import VersionsPane from "@/components/panes/VersionsPane.vue";
import Ribbon from "@/components/ribbon/Ribbon.vue";
import { useAppEvents } from "@/composables/useAppEvents";
import { useScrollSync } from "@/composables/useScrollSync";
import { useSplitter } from "@/composables/useSplitter";
import { useStartup } from "@/composables/useStartup";
import { focusCurrentSection, sectionOf, toggleOutline, togglePreview } from "@/lib/actions";
import { focusedLines, focusSection, revealLine, revealSource } from "@/lib/editor";
import { editor, state } from "@/lib/store";

const main = useTemplateRef("main");
const preview = useTemplateRef("preview");
const { startResize } = useSplitter(main);

// The customize pane needs the preview to show its changes, so it stays open then.
const previewShown = computed(() => state.previewOpen || state.customizing);

// A hidden outline or preview leaves a thin rail to show it again.
const side = "clamp(150px, 16%, 240px) ";
const rail = "26px ";
const columns = computed(
  () =>
    `${state.outlineOpen ? side : rail}${state.versionsOpen ? side : ""}` +
    (previewShown.value ? `${state.split}fr 6px ${1 - state.split}fr` : `1fr ${rail}`),
);

const sync = useScrollSync(preview, previewShown);
useAppEvents();
useStartup();

// jump shows a heading from the outline in the editor (within its top-level
// section, when focused on sections), and the preview follows (linked again if
// it wasn't).
function jump(line: number) {
  if (!editor.value) return;
  sync.link();
  const section = state.focusSection ? sectionOf(line) : undefined;
  if (section) focusSection(editor.value, section);
  revealLine(editor.value, line);
}

// pick shows where a click on the preview is in the editor; focused on a
// section, a click outside it shows the top-level section clicked instead.
function pick(line: number, next: number, t: number) {
  if (!editor.value) return;
  const f = focusedLines(editor.value.state);
  if (f && (line < f.first || line > f.last)) {
    const section = sectionOf(line);
    if (section) focusSection(editor.value, section);
  }
  revealSource(editor.value, line, next, t);
}

// A newly opened document shows its first section when focused on sections.
watch(() => state.outline, focusCurrentSection);
</script>

<template>
  <div class="app">
    <TitleBar />
    <Ribbon />
    <main ref="main" class="main" :style="{ gridTemplateColumns: columns }">
      <OutlinePane v-if="state.outlineOpen" @jump="jump" />
      <PaneRail v-else label="Outline" side="left" @open="toggleOutline" />
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
          @click="state.scrollLinked ? sync.unlink() : sync.link()"
        >
          <Link v-if="state.scrollLinked" :size="13" />
          <Unlink v-else :size="13" />
        </button>
        <span v-else />
      </div>
      <PreviewPane v-show="previewShown" ref="preview" @pick="pick" />
      <PaneRail v-if="!previewShown" label="Preview" side="right" @open="togglePreview" />
    </main>
    <StatusBar />
    <DialogHost />
    <Toasts />
  </div>
</template>

<style scoped>
/* One column as wide as the window: a wide child (the ribbon's open tab, a
   long line) scrolls or clips inside it rather than widening the app. */
.app {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  grid-template-columns: minmax(0, 1fr);
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
