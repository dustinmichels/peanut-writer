// The citation manager: the document's references (Name.bib) cited, added,
// edited, imported and looked up, and sources cited from Zotero. Citations
// render without it (internal/doc, internal/render); this is how they're
// managed. It's mounted in six places; take those out (and its service in
// main.go) to go without it:
//   - components/dialogs/DialogHost.vue: CitationDialog, ReferenceSettingsDialog
//   - components/ribbon/RibbonNotes.vue: RibbonCitations
//   - components/ribbon/RibbonInsert.vue: openCitations
//   - App.vue: ReferencesPane
//   - components/panes/EditorPane.vue: citationEditor
//   - lib/store/state.ts: the `citation` and `referenceSettings` dialog kinds

import { citationCompletions, citationHover, citationWidgets } from "./editor";

export { default as CitationDialog } from "./CitationDialog.vue";
export { default as ReferenceSettingsDialog } from "./ReferenceSettingsDialog.vue";
export { default as ReferencesPane } from "./ReferencesPane.vue";
export { default as RibbonCitations } from "./RibbonCitations.vue";
export { openCitations } from "./actions";
export { refs as citationState } from "./store";

// What the editor gets: completion of keys after `[@`, citations shown as
// what they cite and changed with a click, and a citation's reference on
// hover.
export const citationEditor = {
  completions: [citationCompletions],
  extensions: [citationWidgets, citationHover],
};
