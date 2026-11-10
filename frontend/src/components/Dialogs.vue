<script setup lang="ts">
import FigureDialog from "./dialogs/FigureDialog.vue";
import TableDialog from "./dialogs/TableDialog.vue";
import PasteTableDialog from "./dialogs/PasteTableDialog.vue";
import CrossRefDialog from "./dialogs/CrossRefDialog.vue";
import LinkDialog from "./dialogs/LinkDialog.vue";
import PropertiesDialog from "./dialogs/PropertiesDialog.vue";
import CheatSheet from "./dialogs/CheatSheet.vue";
import RecentDialog from "./dialogs/RecentDialog.vue";
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
    <CheatSheet v-else-if="state.dialog.kind === 'cheatsheet'" @close="close" />
    <RecentDialog
      v-else-if="state.dialog.kind === 'recent'"
      :files="state.dialog.files"
      @close="close"
    />
  </template>
</template>
