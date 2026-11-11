// templates.ts changes the document's properties and its template, and
// manages the user's templates.

import { Transaction } from "@codemirror/state";
import { DocService } from "@bindings/peanut-writer";
import type { Style } from "@bindings/peanut-writer/internal/templates/models";
import { type Meta, readFrontMatter, writeFrontMatter } from "@/lib/markdown";
import { scheduleRender, state, toast } from "@/lib/store";
import { loadCustom } from "./documents";
import { run, view } from "./run";

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
