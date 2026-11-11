// export.ts writes the document's PDF, Word and web copies, and shows it in
// Finder.

import { DocService } from "@bindings/peanut-writer";
import { state, toast } from "@/lib/store";
import { run } from "./run";
import { formatAndSave, writtenText } from "./saving";

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
export const exportHtml = () => exported("Web Page", () => DocService.ExportHTML(state.content));

// syncFiles saves the document, then writes its PDF and Word copies beside it.
export async function syncFiles() {
  if (await formatAndSave()) await syncCopies();
}

// syncCopies writes the copies of the document as it was saved.
export async function syncCopies() {
  const content = state.content;
  const paths = await run("Sync files", () => DocService.SyncFiles(writtenText(content)));
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
