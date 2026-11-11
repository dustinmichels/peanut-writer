// The Markdown editor: CodeMirror with Word-like conveniences. Unless the
// Markdown is shown, its marks are out of sight: headings, emphasis, links,
// quotes and bullets read as formatted text, figures and tables as pictures
// and grids, cross-references as "Figure 2", and the front matter as a
// document properties card. Math stays as its TeX, set apart.

import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import {
  ensureSyntaxTree,
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import {
  ChangeSet,
  type ChangeSpec,
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
  Facet,
  findClusterBreak,
  type Line,
  type Range,
  RangeSetBuilder,
  StateField,
  Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { tags as t } from "@lezer/highlight";
import {
  figureMarkdown,
  figureSpec,
  type FigureSpec,
  type FootnoteMark,
  type Footnotes,
  type Item,
  type Kind,
  type RefAt,
  kindName,
  parseTable,
  plain,
  type Position,
  readFrontMatter,
  relabelChanges,
  renumberFootnotes,
  scan,
  scanFootnotes,
  type Table,
} from "./markdown";
import { math, mathTag } from "./math";

export interface Handlers {
  editFigure(item: Item): void;
  editTable(item: Item): void;
  editProperties(): void;
  editRef(at: RefAt): void;
  // Dropped files arrive through Wails (see EditorPane), not DOM drop events.
  pasteImages(files: File[], pos: number): void;
  imageURL(src: string): Promise<string>;
  changed(state: EditorState, docChanged: boolean): void;
}

// --- Document scan, shared by the decorations and the ribbon ---------------

export const itemsField = StateField.define<Item[]>({
  create: (s) => scan(s.doc.toString()),
  update: (items, tr) => (tr.docChanged ? scan(tr.state.doc.toString()) : items),
});

// Where the front matter ends (0 without one).
const frontMatterEnd = StateField.define<number>({
  create: (s) => readFrontMatter(s.doc.toString()).to,
  update: (end, tr) => (tr.docChanged ? readFrontMatter(tr.state.doc.toString()).to : end),
});

// The footnote marks and notes.
const footnotesField = StateField.define<Footnotes>({
  create: (s) => scanFootnotes(s.doc.toString()),
  update: (fn, tr) => (tr.docChanged ? scanFootnotes(tr.state.doc.toString()) : fn),
});

// bodyHint shows "Begin typing…" where the text goes while there's none, under
// the properties too (CodeMirror's placeholder only shows in an empty document).
class BodyHint extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-placeholder";
    span.setAttribute("aria-hidden", "true");
    span.textContent = "Begin typing…";
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

const bodyHint = EditorView.decorations.compute(["doc", frontMatterEnd], (s) => {
  const doc = s.doc;
  const fmEnd = s.field(frontMatterEnd);
  if (doc.lineAt(doc.length).from < fmEnd || doc.sliceString(fmEnd).trim()) return Decoration.none;
  return Decoration.set(Decoration.widget({ widget: new BodyHint(), side: 1 }).range(doc.length));
});

// startSelection puts the cursor under the properties of a document with no
// text yet, where its first words go.
function startSelection(doc: string): { anchor: number } | undefined {
  return doc.slice(readFrontMatter(doc).to).trim() ? undefined : { anchor: doc.length };
}

// --- Widgets -------------------------------------------------------------------

// Pictures by reference, for the open document (replaceDoc clears it).
const imageCache = new Map<string, Promise<string>>();

const positions: { pos: Position; title: string }[] = [
  { pos: "left", title: "Left" },
  { pos: "", title: "Centered" },
  { pos: "right", title: "Right" },
];

// positionIcon draws a picture (the box) on a line, pushed left, centered
// or right.
function positionIcon(pos: Position): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  const x = pos === "left" ? 1 : pos === "right" ? 7 : 4;
  for (const [rx, ry, rw, rh] of [
    [x, 2, 8, 7],
    [1, 12, 14, 2],
  ]) {
    const r = document.createElementNS(ns, "rect");
    r.setAttribute("x", String(rx));
    r.setAttribute("y", String(ry));
    r.setAttribute("width", String(rw));
    r.setAttribute("height", String(rh));
    r.setAttribute("rx", "1");
    r.setAttribute("fill", "currentColor");
    svg.append(r);
  }
  return svg;
}

// loadPicture shows the picture src in img, or a note in its place when
// there's no such file.
function loadPicture(img: HTMLImageElement, src: string, handlers: Handlers) {
  if (!imageCache.has(src)) imageCache.set(src, handlers.imageURL(src));
  imageCache.get(src)!.then((url) => {
    if (url) img.src = url;
    else {
      // Not found: look again next time, in case it turns up.
      imageCache.delete(src);
      img.parentElement?.classList.add("missing");
      const msg = document.createElement("span");
      msg.textContent = `Missing picture: ${src}`;
      img.replaceWith(msg);
    }
  });
}

// gripIcon draws two columns of dots: something to take hold of.
function gripIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  for (const cx of [6, 10]) {
    for (const cy of [3.5, 8, 12.5]) {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", "1.4");
      c.setAttribute("fill", "currentColor");
      svg.append(c);
    }
  }
  return svg;
}

// --- Moving figures and tables ---------------------------------------------------

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

// moveItem moves a figure's or table's Markdown to the block start target (or
// the end), keeping a blank line on either side. Dropping it where it is does
// nothing.
function moveItem(view: EditorView, item: Item, target: number) {
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

// startMove drags the figure or table el (whose Markdown current() finds) by
// its grip: a line shows where it will land, the editor scrolls near its edges,
// and Escape cancels.
function startMove(
  view: EditorView,
  el: HTMLElement,
  grip: HTMLElement,
  e: PointerEvent,
  current: () => Item | undefined,
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
    if (drop && target >= 0 && view.state === state) moveItem(view, item, target);
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

// block wraps a block widget's element. CodeMirror measures a widget without
// its margins, so the space around it is the wrapper's padding.
function block(el: HTMLElement, cls: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = cls;
  wrap.append(el);
  return wrap;
}

class FigureWidget extends WidgetType {
  constructor(
    readonly item: Item,
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: FigureWidget) {
    const a = this.item;
    const b = o.item;
    return (
      JSON.stringify(a.pictures) === JSON.stringify(b.pictures) &&
      a.columns === b.columns &&
      a.number === b.number &&
      a.caption === b.caption &&
      a.width === b.width &&
      a.label === b.label &&
      a.position === b.position
    );
  }
  toDOM(view: EditorView) {
    const pictures = this.item.pictures ?? [];
    const grid = pictures.length > 1;
    const el = document.createElement("div");
    el.className = "pw-figure";
    if (this.item.position) el.classList.add(this.item.position);
    // The item as the document has it now (this widget may be older).
    const current = () => {
      const pos = view.posAtDOM(el);
      return view.state
        .field(itemsField)
        .find((x) => x.kind === "figure" && pos >= x.from - 1 && pos <= x.to + 1);
    };
    const update = (patch: Partial<FigureSpec>) => {
      const item = current();
      if (!item) return;
      view.dispatch({
        changes: {
          from: item.from,
          to: item.to,
          insert: figureMarkdown({ ...figureSpec(item), ...patch }),
        },
        userEvent: "input",
      });
    };
    const open = () => {
      const item = current();
      if (item) this.handlers.editFigure(item);
    };

    const frame = document.createElement("div");
    frame.className = "pw-figure-frame";
    const w = this.item.width || 0;
    frame.style.width = w > 0 ? `${w}%` : grid ? "100%" : "auto";
    let body: HTMLElement = frame;
    if (grid) {
      body = document.createElement("div");
      body.className = "pw-figure-grid";
      body.style.gridTemplateColumns = `repeat(${this.item.columns || 1}, minmax(0, 1fr))`;
      frame.append(body);
    }
    for (const p of pictures) {
      const img = document.createElement("img");
      img.alt = plain(grid ? p.alt : this.item.caption);
      img.draggable = false;
      img.ondblclick = open;
      if (grid) {
        const cell = document.createElement("div");
        cell.className = "pw-figure-cell";
        cell.append(img);
        body.append(cell);
      } else body.append(img);
      loadPicture(img, p.src, this.handlers);
    }

    const tools = document.createElement("div");
    tools.className = "pw-figure-tools";
    const grip = document.createElement("div");
    grip.className = "pw-figure-grip";
    grip.title = "Drag to move";
    grip.append(gripIcon());
    grip.onpointerdown = (e) => startMove(view, el, grip, e, current);
    tools.append(grip);
    for (const p of positions) {
      const b = document.createElement("button");
      b.className = "pw-figure-tool";
      if ((this.item.position ?? "") === p.pos) b.classList.add("on");
      b.title = p.title;
      b.append(positionIcon(p.pos));
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => update({ position: p.pos });
      tools.append(b);
    }

    // Dragging the corner sets the width as a share of the text width. A
    // centered picture grows on both sides, so it follows the pointer at
    // twice the rate.
    const handle = document.createElement("div");
    handle.className = "pw-figure-handle";
    handle.title = "Drag to resize";
    const size = document.createElement("div");
    size.className = "pw-figure-size";
    handle.onpointerdown = (e) => {
      e.preventDefault();
      const css = getComputedStyle(el);
      const full = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      const startW = frame.getBoundingClientRect().width;
      const startX = e.clientX;
      const rate = (this.item.position === "right" ? -1 : 1) * (this.item.position ? 1 : 2);
      let pct = 0;
      size.textContent = `${Math.round((startW / full) * 100)}%`;
      handle.setPointerCapture(e.pointerId);
      el.classList.add("resizing");
      const move = (ev: PointerEvent) => {
        pct = Math.round(
          Math.min(100, Math.max(10, ((startW + rate * (ev.clientX - startX)) / full) * 100)),
        );
        frame.style.width = `${pct}%`;
        size.textContent = `${pct}%`;
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        el.classList.remove("resizing");
        if (pct && pct !== this.item.width) update({ width: pct });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    };
    frame.append(tools, handle, size);

    const cap = document.createElement("div");
    cap.className = "pw-figure-caption";
    const badge = document.createElement("span");
    badge.className = "pw-badge";
    badge.textContent = `Figure ${this.item.number}`;
    cap.append(
      badge,
      document.createTextNode(" " + (plain(this.item.caption) || "No caption yet")),
    );
    const edit = document.createElement("button");
    edit.className = "pw-widget-btn";
    edit.textContent = "Edit figure";
    edit.onmousedown = (e) => e.preventDefault();
    edit.onclick = open;
    cap.append(edit);
    el.append(frame, cap);
    return block(el, "pw-figure-block");
  }
  ignoreEvent() {
    return true;
  }
}

// TableBar stands in for a table's Markdown: it names the table, opens it
// for editing and draws it below.
class TableBar extends WidgetType {
  constructor(
    readonly item: Item,
    readonly handlers: Handlers,
    readonly table: Table,
  ) {
    super();
  }
  eq(o: TableBar) {
    return (
      o.item.number === this.item.number &&
      o.item.caption === this.item.caption &&
      JSON.stringify(o.table) === JSON.stringify(this.table)
    );
  }
  toDOM(view: EditorView) {
    const bar = document.createElement("div");
    bar.className = "pw-tablebar";
    const root = document.createElement("div");
    const badge = document.createElement("span");
    badge.className = "pw-badge";
    badge.textContent = `Table ${this.item.number}`;
    const cap = document.createElement("span");
    cap.className = "pw-tablebar-caption";
    cap.textContent = plain(this.item.caption) || "No caption yet";
    const edit = document.createElement("button");
    edit.className = "pw-widget-btn";
    edit.textContent = "Edit table";
    edit.onmousedown = (e) => e.preventDefault();
    const current = () => {
      const pos = view.posAtDOM(root);
      return view.state
        .field(itemsField)
        .find((x) => x.kind === "table" && Math.abs(x.from - pos) <= 1);
    };
    const open = () => {
      const item = current();
      if (item) this.handlers.editTable(item);
    };
    edit.onclick = open;
    const grip = document.createElement("div");
    grip.className = "pw-tablebar-grip";
    grip.title = "Drag to move";
    grip.append(gripIcon());
    grip.onpointerdown = (e) => startMove(view, root, grip, e, current);
    bar.append(grip, badge, cap, edit);

    root.className = "pw-table";
    const grid = document.createElement("table");
    const t = this.table;
    const row = (cells: string[], tag: "th" | "td") => {
      const tr = document.createElement("tr");
      cells.forEach((c, i) => {
        const cell = document.createElement(tag);
        cell.textContent = plain(c);
        if (t.align[i]) cell.style.textAlign = t.align[i];
        tr.append(cell);
      });
      return tr;
    };
    const head = document.createElement("thead");
    head.append(row(t.header, "th"));
    const body = document.createElement("tbody");
    for (const r of t.rows) body.append(row(r, "td"));
    grid.append(head, body);
    grid.ondblclick = open;
    root.append(bar, grid);
    return root;
  }
  ignoreEvent() {
    return true;
  }
}

class RefWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly text: string,
    readonly ok: boolean,
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: RefWidget) {
    return o.label === this.label && o.text === this.text && o.ok === this.ok;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = this.ok ? "pw-ref" : "pw-ref broken";
    el.textContent = this.text;
    el.title = this.ok
      ? `Cross-reference to ${this.label}. Click to change or unlink it.`
      : `Nothing is labelled ${this.label}. Click to change or remove it.`;
    el.onmousedown = (e) => e.preventDefault();
    el.onclick = () => {
      // The widget may have moved since it was drawn.
      const from = view.posAtDOM(el);
      this.handlers.editRef({
        from,
        to: from + this.label.length + 1,
        label: this.label,
        text: this.ok ? this.text : "",
      });
    };
    return el;
  }
}

// goTo puts the cursor at pos and scrolls it to the middle of the editor.
function goTo(view: EditorView, pos: number) {
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
  view.focus();
}

// noteTip is a note's text for a tooltip: plain, on one line, not too long.
function noteTip(text: string): string {
  const t = plain(text.replace(/\s+/g, " ")).trim();
  return t.length > 300 ? `${t.slice(0, 300)}…` : t;
}

// FootnoteMarkWidget stands in for a footnote mark: its number, raised, which
// shows the note's text on hover and goes to the note on a click. A mark with
// no note reads "?", and a click adds the note.
class FootnoteMarkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly number: number,
    readonly note: string | null,
  ) {
    super();
  }
  eq(o: FootnoteMarkWidget) {
    return o.label === this.label && o.number === this.number && o.note === this.note;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className =
      this.note === null
        ? "pw-footnote-ref pw-footnote-mark broken"
        : "pw-footnote-ref pw-footnote-mark";
    el.textContent = this.number > 0 ? String(this.number) : "?";
    el.title =
      this.note === null
        ? `No note is labelled ${this.label}. Click to add it.`
        : `${noteTip(this.note) || "(The note is empty.)"}\n\nClick to go to the note.`;
    el.onmousedown = (e) => e.preventDefault();
    el.onclick = () => {
      const note = view.state.field(footnotesField).notes.find((n) => n.label === this.label);
      if (note) goTo(view, note.textFrom);
      else addNote(view, this.label, view.posAtDOM(el), false);
    };
    return el;
  }
}

// NoteHeadWidget stands in for a note's `[^label]: `: the note's number, a
// click going back to its mark. A note nothing marks reads "?".
class NoteHeadWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly number: number,
    readonly marked: boolean,
  ) {
    super();
  }
  eq(o: NoteHeadWidget) {
    return o.label === this.label && o.number === this.number && o.marked === this.marked;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = this.marked ? "pw-note-head" : "pw-note-head orphan";
    el.textContent = this.number > 0 ? String(this.number) : this.marked ? this.label : "?";
    el.title = this.marked
      ? "Click to go back to the footnote's mark."
      : `Nothing in the text marks this note (${this.label}): it isn't printed.`;
    el.onmousedown = (e) => e.preventDefault();
    el.onclick = () => {
      const marks = view.state.field(footnotesField).marks.filter((m) => m.label === this.label);
      const mark = marks.find((m) => !m.inNote) ?? marks[0];
      if (mark) goTo(view, mark.to);
    };
    return el;
  }
}

class PropertiesCard extends WidgetType {
  constructor(
    readonly title: string,
    readonly byline: string,
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: PropertiesCard) {
    return o.title === this.title && o.byline === this.byline;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "pw-props";
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "pw-props-title";
    title.textContent = this.title || "Untitled document";
    const by = document.createElement("div");
    by.className = "pw-props-by";
    by.textContent = this.byline || "Document properties";
    text.append(title, by);
    const btn = document.createElement("button");
    btn.className = "pw-widget-btn";
    btn.textContent = "Edit header";
    btn.onmousedown = (e) => e.preventDefault();
    const open = () => this.handlers.editProperties();
    btn.onclick = open;
    el.ondblclick = open;
    el.append(text, btn);
    return block(el, "pw-props-block");
  }
  ignoreEvent() {
    return true;
  }
}

const refRe = /(^|[^\w])@((?:fig|tbl|eq):[A-Za-z0-9_-]*[A-Za-z0-9_])/g;

// Whether the editor shows the document's Markdown as plain text (mono, only
// syntax colors), or hides its marks and puts figures and tables in place
// of theirs.
const showMarkdown = Facet.define<boolean, boolean>({
  combine: (v) => v.some(Boolean),
});
const showSlot = new Compartment();

function showExtension(show: boolean): Extension {
  return show
    ? [
        showMarkdown.of(true),
        syntaxHighlighting(sourceHighlight),
        EditorView.editorAttributes.of({ class: "pw-source" }),
      ]
    : syntaxHighlighting(highlight);
}

// setShowMarkdown shows or hides the document's Markdown.
export function setShowMarkdown(view: EditorView, show: boolean) {
  view.dispatch({ effects: showSlot.reconfigure(showExtension(show)) });
}

interface Decos {
  deco: DecorationSet;
  atomic: DecorationSet;
}

// shownDate is the date as the document shows it: `today` is today's date,
// written as internal/doc writes it ("January 2, 2006").
function shownDate(date: string | undefined): string | undefined {
  if (date?.trim().toLowerCase() !== "today") return date;
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildDecorations(state: EditorState, handlers: Handlers): Decos {
  // Shown Markdown is plain text.
  if (state.facet(showMarkdown)) return { deco: Decoration.none, atomic: Decoration.none };
  const doc = state.doc;
  const items = state.field(itemsField);
  // The first of a label wins, as in internal/doc.
  const labels = new Map<string, Item>();
  for (const x of items) if (x.label && !labels.has(x.label)) labels.set(x.label, x);
  const ranges: {
    from: number;
    to: number;
    deco: Decoration;
    atomic?: boolean;
  }[] = [];

  const fm = readFrontMatter(doc.toString());
  if (fm.to === 0) {
    // No properties yet (a new document, or one on the default template):
    // the card still sits on top, so they can be added.
    ranges.push({
      from: 0,
      to: 0,
      deco: Decoration.widget({
        widget: new PropertiesCard("", "", handlers),
        block: true,
        side: -1,
      }),
    });
  } else {
    const by = [fm.meta.author, fm.meta.topic, shownDate(fm.meta.date)].filter(Boolean).join(" · ");
    const end = doc.lineAt(Math.max(fm.to - 1, 0)).to;
    ranges.push({
      from: 0,
      to: end,
      deco: Decoration.replace({
        widget: new PropertiesCard(fm.meta.title, by, handlers),
        block: true,
      }),
      atomic: true,
    });
  }

  // Figures and tables replace their Markdown; nothing else is decorated
  // inside them. Equations stay as their TeX, and figures and tables in lists
  // and quotes as their Markdown.
  const hidden: Item[] = [];
  for (const it of items) {
    if (it.kind === "equation" || it.prefix !== undefined) continue;
    hidden.push(it);
    if (it.kind === "figure") {
      ranges.push({
        from: it.from,
        to: it.to,
        deco: Decoration.replace({ widget: new FigureWidget(it, handlers), block: true }),
        atomic: true,
      });
    } else {
      const table = parseTable(doc.sliceString(it.tableFrom!, it.tableTo!));
      ranges.push({
        from: it.from,
        to: it.to,
        deco: Decoration.replace({
          widget: new TableBar(it, handlers, table),
          block: true,
        }),
        atomic: true,
      });
    }
  }

  // Cross-references and footnote marks, outside code and math.
  const text = doc.toString();
  const tree = syntaxTree(state);
  const inCode = (pos: number) => {
    for (let n: SyntaxNode | null = tree.resolve(pos, 1); n; n = n.parent) {
      if (/^(InlineCode|FencedCode|CodeBlock|InlineMath|BlockMath)$/.test(n.name)) return true;
    }
    return false;
  };
  const out = (pos: number) => pos < fm.to || hidden.some((h) => pos >= h.from && pos <= h.to);
  for (const m of text.matchAll(refRe)) {
    const from = m.index! + m[1].length;
    const to = from + m[2].length + 1;
    if (out(from) || inCode(from)) continue;
    const target = labels.get(m[2]);
    const label = target ? `${kindName[target.kind]} ${target.number}` : `?? ${m[2]}`;
    ranges.push({
      from,
      to,
      deco: Decoration.replace({
        widget: new RefWidget(m[2], label, !!target, handlers),
      }),
      atomic: true,
    });
  }
  const { marks, notes } = state.field(footnotesField);
  const noteText = new Map<string, string>();
  for (const n of notes) if (!noteText.has(n.label)) noteText.set(n.label, n.text);
  for (const m of marks) {
    if (out(m.from)) continue;
    if (m.inNote) {
      // A note within a note is printed in brackets (Word, the web) or as
      // a note of its own: its mark stays as written.
      ranges.push({ from: m.from, to: m.to, deco: Decoration.mark({ class: "pw-footnote-ref" }) });
      continue;
    }
    ranges.push({
      from: m.from,
      to: m.to,
      deco: Decoration.replace({
        widget: new FootnoteMarkWidget(m.label, m.number, noteText.get(m.label) ?? null),
      }),
      atomic: true,
    });
  }
  // Notes: smaller text, the `[^label]: ` shown as the note's number.
  const first = new Map<string, FootnoteMark>();
  for (const m of marks)
    if (!first.has(m.label) || (first.get(m.label)!.inNote && !m.inNote)) first.set(m.label, m);
  for (const n of notes) {
    if (out(n.from)) continue;
    const last = doc.lineAt(Math.max(n.to, n.textFrom)).number;
    for (let l = n.line; l <= last; l++) {
      const at = doc.line(l).from;
      ranges.push({ from: at, to: at, deco: Decoration.line({ class: "pw-note-line" }) });
    }
    const mark = first.get(n.label);
    ranges.push({
      from: n.from,
      to: n.textFrom,
      deco: Decoration.replace({
        widget: new NoteHeadWidget(n.label, mark && !mark.inNote ? mark.number : 0, !!mark),
      }),
      atomic: true,
    });
  }

  ranges.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide);
  const all = new RangeSetBuilder<Decoration>();
  const atomic = new RangeSetBuilder<Decoration>();
  for (const r of ranges) {
    all.add(r.from, r.to, r.deco);
    if (r.atomic) atomic.add(r.from, r.to, r.deco);
  }
  return { deco: all.finish(), atomic: atomic.finish() };
}

function decorations(handlers: Handlers): Extension {
  const field = StateField.define<Decos>({
    create: (s) => buildDecorations(s, handlers),
    update: (d, tr: Transaction) =>
      tr.docChanged ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
      tr.state.facet(showMarkdown) !== tr.startState.facet(showMarkdown)
        ? buildDecorations(tr.state, handlers)
        : d,
    provide: (f) => [
      EditorView.decorations.from(f, (d) => d.deco),
      EditorView.atomicRanges.of((v) => v.state.field(f).atomic),
    ],
  });
  return field;
}

// Block-level line styling from the syntax tree: headings, quotes, code, math.
const blockLineClass: Partial<Record<string, string>> = {
  Blockquote: "pw-quote-line",
  FencedCode: "pw-code-line",
  BlockMath: "pw-math-line",
};
const lineStyles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        syntaxTree(u.state) !== syntaxTree(u.startState) ||
        u.state.facet(showMarkdown) !== u.startState.facet(showMarkdown)
      )
        this.decorations = this.build(u.view);
    }
    build(view: EditorView) {
      const b = new RangeSetBuilder<Decoration>();
      const seen = new Set<number>();
      const add = (pos: number, cls: string) => {
        const line = view.state.doc.lineAt(pos);
        if (seen.has(line.from)) return;
        seen.add(line.from);
        b.add(line.from, line.from, Decoration.line({ class: cls }));
      };
      // Shown Markdown dims its front matter (otherwise a card covers it).
      if (view.state.facet(showMarkdown)) {
        const end = view.state.field(frontMatterEnd);
        for (let p = 0; p < end;) {
          add(p, "pw-meta-line");
          p = view.state.doc.lineAt(p).to + 1;
        }
      }
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (n) => {
            const h = /^ATXHeading(\d)$/.exec(n.name);
            const cls = blockLineClass[n.name];
            if (h) add(n.from, `pw-h pw-h${h[1]}`);
            else if (cls) {
              for (let p = n.from; p <= n.to;) {
                const line = view.state.doc.lineAt(p);
                if (line.from >= from && line.from <= to) add(line.from, cls);
                p = line.to + 1;
              }
              return false;
            }
          },
        });
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

// --- Hidden Markdown marks ---------------------------------------------------------

// Unless the Markdown is shown, its marks are replaced by nothing (or a
// heading's #s, a bullet, a rule). Each hidden range has a kind: "mark"
// around inline text, "prefix" before a line's text (heading, quote,
// bullet), "line" for a whole line (a rule, a code fence).
type HiddenKind = "mark" | "prefix" | "line";

// HeadingMarkWidget shows a heading's #s, which stay out of the cursor's way
// like the rest of the line's prefix.
class HeadingMarkWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }
  eq(o: HeadingMarkWidget) {
    return o.level === this.level;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-heading-mark";
    el.textContent = "#".repeat(this.level) + " ";
    return el;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-bullet";
    el.textContent = "•";
    return el;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-rule";
    return el;
  }
}

class FenceWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }
  eq(o: FenceWidget) {
    return o.lang === this.lang;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-fence";
    el.textContent = this.lang;
    return el;
  }
}

// linePrefix is the marks before a line's text that are hidden: an ATX
// heading's #s (level is its count), quote marks and bullets, each with the
// space after it. Indentation and numbers stay visible.
function linePrefix(
  state: EditorState,
  line: Line,
): { from: number; to: number; bullet: boolean; level: number }[] {
  const tree = syntaxTree(state);
  const out: { from: number; to: number; bullet: boolean; level: number }[] = [];
  let pos = line.from;
  for (;;) {
    while (pos < line.to && /[ \t]/.test(line.text[pos - line.from])) pos++;
    if (pos >= line.to) break;
    const n = tree.resolveInner(pos, 1);
    if (n.from !== pos) break;
    const heading = n.name === "HeaderMark" && /^ATXHeading/.test(n.parent?.name ?? "");
    const bullet = n.name === "ListMark" && n.parent?.parent?.name === "BulletList";
    if (!heading && !bullet && n.name !== "QuoteMark") break;
    let to = n.to;
    if (heading) while (to < line.to && line.text[to - line.from] === " ") to++;
    else if (line.text[to - line.from] === " ") to++;
    out.push({ from: n.from, to, bullet, level: heading ? n.to - n.from : 0 });
    pos = to;
  }
  return out;
}

function prefixEnd(state: EditorState, line: Line): number {
  const p = linePrefix(state, line);
  return p.length ? p[p.length - 1].to : line.from;
}

// deadLine tells whether line is shown whole as a widget (a rule or a code
// fence), where the cursor can't usefully be.
function deadLine(state: EditorState, line: Line): "hr" | "fence" | null {
  const indent = line.text.length - line.text.trimStart().length;
  for (
    let n: SyntaxNode | null = syntaxTree(state).resolveInner(line.from + indent, 1);
    n;
    n = n.parent
  ) {
    if (n.name === "HorizontalRule") return "hr";
    if (n.name === "FencedCode") {
      const open = state.doc.lineAt(n.from).number;
      if (open === line.number) return "fence";
      const close = state.doc.lineAt(n.to).number;
      return close === line.number && close > open && fenceRe.test(line.text) ? "fence" : null;
    }
  }
  return null;
}

// covered tells whether pos is in the front matter or a figure or table
// shown as a widget, which stands in for its Markdown whole.
function covered(state: EditorState, pos: number): boolean {
  return (
    pos < state.field(frontMatterEnd) ||
    state
      .field(itemsField)
      .some((x) => x.kind !== "equation" && x.prefix === undefined && pos >= x.from && pos <= x.to)
  );
}

const emptyPairs = ["**", "~~", "*", "`"];

// emptyPairAt is the empty pair of marks the cursor is in (as a style
// button leaves them), or null.
function emptyPairAt(state: EditorState, pos: number): { from: number; to: number } | null {
  for (const s of emptyPairs) {
    if (pos >= s.length && state.sliceDoc(pos - s.length, pos + s.length) === s + s)
      return { from: pos - s.length, to: pos + s.length };
  }
  return null;
}

interface Hidden {
  deco: DecorationSet;
  atomic: DecorationSet;
}

function buildHidden(view: EditorView): Hidden {
  const state = view.state;
  if (state.facet(showMarkdown)) return { deco: Decoration.none, atomic: Decoration.none };
  const doc = state.doc;
  const deco: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const seen = new Set<string>();
  const hide = (from: number, to: number, kind: HiddenKind, widget?: WidgetType) => {
    const key = `${from}:${to}`;
    if (from >= to || seen.has(key)) return;
    seen.add(key);
    const d = Decoration.replace({ widget, kind }).range(from, to);
    deco.push(d);
    atomic.push(d);
  };
  const fence = (line: Line, lang: string) => {
    hide(line.from, line.to, "line", new FenceWidget(lang));
    deco.push(Decoration.line({ class: "pw-code-fence" }).range(line.from));
  };

  for (const { from, to } of view.visibleRanges) {
    for (let p = from; p <= to;) {
      const line = doc.lineAt(p);
      if (!covered(state, line.from)) {
        for (const m of linePrefix(state, line))
          hide(
            m.from,
            m.to,
            "prefix",
            m.level ? new HeadingMarkWidget(m.level) : m.bullet ? new BulletWidget() : undefined,
          );
      }
      p = line.to + 1;
    }
    syntaxTree(state).iterate({
      from,
      to,
      enter: (n) => {
        if (n.name === "Document") return;
        if (covered(state, n.from)) return false;
        switch (n.name) {
          case "HeaderMark": {
            // A closing run of #s; the opening one is part of the prefix.
            const parent = n.node.parent;
            if (parent && /^ATXHeading/.test(parent.name) && n.from > parent.from) {
              let start = n.from;
              while (start > parent.from && doc.sliceString(start - 1, start) === " ") start--;
              hide(start, n.to, "mark");
            }
            break;
          }
          case "EmphasisMark":
          case "StrikethroughMark":
            hide(n.from, n.to, "mark");
            break;
          case "CodeMark":
            if (n.node.parent?.name === "InlineCode") hide(n.from, n.to, "mark");
            break;
          case "Escape":
            hide(n.from, n.from + 1, "mark");
            break;
          case "HorizontalRule":
            hide(n.from, n.to, "line", new RuleWidget());
            break;
          case "Link": {
            const url = n.node.getChild("URL");
            const marks = n.node.getChildren("LinkMark");
            if (!url || marks.length < 2) break;
            hide(marks[0].from, marks[0].to, "mark");
            hide(marks[1].from, n.to, "mark");
            if (marks[1].from > marks[0].to) {
              const title = doc.sliceString(url.from, url.to);
              deco.push(
                Decoration.mark({
                  class: "pw-link",
                  attributes: { title },
                }).range(marks[0].to, marks[1].from),
              );
            }
            break;
          }
          case "FencedCode": {
            const open = doc.lineAt(n.from);
            const close = doc.lineAt(n.to);
            const info = n.node.getChild("CodeInfo");
            fence(open, info ? doc.sliceString(info.from, info.to) : "");
            if (close.number > open.number && fenceRe.test(close.text)) fence(close, "");
            return false;
          }
        }
      },
    });
  }

  // A style button with nothing selected leaves an empty pair to type into.
  const sel = state.selection.main;
  const pair = sel.empty ? emptyPairAt(state, sel.head) : null;
  if (pair) {
    const half = (pair.to - pair.from) / 2;
    deco.push(Decoration.replace({}).range(pair.from, pair.from + half));
    deco.push(Decoration.replace({}).range(pair.to - half, pair.to));
  }
  return {
    deco: Decoration.set(deco, true),
    atomic: Decoration.set(atomic, true),
  };
}

const hiddenMarks = ViewPlugin.fromClass(
  class {
    hidden: Hidden;
    constructor(view: EditorView) {
      this.hidden = buildHidden(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        syntaxTree(u.state) !== syntaxTree(u.startState) ||
        u.state.facet(showMarkdown) !== u.startState.facet(showMarkdown)
      )
        this.hidden = buildHidden(u.view);
    }
  },
  {
    decorations: (v) => v.hidden.deco,
    provide: (p) =>
      EditorView.atomicRanges.of((v) => v.plugin(p)?.hidden.atomic ?? Decoration.none),
  },
);

// hiddenAt is the hidden range ending (dir -1) or starting (dir 1) at pos.
function hiddenAt(
  view: EditorView,
  pos: number,
  dir: -1 | 1,
): { from: number; to: number; kind: HiddenKind } | null {
  const set = view.plugin(hiddenMarks)?.hidden.atomic;
  let found: { from: number; to: number; kind: HiddenKind } | null = null;
  set?.between(pos, pos, (from, to, d) => {
    if (dir < 0 ? to === pos && from < pos : from === pos && to > pos) {
      found = { from, to, kind: d.spec.kind };
      return false;
    }
  });
  return found;
}

// settle moves a cursor out of places hidden marks make meaningless: off a
// rule or code fence line (onward, in the direction it was going), and past
// a line's hidden prefix, so typing lands in the text.
function settle(state: EditorState, pos: number, forward: boolean): number {
  // The properties are edited in their dialog, never in place.
  const fmEnd = state.field(frontMatterEnd);
  if (pos < fmEnd) return fmEnd;
  for (let i = 0; i < 8; i++) {
    const line = state.doc.lineAt(pos);
    if (covered(state, line.from)) return pos;
    if (deadLine(state, line)) {
      const next = forward ? line.to + 1 : line.from - 1;
      if (next < 0 || next > state.doc.length) forward = !forward;
      else pos = next;
      continue;
    }
    return Math.max(pos, prefixEnd(state, line));
  }
  return pos;
}

const settleCursor = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection || tr.state.facet(showMarkdown)) return tr;
  const sel = tr.state.selection.main;
  if (!sel.empty) return tr;
  const pos = settle(tr.state, sel.head, sel.head >= tr.startState.selection.main.head);
  return pos === sel.head ? tr : [tr, { selection: { anchor: pos }, sequential: true }];
});

// guardProperties keeps typing, deleting and dragging out of the front
// matter while the Markdown is hidden: the card stands in for it, and its
// dialog is the one way to change it. Edits reaching into it are cut back to
// where the text begins. Changes the app makes (the dialog, Auto Format) are
// dispatched with filter: false; undo and redo pass as they are.
const guardProperties = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.startState.facet(showMarkdown)) return tr;
  if (!tr.isUserEvent("input") && !tr.isUserEvent("delete") && !tr.isUserEvent("move")) return tr;
  const start = tr.startState;
  const end = start.field(frontMatterEnd);
  if (!end) return tr;
  // Text typed right after a closing fence with no line break after it
  // starts a line of its own.
  const open = start.doc.sliceString(end - 1, end) !== "\n";
  // The cursor goes after what the cut-back edit puts where the text begins.
  let after = -1;
  const changes: ChangeSpec[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const to = Math.max(toA, end);
    if (fromA < end || (open && fromA === end)) after = to;
    const from = Math.max(fromA, end);
    let insert = inserted.toString();
    if (open && from === end && insert) insert = "\n" + insert;
    changes.push({ from, to, insert });
  });
  if (after < 0) return tr;
  const set = start.changes(changes);
  const head = set.mapPos(after, 1);
  return {
    changes: set,
    selection: EditorSelection.cursor(head),
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    userEvent: tr.annotation(Transaction.userEvent),
  };
});

// followLabels keeps references on a figure, table or equation whose label
// changes in place, in its dialog or by typing in the Markdown: references to
// the old label take the new one, in the same undoable step. Items pair up by
// kind and order; a label still in use after, or one already in use before,
// is left alone, so moving items or reusing a label doesn't steal references.
const followLabels = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent("input") || tr.isUserEvent("delete"))) return tr;
  const before = tr.startState.field(itemsField);
  const after = tr.state.field(itemsField);
  const had = new Set(before.map((x) => x.label));
  const has = new Set(after.map((x) => x.label));
  const text = tr.newDoc.toString();
  const changes: ChangeSpec[] = [];
  for (const kind of Object.keys(kindName) as Kind[]) {
    const a = before.filter((x) => x.kind === kind);
    const b = after.filter((x) => x.kind === kind);
    if (a.length !== b.length) continue;
    a.forEach(({ label: from }, i) => {
      const to = b[i].label;
      if (from && to && from !== to && !has.has(from) && !had.has(to))
        changes.push(...relabelChanges(text, from, to));
    });
  }
  return changes.length ? [tr, { changes, sequential: true }] : tr;
});

// followFootnotes keeps numbered footnotes numbered 1, 2, 3… in order, in the
// same undoable step: deleting a mark whole (as the editor shows it) deletes
// its note too, unless another mark shares it, and pasting or dropping text
// with marks renumbers them. Cutting leaves the note, for the mark to be
// pasted back; deleting part of a mark in the Markdown leaves it alone.
const followFootnotes = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const paste = tr.isUserEvent("input.paste") || tr.isUserEvent("move.drop");
  const edit =
    (tr.isUserEvent("input") || tr.isUserEvent("delete")) && !tr.isUserEvent("delete.cut");
  if (!paste && !edit) return tr;
  const before = tr.startState.field(footnotesField);
  const after = tr.state.field(footnotesField);
  const whole = (m: FootnoteMark) => {
    let hit = false;
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (fromA <= m.from && toA >= m.to) hit = true;
    });
    return hit;
  };
  const gone = new Set<string>();
  for (const m of before.marks) {
    if (gone.has(m.label) || after.marks.some((x) => x.label === m.label)) continue;
    if (before.marks.every((x) => x.label !== m.label || whole(x))) gone.add(m.label);
  }
  if (!paste && !gone.size) return tr;

  // Each note going takes the blank lines after it (or, at the end, before it).
  const doc = tr.newDoc;
  const text = doc.toString();
  const spans: { from: number; to: number }[] = [];
  for (const n of after.notes) {
    if (!gone.has(n.label)) continue;
    let { from, to } = n;
    while (to < text.length && /\s/.test(text[to])) to++;
    if (to === text.length) while (from > 0 && /\s/.test(text[from - 1])) from--;
    spans.push({ from, to });
  }
  spans.sort((a, b) => a.from - b.from);
  const cuts: { from: number; to: number; insert?: string }[] = [];
  for (const s of spans) {
    const last = cuts[cuts.length - 1];
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else cuts.push({ ...s });
  }
  const end = cuts[cuts.length - 1];
  if (end && end.to === text.length && end.from > 0) end.insert = "\n";
  const removed = ChangeSet.of(cuts, doc.length);
  const rest = removed.apply(doc);
  const changes = removed.compose(ChangeSet.of(renumberFootnotes(rest.toString()), rest.length));
  return changes.empty ? tr : [tr, { changes, sequential: true }];
});

// moveChar moves the cursor one character, stepping over hidden marks as if
// they weren't there. Marks at the end (or start) of a line are a step of
// their own, out of (or into) the styled text, before the line break.
function moveChar(view: EditorView, forward: boolean, extend: boolean): boolean {
  const state = view.state;
  if (state.facet(showMarkdown)) return false;
  const sel = state.selection.main;
  if (!extend && !sel.empty) return false;
  let p = sel.head;
  let last: HiddenKind | null = null;
  for (let r; (r = hiddenAt(view, p, forward ? 1 : -1)) && r.kind !== "line";) {
    p = forward ? r.to : r.from;
    last = r.kind;
  }
  const line = state.doc.lineAt(p);
  const edge = forward ? p === line.to : p === line.from;
  if (last === "mark" && edge) {
    // Stop here: past the marks, before the line break.
  } else if (forward && p < state.doc.length)
    p = p === line.to ? p + 1 : line.from + findClusterBreak(line.text, p - line.from, true);
  else if (!forward && p > 0) {
    p = p === line.from ? p - 1 : line.from + findClusterBreak(line.text, p - line.from, false);
    // Into a line's hidden prefix: on to the end of the line before.
    const at = state.doc.lineAt(p);
    if (p < prefixEnd(state, at) && at.from > 0) p = at.from - 1;
  }
  if (p === sel.head) return false;
  view.dispatch({
    selection: EditorSelection.single(extend ? sel.anchor : p, p),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

const wrapperMark: Record<string, string> = {
  Emphasis: "EmphasisMark",
  StrongEmphasis: "EmphasisMark",
  Strikethrough: "StrikethroughMark",
  InlineCode: "CodeMark",
  Link: "LinkMark",
};

// emptied is the styled text or link that deleting from..to would leave
// empty (so it goes whole, marks and all), or null.
function emptied(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } | null {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1); n; n = n.parent) {
    const mark = wrapperMark[n.name];
    if (!mark) continue;
    const marks = n.getChildren(mark);
    if (marks.length < 2) continue;
    const close = n.name === "Link" ? marks[1] : marks[marks.length - 1];
    if (marks[0].to === from && close.from === to) return { from: n.from, to: n.to };
  }
  return null;
}

// deleteChar deletes the character before (or after) the cursor as it reads,
// past hidden marks: a heading, quote or bullet goes whole from the start of
// its text, a rule from the line after, styled text with its last character,
// and a widget standing in for text (a reference, a footnote mark) whole.
// Code fences are stepped into, not broken.
function deleteChar(view: EditorView, forward: boolean): boolean {
  const state = view.state;
  if (state.facet(showMarkdown)) return false;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const doc = state.doc;
  const del = (from: number, to: number) => {
    view.dispatch({
      changes: { from, to },
      scrollIntoView: true,
      userEvent: forward ? "delete.forward" : "delete.backward",
    });
    return true;
  };
  const head = sel.head;
  const pair = emptyPairAt(state, head);
  if (pair) return del(pair.from, pair.to);

  let p = head;
  for (let r; (r = hiddenAt(view, p, forward ? 1 : -1));) {
    if (r.kind === "prefix" && !forward) return del(r.from, r.to);
    if (r.kind !== "mark") break;
    p = forward ? r.to : r.from;
  }
  const line = doc.lineAt(p);
  if (forward ? p === line.to : p === line.from) {
    if (forward ? p >= doc.length : p <= 0) return p !== head;
    const other = doc.lineAt(forward ? p + 1 : p - 1);
    const dead = covered(state, other.from) ? null : deadLine(state, other);
    if (dead === "hr") return del(forward ? p : other.from, forward ? other.to : p);
    if (dead === "fence") {
      const into = forward ? Math.min(other.to + 1, doc.length) : Math.max(other.from - 1, 0);
      view.dispatch({ selection: { anchor: into }, scrollIntoView: true });
      return true;
    }
    if (p === head) return false;
    return forward ? del(p, p + 1) : del(p - 1, p);
  }
  const q = line.from + findClusterBreak(line.text, p - line.from, forward);
  let [from, to] = forward ? [p, q] : [q, p];
  const whole = emptied(state, from, to);
  if (whole) return del(whole.from, whole.to);
  for (const atomic of state.facet(EditorView.atomicRanges)) {
    atomic(view).between(from, to, (a, b) => {
      if (a < to && b > from) [from, to] = [Math.min(from, a), Math.max(to, b)];
    });
  }
  return del(from, to);
}

const hiddenKeymap = keymap.of([
  {
    key: "ArrowLeft",
    run: (v) => moveChar(v, false, false),
    shift: (v) => moveChar(v, false, true),
  },
  {
    key: "ArrowRight",
    run: (v) => moveChar(v, true, false),
    shift: (v) => moveChar(v, true, true),
  },
  { key: "Backspace", run: (v) => deleteChar(v, false) },
  { key: "Delete", run: (v) => deleteChar(v, true) },
]);

// --- Highlighting and theme ----------------------------------------------

const highlightCommon = [
  { tag: [t.heading1, t.heading2, t.strong], fontWeight: "700" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: "650" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--accent-ink)", textDecoration: "underline" },
  { tag: t.url, color: "var(--muted)" },
  { tag: [t.processingInstruction, t.meta], color: "var(--marks)" },
  { tag: t.contentSeparator, color: "var(--marks)" },
  { tag: t.quote, color: "var(--quote)" },
  { tag: t.list, color: "var(--accent-ink)" },
];

const highlight = HighlightStyle.define([
  ...highlightCommon,
  { tag: t.monospace, fontFamily: "var(--mono)", fontSize: "0.92em", color: "var(--roast)" },
  { tag: mathTag, fontFamily: "var(--mono)", fontSize: "0.92em", color: "var(--math)" },
]);

// Shown Markdown is all mono already: only colors and weights.
const sourceHighlight = HighlightStyle.define([
  ...highlightCommon,
  { tag: t.monospace, color: "var(--roast)" },
  { tag: mathTag, color: "var(--math)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", fontSize: "16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--writing)",
    lineHeight: "1.7",
    overflow: "auto",
  },
  ".cm-content": {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "36px 48px 40vh",
    caretColor: "var(--roast)",
  },
  ".cm-line": { padding: "0 2px" },
  ".cm-activeLine": { backgroundColor: "rgba(217, 158, 130, 0.07)" },
  ".cm-cursor": { borderLeftColor: "var(--roast)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(217, 158, 130, 0.32) !important",
  },
  ".cm-placeholder": { color: "var(--muted)", fontStyle: "italic" },
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    borderColor: "var(--border)",
  },
});

// --- Commands for the ribbon ----------------------------------------------

export type Mark = "strong" | "emph" | "strike" | "code";
const markText: Record<Mark, string> = {
  strong: "**",
  emph: "*",
  strike: "~~",
  code: "`",
};
const markNode: Record<Mark, string> = {
  strong: "StrongEmphasis",
  emph: "Emphasis",
  strike: "Strikethrough",
  code: "InlineCode",
};

// activeMarks lists the inline styles around the cursor.
export function activeMarks(state: EditorState): Set<Mark> {
  const out = new Set<Mark>();
  const pos = state.selection.main.from;
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    for (const m of Object.keys(markNode) as Mark[]) if (n.name === markNode[m]) out.add(m);
  }
  return out;
}

// toggleMark wraps the selection (or the word at the cursor) in a style, or
// unwraps it when it's already styled.
export function toggleMark(view: EditorView, mark: Mark): boolean {
  const s = markText[mark];
  const node = markNode[mark];
  const state = view.state;
  const tr = state.changeByRange((range) => {
    // Already inside: remove the marks around it.
    for (
      let n: SyntaxNode | null = syntaxTree(state).resolveInner(range.from, -1);
      n;
      n = n.parent
    ) {
      if (n.name === node) {
        const inner = state.sliceDoc(n.from, n.to);
        if (inner.startsWith(s) && inner.endsWith(s)) {
          return {
            changes: [
              { from: n.from, to: n.from + s.length },
              { from: n.to - s.length, to: n.to },
            ],
            range: EditorSelection.range(
              Math.max(n.from, range.from - s.length),
              Math.max(n.from, range.to - s.length),
            ),
          };
        }
      }
    }
    let { from, to } = range;
    if (from === to) {
      const word = state.wordAt(from);
      if (word) ({ from, to } = word);
    }
    if (from === to) {
      return {
        changes: { from, insert: s + s },
        range: EditorSelection.cursor(from + s.length),
      };
    }
    return {
      changes: [
        { from, insert: s },
        { from: to, insert: s },
      ],
      range: EditorSelection.range(from + s.length, to + s.length),
    };
  });
  view.dispatch(tr, { userEvent: "input.format" });
  view.focus();
  return true;
}

// clearFormatting removes bold, italic, strikethrough and code marks from the
// selection.
export function clearFormatting(view: EditorView) {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  // Not underscores: they're more often in names than marks.
  const text = view.state.sliceDoc(from, to).replace(/(\*\*|~~|\*|`)(?=\S)([\s\S]*?\S)\1/g, "$2");
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from, head: from + text.length },
    userEvent: "input.format",
  });
}

export type BlockStyle = "p" | "h1" | "h2" | "h3" | "h4" | "quote";
const prefixRe = /^(\s*)(#{1,6}\s+|>\s?)?/;

export function blockStyleAt(state: EditorState): BlockStyle | "code" | "list" {
  const line = state.doc.lineAt(state.selection.main.head);
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(line.from, 1); n; n = n.parent) {
    if (n.name === "FencedCode") return "code";
  }
  const h = /^(#{1,6})\s/.exec(line.text);
  if (h) return `h${Math.min(h[1].length, 4)}` as BlockStyle;
  if (/^\s*>/.test(line.text)) return "quote";
  if (/^\s*([-*+]|\d+[.)])\s/.test(line.text)) return "list";
  return "p";
}

function selectedLines(state: EditorState) {
  const lines: Line[] = [];
  const { from, to } = state.selection.main;
  for (let p = state.doc.lineAt(from).from; p <= to;) {
    const line = state.doc.lineAt(p);
    lines.push(line);
    p = line.to + 1;
    if (line.to >= state.doc.length) break;
  }
  return lines;
}

// setBlockStyle makes the selected lines a heading, a quote or plain text.
export function setBlockStyle(view: EditorView, style: BlockStyle) {
  const prefix = style === "p" ? "" : style === "quote" ? "> " : "#".repeat(Number(style[1])) + " ";
  const changes = selectedLines(view.state).map((line) => {
    const m = prefixRe.exec(line.text)!;
    return {
      from: line.from + m[1].length,
      to: line.from + m[0].length,
      insert: prefix,
    };
  });
  view.dispatch({ changes, userEvent: "input.format" });
  view.focus();
}

export function toggleList(view: EditorView, kind: "bullet" | "ordered") {
  const lines = selectedLines(view.state).filter((l) => l.text.trim() !== "");
  const re = kind === "bullet" ? /^(\s*)[-*+]\s+/ : /^(\s*)\d+[.)]\s+/;
  const all = lines.length > 0 && lines.every((l) => re.test(l.text));
  const changes = lines.map((line, i) => {
    const m = /^(\s*)([-*+]\s+|\d+[.)]\s+)?/.exec(line.text)!;
    const insert = all ? "" : kind === "bullet" ? "- " : `${i + 1}. `;
    return {
      from: line.from + m[1].length,
      to: line.from + m[0].length,
      insert,
    };
  });
  if (!lines.length) {
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: kind === "bullet" ? "- " : "1. " },
      selection: { anchor: pos + (kind === "bullet" ? 2 : 3) },
      userEvent: "input.format",
    });
  } else view.dispatch({ changes, userEvent: "input.format" });
  view.focus();
}

const fenceRe = /^\s{0,3}(```|~~~)/;

// toggleCodeBlock fences the selected lines, or removes the fences around
// the code block the cursor is in.
export function toggleCodeBlock(view: EditorView) {
  const state = view.state;
  const { from, to } = state.selection.main;
  const a = state.doc.lineAt(from);
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(a.from, 1); n; n = n.parent) {
    if (n.name !== "FencedCode") continue;
    const open = state.doc.lineAt(n.from);
    const close = state.doc.lineAt(n.to);
    const closed = close.number > open.number && fenceRe.test(close.text);
    const changes = !closed
      ? [{ from: open.from, to: Math.min(open.to + 1, state.doc.length) }]
      : close.number === open.number + 1
        ? [{ from: open.from, to: close.to }]
        : [
            { from: open.from, to: open.to + 1 },
            { from: close.from - 1, to: close.to },
          ];
    view.dispatch({ changes, userEvent: "input.format" });
    view.focus();
    return;
  }
  const b = state.doc.lineAt(to);
  const body = state.sliceDoc(a.from, b.to);
  insertBlock(view, "```\n" + body + "\n```", {
    replace: { from: a.from, to: b.to },
    cursorOffset: 4,
  });
}

// insertBlock puts text in a paragraph of its own at the cursor (or in place
// of replace), with blank lines around it, and returns where it starts. text
// may depend on where that is.
export function insertBlock(
  view: EditorView,
  text: string | ((start: number) => string),
  opts: {
    replace?: { from: number; to: number };
    at?: number;
    cursorOffset?: number;
  } = {},
): number {
  const state = view.state;
  let from: number;
  let to: number;
  if (opts.replace) ({ from, to } = opts.replace);
  else {
    const pos = opts.at ?? state.selection.main.head;
    const line = state.doc.lineAt(pos);
    // Within a line: break it at the cursor; at its ends: next to it.
    from = to =
      line.text.trim() === ""
        ? line.from
        : pos === line.from
          ? line.from
          : pos === line.to
            ? line.to
            : pos;
    if (line.text.trim() === "") to = line.to;
  }
  const before = state.sliceDoc(Math.max(0, from - 2), from);
  const after = state.sliceDoc(to, to + 2);
  const lead =
    from === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail =
    to >= state.doc.length
      ? "\n"
      : after.startsWith("\n\n")
        ? ""
        : after.startsWith("\n")
          ? "\n"
          : "\n\n";
  const start = from + lead.length;
  if (typeof text === "function") text = text(start);
  const cursor = start + (opts.cursorOffset ?? text.length);
  view.dispatch({
    changes: { from, to, insert: lead + text + trail },
    selection: { anchor: cursor },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
  return start;
}

// insertDivider puts a divider at the cursor: `---`, or `***` at the very
// start of the document, where `---` would open front matter (taking the
// text up to a later `---` line with it).
export function insertDivider(view: EditorView) {
  insertBlock(view, (start) => (start === 0 ? "***" : "---"));
}

export function insertText(view: EditorView, text: string, select = false) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: select ? { anchor: from, head: from + text.length } : { anchor: from + text.length },
    userEvent: "input",
  });
  view.focus();
}

// insertFootnote adds a numbered mark at the cursor and its note with the
// others, in order, renumbering the notes after it, and moves the cursor
// there to type it (a click on its number goes back).
export function insertFootnote(view: EditorView) {
  const fn = view.state.field(footnotesField);
  const used = [...fn.marks, ...fn.notes].map((x) => x.label).filter((l) => /^\d+$/.test(l));
  const label = String(Math.max(0, ...used.map(Number)) + 1);
  addNote(view, label, view.state.selection.main.head, true);
}

// addNote adds an empty note for label (and its mark at pos, if mark): after
// the note of the nearest mark before pos, or before the first note, or at
// the end, then renumbers, and puts the cursor in the note.
function addNote(view: EditorView, label: string, pos: number, mark: boolean) {
  const state = view.state;
  const { marks, notes } = state.field(footnotesField);
  const head = `[^${label}]: `;
  const prev = marks.filter(
    (m) => !m.inNote && m.to <= pos && m.label !== label && notes.some((n) => n.label === m.label),
  );
  const after = prev.length
    ? notes.find((n) => n.label === prev[prev.length - 1].label)
    : undefined;
  let at: number;
  let note: string;
  let cursor: number; // in note
  if (after) {
    at = after.to;
    note = `\n\n${head}`;
    cursor = note.length;
  } else if (notes.length) {
    at = notes[0].from;
    note = `${head}\n\n`;
    cursor = head.length;
  } else {
    const doc = state.doc.toString();
    at = doc.length;
    note = `${doc.endsWith("\n\n") ? "" : doc.endsWith("\n") ? "\n" : "\n\n"}${head}`;
    cursor = note.length;
  }
  const added = state.changes([
    ...(mark ? [{ from: pos, insert: `[^${label}]` }] : []),
    { from: at, insert: note },
  ]);
  const doc = added.apply(state.doc);
  const renumbered = ChangeSet.of(renumberFootnotes(doc.toString()), doc.length);
  const anchor = renumbered.mapPos(added.mapPos(at, 1) - note.length + cursor, 1);
  view.dispatch({
    changes: added.compose(renumbered),
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
    userEvent: "input",
  });
  view.focus();
}

// insertEquation wraps text selected within a line as inline math ($…$), or
// else puts a display equation on lines of its own, the cursor between its
// `$$` lines (and the selected lines there, if any).
export function insertEquation(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const text = doc.sliceString(from, to);
  const tex = text.trim();
  if (tex && doc.lineAt(from).number === doc.lineAt(to).number) {
    // Math can't start or end with a space: keep any outside the dollars.
    const lead = text.indexOf(tex);
    const start = from + lead + 1;
    view.dispatch({
      changes: { from: from + lead, to: from + lead + tex.length, insert: `$${tex}$` },
      selection: { anchor: start, head: start + tex.length },
      userEvent: "input",
    });
    view.focus();
    return;
  }
  insertBlock(view, `$$\n${tex}\n$$`, {
    replace: tex ? { from, to } : undefined,
    cursorOffset: 3 + tex.length,
  });
}

// --- Cross-reference completion -----------------------------------------

const completionType: Record<Item["kind"], string> = {
  figure: "variable",
  table: "class",
  equation: "constant",
};

function refCompletions(ctx: CompletionContext) {
  const word = ctx.matchBefore(/@[\w:-]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (word.from > 0 && /\w/.test(ctx.state.sliceDoc(word.from - 1, word.from))) return null;
  const options: Completion[] = ctx.state
    .field(itemsField)
    .filter((x) => x.label)
    .map((x) => ({
      label: "@" + x.label,
      detail: `${kindName[x.kind]} ${x.number}`,
      info: plain(x.caption),
      type: completionType[x.kind],
    }));
  return options.length ? { from: word.from, options, validFor: /^@[\w:-]*$/ } : null;
}

// --- Setup ----------------------------------------------------------------------

export function createEditor(
  parent: HTMLElement,
  doc: string,
  handlers: Handlers,
  show: boolean,
): EditorView {
  const formatting = keymap.of([
    { key: "Mod-b", run: (v) => toggleMark(v, "strong") },
    { key: "Mod-i", run: (v) => toggleMark(v, "emph") },
    { key: "Mod-Shift-x", run: (v) => toggleMark(v, "strike") },
    { key: "Mod-`", run: (v) => toggleMark(v, "code") },
    { key: "Mod-Alt-1", run: (v) => (setBlockStyle(v, "h1"), true) },
    { key: "Mod-Alt-2", run: (v) => (setBlockStyle(v, "h2"), true) },
    { key: "Mod-Alt-3", run: (v) => (setBlockStyle(v, "h3"), true) },
    { key: "Mod-Alt-4", run: (v) => (setBlockStyle(v, "h4"), true) },
    { key: "Mod-Alt-0", run: (v) => (setBlockStyle(v, "p"), true) },
    { key: "Tab", run: indentMore, shift: indentLess },
  ]);

  const extensions: Extension[] = [
    itemsField,
    footnotesField,
    frontMatterEnd,
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(false),
    bodyHint,
    markdown({ base: markdownLanguage, addKeymap: false, extensions: [math] }),
    // Highlighting comes with showSlot.
    theme,
    hiddenKeymap,
    formatting,
    keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    autocompletion({ override: [refCompletions], icons: false }),
    decorations(handlers),
    lineStyles,
    hiddenMarks,
    settleCursor,
    guardProperties,
    followLabels,
    followFootnotes,
    EditorView.contentAttributes.of({
      spellcheck: "true",
      autocorrect: "on",
      autocapitalize: "sentences",
    }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged || u.selectionSet) handlers.changed(u.state, u.docChanged);
    }),
    EditorView.domEventHandlers({
      paste(e, view) {
        const files = [...(e.clipboardData?.files ?? [])].filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return false;
        e.preventDefault();
        handlers.pasteImages(files, view.state.selection.main.head);
        return true;
      },
    }),
  ];
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: startSelection(doc),
      extensions: [extensions, showSlot.of(showExtension(show))],
    }),
  });
  editorSetup.set(view, { extensions, handlers });
  return view;
}

const editorSetup = new WeakMap<EditorView, { extensions: Extension[]; handlers: Handlers }>();

// replaceDoc swaps in a new document, starting a fresh undo history.
export function replaceDoc(view: EditorView, doc: string) {
  imageCache.clear(); // picture paths are relative to the document
  const { extensions, handlers } = editorSetup.get(view)!;
  const show = showSlot.of(showExtension(view.state.facet(showMarkdown)));
  view.setState(
    EditorState.create({ doc, selection: startSelection(doc), extensions: [extensions, show] }),
  );
  handlers.changed(view.state, false); // setState skips update listeners
}

// How far below the editor's top revealLine puts a line.
const revealMargin = 24;

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
