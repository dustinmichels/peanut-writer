// Moving the cursor and scrolling the editor to a place in the document.

import { EditorView } from "@codemirror/view";

// goTo puts the cursor at pos and scrolls it to the middle of the editor.
export function goTo(view: EditorView, pos: number) {
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
  view.focus();
}

// How far below the editor's top revealLine puts a line.
export const revealMargin = 24;

// revealLine puts the cursor at the start of line n (1-based) and scrolls it
// to the top of the editor.
export function revealLine(view: EditorView, n: number) {
  if (n < 1 || n > view.state.doc.lines) return;
  const { from } = view.state.doc.line(n);
  view.dispatch({
    selection: { anchor: from },
    effects: EditorView.scrollIntoView(from, {
      y: "start",
      yMargin: revealMargin,
    }),
  });
  view.focus();
}

// revealSource puts the cursor a fraction t of the way down the editor from
// the start of line n to the start of line next (0: n alone), and centers it
// in the editor if it's out of view. In a long wrapped line the place is in
// proportion.
export function revealSource(view: EditorView, n: number, next: number, t: number) {
  const doc = view.state.doc;
  if (n < 1 || n > doc.lines) return;
  const top = view.lineBlockAt(doc.line(n).from).top;
  const end = next > n && next <= doc.lines ? view.lineBlockAt(doc.line(next).from).top : top;
  const h = top + t * (end - top);
  const b = view.lineBlockAtHeight(h);
  const f = b.height > 0 ? Math.min(1, Math.max(0, (h - b.top) / b.height)) : 0;
  // At least line n: a height on a line's top edge can find the line above.
  const pos = Math.max(doc.line(n).from, Math.min(b.to, b.from + Math.round(f * b.length)));
  const r = view.scrollDOM.getBoundingClientRect();
  const y = view.documentTop + h;
  const shown = y >= r.top && y <= r.bottom - 24;
  view.dispatch({
    selection: { anchor: pos },
    effects: shown ? [] : EditorView.scrollIntoView(pos, { y: "center" }),
  });
  view.focus();
}

// lineScrollTop is the editor's scrollTop that shows line n (1-based) where
// revealLine puts it. Lines out of view have estimated heights.
export function lineScrollTop(view: EditorView, n: number): number | undefined {
  if (n < 1 || n > view.state.doc.lines) return;
  const scroller = view.scrollDOM;
  const docTop = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
  return docTop + view.lineBlockAt(view.state.doc.line(n).from).top - revealMargin;
}
