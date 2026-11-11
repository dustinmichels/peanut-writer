// documents.ts loads documents: new, opened, recent, the welcome guide, and
// quitting.

import { DocService } from "@bindings/peanut-writer";
import type { DocInfo } from "@bindings/peanut-writer/models";
import { itemsField, replaceDoc } from "@/lib/editor";
import { scan, wordCount } from "@/lib/markdown";
import { behindCopies, editor, scheduleRender, state } from "@/lib/store";
import { syncCopies } from "./export";
import { run } from "./run";
import { effectiveSettings, queueSave, scheduleAutosave } from "./saving";

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
export async function loadCustom() {
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

// ensureSaved deals with unsaved changes before they'd be lost; false means
// the user canceled. A document with a file is just saved; only an untitled
// one asks. With Sync on quit, copies behind the document are synced too.
export async function ensureSaved(): Promise<boolean> {
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

// Closing the window asks again each time; one question at a time.
let quitting = false;
export async function quit() {
  if (quitting) return;
  quitting = true;
  try {
    if (await ensureSaved()) DocService.Quit();
  } finally {
    quitting = false;
  }
}
