<script setup lang="ts">
// The ribbon's References tab: cross-references, notes and contents, and the
// document's figures and tables in order.
import { computed } from "vue";
import { Footprints, Link2, ListTree, NotebookText } from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import { withView } from "./withView";
import ItemThumb from "@/components/ui/ItemThumb.vue";
import { newFootnote } from "@/lib/actions";
import { insertBlock } from "@/lib/editor";
import { state } from "@/lib/store";

// The figures and tables, in order, previewed under References.
const previews = computed(() => state.items.filter((x) => x.kind !== "equation"));
const figures = computed(() => previews.value.filter((x) => x.kind === "figure").length);
const tables = computed(() => previews.value.length - figures.value);
</script>

<template>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="Link2"
        label="Cross-reference"
        @click="state.dialog = { kind: 'crossref' }"
      />
      <RibbonButton big :icon="Footprints" label="Footnote" @click="newFootnote" />
      <RibbonButton
        big
        :icon="ListTree"
        label="Contents"
        title="Table of contents"
        @click="withView((v) => insertBlock(v, '[TOC]'))"
      />
    </div>
    <label>Insert</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="NotebookText"
        label="All Notes"
        title="Every footnote beside the sentence it marks"
        @click="state.dialog = { kind: 'footnotes' }"
      />
    </div>
    <label>Notes</label>
  </div>
  <div class="group">
    <div class="thumbs">
      <ItemThumb v-for="x in previews" :key="`${state.path}:${x.kind}:${x.number}`" :item="x" />
      <span v-if="!previews.length" class="hint">
        Figures and tables you add show here. Numbers update as you move things around.
      </span>
    </div>
    <label>
      {{ figures }} {{ figures === 1 ? "figure" : "figures" }} · {{ tables }}
      {{ tables === 1 ? "table" : "tables" }}
    </label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
<style scoped>
.thumbs {
  display: flex;
  gap: 4px;
  max-width: 480px;
  min-height: 62px;
  overflow-x: auto;
}
.thumbs .hint {
  align-self: center;
  max-width: 200px;
  color: var(--muted);
  font-size: 11px;
}
</style>
