// equations.ts adds and rewrites display equations, and draws them for the
// editor.

import { DocService } from "@bindings/peanut-writer";
import { inlineMath, insertBlock } from "@/lib/editor";
import { type DisplayEquation, equationMarkdown } from "@/lib/markdown";
import { editor, state } from "@/lib/store";
import { view } from "./run";

// Each formula drawn, as a data URL ("" when it can't be), kept for the
// session: the drawing doesn't depend on the document.
const drawn = new Map<string, Promise<string>>();
let queue: { tex: string; resolve: (url: string) => void }[] = [];

// equationURL draws a display equation. Those asked for together (a document's
// worth, as it opens) are drawn in one Typst run.
export function equationURL(tex: string): Promise<string> {
  let url = drawn.get(tex);
  if (!url) {
    const { promise, resolve } = Promise.withResolvers<string>();
    url = promise;
    drawn.set(tex, url);
    if (!queue.length) setTimeout(drawQueued);
    queue.push({ tex, resolve });
  }
  return url;
}

async function drawQueued() {
  const batch = queue;
  queue = [];
  let urls: string[] = [];
  try {
    urls = (await DocService.Equations(batch.map((x) => x.tex))) ?? [];
  } catch {
    // Not drawn this time; asked again, they're tried again.
    for (const x of batch) drawn.delete(x.tex);
  }
  batch.forEach((x, i) => x.resolve(urls[i] ?? ""));
}

// newEquation wraps text selected within a line as inline math, or else asks
// for a display equation to put at the cursor (or of the selected lines).
export function newEquation() {
  const v = editor.value;
  if (!v || inlineMath(v)) return;
  const { from, to } = v.state.selection.main;
  const tex = v.state.sliceDoc(from, to).trim();
  state.dialog = { kind: "equation", tex, replace: tex ? { from, to } : undefined };
}

// applyEquation writes the equation in place of eq, or inserts it (in place of
// replace, if given).
export function applyEquation(
  eq: DisplayEquation | undefined,
  tex: string,
  label: string,
  replace?: { from: number; to: number },
) {
  const v = view();
  const text = equationMarkdown(tex, label);
  if (eq) {
    v.dispatch({ changes: { from: eq.from, to: eq.to, insert: text }, userEvent: "input" });
    v.focus();
  } else insertBlock(v, text, { replace });
}
