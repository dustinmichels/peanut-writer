<script setup lang="ts">
// The citation manager's group on the ribbon's Citations & Footnotes tab:
// cite, see every reference, import, and update from Zotero.
import { FileUp, Library, Quote, RefreshCw } from "lucide-vue-next";
import RibbonButton from "@/components/ribbon/RibbonButton.vue";
import { openCitations, toggleReferencesPane, updateSources } from "./actions";
import { refs } from "./store";
import { state } from "@/lib/store";
</script>

<template>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="Quote"
        label="Citation"
        title="Cite a source, or add one to the document's references"
        @click="openCitations()"
      />
      <RibbonButton
        big
        :icon="Library"
        label="All Sources"
        title="Every reference beside the editor, with how often it's cited"
        :active="refs.paneOpen"
        @click="toggleReferencesPane"
      />
      <RibbonButton
        big
        :icon="FileUp"
        label="Import"
        title="Add references from BibTeX or RIS (another document, a reference manager)"
        @click="openCitations({ import: true })"
      />
      <RibbonButton
        v-if="state.zotero"
        big
        :icon="RefreshCw"
        label="Update"
        title="Fetch the cited sources from Zotero again, with any changes made there"
        @click="updateSources"
      />
    </div>
    <label>Citations</label>
  </div>
</template>

<style scoped src="@/components/ribbon/ribbon.css"></style>
