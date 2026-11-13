// Setting up the editor, and swapping in a new document.

import { autocompletion, type CompletionSource } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import { indentListLess, indentListMore, setBlockStyle, toggleMark } from "./commands";
import { refCompletions } from "./completion";
import { decorations, lineStyles } from "./decorations";
import {
  bodyHint,
  equationsField,
  footnotesField,
  frontMatterEnd,
  itemsField,
  showMarkdown,
  startSelection,
  typedEquation,
} from "./fields";
import { followFootnotes, followLabels, guardProperties } from "./filters";
import { focusField, focusGuard, focusKeymap } from "./focus";
import { hiddenKeymap, hiddenMarks, settleCursor } from "./hidden";
import { highlight } from "./highlight";
import { math } from "./math";
import { showExtension, showSlot, theme } from "./theme";
import type { Handlers } from "./types";
import { imageCache } from "./widgets/figure";

// An add-on to the editor (a feature such as the citation manager): its
// completions, offered beside the cross-references', and its extensions.
export interface EditorAddon {
  completions: CompletionSource[];
  extensions: Extension[];
}

export function createEditor(
  parent: HTMLElement,
  doc: string,
  handlers: Handlers,
  show: boolean,
  addon: EditorAddon = { completions: [], extensions: [] },
): EditorView {
  const formatting = keymap.of([
    { key: "Mod-b", run: (v) => toggleMark(v, "strong") },
    { key: "Mod-i", run: (v) => toggleMark(v, "emph") },
    { key: "Mod-Shift-x", run: (v) => toggleMark(v, "strike") },
    { key: "Mod-Shift-h", run: (v) => toggleMark(v, "highlight") },
    { key: "Mod-`", run: (v) => toggleMark(v, "code") },
    { key: "Mod-Alt-1", run: (v) => (setBlockStyle(v, "h1"), true) },
    { key: "Mod-Alt-2", run: (v) => (setBlockStyle(v, "h2"), true) },
    { key: "Mod-Alt-3", run: (v) => (setBlockStyle(v, "h3"), true) },
    { key: "Mod-Alt-4", run: (v) => (setBlockStyle(v, "h4"), true) },
    { key: "Mod-Alt-0", run: (v) => (setBlockStyle(v, "p"), true) },
    { key: "Tab", run: indentListMore, shift: indentListLess },
  ]);

  const extensions: Extension[] = [
    itemsField,
    equationsField,
    typedEquation,
    footnotesField,
    frontMatterEnd,
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(false),
    bodyHint,
    markdown({ base: markdownLanguage, addKeymap: false, extensions: [math, highlight] }),
    // Highlighting comes with showSlot.
    theme,
    hiddenKeymap,
    focusKeymap,
    formatting,
    // Not ⌘/ (toggleComment, `<!-- -->`): that's View → Markdown, the menu's.
    keymap.of([
      ...markdownKeymap,
      ...defaultKeymap.filter((b) => b.key !== "Mod-/"),
      ...historyKeymap,
      ...searchKeymap,
    ]),
    autocompletion({ override: [refCompletions, ...addon.completions], icons: false }),
    ...addon.extensions,
    decorations(handlers),
    lineStyles,
    hiddenMarks,
    settleCursor,
    guardProperties,
    focusField,
    followLabels,
    followFootnotes,
    // Last, so its filter runs first (filters run last to first).
    focusGuard,
    EditorView.contentAttributes.of({
      spellcheck: "true",
      autocorrect: "on",
      autocapitalize: "sentences",
    }),
    EditorView.updateListener.of((u) => {
      const refocused = u.startState.field(focusField) !== u.state.field(focusField);
      if (u.docChanged || u.selectionSet || refocused) handlers.changed(u.state, u.docChanged);
    }),
    EditorView.domEventHandlers({
      paste(e, view) {
        const files = [...(e.clipboardData?.files ?? [])].filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return false;
        e.preventDefault();
        handlers.pasteImages(files, view.state.selection.main.head);
        return true;
      },
    }),
  ];
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: startSelection(doc),
      extensions: [extensions, showSlot.of(showExtension(show))],
    }),
  });
  editorSetup.set(view, { extensions, handlers });
  return view;
}

const editorSetup = new WeakMap<EditorView, { extensions: Extension[]; handlers: Handlers }>();

// replaceDoc swaps in a new document, starting a fresh undo history.
export function replaceDoc(view: EditorView, doc: string) {
  imageCache.clear(); // picture paths are relative to the document
  const { extensions, handlers } = editorSetup.get(view)!;
  const show = showSlot.of(showExtension(view.state.facet(showMarkdown)));
  view.setState(
    EditorState.create({ doc, selection: startSelection(doc), extensions: [extensions, show] }),
  );
  handlers.changed(view.state, false); // setState skips update listeners
}
