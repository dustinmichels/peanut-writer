// text.ts inserts text: links, footnotes and sample text.

import { DocService } from "@bindings/peanut-writer";
import { insertBlock, itemsField } from "@/lib/editor";
import { loremLabels, loremMarkdown, loremPictures } from "@/lib/lorem";
import { scanFootnotes } from "@/lib/markdown";
import { editor, state } from "@/lib/store";
import { run, view } from "./run";

// insertLoremIpsum inserts sample headings, text, footnotes, math, figures and
// tables at the cursor, storing the sample pictures beside the document.
export async function insertLoremIpsum() {
  const srcs = await run("Lorem ipsum", () =>
    Promise.all(loremPictures.map((p) => DocService.AddImage(p.name, btoa(p.svg)))),
  );
  if (!srcs) return;
  const v = view();
  const { marks, notes } = scanFootnotes(v.state.doc.toString());
  const taken = new Set([
    ...v.state.field(itemsField).map((x) => x.label),
    ...marks.map((m) => m.label),
    ...notes.map((n) => n.label),
  ]);
  let suffix = "";
  for (let n = 2; loremLabels.some((l) => taken.has(l + suffix)); n++) suffix = `-${n}`;
  insertBlock(v, loremMarkdown(srcs, suffix));
}

// editLink asks for a link for the selected text.
export function editLink() {
  const v = editor.value;
  if (!v) return;
  const { from, to } = v.state.selection.main;
  state.dialog = { kind: "link", text: v.state.sliceDoc(from, to) };
}

// newFootnote asks for the text of a footnote to add at the cursor.
export function newFootnote() {
  if (editor.value) state.dialog = { kind: "footnote" };
}
