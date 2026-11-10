<script setup lang="ts">
import FigureDialog from "./dialogs/FigureDialog.vue";
import TableDialog from "./dialogs/TableDialog.vue";
import PasteTableDialog from "./dialogs/PasteTableDialog.vue";
import CrossRefDialog from "./dialogs/CrossRefDialog.vue";
import LinkDialog from "./dialogs/LinkDialog.vue";
import PropertiesDialog from "./dialogs/PropertiesDialog.vue";
import SettingsDialog from "./dialogs/SettingsDialog.vue";
import CheatSheet from "./dialogs/CheatSheet.vue";
import AboutDialog from "./dialogs/AboutDialog.vue";
import RecentDialog from "./dialogs/RecentDialog.vue";
import TemplatesDialog from "./dialogs/TemplatesDialog.vue";
import CommandPalette from "./dialogs/CommandPalette.vue";
import { editor, state } from "../lib/store";

function close() {
  state.dialog = null;
  editor.value?.focus();
}
</script>

<template>
  <!-- Keyed by item so a new figure or table gets a fresh dialog. -->
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
    <PasteTableDialog v-else-if="state.dialog.kind === 'pasteTable'" @close="close" />
    <CrossRefDialog v-else-if="state.dialog.kind === 'crossref'" @close="close" />
    <LinkDialog v-else-if="state.dialog.kind === 'link'" :text="state.dialog.text" @close="close" />
    <PropertiesDialog v-else-if="state.dialog.kind === 'properties'" @close="close" />
    <SettingsDialog v-else-if="state.dialog.kind === 'settings'" @close="close" />
    <CheatSheet v-else-if="state.dialog.kind === 'cheatsheet'" @close="close" />
    <AboutDialog v-else-if="state.dialog.kind === 'about'" @close="close" />
    <RecentDialog
      v-else-if="state.dialog.kind === 'recent'"
      :files="state.dialog.files"
      @close="close"
    />
    <TemplatesDialog v-else-if="state.dialog.kind === 'templates'" @close="close" />
    <CommandPalette v-else-if="state.dialog.kind === 'commands'" @close="close" />
  </template>
</template>
