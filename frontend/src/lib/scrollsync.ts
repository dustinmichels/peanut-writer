// Keeps the editor and preview scrolled to the same place, and tracks the
// heading the editor is scrolled to (for the outline). Headings are the
// anchors: between two of them, each pane's position is interpolated from the
// other's. While linked (state.scrollLinked), scrolling either pane brings the
// other along; only the link button unlinks them.

import { watch } from "vue";
import type { EditorView } from "@codemirror/view";
import { focusedLines, lineScrollTop } from "@/lib/editor";
import { state } from "@/lib/store";

type Anchor = [editor: number, preview: number]; // scrollTops showing the same place

// How long after one pane is moved to follow the other its scroll events are
// taken as the echo of following rather than the user's.
const echoMs = 150;

// syncScroll links the editor to the preview's scroller, which maps heading
// source lines to the scrollTop showing them. It returns the teardown, link,
// which links the panes and lines the preview up with the editor, and unlink.
export function syncScroll(
  view: EditorView,
  preview: HTMLElement,
  headingTops: () => Map<number, number>,
): { stop: () => void; link: () => void; unlink: () => void } {
  const ed = view.scrollDOM;
  let previewUntil = 0; // preview scroll events before this are echoes
  let editorUntil = 0; // editor scroll events before this are echoes

  // headings are the outline's headings the editor shows: those in the
  // focused section, if there is one.
  function headings() {
    const f = focusedLines(view.state);
    return f ? state.outline.filter((h) => h.line >= f.first && h.line <= f.last) : state.outline;
  }

  // anchors pairs the panes' positions at the start, at each heading both
  // can scroll to, and at the end; strictly increasing in both. Focused on a
  // section, the editor's start and end are the section's in the preview.
  function anchors(): Anchor[] {
    const eMax = Math.max(0, ed.scrollHeight - ed.clientHeight);
    let pMax = Math.max(0, preview.scrollHeight - preview.clientHeight);
    const tops = headingTops();
    let p0 = 0;
    const f = focusedLines(view.state);
    if (f) {
      p0 = Math.min(pMax, tops.get(f.first) ?? 0);
      const next = state.outline.find((h) => h.line > f.last);
      pMax = Math.max(p0, Math.min(pMax, (next && tops.get(next.line)) ?? pMax));
    }
    const out: Anchor[] = [[0, p0]];
    for (const h of headings()) {
      const p = tops.get(h.line);
      const e = lineScrollTop(view, h.line);
      if (p === undefined || e === undefined) continue;
      const [le, lp] = out[out.length - 1];
      if (e > le && p > lp && e < eMax && p < pMax) out.push([e, p]);
    }
    out.push([eMax, pMax]);
    return out;
  }

  // follow tracks the editor's heading and, while linked, brings the preview
  // along.
  function follow() {
    state.currentHeading = currentHeading();
    if (!state.scrollLinked) return;
    previewUntil = performance.now() + echoMs;
    preview.scrollTop = along(anchors(), ed.scrollTop);
  }

  // currentHeading is the last heading at or above the editor's top; at the
  // bottom, where later headings can't reach the top, the last one in view.
  function currentHeading(): number {
    const top = ed.scrollTop;
    const eMax = ed.scrollHeight - ed.clientHeight;
    const limit = eMax > 0 && top >= eMax - 2 ? top + ed.clientHeight - 48 : top + 1;
    let line = 0;
    for (const h of headings()) {
      const e = lineScrollTop(view, h.line);
      if (e === undefined || e > limit) break;
      line = h.line;
    }
    return line;
  }

  const onEditor = () => {
    if (performance.now() < editorUntil) state.currentHeading = currentHeading();
    else follow();
  };
  // While linked, scrolling the preview brings the editor along.
  const onPreview = () => {
    if (!state.scrollLinked || performance.now() < previewUntil) return;
    editorUntil = performance.now() + echoMs;
    const swapped = anchors().map(([e, p]): Anchor => [p, e]);
    ed.scrollTop = along(swapped, preview.scrollTop);
  };
  ed.addEventListener("scroll", onEditor, { passive: true });
  preview.addEventListener("scroll", onPreview, { passive: true });

  // A new render or zoom moves the headings in the preview, and focusing on
  // a section (or no longer) changes what the editor shows, maybe without
  // scrolling it: line them up again (after the pages are laid out).
  const stop = watch(
    () => [state.pages, state.outline, state.zoom, state.fitZoom, state.focusedHeading],
    follow,
    { flush: "post" },
  );

  return {
    stop() {
      stop();
      ed.removeEventListener("scroll", onEditor);
      preview.removeEventListener("scroll", onPreview);
    },
    link() {
      state.scrollLinked = true;
      follow();
    },
    unlink() {
      state.scrollLinked = false;
    },
  };
}

// along maps the editor's scrollTop x to the preview's, linearly between the
// anchors around it.
function along(pts: Anchor[], x: number): number {
  let i = 1;
  while (i < pts.length - 1 && x > pts[i][0]) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const span = b[0] - a[0];
  const t = span > 0 ? Math.min(1, Math.max(0, (x - a[0]) / span)) : 0;
  return a[1] + t * (b[1] - a[1]);
}
