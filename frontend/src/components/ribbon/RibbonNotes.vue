<script setup lang="ts">
// The ribbon's Citations & Footnotes tab: the citation manager's group (see
// features/citations), where the reference list goes, and footnotes.
import { BookMarked, Footprints, NotebookText } from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import { withView } from "./withView";
import { RibbonCitations } from "@/features/citations";
import { newFootnote } from "@/lib/actions";
import { insertBlock } from "@/lib/editor";
import { state } from "@/lib/store";
</script>

<template>
  <RibbonCitations />
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="BookMarked"
        label="Reference List"
        title="Put the list of works cited here (it's at the end otherwise)"
        @click="withView((v) => insertBlock(v, '[References]'))"
      />
    </div>
    <label>Bibliography</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton big :icon="Footprints" label="Footnote" @click="newFootnote" />
      <RibbonButton
        big
        :icon="NotebookText"
        label="All Notes"
        title="Every footnote beside the sentence it marks"
        @click="state.dialog = { kind: 'footnotes' }"
      />
    </div>
    <label>Footnotes</label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
