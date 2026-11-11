<script setup lang="ts">
// The ribbon's File tab: new, open, save, export and help.
import {
  BookOpen,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  Globe,
  History,
  Info,
  RefreshCw,
  Save,
  SaveAll,
  Sparkles,
} from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import {
  exportDocx,
  exportHtml,
  exportPdf,
  menu,
  newDoc,
  openDoc,
  openWelcome,
  save,
  saveAs,
  showRecent,
  syncFiles,
} from "@/lib/actions";
import { canSave, canSync, state } from "@/lib/store";
</script>

<template>
  <div class="group">
    <div class="row">
      <RibbonButton big :icon="FilePlus2" label="New" title="New (⌘N)" @click="newDoc" />
      <RibbonButton big :icon="FolderOpen" label="Open" title="Open (⌘O)" @click="openDoc" />
      <RibbonButton
        big
        :icon="History"
        label="Recent"
        title="Open a recent document (⇧⌘O)"
        @click="showRecent"
      />
      <RibbonButton
        big
        :icon="Save"
        label="Save"
        :title="state.dirty ? 'Save unsaved changes (⌘S)' : 'Save (⌘S)'"
        :attention="state.dirty"
        :disabled="!canSave"
        @click="save"
      />
      <RibbonButton big :icon="SaveAll" label="Save As" title="Save As (⇧⌘S)" @click="saveAs" />
    </div>
    <label>Document</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="FileDown"
        label="PDF"
        title="Export as PDF (⌘E)"
        @click="exportPdf"
      />
      <RibbonButton
        big
        :icon="FileText"
        label="Word"
        title="Export as Word (⇧⌘E)"
        @click="exportDocx"
      />
      <RibbonButton
        big
        :icon="Globe"
        label="Web"
        title="Export as Web Page (⌥⌘E)"
        @click="exportHtml"
      />
      <RibbonButton
        big
        :icon="RefreshCw"
        label="Sync Files"
        :title="
          canSync
            ? 'Save, then write PDF and Word copies beside the document (⇧⌘Y)'
            : 'The PDF and Word copies are up to date'
        "
        :disabled="!canSync"
        @click="syncFiles"
      />
    </div>
    <label>Export</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton big :icon="Sparkles" label="Welcome" @click="openWelcome" />
      <RibbonButton big :icon="BookOpen" label="Cheat Sheet" @click="menu('cheatsheet')" />
      <RibbonButton big :icon="Info" label="About" @click="menu('about')" />
    </div>
    <label>Help</label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
