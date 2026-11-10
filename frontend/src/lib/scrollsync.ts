// Keeps the editor and the preview scrolled to the same place, and tracks the
// heading the editor is scrolled to (for the outline). Headings are the
// anchors: between two of them, each pane's position is interpolated.

import { watch } from "vue";
import type { EditorView } from "@codemirror/view";
import { lineScrollTop } from "./editor";
import { state } from "./store";

type Pane = "editor" | "preview";
type Anchor = [editor: number, preview: number]; // scrollTops showing the same place

// How long after a pane scrolls the other's scroll events are taken as the
// echo of following it rather than the user's.
const echoMs = 150;

// syncScroll links the editor to the preview's scroller, which maps heading
// source lines to the scrollTop showing them. It returns the unlink.
export function syncScroll(
  view: EditorView,
  preview: HTMLElement,
  headingTops: () => Map<number, number>,
): () => void {
  const ed = view.scrollDOM;
  let driver: Pane = "editor";
  let until = 0;

  // anchors pairs the panes' positions at the start, at each heading both
  // can scroll to, and at the end; strictly increasing in both.
  function anchors(): Anchor[] {
    const eMax = Math.max(0, ed.scrollHeight - ed.clientHeight);
    const pMax = Math.max(0, preview.scrollHeight - preview.clientHeight);
    const tops = headingTops();
    const out: Anchor[] = [[0, 0]];
    for (const h of state.outline) {
      const p = tops.get(h.line);
      const e = lineScrollTop(view, h.line);
      if (p === undefined || e === undefined) continue;
      const [le, lp] = out[out.length - 1];
      if (e > le && p > lp && e < eMax && p < pMax) out.push([e, p]);
    }
    out.push([eMax, pMax]);
    return out;
  }

  function follow(from: Pane) {
    driver = from;
    until = performance.now() + echoMs;
    const pts = anchors();
    if (from === "editor") preview.scrollTop = along(pts, ed.scrollTop, 0);
    else ed.scrollTop = along(pts, preview.scrollTop, 1);
    state.currentHeading = currentHeading();
  }

  // currentHeading is the last heading at or above the editor's top; at the
  // bottom, where later headings can't reach the top, the last one in view.
  function currentHeading(): number {
    const top = ed.scrollTop;
    const eMax = ed.scrollHeight - ed.clientHeight;
    const limit = eMax > 0 && top >= eMax - 2 ? top + ed.clientHeight - 48 : top + 1;
    let line = 0;
    for (const h of state.outline) {
      const e = lineScrollTop(view, h.line);
      if (e === undefined || e > limit) break;
      line = h.line;
    }
    return line;
  }

  const scrolled = (from: Pane) => () => {
    if (from !== driver && performance.now() < until) return;
    follow(from);
  };
  const onEditor = scrolled("editor");
  const onPreview = scrolled("preview");
  ed.addEventListener("scroll", onEditor, { passive: true });
  preview.addEventListener("scroll", onPreview, { passive: true });

  // A new render or zoom moves the headings in the preview: line it up again
  // (after the pages are laid out).
  const stop = watch(
    () => [state.pages, state.outline, state.zoom, state.fitZoom],
    () => follow("editor"),
    { flush: "post" },
  );

  return () => {
    stop();
    ed.removeEventListener("scroll", onEditor);
    preview.removeEventListener("scroll", onPreview);
  };
}

// along maps scrollTop x of one pane (side 0: editor, 1: preview) to the
// other's, linearly between the anchors around it.
function along(pts: Anchor[], x: number, side: 0 | 1): number {
  const other = 1 - side;
  let i = 1;
  while (i < pts.length - 1 && x > pts[i][side]) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const span = b[side] - a[side];
  const t = span > 0 ? Math.min(1, Math.max(0, (x - a[side]) / span)) : 0;
  return a[other] + t * (b[other] - a[other]);
}
