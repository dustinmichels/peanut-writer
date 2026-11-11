// What the command palette (⇧⌘P) offers: everything the menus and the ribbon
// can do, by name.

import { indentLess, indentMore } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import {
  choosePicture,
  choosePictureGrid,
  customizeTemplate,
  editLink,
  importTemplate,
  insertLoremIpsum,
  newFootnote,
  menu,
  openTemplatesFolder,
  packageOf,
  setTemplate,
  showInFolder,
  showPackageContents,
  restoreView,
  toggleFocusSection,
} from "@/lib/actions";
import {
  type BlockStyle,
  clearFormatting,
  insertBlock,
  insertDivider,
  insertEquation,
  setBlockStyle,
  toggleCodeBlock,
  toggleList,
  toggleMark,
} from "@/lib/editor";
import { canSave, canSync, docTemplates, editor, state } from "@/lib/store";

export interface Command {
  id: string;
  group: string;
  label: string;
  shortcut?: string;
  run: () => unknown;
  // Whether it would do anything now; a command that wouldn't is shown dimmed.
  enabled?: () => boolean;
}

// inEditor runs f on the editor, which keeps the focus.
function inEditor(f: (v: EditorView) => unknown) {
  return () => {
    const v = editor.value;
    if (!v) return;
    f(v);
    v.focus();
  };
}

const style = (s: BlockStyle) => inEditor((v) => setBlockStyle(v, s));

const fixed: Command[] = [
  { id: "new", group: "File", label: "New", shortcut: "⌘N", run: () => menu("new") },
  { id: "open", group: "File", label: "Open…", shortcut: "⌘O", run: () => menu("open") },
  {
    id: "recent",
    group: "File",
    label: "Open Recent…",
    shortcut: "⇧⌘O",
    run: () => menu("recent"),
  },
  {
    id: "save",
    group: "File",
    label: "Save",
    shortcut: "⌘S",
    run: () => menu("save"),
    enabled: () => canSave.value,
  },
  { id: "saveAs", group: "File", label: "Save As…", shortcut: "⇧⌘S", run: () => menu("saveAs") },
  {
    id: "exportPdf",
    group: "File",
    label: "Export as PDF…",
    shortcut: "⌘E",
    run: () => menu("exportPdf"),
  },
  {
    id: "exportDocx",
    group: "File",
    label: "Export as Word…",
    shortcut: "⇧⌘E",
    run: () => menu("exportDocx"),
  },
  {
    id: "exportHtml",
    group: "File",
    label: "Export as Web Page…",
    shortcut: "⌥⌘E",
    run: () => menu("exportHtml"),
  },
  {
    id: "syncFiles",
    group: "File",
    label: "Sync Files",
    shortcut: "⇧⌘Y",
    run: () => menu("syncFiles"),
    enabled: () => canSync.value,
  },
  {
    id: "reveal",
    group: "File",
    label: "Show in Finder",
    run: showInFolder,
    enabled: () => !!state.path,
  },
  {
    id: "revealPackage",
    group: "File",
    label: "Show Package Contents",
    run: showPackageContents,
    enabled: () => !!packageOf(state.path),
  },
  {
    id: "properties",
    group: "File",
    label: "Properties…",
    run: () => (state.dialog = { kind: "properties" }),
  },
  {
    id: "settings",
    group: "File",
    label: "Settings…",
    shortcut: "⌘,",
    run: () => menu("settings"),
  },

  { id: "undo", group: "Edit", label: "Undo", shortcut: "⌘Z", run: () => menu("undo") },
  { id: "redo", group: "Edit", label: "Redo", shortcut: "⇧⌘Z", run: () => menu("redo") },
  { id: "find", group: "Edit", label: "Find…", shortcut: "⌘F", run: () => menu("find") },

  {
    id: "bold",
    group: "Format",
    label: "Bold",
    shortcut: "⌘B",
    run: inEditor((v) => toggleMark(v, "strong")),
  },
  {
    id: "italic",
    group: "Format",
    label: "Italic",
    shortcut: "⌘I",
    run: inEditor((v) => toggleMark(v, "emph")),
  },
  {
    id: "strike",
    group: "Format",
    label: "Strikethrough",
    shortcut: "⇧⌘X",
    run: inEditor((v) => toggleMark(v, "strike")),
  },
  {
    id: "code",
    group: "Format",
    label: "Code",
    shortcut: "⌘`",
    run: inEditor((v) => toggleMark(v, "code")),
  },
  { id: "clear", group: "Format", label: "Clear Formatting", run: inEditor(clearFormatting) },
  { id: "normal", group: "Format", label: "Normal Text", shortcut: "⌥⌘0", run: style("p") },
  { id: "h1", group: "Format", label: "Heading 1", shortcut: "⌥⌘1", run: style("h1") },
  { id: "h2", group: "Format", label: "Heading 2", shortcut: "⌥⌘2", run: style("h2") },
  { id: "h3", group: "Format", label: "Heading 3", shortcut: "⌥⌘3", run: style("h3") },
  { id: "h4", group: "Format", label: "Heading 4", shortcut: "⌥⌘4", run: style("h4") },
  {
    id: "quote",
    group: "Format",
    label: "Quote",
    run: () => style(state.block === "quote" ? "p" : "quote")(),
  },
  {
    id: "bullets",
    group: "Format",
    label: "Bullets",
    run: inEditor((v) => toggleList(v, "bullet")),
  },
  {
    id: "numbering",
    group: "Format",
    label: "Numbering",
    run: inEditor((v) => toggleList(v, "ordered")),
  },
  {
    id: "indent",
    group: "Format",
    label: "Increase Indent",
    shortcut: "⇥",
    run: inEditor(indentMore),
  },
  {
    id: "outdent",
    group: "Format",
    label: "Decrease Indent",
    shortcut: "⇧⇥",
    run: inEditor(indentLess),
  },

  { id: "picture", group: "Insert", label: "Picture…", run: choosePicture },
  { id: "pictureGrid", group: "Insert", label: "Picture Grid…", run: choosePictureGrid },
  { id: "table", group: "Insert", label: "Table…", run: () => (state.dialog = { kind: "table" }) },
  {
    id: "pasteTable",
    group: "Insert",
    label: "Paste Table…",
    run: () => (state.dialog = { kind: "pasteTable" }),
  },
  { id: "link", group: "Insert", label: "Link…", run: editLink },
  { id: "footnote", group: "Insert", label: "Footnote…", run: newFootnote },
  {
    id: "footnotes",
    group: "View",
    label: "All Footnotes",
    run: () => (state.dialog = { kind: "footnotes" }),
  },
  { id: "equation", group: "Insert", label: "Equation", run: inEditor(insertEquation) },
  { id: "codeBlock", group: "Insert", label: "Code Block", run: inEditor(toggleCodeBlock) },
  { id: "divider", group: "Insert", label: "Divider", run: inEditor(insertDivider) },
  {
    id: "pageBreak",
    group: "Insert",
    label: "Page Break",
    run: inEditor((v) => insertBlock(v, "\\pagebreak")),
  },
  {
    id: "toc",
    group: "Insert",
    label: "Table of Contents",
    run: inEditor((v) => insertBlock(v, "[TOC]")),
  },
  {
    id: "crossref",
    group: "Insert",
    label: "Cross-reference…",
    run: () => (state.dialog = { kind: "crossref" }),
  },
  { id: "lorem", group: "Insert", label: "Lorem Ipsum", run: insertLoremIpsum },

  { id: "customize", group: "Design", label: "Customize Template", run: customizeTemplate },
  {
    id: "saveTemplate",
    group: "Design",
    label: "Save as Template…",
    run: () => (state.dialog = { kind: "saveTemplate" }),
    enabled: () => !!state.custom,
  },
  {
    id: "manageTemplates",
    group: "Design",
    label: "Manage Templates…",
    run: () => (state.dialog = { kind: "templates" }),
  },
  { id: "importTemplate", group: "Design", label: "Import Template…", run: importTemplate },
  {
    id: "templatesFolder",
    group: "Design",
    label: "Open Templates Folder",
    run: openTemplatesFolder,
  },

  {
    id: "markdown",
    group: "View",
    label: "Toggle Markdown",
    shortcut: "⌘/",
    run: () => menu("markdown"),
  },
  { id: "outline", group: "View", label: "Toggle Outline", run: () => menu("outline") },
  {
    id: "focusSection",
    group: "View",
    label: "Toggle Focus on Section",
    run: toggleFocusSection,
    enabled: () => state.outline.length > 0,
  },
  { id: "versions", group: "View", label: "Toggle Versions", run: () => menu("versions") },
  { id: "preview", group: "View", label: "Toggle Preview", run: () => menu("preview") },
  { id: "restoreView", group: "View", label: "Restore Default View", run: restoreView },
  { id: "zoomIn", group: "View", label: "Zoom In", shortcut: "⌘=", run: () => menu("zoomIn") },
  { id: "zoomOut", group: "View", label: "Zoom Out", shortcut: "⌘-", run: () => menu("zoomOut") },
  {
    id: "zoomReset",
    group: "View",
    label: "Actual Size",
    shortcut: "⌘0",
    run: () => menu("zoomReset"),
  },

  { id: "welcome", group: "Help", label: "Welcome Guide", run: () => menu("welcome") },
  { id: "cheatsheet", group: "Help", label: "Markdown Cheat Sheet", run: () => menu("cheatsheet") },
  { id: "docs", group: "Help", label: "Documentation", run: () => menu("docs") },
  { id: "about", group: "Help", label: "About Peanut Writer", run: () => menu("about") },
];

// commands lists every command, with one per template to switch to it.
export function commands(): Command[] {
  const templates = docTemplates.value.map((t): Command => ({
    id: `template:${t.id}`,
    group: "Template",
    label: t.name,
    run: () => setTemplate(t.id),
    enabled: () => state.template !== t.id,
  }));
  return [...fixed, ...templates];
}

// matches reports whether every word of the query begins a word of the
// command's group or label ("ex wo" finds "Export as Word…").
export function matches(c: Command, query: string): boolean {
  const words = `${c.group} ${c.label}`.toLowerCase().split(/[^a-z0-9]+/);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((q) => words.some((w) => w.startsWith(q)));
}
