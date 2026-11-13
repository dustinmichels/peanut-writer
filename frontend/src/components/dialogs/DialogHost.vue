<script setup lang="ts">
// DialogHost shows the open dialog, if any (state.dialog), and the cheat sheet
// over it.
import FigureDialog from "./FigureDialog.vue";
import TableDialog from "./TableDialog.vue";
import EquationDialog from "./EquationDialog.vue";
import PasteTableDialog from "./PasteTableDialog.vue";
import CrossRefDialog from "./CrossRefDialog.vue";
import { CitationDialog } from "@/features/citations";
import LinkDialog from "./LinkDialog.vue";
import FootnoteDialog from "./FootnoteDialog.vue";
import FootnotesDialog from "./FootnotesDialog.vue";
import PropertiesDialog from "./PropertiesDialog.vue";
import SettingsDialog from "./SettingsDialog.vue";
import CheatSheet from "./CheatSheet.vue";
import AboutDialog from "./AboutDialog.vue";
import RecentDialog from "./RecentDialog.vue";
import StartDialog from "./StartDialog.vue";
import TemplatesDialog from "./TemplatesDialog.vue";
import SaveTemplateDialog from "./SaveTemplateDialog.vue";
import CommandPalette from "./CommandPalette.vue";
import { editor, state } from "@/lib/store";

function close() {
  state.dialog = null;
  editor.value?.focus();
}

// The cheat sheet sits over any open dialog, which stays as it was.
function closeCheatSheet() {
  state.cheatSheet = false;
  if (!state.dialog) editor.value?.focus();
}
</script>

<template>
  <!-- Keyed by item so a new figure, table or equation gets a fresh dialog. -->
  <template v-if="state.dialog">
    <FigureDialog
      v-if="state.dialog.kind === 'figure'"
      :key="state.dialog.item.from"
      :item="state.dialog.item"
      @close="close"
    />
    <TableDialog
      v-else-if="state.dialog.kind === 'table'"
      :key="state.dialog.item?.from ?? -1"
      :item="state.dialog.item"
      :cols="state.dialog.cols"
      :rows="state.dialog.rows"
      :table="state.dialog.table"
      @close="close"
    />
    <EquationDialog
      v-else-if="state.dialog.kind === 'equation'"
      :key="state.dialog.eq?.from ?? -1"
      :eq="state.dialog.eq"
      :tex="state.dialog.tex"
      :replace="state.dialog.replace"
      @close="close"
    />
    <PasteTableDialog v-else-if="state.dialog.kind === 'pasteTable'" @close="close" />
    <CitationDialog v-else-if="state.dialog.kind === 'citation'" @close="close" />
    <CrossRefDialog
      v-else-if="state.dialog.kind === 'crossref'"
      :key="state.dialog.at?.from ?? -1"
      :at="state.dialog.at"
      @close="close"
    />
    <LinkDialog v-else-if="state.dialog.kind === 'link'" :text="state.dialog.text" @close="close" />
    <FootnoteDialog
      v-else-if="state.dialog.kind === 'footnote'"
      :label="state.dialog.label"
      @close="close"
    />
    <FootnotesDialog v-else-if="state.dialog.kind === 'footnotes'" @close="close" />
    <PropertiesDialog v-else-if="state.dialog.kind === 'properties'" @close="close" />
    <SettingsDialog v-else-if="state.dialog.kind === 'settings'" @close="close" />
    <AboutDialog v-else-if="state.dialog.kind === 'about'" @close="close" />
    <RecentDialog
      v-else-if="state.dialog.kind === 'recent'"
      :files="state.dialog.files"
      @close="close"
    />
    <StartDialog
      v-else-if="state.dialog.kind === 'start'"
      :files="state.dialog.files"
      @close="close"
    />
    <TemplatesDialog v-else-if="state.dialog.kind === 'templates'" @close="close" />
    <SaveTemplateDialog v-else-if="state.dialog.kind === 'saveTemplate'" @close="close" />
    <CommandPalette v-else-if="state.dialog.kind === 'commands'" @close="close" />
  </template>
  <CheatSheet v-if="state.cheatSheet" @close="closeCheatSheet" />
</template>
