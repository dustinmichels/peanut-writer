<script setup lang="ts">
// The ribbon's View tab: the Markdown behind the document, and which panes show
// beside the editor.
import { FileClock, FileCode, PanelRight, RotateCcw, TableOfContents } from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import {
  restoreView,
  toggleMarkdown,
  toggleOutline,
  togglePreview,
  toggleVersions,
} from "@/lib/actions";
import { state } from "@/lib/store";
</script>

<template>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="FileCode"
        label="Markdown"
        title="Show and edit the Markdown behind the document (⌘/)"
        :active="state.showMarkdown"
        @click="toggleMarkdown"
      />
    </div>
    <label>Markdown</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="TableOfContents"
        label="Outline"
        title="Show the headings beside the editor, to jump to a section"
        :active="state.outlineOpen"
        @click="toggleOutline"
      />
      <RibbonButton
        big
        :icon="FileClock"
        label="Versions"
        title="Save a named version of the document, or load an earlier one"
        :active="state.versionsOpen"
        @click="toggleVersions"
      />
      <RibbonButton
        big
        :icon="PanelRight"
        label="Preview"
        title="Show the typeset pages beside the editor"
        :active="state.previewOpen"
        @click="togglePreview"
      />
    </div>
    <label>Panes</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="RotateCcw"
        label="Restore Defaults"
        title="Hide the Markdown, show the outline and preview at an even split, and hide the versions"
        @click="restoreView"
      />
    </div>
    <label>Reset</label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
