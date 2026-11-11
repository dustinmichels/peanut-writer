// saving.ts saves documents: autosaves, the user's saves (formatted first,
// with Auto Format on) and the settings that govern them.

import { diff } from "@codemirror/merge";
import { Transaction } from "@codemirror/state";
import { DocService } from "@bindings/peanut-writer";
import type { DocInfo, SettingsInfo } from "@bindings/peanut-writer/models";
import { readFrontMatter } from "@/lib/markdown";
import { behindCopies, editor, state, toast } from "@/lib/store";
import { loadSettings } from "./documents";
import { syncCopies } from "./export";
import { run } from "./run";
import { setMeta } from "./templates";

// A document with a file saves itself this long after the last edit.
const autosaveDelay = 2000;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

export function scheduleAutosave() {
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
// The save of an untitled document, which asks where to save it: saving
// again meanwhile (⌘S twice) joins it rather than queueing a second dialog.
let naming: Promise<boolean> | null = null;

export function queueSave(): Promise<boolean> {
  clearTimeout(autosaveTimer);
  if (naming) return naming;
  const s = (saving = saving.then(saveNow));
  if (!state.path) {
    naming = s;
    const done = () => {
      if (naming === s) naming = null;
    };
    s.then(done, done);
  }
  return s;
}

async function saveNow(): Promise<boolean> {
  if (state.path && !state.dirty) return true;
  stampVersion();
  const content = state.content;
  const info = await run("Save", () => DocService.Save(content));
  if (!info || info.canceled) return false;
  afterSave(content, info);
  return true;
}

// The latest save's text as sent and as written, when an open dialog kept the
// properties it filled in out of the editor.
let filled: { sent: string; written: string } | null = null;

// writtenText is what saving content wrote: the PDF and Word copies are made
// from it, properties and all.
export function writtenText(content: string): string {
  return filled?.sent === content ? filled.written : content;
}

// afterSave takes what a save of sent wrote. An open dialog may hold places in
// the text (a figure's, say), which properties filled in would move: then the
// text the editor sent counts as saved, though the file has them filled in
// too; the next save fills them in again.
function afterSave(sent: string, info: DocInfo) {
  filled = null;
  if (state.dialog && info.content !== sent) {
    filled = { sent, written: info.content };
    saved({ ...info, content: sent });
    return;
  }
  takeFilled(sent, info.content);
  saved(info);
}

// takeFilled puts the properties a save filled in (see fillProperties in
// service.go) into the editor, outside the undo history. Only the front
// matter differs, so text typed meanwhile below it stays.
function takeFilled(sent: string, written: string) {
  const v = editor.value;
  if (!v || written === sent) return;
  const to = readFrontMatter(sent).to;
  const body = sent.slice(to);
  if (!written.endsWith(body) || v.state.doc.sliceString(0, to) !== sent.slice(0, to)) return;
  v.dispatch({
    changes: { from: 0, to, insert: written.slice(0, written.length - body.length) },
    userEvent: "input",
    filter: false, // past the guard that keeps typing out of the properties
    annotations: Transaction.addToHistory.of(false),
  });
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

export async function formatAndSave(): Promise<boolean> {
  await autoFormat();
  return queueSave();
}

// defaultSettings is what a setting neither the document nor the user sets
// comes to.
export const defaultSettings = {
  autoFormat: true,
  headingCase: "none",
  peanut: true,
  peanutActivity: "chill",
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
    peanutActivity:
      s.document.peanutActivity ?? s.user.peanutActivity ?? defaultSettings.peanutActivity,
    syncOnSave: s.document.syncOnSave ?? s.user.syncOnSave ?? defaultSettings.syncOnSave,
    syncOnQuit: s.document.syncOnQuit ?? s.user.syncOnQuit ?? defaultSettings.syncOnQuit,
  };
}

// autoFormat formats the Markdown with oxfmt when the settings turn Auto
// Format on, as one undoable edit that keeps the cursor among the text it
// was in. If the text changes meanwhile, formatting fails, or a dialog is
// open (see afterSave), it's left as it is.
export async function autoFormat() {
  const s = await loadSettings();
  const v = editor.value;
  if (!v || !s?.autoFormat) return;
  const { headingCase } = s;
  const before = v.state.doc.toString();
  const after = await run("Auto format", () => DocService.Format(before, headingCase));
  if (after === undefined || after === before || v.state.doc.toString() !== before) return;
  if (state.dialog) return;
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
  if (!editor.value || !state.version || state.dialog) return;
  if (readFrontMatter(editor.value.state.doc.toString()).meta["peanut-version"] === state.version)
    return;
  setMeta({ "peanut-version": state.version }, false);
}

export async function saveAs(): Promise<boolean> {
  await autoFormat();
  stampVersion();
  const content = state.content;
  const info = await run("Save As", () => DocService.SaveAs(content));
  if (!info || info.canceled) return false;
  afterSave(content, info);
  toast(`Saved as ${info.name}`, "success");
  if (state.syncOnSave && behindCopies.value) await syncCopies();
  return true;
}
