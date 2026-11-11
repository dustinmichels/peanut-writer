// menu.ts dispatches the app menu's actions.

import { redo, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { Browser } from "@wailsio/runtime";
import { editor, state } from "@/lib/store";
import { newDoc, openDoc, openWelcome, quit, showRecent } from "./documents";
import { exportDocx, exportHtml, exportPdf, syncFiles } from "./export";
import { docsUrl } from "./run";
import { save, saveAs } from "./saving";
import { toggleMarkdown, toggleOutline, togglePreview, toggleVersions } from "./view";

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
    case "exportHtml":
      return exportHtml();
    case "syncFiles":
      return syncFiles();
    case "quit":
      return quit();
    case "welcome":
      return openWelcome();
    case "cheatsheet":
      state.cheatSheet = true;
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
      // The search panel is in the editor, under any dialog.
      if (v && !state.dialog && !state.cheatSheet) openSearchPanel(v);
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
    case "preview":
      return togglePreview();
    case "markdown":
      return toggleMarkdown();
  }
}
