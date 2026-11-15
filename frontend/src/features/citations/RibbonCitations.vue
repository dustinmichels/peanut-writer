<script setup lang="ts">
// The citation manager's groups on the ribbon's Citations & Footnotes tab:
// cite, see every reference, import, and set the style; and, with Zotero
// citations on, a group of its own to cite from Zotero and update from it.
import { BookSearch, FileUp, Library, Quote, RefreshCw, Settings2 } from "lucide-vue-next";
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
        big
        :icon="Settings2"
        label="Style"
        title="Citation style (APA, Chicago, IEEE…) and where the reference list goes"
        @click="state.dialog = { kind: 'referenceSettings' }"
      />
    </div>
    <label>Citations</label>
  </div>
  <div v-if="state.zotero" class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="BookSearch"
        label="Cite from Zotero"
        title="Search your Zotero library and cite a source; it's copied into the document's references"
        @click="openCitations({ zotero: true })"
      />
      <RibbonButton
        big
        :icon="RefreshCw"
        label="Update"
        title="Fetch the cited sources from Zotero again, with any changes made there"
        @click="updateSources"
      />
    </div>
    <label>Zotero</label>
  </div>
</template>

<style scoped src="@/components/ribbon/ribbon.css"></style>
