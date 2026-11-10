// The Markdown editor: CodeMirror with Word-like conveniences. Figures show
// their picture and number, tables get an edit bar, cross-references read
// as "Figure 2", and the front matter becomes a document properties card.

import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import {
  EditorSelection,
  EditorState,
  type Extension,
  type Line,
  RangeSetBuilder,
  StateField,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder,
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
  type Item,
  plain,
  type Position,
  readFrontMatter,
  scan,
} from "./markdown";

export interface Handlers {
  editFigure(item: Item): void;
  editTable(item: Item): void;
  editProperties(): void;
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

// --- Widgets -------------------------------------------------------------------

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
      a.src === b.src &&
      a.number === b.number &&
      a.caption === b.caption &&
      a.width === b.width &&
      a.label === b.label &&
      a.position === b.position
    );
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "pw-figure";
    if (this.item.position) el.classList.add(this.item.position);
    // The item as the document has it now (this widget may be older).
    const current = () => {
      const pos = view.posAtDOM(el);
      return view.state
        .field(itemsField)
        .find((x) => x.kind === "figure" && x.to <= pos + 1 && x.to >= pos - 1);
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

    const frame = document.createElement("div");
    frame.className = "pw-figure-frame";
    const img = document.createElement("img");
    img.alt = plain(this.item.caption);
    img.draggable = false;
    const w = this.item.width || 0;
    frame.style.width = w > 0 ? `${w}%` : "auto";
    const src = this.item.src ?? "";
    if (!imageCache.has(src)) imageCache.set(src, this.handlers.imageURL(src));
    imageCache.get(src)!.then((url) => {
      if (url) img.src = url;
      else {
        frame.classList.add("missing");
        const msg = document.createElement("span");
        msg.textContent = `Missing picture: ${src}`;
        img.replaceWith(msg);
      }
    });

    const tools = document.createElement("div");
    tools.className = "pw-figure-tools";
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
    frame.append(img, tools, handle, size);

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
    const open = () => {
      const item = current();
      if (item) this.handlers.editFigure(item);
    };
    edit.onclick = open;
    img.ondblclick = open;
    cap.append(edit);
    el.append(frame, cap);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

class TableBar extends WidgetType {
  constructor(
    readonly item: Item,
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: TableBar) {
    return o.item.number === this.item.number && o.item.caption === this.item.caption;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "pw-tablebar";
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
    edit.onclick = () => {
      const pos = view.posAtDOM(el);
      const item = view.state
        .field(itemsField)
        .find((x) => x.kind === "table" && Math.abs(x.from - pos) <= 1);
      if (item) this.handlers.editTable(item);
    };
    el.append(badge, cap, edit);
    return el;
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
  ) {
    super();
  }
  eq(o: RefWidget) {
    return o.label === this.label && o.text === this.text && o.ok === this.ok;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = this.ok ? "pw-ref" : "pw-ref broken";
    el.textContent = this.text;
    el.title = this.ok ? `Cross-reference to ${this.label}` : `Nothing is labelled ${this.label}`;
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
    btn.textContent = "Edit properties";
    btn.onmousedown = (e) => e.preventDefault();
    const open = () => this.handlers.editProperties();
    btn.onclick = open;
    el.ondblclick = open;
    el.append(text, btn);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const refRe = /(^|[^\w])@((?:fig|tbl):[A-Za-z0-9_-]*[A-Za-z0-9_])/g;
const footRe = /\[\^[^\]\s]+\](?!:)/g;

interface Decos {
  deco: DecorationSet;
  atomic: DecorationSet;
}

function buildDecorations(state: EditorState, handlers: Handlers): Decos {
  const doc = state.doc;
  const items = state.field(itemsField);
  const labels = new Map(items.filter((x) => x.label).map((x) => [x.label, x]));
  const ranges: { from: number; to: number; deco: Decoration; atomic?: boolean }[] = [];

  const fm = readFrontMatter(doc.toString());
  if (fm.to > 0) {
    const by = [fm.meta.author, fm.meta.date].filter(Boolean).join(" · ");
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

  for (const it of items) {
    if (it.kind === "figure") {
      ranges.push({
        from: it.to,
        to: it.to,
        deco: Decoration.widget({ widget: new FigureWidget(it, handlers), block: true, side: 1 }),
      });
      ranges.push({
        from: it.from,
        to: it.from,
        deco: Decoration.line({ class: "pw-figure-line" }),
      });
    } else {
      ranges.push({
        from: it.from,
        to: it.from,
        deco: Decoration.widget({ widget: new TableBar(it, handlers), block: true, side: -1 }),
      });
      for (let p = it.tableFrom!; p <= it.tableTo!;) {
        const line = doc.lineAt(p);
        ranges.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({ class: "pw-table-line" }),
        });
        p = line.to + 1;
      }
      if (it.captionFrom !== undefined) {
        ranges.push({
          from: it.captionFrom,
          to: it.captionFrom,
          deco: Decoration.line({ class: "pw-caption-line" }),
        });
      }
    }
  }

  // Cross-references and footnote markers, outside code.
  const text = doc.toString();
  const tree = syntaxTree(state);
  const inCode = (pos: number) => {
    for (let n: SyntaxNode | null = tree.resolve(pos, 1); n; n = n.parent) {
      if (n.name === "InlineCode" || n.name === "FencedCode" || n.name === "CodeBlock") return true;
    }
    return false;
  };
  for (const m of text.matchAll(refRe)) {
    const from = m.index! + m[1].length;
    const to = from + m[2].length + 1;
    if (from < fm.to || inCode(from)) continue;
    const target = labels.get(m[2]);
    const label = target
      ? `${target.kind === "figure" ? "Figure" : "Table"} ${target.number}`
      : `?? ${m[2]}`;
    ranges.push({
      from,
      to,
      deco: Decoration.replace({ widget: new RefWidget(m[2], label, !!target) }),
      atomic: true,
    });
  }
  for (const m of text.matchAll(footRe)) {
    if (m.index! < fm.to || inCode(m.index!)) continue;
    ranges.push({
      from: m.index!,
      to: m.index! + m[0].length,
      deco: Decoration.mark({ class: "pw-footnote-ref" }),
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
      tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)
        ? buildDecorations(tr.state, handlers)
        : d,
    provide: (f) => [
      EditorView.decorations.from(f, (d) => d.deco),
      EditorView.atomicRanges.of((v) => v.state.field(f).atomic),
    ],
  });
  return field;
}

// Block-level line styling from the syntax tree: headings, quotes, code.
const lineStyles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState))
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
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (n) => {
            const h = /^ATXHeading(\d)$/.exec(n.name);
            if (h) add(n.from, `pw-h pw-h${h[1]}`);
            else if (n.name === "Blockquote" || n.name === "FencedCode") {
              for (let p = n.from; p <= n.to;) {
                const line = view.state.doc.lineAt(p);
                if (line.from >= from && line.from <= to)
                  add(line.from, n.name === "Blockquote" ? "pw-quote-line" : "pw-code-line");
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

// --- Highlighting and theme ----------------------------------------------

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700" },
  { tag: t.heading2, fontWeight: "700" },
  { tag: t.heading3, fontWeight: "650" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "650" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--accent-ink)", textDecoration: "underline" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.monospace, fontFamily: "var(--mono)", fontSize: "0.92em", color: "var(--roast)" },
  { tag: [t.processingInstruction, t.meta], color: "var(--marks)" },
  { tag: t.contentSeparator, color: "var(--marks)" },
  { tag: t.quote, color: "var(--quote)" },
  { tag: t.list, color: "var(--accent-ink)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", fontSize: "16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--writing)", lineHeight: "1.7", overflow: "auto" },
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
  ".cm-panels": { backgroundColor: "var(--surface)", borderColor: "var(--border)" },
});

// --- Commands for the ribbon ----------------------------------------------

export type Mark = "strong" | "emph" | "strike" | "code";
const markText: Record<Mark, string> = { strong: "**", emph: "*", strike: "~~", code: "`" };
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
      return { changes: { from, insert: s + s }, range: EditorSelection.cursor(from + s.length) };
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
    return { from: line.from + m[1].length, to: line.from + m[0].length, insert: prefix };
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
    return { from: line.from + m[1].length, to: line.from + m[0].length, insert };
  });
  if (!lines.length) {
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: kind === "bullet" ? "- " : "1. " },
      selection: { anchor: pos + (kind === "bullet" ? 2 : 3) },
    });
  } else view.dispatch({ changes, userEvent: "input.format" });
  view.focus();
}

export function toggleCodeBlock(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const a = view.state.doc.lineAt(from);
  const b = view.state.doc.lineAt(to);
  const body = view.state.sliceDoc(a.from, b.to);
  insertBlock(view, "```\n" + body + "\n```", {
    replace: { from: a.from, to: b.to },
    cursorOffset: 4,
  });
}

// insertBlock puts text in a paragraph of its own at the cursor (or in place
// of replace), with blank lines around it, and returns where it starts.
export function insertBlock(
  view: EditorView,
  text: string,
  opts: { replace?: { from: number; to: number }; at?: number; cursorOffset?: number } = {},
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

export function insertText(view: EditorView, text: string, select = false) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: select ? { anchor: from, head: from + text.length } : { anchor: from + text.length },
    userEvent: "input",
  });
  view.focus();
}

// insertFootnote adds a marker at the cursor and the note at the end of the
// document, and moves the cursor there to type it.
export function insertFootnote(view: EditorView) {
  const doc = view.state.doc.toString();
  let n = 1;
  while (doc.includes(`[^${n}]`)) n++;
  const pos = view.state.selection.main.head;
  const end = view.state.doc.length;
  const tail = doc.endsWith("\n\n") ? "" : doc.endsWith("\n") ? "\n" : "\n\n";
  const note = `${tail}[^${n}]: `;
  view.dispatch({
    changes: [
      { from: pos, insert: `[^${n}]` },
      { from: end, insert: note },
    ],
    selection: { anchor: end + `[^${n}]`.length + note.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
}

// --- Cross-reference completion -----------------------------------------

function refCompletions(ctx: CompletionContext) {
  const word = ctx.matchBefore(/@[\w:-]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (word.from > 0 && /\w/.test(ctx.state.sliceDoc(word.from - 1, word.from))) return null;
  const options: Completion[] = ctx.state
    .field(itemsField)
    .filter((x) => x.label)
    .map((x) => ({
      label: "@" + x.label,
      detail: `${x.kind === "figure" ? "Figure" : "Table"} ${x.number}`,
      info: plain(x.caption),
      type: x.kind === "figure" ? "variable" : "class",
    }));
  return options.length ? { from: word.from, options, validFor: /^@[\w:-]*$/ } : null;
}

// --- Setup ----------------------------------------------------------------------

export function createEditor(parent: HTMLElement, doc: string, handlers: Handlers): EditorView {
  const formatting = keymap.of([
    { key: "Mod-b", run: (v) => toggleMark(v, "strong") },
    { key: "Mod-i", run: (v) => toggleMark(v, "emph") },
    { key: "Mod-Shift-x", run: (v) => toggleMark(v, "strike") },
    { key: "Mod-`", run: (v) => toggleMark(v, "code") },
    { key: "Mod-Alt-1", run: (v) => (setBlockStyle(v, "h1"), true) },
    { key: "Mod-Alt-2", run: (v) => (setBlockStyle(v, "h2"), true) },
    { key: "Mod-Alt-3", run: (v) => (setBlockStyle(v, "h3"), true) },
    { key: "Mod-Alt-0", run: (v) => (setBlockStyle(v, "p"), true) },
    { key: "Tab", run: indentMore, shift: indentLess },
  ]);

  const extensions: Extension[] = [
    itemsField,
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(false),
    placeholder("Start writing…"),
    markdown({ base: markdownLanguage, addKeymap: false }),
    syntaxHighlighting(highlight),
    theme,
    formatting,
    keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    autocompletion({ override: [refCompletions], icons: false }),
    decorations(handlers),
    lineStyles,
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
  const view = new EditorView({ parent, state: EditorState.create({ doc, extensions }) });
  editorExtensions.set(view, extensions);
  return view;
}

const editorExtensions = new WeakMap<EditorView, Extension[]>();

// replaceDoc swaps in a new document, starting a fresh undo history.
export function replaceDoc(view: EditorView, doc: string) {
  view.setState(EditorState.create({ doc, extensions: editorExtensions.get(view) }));
}
