// What the menus, the ribbon and the dialogs do to the document.

import { redo, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import type { ChangeSpec } from "@codemirror/state";
import { DocService } from "../../bindings/peanut-writer";
import type { DocInfo } from "../../bindings/peanut-writer/models";
import { insertBlock, itemsField, replaceDoc } from "./editor";
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
  state.pages = [];
  state.renderError = "";
  if (editor.value) replaceDoc(editor.value, info.content);
  contentChanged(info.content);
  scheduleRender(0);
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
  scheduleRender();
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
// the user canceled.
export async function ensureSaved(): Promise<boolean> {
  if (!state.dirty) return true;
  const choice = await DocService.ConfirmDiscard(state.name);
  if (choice === "cancel") return false;
  if (choice === "save") return save();
  return true;
}

export async function newDoc() {
  if (!(await ensureSaved())) return;
  const info = await run("New document", () => DocService.NewDocument());
  if (info) loadDoc(info);
}

export async function openDoc() {
  if (!(await ensureSaved())) return;
  const info = await run("Open", () => DocService.OpenDocument());
  if (info && !info.canceled) loadDoc(info);
}

export async function openWelcome() {
  if (!(await ensureSaved())) return;
  const info = await run("Welcome guide", () => DocService.OpenWelcome());
  if (info) loadDoc(info);
}

function saved(info: DocInfo) {
  state.path = info.path;
  state.name = info.name;
  state.saved = info.content;
  state.dirty = state.content !== info.content;
  DocService.SetDirty(state.dirty);
}

export async function save(): Promise<boolean> {
  const info = await run("Save", () => DocService.Save(state.content));
  if (!info || info.canceled) return false;
  saved(info);
  return true;
}

export async function saveAs(): Promise<boolean> {
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

export async function quit() {
  if (await ensureSaved()) DocService.Quit();
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
    case "quit":
      return quit();
    case "welcome":
      return openWelcome();
    case "cheatsheet":
      state.dialog = { kind: "cheatsheet" };
      return;
    case "undo":
      if (v) undo(v);
      return;
    case "redo":
      if (v) redo(v);
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

// addFigure inserts a figure for an image already in the document's folder,
// then opens it for a caption.
function addFigure(src: string, at?: number) {
  const v = view();
  const start = insertBlock(
    v,
    figureMarkdown({ src, caption: "", label: "", width: 70, position: "" }),
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
      addFigure(src, pos);
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
      addFigure(src, pos);
      pos = view().state.selection.main.head;
    }
  }
}

export async function choosePicture() {
  const src = await run("Insert picture", () => DocService.ChooseImage());
  if (src) addFigure(src);
}

export async function replacePicture(): Promise<string> {
  return (await run("Replace picture", () => DocService.ChooseImage())) ?? "";
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
  v.dispatch({ changes, userEvent: "input" });
  // The cursor goes after the reference, wherever the changes moved it.
  const at =
    v.state.doc.toString().lastIndexOf("@" + label, v.state.selection.main.head + text.length) +
    label.length +
    1;
  v.dispatch({ selection: { anchor: Math.min(at, v.state.doc.length) } });
  v.focus();
}

// --- Document properties and templates ---------------------------------------

export function setMeta(patch: Partial<Meta>) {
  const v = view();
  const text = v.state.doc.toString();
  const fm = readFrontMatter(text);
  const meta = { ...fm.meta, ...patch };
  let block = writeFrontMatter(meta, fm.extra);
  // Keep a blank line between the properties and the text.
  if (block && fm.to === 0 && text && !text.startsWith("\n")) block += "\n";
  v.dispatch({ changes: { from: 0, to: fm.to, insert: block }, userEvent: "input" });
}

export function setTemplate(id: string) {
  setMeta({ template: id === "classic" ? "" : id });
  state.template = id;
}
