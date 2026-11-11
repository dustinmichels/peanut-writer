// What the menus, the ribbon and the dialogs do to the document.

import { redo, undo } from "@codemirror/commands";
import { diff } from "@codemirror/merge";
import { openSearchPanel } from "@codemirror/search";
import { type ChangeSpec, Transaction } from "@codemirror/state";
import { Browser } from "@wailsio/runtime";
import { DocService } from "../../bindings/peanut-writer";
import type { DocInfo, SettingsInfo } from "../../bindings/peanut-writer/models";
import type { Style } from "../../bindings/peanut-writer/internal/templates/models";
import { insertBlock, itemsField, replaceDoc, setShowMarkdown } from "./editor";
import { loremLabels, loremMarkdown, loremPictures } from "./lorem";
import {
  captionMarkdown,
  type FigureSpec,
  figureMarkdown,
  figureSpec,
  type Item,
  type Meta,
  readFrontMatter,
  type RefAt,
  scan,
  type Table,
  uniqueLabel,
  wordCount,
  writeFrontMatter,
  writeTable,
} from "./markdown";
import { behindCopies, editor, errorText, scheduleRender, state, toast } from "./store";

export const docsUrl = "https://dustinmichels.github.io/peanut-writer/";
export const repoUrl = "https://github.com/dustinmichels/peanut-writer";

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
  state.opened = info.content;
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

// loadSettings applies the settings that take effect without saving (Peanut,
// Sync on save and quit) for the open document and returns what they come to, unless
// another document is opened meanwhile.
export async function loadSettings() {
  const path = state.path;
  const info = await run("Settings", () => DocService.Settings());
  if (!info || state.path !== path) return undefined;
  const s = effectiveSettings(info);
  state.showPeanut = s.peanut;
  state.syncOnSave = s.syncOnSave;
  state.syncOnQuit = s.syncOnQuit;
  return s;
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
// one asks. With Sync on quit, copies behind the document are synced too.
async function ensureSaved(): Promise<boolean> {
  if (state.dirty) {
    let choice = "save";
    if (!state.path) choice = await DocService.ConfirmDiscard(state.name);
    if (choice === "cancel") return false;
    if (choice === "save" && !(await queueSave())) return false;
  }
  if (state.syncOnQuit && behindCopies.value) await syncCopies();
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
  if (info.path !== state.path) state.synced = state.opened = null;
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
// first; with Sync on save, the PDF and Word copies follow. Autosaves and
// saves on the way out don't format, so spaces typed a moment ago aren't
// trimmed from under the cursor.
export async function save(): Promise<boolean> {
  if (!(await formatAndSave())) return false;
  if (state.syncOnSave && behindCopies.value) await syncCopies();
  return true;
}

async function formatAndSave(): Promise<boolean> {
  await autoFormat();
  return queueSave();
}

// defaultSettings is what a setting neither the document nor the user sets
// comes to.
export const defaultSettings = {
  autoFormat: false,
  headingCase: "none",
  peanut: true,
  syncOnSave: false,
  syncOnQuit: true,
};

// effectiveSettings is what the settings come to: the document's where it
// has them, else the user's, else the default.
export function effectiveSettings(s: SettingsInfo) {
  return {
    autoFormat: s.document.autoFormat ?? s.user.autoFormat ?? defaultSettings.autoFormat,
    headingCase: s.document.headingCase ?? s.user.headingCase ?? defaultSettings.headingCase,
    peanut: s.document.peanut ?? s.user.peanut ?? defaultSettings.peanut,
    syncOnSave: s.document.syncOnSave ?? s.user.syncOnSave ?? defaultSettings.syncOnSave,
    syncOnQuit: s.document.syncOnQuit ?? s.user.syncOnQuit ?? defaultSettings.syncOnQuit,
  };
}

// autoFormat formats the Markdown with oxfmt when the settings turn Auto
// Format on, as one undoable edit that keeps the cursor among the text it
// was in. If the text changes meanwhile, or formatting fails, it's left as
// it is.
export async function autoFormat() {
  const s = await loadSettings();
  const v = editor.value;
  if (!v || !s?.autoFormat) return;
  const { headingCase } = s;
  const before = v.state.doc.toString();
  const after = await run("Auto format", () => DocService.Format(before, headingCase));
  if (after === undefined || after === before || v.state.doc.toString() !== before) return;
  const changes = diff(before, after).map((c) => ({
    from: c.fromA,
    to: c.toA,
    insert: after.slice(c.fromB, c.toB),
  }));
  // Formatting may tidy the front matter too, which the properties guard
  // would otherwise keep from changing.
  v.dispatch({ changes, userEvent: "input.format", filter: false });
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
  if (state.syncOnSave && behindCopies.value) await syncCopies();
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

// syncFiles saves the document, then writes its PDF and Word copies beside it.
export async function syncFiles() {
  if (await formatAndSave()) await syncCopies();
}

async function syncCopies() {
  const content = state.content;
  const paths = await run("Sync files", () => DocService.SyncFiles(content));
  if (!paths?.length) return;
  state.synced = content;
  toast(`Synced ${paths.map((p) => p.split("/").pop()).join(" and ")}`, "success", {
    label: "Show in Finder",
    run: () => DocService.Reveal(paths[0]),
  });
}

// packageOf is the .peanut package holding the document file at path, or ""
// if it isn't in one.
export function packageOf(path: string): string {
  const dir = path.replace(/[/\\][^/\\]*$/, "");
  return dir !== path && /\.peanut$/i.test(dir) ? dir : "";
}

// showInFolder opens the folder holding the document (its package, if it's in
// one, beside its synced PDF and Word copies) in Finder with it selected.
export function showInFolder() {
  if (state.path)
    run("Show in Finder", () => DocService.Reveal(packageOf(state.path) || state.path));
}

// showPackageContents opens the document's package in Finder with its
// Markdown file selected.
export function showPackageContents() {
  if (packageOf(state.path)) run("Show Package Contents", () => DocService.Reveal(state.path));
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
    case "recent":
      return showRecent();
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
    case "about":
      state.dialog = { kind: "about" };
      return;
    case "docs":
      return Browser.OpenURL(docsUrl);
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
    case "versions":
      return toggleVersions();
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

// insertLoremIpsum inserts sample headings, text, math, figures and tables at
// the cursor, storing the sample pictures beside the document.
export async function insertLoremIpsum() {
  const srcs = await run("Lorem ipsum", () =>
    Promise.all(loremPictures.map((p) => DocService.AddImage(p.name, btoa(p.svg)))),
  );
  if (!srcs) return;
  const v = view();
  const taken = new Set(v.state.field(itemsField).map((x) => x.label));
  let suffix = "";
  for (let n = 2; loremLabels.some((l) => taken.has(l + suffix)); n++) suffix = `-${n}`;
  insertBlock(v, loremMarkdown(srcs, suffix));
}

export async function replacePicture(): Promise<string> {
  return (await run("Replace picture", () => DocService.ChooseImage())) ?? "";
}

export async function addPictures(): Promise<string[]> {
  return (await run("Add pictures", () => DocService.ChooseImages())) ?? [];
}

export function applyFigure(item: Item, f: FigureSpec) {
  const v = view();
  const items = v.state.field(itemsField);
  const label = f.label || uniqueLabel("fig", f.caption, items, item.label);
  v.dispatch({
    changes: { from: item.from, to: item.to, insert: figureMarkdown({ ...f, label }) },
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
      changes: { from: item.tableFrom!, to: item.to, insert: text },
      userEvent: "input",
    });
    v.focus();
  } else {
    insertBlock(v, text);
  }
}

// --- Cross-references ---------------------------------------------------------

const labelPrefix = { figure: "fig", table: "tbl", equation: "eq" } as const;

// insertCrossRef inserts a reference to item at the cursor, or in place of the
// reference at `at`, first giving the item a label if it has none.
export function insertCrossRef(item: Item, at?: RefAt) {
  const v = view();
  const items = v.state.field(itemsField);
  const changes: ChangeSpec[] = [];
  let label = item.label;
  if (!label) {
    label = uniqueLabel(labelPrefix[item.kind], item.caption, items);
    if (item.kind === "figure") {
      changes.push({
        from: item.from,
        to: item.to,
        insert: figureMarkdown({ ...figureSpec(item), label }),
      });
    } else if (item.kind === "equation") {
      changes.push({ from: item.to, insert: ` {#${label}}` });
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
  const { from, to } = at ?? v.state.selection.main;
  const before = at ? "" : v.state.sliceDoc(from - 1, from);
  const text = (before && !/[\s(\[]/.test(before) ? " " : "") + "@" + label;
  changes.push({ from, to, insert: text });
  const set = v.state.changes(changes);
  // The cursor goes after the reference, wherever the other changes put it.
  v.dispatch({ changes: set, selection: { anchor: set.mapPos(to, 1) }, userEvent: "input" });
  v.focus();
}

// unlinkCrossRef turns the reference at `at` into the plain text it reads as,
// which no longer follows its target; a reference to nothing is removed.
export function unlinkCrossRef(at: RefAt) {
  const v = view();
  v.dispatch({
    changes: { from: at.from, to: at.to, insert: at.text },
    selection: { anchor: at.from + at.text.length },
    userEvent: "input",
  });
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
    filter: false, // past the guard that keeps typing out of the properties
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

// setTemplateBase bases the document's own template on another template,
// keeping its changes.
export function setTemplateBase(base: string) {
  styling = styling.then(async () => {
    const t = await run("Customize template", () => DocService.SetTemplateBase(base));
    if (!t) return;
    state.custom = t;
    scheduleRender(0);
  });
}

// saveCustomTemplate adds the document's own template to the user's
// templates, for any document to use, and reports whether it did.
export async function saveCustomTemplate(name: string, description: string) {
  await styling; // its latest changes
  const id = await run("Save as template", () => DocService.SaveCustomTemplate(name, description));
  if (!id) return false;
  await refreshTemplates();
  const saved = state.templates.find((t) => t.id === id)?.name ?? id;
  toast(`Saved the template “${saved}”.`, "success", {
    label: "Use It",
    run: () => {
      state.customizing = false;
      setTemplate(id);
    },
  });
  return true;
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

export function toggleVersions() {
  state.versionsOpen = !state.versionsOpen;
  localStorage.setItem("versions", state.versionsOpen ? "1" : "0");
}

// --- Versions ---------------------------------------------------------------------------

// saveVersion saves the document (asking where, if it's untitled), then keeps
// it as a named version with Word and PDF copies; reports whether it did.
export async function saveVersion(name: string): Promise<boolean> {
  if (!(await save())) return false;
  const v = await run("Save version", () => DocService.SaveVersion(name));
  if (!v) return false;
  toast(`Saved the version “${v.name}”.`, "success", {
    label: "Show in Finder",
    run: () => DocService.Reveal(v.path),
  });
  return true;
}

// loadVersion saves the document, then asks and replaces it with a version.
export async function loadVersion(name: string) {
  if (!(await ensureSaved())) return;
  const info = await run("Load version", () => DocService.LoadVersion(name));
  if (!info || info.canceled) return;
  loadDoc(info);
  toast(`Loaded the version “${name}”. The text it replaced is in backups.`, "success");
}

// --- Text -----------------------------------------------------------------------------

// editLink asks for a link for the selected text.
export function editLink() {
  const v = editor.value;
  if (!v) return;
  const { from, to } = v.state.selection.main;
  state.dialog = { kind: "link", text: v.state.sliceDoc(from, to) };
}
