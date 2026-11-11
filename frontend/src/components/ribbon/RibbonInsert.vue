<script setup lang="ts">
// The ribbon's Insert tab: pictures and tables, links, notes and references,
// equations, and layout blocks.
import { ref } from "vue";
import {
  ClipboardPaste,
  CodeXml,
  Footprints,
  Image,
  Images,
  Link,
  Link2,
  ListTree,
  Minus,
  Sigma,
  SquareSplitVertical,
  Table,
} from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import TableGridPicker from "./TableGridPicker.vue";
import { withView } from "./withView";
import { choosePicture, choosePictureGrid, editLink, newFootnote } from "@/lib/actions";
import { insertBlock, insertDivider, insertEquation, toggleCodeBlock } from "@/lib/editor";
import { state } from "@/lib/store";

const tablePicker = ref(false);

function pickTable(cols: number, rows: number) {
  tablePicker.value = false;
  state.dialog = { kind: "table", cols, rows };
}
</script>

<template>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="Image"
        label="Picture"
        title="Insert a picture (or drag one in)"
        @click="choosePicture"
      />
      <RibbonButton
        big
        :icon="Images"
        label="Picture Grid"
        title="Insert several pictures side by side, sharing one caption"
        @click="choosePictureGrid"
      />
      <div class="pop" @mouseleave="tablePicker = false">
        <RibbonButton big :icon="Table" label="Table" @click="tablePicker = !tablePicker" />
        <div v-if="tablePicker" class="popover"><TableGridPicker @pick="pickTable" /></div>
      </div>
      <RibbonButton
        big
        :icon="ClipboardPaste"
        label="Paste Table"
        title="Make a table from CSV or cells copied from Excel or Google Sheets"
        @click="state.dialog = { kind: 'pasteTable' }"
      />
    </div>
    <label>Figures &amp; Tables</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton big :icon="Link" label="Link" @click="editLink" />
      <RibbonButton big :icon="Footprints" label="Footnote" @click="newFootnote" />
      <RibbonButton
        big
        :icon="Link2"
        label="Cross-reference"
        @click="state.dialog = { kind: 'crossref' }"
      />
      <RibbonButton
        big
        :icon="Sigma"
        label="Equation"
        title="Insert an equation (selected text becomes inline math)"
        @click="withView(insertEquation)"
      />
    </div>
    <label>Text</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton big :icon="CodeXml" label="Code" @click="withView(toggleCodeBlock)" />
      <RibbonButton big :icon="Minus" label="Divider" @click="withView(insertDivider)" />
      <RibbonButton
        big
        :icon="SquareSplitVertical"
        label="Page Break"
        @click="withView((v) => insertBlock(v, '\\pagebreak'))"
      />
      <RibbonButton
        big
        :icon="ListTree"
        label="Contents"
        title="Table of contents"
        @click="withView((v) => insertBlock(v, '[TOC]'))"
      />
    </div>
    <label>Layout</label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
