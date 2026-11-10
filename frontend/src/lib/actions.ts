// What the menus, the ribbon and the dialogs do to the document.

import { redo, undo } from "@codemirror/commands";
import { diff } from "@codemirror/merge";
import { openSearchPanel } from "@codemirror/search";
import { type ChangeSpec, Transaction } from "@codemirror/state";
import { DocService } from "../../bindings/peanut-writer";
import type { DocInfo, SettingsInfo } from "../../bindings/peanut-writer/models";
import type { Style } from "../../bindings/peanut-writer/internal/templates/models";
import { insertBlock, itemsField, replaceDoc, setShowMarkdown } from "./editor";
import {
  captionMarkdown,
  type FigureSpec,
  figureMarkdown,
  figureSpec,
  type Item,
  type Meta,
  readFrontMatter,
  scan,
  type Table,
  uniqueLabel,
  wordCount,
  writeFrontMatter,
  writeTable,
} from "./markdown";
import { editor, errorText, scheduleRender, state, toast } from "./store";

function view() {
  const v = editor.value;
  if (!v) throw new Error("the editor isn't ready");
  return v;
}

// --- Documents ----------------------------------------------------------------

export function loadDoc(info: DocInfo) {
  state.path = info.path;
  state.name = info.name || "Untitled";
  state.saved = info.content;
  state.content = info.content;
  state.dirty = false;
  state.synced = null;
  state.pages = [];
  state.renderError = "";
  state.warnings = [];
  state.customizing = false;
  state.custom = null;
  if (editor.value) replaceDoc(editor.value, info.content);
  contentChanged(info.content);
  scheduleRender(0);
  loadCustom();
  loadSettings();
}

// loadSettings applies the settings that show straight away (Peanut) for
// the open document, unless another document is opened meanwhile.
export async function loadSettings() {
  const path = state.path;
  const info = await run("Settings", () => DocService.Settings());
  if (info && state.path === path) state.showPeanut = effectiveSettings(info).peanut;
}

// loadCustom fetches the document's own template, if it has one, unless
// another document is opened meanwhile.
async function loadCustom() {
  const path = state.path;
  const t = await run("Document template", () => DocService.CustomTemplate());
  if (t !== undefined && state.path === path) state.custom = t;
}

// contentChanged updates what's derived from the text after an edit.
export function contentChanged(content: string) {
  state.content = content;
  state.items = editor.value ? editor.value.state.field(itemsField) : scan(content);
  state.words = wordCount(content);
  const dirty = content !== state.saved;
  if (dirty !== state.dirty) {
    state.dirty = dirty;
    DocService.SetDirty(dirty);
  }
  scheduleAutosave();
  scheduleRender();
}

// A document with a file saves itself this long after the last edit.
const autosaveDelay = 2000;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = state.path && state.dirty ? setTimeout(autosave, autosaveDelay) : undefined;
}

// How long the title bar says an autosave ran.
const autosavedMs = 2500;
let autosavedTimer: ReturnType<typeof setTimeout> | undefined;

async function autosave() {
  if (!(await queueSave())) return;
  state.autosaved = true;
  clearTimeout(autosavedTimer);
  autosavedTimer = setTimeout(() => (state.autosaved = false), autosavedMs);
}

async function run<T>(what: string, f: () => Promise<T>): Promise<T | undefined> {
  try {
    return await f();
  } catch (e) {
    toast(`${what}: ${errorText(e)}`, "error");
    return undefined;
  }
}

// ensureSaved deals with unsaved changes before they'd be lost; false means
// the user canceled. A document with a file is just saved; only an untitled
// one asks.
async function ensureSaved(): Promise<boolean> {
  if (!state.dirty) return true;
  if (state.path) return queueSave();
  const choice = await DocService.ConfirmDiscard(state.name);
  if (choice === "cancel") return false;
  if (choice === "save") return queueSave();
  return true;
}

export async function newDoc() {
  if (!(await ensureSaved())) return;
  const info = await run("New document", () => DocService.NewDocument());
  if (!info || info.canceled) return;
  loadDoc(info);
  editor.value?.focus();
}

export async function openDoc() {
  if (!(await ensureSaved())) return;
  const info = await run("Open", () => DocService.OpenDocument());
  if (info && !info.canceled) loadDoc(info);
}

export async function openRecent(path: string) {
  if (!(await ensureSaved())) return;
  const info = await run("Open", () => DocService.OpenPath(path));
  if (info) loadDoc(info);
}

// showRecent offers the recent documents.
export async function showRecent() {
  const files = await run("Recent documents", () => DocService.RecentFiles());
  if (files) state.dialog = { kind: "recent", files };
}

// forgetRecent takes a document off the recent list.
export async function forgetRecent(path: string) {
  await run("Recent documents", () => DocService.ForgetRecent(path));
}

export async function openWelcome() {
  if (!(await ensureSaved())) return;
  const info = await run("Welcome guide", () => DocService.OpenWelcome());
  if (info) loadDoc(info);
}

function saved(info: DocInfo) {
  // Copies synced beside another file don't count for this one.
  if (info.path !== state.path) state.synced = null;
  state.path = info.path;
  state.name = info.name;
  state.saved = info.content;
  state.dirty = state.content !== info.content;
  DocService.SetDirty(state.dirty);
  scheduleAutosave();
}

// Saves run one at a time, so an autosave and ⌘S can't overlap.
let saving: Promise<boolean> = Promise.resolve(true);

function queueSave(): Promise<boolean> {
  clearTimeout(autosaveTimer);
  saving = saving.then(saveNow);
  return saving;
}

async function saveNow(): Promise<boolean> {
  if (state.path && !state.dirty) return true;
  stampVersion();
  const info = await run("Save", () => DocService.Save(state.content));
  if (!info || info.canceled) return false;
  saved(info);
  return true;
}

// save is the user saving: with Auto Format on, the Markdown is tidied
// first. Autosaves and saves on the way out don't format, so spaces typed a
// moment ago aren't trimmed from under the cursor.
export async function save(): Promise<boolean> {
  await autoFormat();
  return queueSave();
}

// effectiveSettings is what the settings come to: the document's where it
// has them, else the user's, else off.
export function effectiveSettings(s: SettingsInfo) {
  return {
    autoFormat: s.document.autoFormat ?? s.user.autoFormat ?? false,
    titleCase: s.document.titleCase ?? s.user.titleCase ?? false,
    peanut: s.document.peanut ?? s.user.peanut ?? true,
  };
}

// autoFormat formats the Markdown with oxfmt when the settings turn Auto
// Format on, as one undoable edit that keeps the cursor among the text it
// was in. If the text changes meanwhile, or formatting fails, it's left as
// it is.
export async function autoFormat() {
  const v = editor.value;
  if (!v) return;
  const info = await run("Settings", () => DocService.Settings());
  if (!info) return;
  const { autoFormat: on, titleCase } = effectiveSettings(info);
  if (!on) return;
  const before = v.state.doc.toString();
  const after = await run("Auto format", () => DocService.Format(before, titleCase));
  if (after === undefined || after === before || v.state.doc.toString() !== before) return;
  const changes = diff(before, after).map((c) => ({
    from: c.fromA,
    to: c.toA,
    insert: after.slice(c.fromB, c.toB),
  }));
  v.dispatch({ changes, userEvent: "input.format" });
}

// stampVersion records the app's version in the front matter of a document
// about to be saved, outside the undo history.
function stampVersion() {
  if (!editor.value || !state.version) return;
  if (readFrontMatter(editor.value.state.doc.toString()).meta["peanut-version"] === state.version)
    return;
  setMeta({ "peanut-version": state.version }, false);
}

export async function saveAs(): Promise<boolean> {
  await autoFormat();
  stampVersion();
  const info = await run("Save As", () => DocService.SaveAs(state.content));
  if (!info || info.canceled) return false;
  saved(info);
  toast(`Saved as ${info.name}`, "success");
  return true;
}

async function exported(kind: string, f: () => Promise<string>) {
  const path = await run(`Export as ${kind}`, f);
  if (!path) return;
  toast(`Exported ${path.split("/").pop()}`, "success", {
    label: "Show in Finder",
    run: () => DocService.Reveal(path),
  });
}

export const exportPdf = () => exported("PDF", () => DocService.ExportPDF(state.content));
export const exportDocx = () => exported("Word", () => DocService.ExportDOCX(state.content));

// syncFiles saves the document, then writes its PDF and Word copies into its out folder.
export async function syncFiles() {
  if (!(await save())) return;
  const content = state.content;
  const paths = await run("Sync files", () => DocService.SyncFiles(content));
  if (!paths?.length) return;
  state.synced = content;
  toast(`Synced ${paths.map((p) => p.split("/").pop()).join(" and ")}`, "success", {
    label: "Show in Finder",
    run: () => DocService.Reveal(paths[0]),
  });
}

// showInFolder opens the document's folder in Finder with the file selected.
export function showInFolder() {
  if (state.path) run("Show in Finder", () => DocService.Reveal(state.path));
}

// Closing the window asks again each time; one question at a time.
let quitting = false;
async function quit() {
  if (quitting) return;
  quitting = true;
  try {
    if (await ensureSaved()) DocService.Quit();
  } finally {
    quitting = false;
  }
}

// A text field in a dialog has its own undo history; the menu's Undo and
// Redo act on it rather than on the document behind the dialog.
function fieldEdit(command: "undo" | "redo"): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  document.execCommand(command);
  return true;
}

export function menu(action: string) {
  const v = editor.value;
  switch (action) {
    case "new":
      return newDoc();
    case "open":
      return openDoc();
    case "save":
      return save();
    case "saveAs":
      return saveAs();
    case "exportPdf":
      return exportPdf();
    case "exportDocx":
      return exportDocx();
    case "syncFiles":
      return syncFiles();
    case "quit":
      return quit();
    case "welcome":
      return openWelcome();
    case "cheatsheet":
      state.dialog = { kind: "cheatsheet" };
      return;
    case "settings":
      state.dialog = { kind: "settings" };
      return;
    case "commands":
      state.dialog = state.dialog?.kind === "commands" ? null : { kind: "commands" };
      return;
    case "undo":
      if (!fieldEdit("undo") && v && !state.dialog) undo(v);
      return;
    case "redo":
      if (!fieldEdit("redo") && v && !state.dialog) redo(v);
      return;
    case "find":
      if (v) openSearchPanel(v);
      return;
    case "zoomIn":
      state.zoom = Math.min(3, (state.zoom || state.fitZoom) * 1.15);
      return;
    case "zoomOut":
      state.zoom = Math.max(0.3, (state.zoom || state.fitZoom) / 1.15);
      return;
    case "zoomReset":
      state.zoom = 0;
      return;
    case "outline":
      return toggleOutline();
    case "markdown":
      return toggleMarkdown();
  }
}

// --- Pictures --------------------------------------------------------------------

function base64(file: File): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
  return promise;
}

function pastedName(file: File): string {
  if (file.name && file.name !== "image.png") return file.name;
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") || "png";
  return `pasted-image.${ext}`;
}

// addFigure inserts a figure for images already in the document's folder
// (a grid for two or more), then opens it for a caption.
function addFigure(srcs: string[], at?: number) {
  const v = view();
  const grid = srcs.length > 1;
  const start = insertBlock(
    v,
    figureMarkdown({
      pictures: srcs.map((src) => ({ src, alt: "" })),
      caption: "",
      label: "",
      width: grid ? 0 : 70,
      position: "",
      columns: Math.min(srcs.length, 3),
    }),
    { at },
  );
  const item = v.state.field(itemsField).find((x) => x.kind === "figure" && x.from === start);
  if (item) state.dialog = { kind: "figure", item };
}

export async function insertImages(files: File[], pos: number) {
  for (const file of files) {
    const src = await run(`Adding ${file.name || "picture"}`, async () =>
      DocService.AddImage(pastedName(file), await base64(file)),
    );
    if (src) {
      addFigure([src], pos);
      pos = view().state.selection.main.head;
    }
  }
}

// insertImageFiles adds figures for image files on disk (dropped ones).
export async function insertImageFiles(paths: string[], pos: number) {
  for (const path of paths) {
    const src = await run(`Adding ${path.split(/[\\/]/).pop()}`, () =>
      DocService.AddImageFile(path),
    );
    if (src) {
      addFigure([src], pos);
      pos = view().state.selection.main.head;
    }
  }
}

export async function choosePicture() {
  const src = await run("Insert picture", () => DocService.ChooseImage());
  if (src) addFigure([src]);
}

// choosePictureGrid inserts a grid of the pictures chosen.
export async function choosePictureGrid() {
  const srcs = await run("Insert pictures", () => DocService.ChooseImages());
  if (srcs?.length) addFigure(srcs);
}

export async function replacePicture(): Promise<string> {
  return (await run("Replace picture", () => DocService.ChooseImage())) ?? "";
}

export async function addPictures(): Promise<string[]> {
  return (await run("Add pictures", () => DocService.ChooseImages())) ?? [];
}

// relabelChanges points every reference to one label at another.
function relabelChanges(text: string, from: string, to: string): ChangeSpec[] {
  if (!from || from === to) return [];
  const re = new RegExp(
    `(^|[^\\w])@${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:-]*[A-Za-z0-9_])`,
    "g",
  );
  const out: ChangeSpec[] = [];
  for (const m of text.matchAll(re)) {
    const at = m.index! + m[1].length + 1;
    out.push({ from: at, to: at + from.length, insert: to });
  }
  return out;
}

export function applyFigure(item: Item, f: FigureSpec) {
  const v = view();
  const items = v.state.field(itemsField);
  const label = f.label || uniqueLabel("fig", f.caption, items, item.label);
  v.dispatch({
    changes: [
      { from: item.from, to: item.to, insert: figureMarkdown({ ...f, label }) },
      ...relabelChanges(v.state.doc.toString(), item.label, label),
    ],
    userEvent: "input",
  });
  v.focus();
}

export function deleteBlock(from: number, to: number) {
  const v = view();
  const doc = v.state.doc;
  // Take the blank line after it too.
  let end = to;
  while (end < doc.length && doc.sliceString(end, end + 1) === "\n") end++;
  v.dispatch({ changes: { from, to: Math.min(end, doc.length) }, userEvent: "delete" });
  v.focus();
}

// --- Tables -------------------------------------------------------------------------

export function applyTable(item: Item | undefined, table: Table, caption: string, label: string) {
  const v = view();
  const items = v.state.field(itemsField);
  const id = label || uniqueLabel("tbl", caption, items, item?.label ?? "");
  const text = `${writeTable(table)}\n\n${captionMarkdown(caption, id)}`;
  if (item) {
    v.dispatch({
      changes: [
        { from: item.tableFrom!, to: item.to, insert: text },
        ...relabelChanges(v.state.doc.toString(), item.label, id),
      ],
      userEvent: "input",
    });
    v.focus();
  } else {
    insertBlock(v, text);
  }
}

// --- Cross-references ---------------------------------------------------------

// insertCrossRef inserts a reference to item at the cursor, first giving the
// item a label if it has none.
export function insertCrossRef(item: Item) {
  const v = view();
  const items = v.state.field(itemsField);
  const changes: ChangeSpec[] = [];
  let label = item.label;
  if (!label) {
    label = uniqueLabel(item.kind === "figure" ? "fig" : "tbl", item.caption, items);
    if (item.kind === "figure") {
      changes.push({
        from: item.from,
        to: item.to,
        insert: figureMarkdown({ ...figureSpec(item), label }),
      });
    } else if (item.captionFrom !== undefined) {
      changes.push({
        from: item.captionFrom,
        to: item.captionTo!,
        insert: captionMarkdown(item.caption, label),
      });
    } else {
      changes.push({ from: item.tableTo!, insert: `\n\n${captionMarkdown("", label)}` });
    }
  }
  const { from, to } = v.state.selection.main;
  const before = v.state.sliceDoc(from - 1, from);
  const text = (before && !/[\s(\[]/.test(before) ? " " : "") + "@" + label;
  changes.push({ from, to, insert: text });
  const set = v.state.changes(changes);
  // The cursor goes after the reference, wherever the other changes put it.
  v.dispatch({ changes: set, selection: { anchor: set.mapPos(to, 1) }, userEvent: "input" });
  v.focus();
}

// --- Document properties and templates ---------------------------------------

// setMeta changes the document's properties; with history false, as an edit
// undo skips.
export function setMeta(patch: Partial<Meta>, history = true) {
  const v = view();
  const text = v.state.doc.toString();
  const fm = readFrontMatter(text);
  const meta = { ...fm.meta, ...patch };
  let block = writeFrontMatter(meta, fm.extra);
  // Keep a blank line between the properties and the text.
  if (block && fm.to === 0 && text && !text.startsWith("\n")) block += "\n";
  v.dispatch({
    changes: { from: 0, to: fm.to, insert: block },
    userEvent: "input",
    annotations: history ? [] : Transaction.addToHistory.of(false),
  });
}

export function setTemplate(id: string) {
  setMeta({ template: id === "classic" ? "" : id });
  state.template = id;
}

export async function refreshTemplates() {
  state.templates = (await DocService.Templates()) ?? [];
  await loadCustom(); // its base may have been renamed or deleted
}

// customizeTemplate gives the document its own template, based on the one it
// uses (unless it has one already), uses it, and shows its fonts and colors
// in place of the editor. Again, it goes back to the editor.
export async function customizeTemplate() {
  if (state.customizing) {
    state.customizing = false;
    return;
  }
  const t = await run("Customize template", () => DocService.CustomizeTemplate(state.template));
  if (!t) return;
  state.custom = t;
  if (state.template !== t.id) setTemplate(t.id);
  state.customizing = true;
}

// Style changes are saved one at a time, in order.
let styling: Promise<unknown> = Promise.resolve();

// setTemplateStyle sets the fonts and colors of the document's own template.
export function setTemplateStyle(style: Style) {
  styling = styling.then(async () => {
    const t = await run("Customize template", () => DocService.SetTemplateStyle(style));
    if (!t) return;
    state.custom = t;
    scheduleRender(0);
  });
}

// removeCustomTemplate deletes the document's own template and goes back to
// the one it was based on.
export async function removeCustomTemplate() {
  const old = state.custom;
  const base = await run("Remove customization", () => DocService.RemoveCustomTemplate());
  if (base === undefined) return;
  state.custom = null;
  state.customizing = false;
  setTemplate(base);
  if (!old) return;
  const name = state.templates.find((t) => t.id === old.base)?.name ?? old.base;
  const path = state.path;
  toast(`Removed this document's changes to ${name}.`, "info", {
    label: "Undo",
    run: async () => {
      if (state.path !== path) return;
      if (!(await run("Undo", () => DocService.CustomizeTemplate(old.base)))) return;
      const t = await run("Undo", () => DocService.SetTemplateStyle(old.style));
      if (!t) return;
      state.custom = t;
      setTemplate(t.id);
    },
  });
}

// renameTemplate reports whether the template was renamed.
export async function renameTemplate(id: string, name: string, description: string) {
  const ok = await run("Rename template", async () => {
    await DocService.RenameTemplate(id, name, description);
    return true;
  });
  if (ok) await refreshTemplates();
  return ok === true;
}

export async function editTemplate(id: string) {
  await run("Edit template", () => DocService.EditTemplate(id));
}

// deleteTemplate asks, then deletes one of the user's templates. A document
// using it goes back to Classic.
export async function deleteTemplate(id: string) {
  if (!(await run("Delete template", () => DocService.DeleteTemplate(id)))) return;
  await refreshTemplates();
  if (state.template === id) setTemplate("classic");
}

export async function shareTemplate(id: string) {
  const p = await run("Share template", () => DocService.ShareTemplate(id));
  if (p)
    toast(
      `Saved ${p.split(/[\\/]/).pop()}. Send it on; it's added with Design → Manage Templates → Import.`,
      "success",
    );
}

export async function importTemplate() {
  const id = await run("Import template", () => DocService.ImportTemplate());
  if (!id) return;
  await refreshTemplates();
  const name = state.templates.find((t) => t.id === id)?.name ?? id;
  toast(`Added the template “${name}”.`, "success", {
    label: "Use It",
    run: () => setTemplate(id),
  });
}

export async function openTemplatesFolder() {
  await run("Templates folder", () => DocService.OpenTemplatesFolder());
  await refreshTemplates();
}

// --- View -----------------------------------------------------------------------------

export function toggleMarkdown() {
  state.showMarkdown = !state.showMarkdown;
  localStorage.setItem("showMarkdown", state.showMarkdown ? "1" : "0");
  if (editor.value) setShowMarkdown(editor.value, state.showMarkdown);
}

export function toggleOutline() {
  state.outlineOpen = !state.outlineOpen;
  localStorage.setItem("outline", state.outlineOpen ? "1" : "0");
}

// --- Text -----------------------------------------------------------------------------

// editLink asks for a link for the selected text.
export function editLink() {
  const v = editor.value;
  if (!v) return;
  const { from, to } = v.state.selection.main;
  state.dialog = { kind: "link", text: v.state.sliceDoc(from, to) };
}
