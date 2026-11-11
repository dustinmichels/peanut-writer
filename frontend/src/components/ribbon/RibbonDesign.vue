<script setup lang="ts">
// The ribbon's Design tab: the template gallery, and customizing and managing
// templates.
import { BookmarkPlus, FolderCog, Palette } from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import TemplateGallery from "./TemplateGallery.vue";
import { customizeTemplate } from "@/lib/actions";
import { state } from "@/lib/store";
</script>

<template>
  <div class="group">
    <TemplateGallery />
    <label>Templates</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="Palette"
        label="Customize"
        title="Change this document's fonts and colors"
        :active="state.customizing"
        @click="customizeTemplate"
      />
      <RibbonButton
        v-if="state.custom"
        big
        :icon="BookmarkPlus"
        label="Save as Template"
        title="Add this document's fonts and colors to your templates, for any document to use"
        @click="state.dialog = { kind: 'saveTemplate' }"
      />
      <RibbonButton
        big
        :icon="FolderCog"
        label="Manage Templates"
        title="Rename, edit, share, delete and import your templates"
        @click="state.dialog = { kind: 'templates' }"
      />
    </div>
    <label>Look</label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
