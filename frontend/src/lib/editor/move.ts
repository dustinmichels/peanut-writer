// Moving figures, tables and the table of contents by dragging their grips.

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readFrontMatter } from "@/lib/markdown";
import { itemsField } from "./fields";

// dropTargets are where a figure or table may be put: the start of each
// top-level block after the front matter and outside figures and tables, and
// the end.
function dropTargets(state: EditorState): number[] {
  const doc = state.doc;
  const fmEnd = readFrontMatter(doc.toString()).to;
  const items = state.field(itemsField);
  const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state);
  const out: number[] = [];
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    const p = doc.lineAt(n.from).from;
    if (p < fmEnd || out[out.length - 1] === p) continue;
    if (items.some((x) => p > x.from && p <= x.to)) continue;
    out.push(p);
  }
  if (out[out.length - 1] !== doc.length) out.push(doc.length);
  return out;
}

// targetY is where the drop line for target p is drawn, in screen
// coordinates: in the blank line before the block, or at its top.
function targetY(view: EditorView, p: number): number {
  const doc = view.state.doc;
  if (p === doc.length && p > 0) return view.lineBlockAt(p).bottom + view.documentTop;
  if (p > 0 && doc.lineAt(p - 1).text.trim() === "") {
    const b = view.lineBlockAt(p - 1);
    return (b.top + b.bottom) / 2 + view.documentTop;
  }
  return view.lineBlockAt(p).top + view.documentTop;
}

// Span is a block's Markdown range in the document.
export type Span = { from: number; to: number };

// moveItem moves a block's Markdown (a figure, table or table of contents) to
// the block start target (or the end), keeping a blank line on either side.
// Dropping it where it is does nothing.
function moveItem(view: EditorView, item: Span, target: number) {
  const doc = view.state.doc;
  const text = doc.sliceString(item.from, item.to);
  const blank = (n: number) => doc.line(n).text.trim() === "";
  // What goes: the item and the blank lines after it, or before it when
  // nothing follows.
  const last = doc.lineAt(item.to).number;
  let next = last + 1;
  while (next <= doc.lines && blank(next)) next++;
  let from = item.from;
  let to: number;
  if (next <= doc.lines) to = doc.line(next).from;
  else {
    let prev = doc.lineAt(item.from).number - 1;
    while (prev >= 1 && blank(prev)) prev--;
    if (prev < 1) return; // the only block: nowhere else to go
    from = doc.line(prev).to;
    to = item.to;
  }
  if (target >= item.from && target <= (next <= doc.lines ? to : doc.length)) return;

  let insert: string;
  let at: number;
  if (target >= doc.length) {
    const tail = doc.sliceString(Math.max(0, doc.length - 2));
    at = doc.length;
    insert = (tail.endsWith("\n\n") ? "" : tail.endsWith("\n") ? "\n" : "\n\n") + text + "\n";
  } else {
    at = target;
    const before = at > 0 && doc.lineAt(at - 1).text.trim() !== "" ? "\n" : "";
    insert = before + text + "\n\n";
  }
  const changes = view.state.changes([
    { from, to },
    { from: at, insert },
  ]);
  const start = changes.mapPos(at, -1) + insert.indexOf(text);
  view.dispatch({
    changes,
    selection: EditorSelection.cursor(start),
    scrollIntoView: true,
    userEvent: "move.drop",
  });
}

// startMove drags the block el (whose Markdown current() finds) by its grip: a
// line shows where it will land, the editor scrolls near its edges, and Escape
// cancels.
export function startMove(
  view: EditorView,
  el: HTMLElement,
  grip: HTMLElement,
  e: PointerEvent,
  current: () => Span | undefined,
) {
  const item = current();
  if (!item) return;
  e.preventDefault();
  const state = view.state;
  const targets = dropTargets(state);
  const line = document.createElement("div");
  line.className = "pw-drop-line";
  view.dom.append(line);
  grip.setPointerCapture(e.pointerId);
  el.classList.add("moving");
  let y = e.clientY;
  let target = -1;
  let frame = 0;

  // Measured through CodeMirror, which first brings its line heights up to
  // date (pictures may have loaded since it last looked).
  const measure = {
    key: line,
    read: () => {
      let best = Infinity;
      let top = 0;
      for (const p of targets) {
        const ty = targetY(view, p);
        if (Math.abs(ty - y) < best) {
          best = Math.abs(ty - y);
          target = p;
          top = ty;
        }
      }
      const box = view.dom.getBoundingClientRect();
      const content = view.contentDOM.getBoundingClientRect();
      const css = getComputedStyle(view.contentDOM);
      const pl = parseFloat(css.paddingLeft);
      return {
        top: top - box.top - 1,
        left: content.left - box.left + pl,
        width: content.width - pl - parseFloat(css.paddingRight),
      };
    },
    write: (m: { top: number; left: number; width: number }) => {
      line.style.top = `${m.top}px`;
      line.style.left = `${m.left}px`;
      line.style.width = `${m.width}px`;
    },
  };
  const place = () => view.requestMeasure(measure);
  // Near the top or bottom edge, scroll that way while the pointer stays.
  const tick = () => {
    const r = view.scrollDOM.getBoundingClientRect();
    const edge = 48;
    const dy =
      y < r.top + edge ? -(r.top + edge - y) : y > r.bottom - edge ? y - (r.bottom - edge) : 0;
    if (dy) {
      view.scrollDOM.scrollTop += Math.max(-24, Math.min(24, dy / 2));
      place();
    }
    frame = requestAnimationFrame(tick);
  };
  const move = (ev: PointerEvent) => {
    y = ev.clientY;
    place();
  };
  const finish = (drop: boolean) => {
    cancelAnimationFrame(frame);
    grip.removeEventListener("pointermove", move);
    grip.removeEventListener("pointerup", up);
    grip.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
    line.remove();
    el.classList.remove("moving");
    // Positions hold while the text does (the parser may update the state).
    if (drop && target >= 0 && view.state.doc === state.doc) moveItem(view, item, target);
  };
  const up = () => finish(true);
  const cancel = () => finish(false);
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    finish(false);
  };
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", up);
  grip.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
  place();
  frame = requestAnimationFrame(tick);
}
