// pictures.ts adds, replaces and removes figures.

import { DocService } from "@bindings/peanut-writer";
import { insertBlock, itemsField } from "@/lib/editor";
import { type FigureSpec, figureMarkdown, type Item, uniqueLabel } from "@/lib/markdown";
import { state } from "@/lib/store";
import { refLabel } from "./crossrefs";
import { run, view } from "./run";

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

export function applyFigure(item: Item, f: FigureSpec) {
  const v = view();
  const items = v.state.field(itemsField);
  const label = refLabel("fig", f.label) || uniqueLabel("fig", f.caption, items, item.label);
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
