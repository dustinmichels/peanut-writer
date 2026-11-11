// Editing commands for the ribbon and the keyboard: inline styles, block
// styles, lists, code blocks, and inserting blocks, footnotes and inline math.
// None reaches into the front matter: a selection taking it in (Select All)
// is styled from where the text begins, and blocks go after it.

import { indentLess, indentMore } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  ChangeSet,
  type ChangeSpec,
  EditorSelection,
  EditorState,
  type Line,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";
import { renumberFootnotes } from "@/lib/markdown";
import { codeNodes, footnotesField, frontMatterEnd, itemsField } from "./fields";
import { tocRe } from "./widgets/toc";

export type Mark = "strong" | "emph" | "strike" | "highlight" | "code";
const markText: Record<Mark, string> = {
  strong: "**",
  emph: "*",
  strike: "~~",
  highlight: "==",
  code: "`",
};
const markNode: Record<Mark, string> = {
  strong: "StrongEmphasis",
  emph: "Emphasis",
  strike: "Strikethrough",
  highlight: "Highlight",
  code: "InlineCode",
};
const blockCode = new Set(["FencedCode", "CodeBlock", "BlockMath"]);
const uncut = new Set([
  ...Object.values(markNode),
  "InlineMath",
  "Link",
  "Image",
  "Autolink",
  "URL",
]);

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
// unwraps it when it's already styled. A selection over several paragraphs,
// headings or table cells styles each one's text, as marks can't run across
// them. Code, math and the front matter are left as written.
export function toggleMark(view: EditorView, mark: Mark): boolean {
  const s = markText[mark];
  const node = markNode[mark];
  const state = view.state;
  const body = state.field(frontMatterEnd);
  // Parsed through the selection: what's off screen may not be yet.
  const tree = ensureSyntaxTree(state, state.selection.main.to, 200) ?? syntaxTree(state);
  // The styled node around from–to, if any.
  const around = (from: number, to: number, side: -1 | 1) => {
    for (let n: SyntaxNode | null = tree.resolveInner(from, side); n; n = n.parent) {
      if (n.name === node && n.to >= to) return n;
    }
    return null;
  };
  // Its marks as written (`__` too, or a run of backticks).
  const marksOf = (n: SyntaxNode): ChangeSpec[] => {
    const open = n.firstChild;
    const close = n.lastChild;
    return open && close && open.to <= close.from && open.name === close.name
      ? [
          { from: open.from, to: open.to },
          { from: close.from, to: close.to },
        ]
      : [];
  };
  // Marks around from–to, and none of the same style within, which would
  // close them early (bolding `a **b** c` gives `**a b c**`).
  const wrap = (from: number, to: number): ChangeSpec[] => {
    const out: ChangeSpec[] = [{ from, insert: s }];
    tree.iterate({
      from,
      to,
      enter: (n) => {
        if (n.name === node && n.from >= from && n.to <= to) out.push(...marksOf(n.node));
      },
    });
    out.push({ from: to, insert: s });
    return out;
  };
  // from–to grown to take in the code, math, link or other style it would
  // cut: marks can't open inside one and close outside it.
  const snap = (from: number, to: number) => {
    let a = from;
    let b = to;
    for (let n: SyntaxNode | null = tree.resolveInner(from, 1); n; n = n.parent) {
      if (uncut.has(n.name) && n.from < from && from < n.to && n.to <= to) a = n.from;
    }
    for (let n: SyntaxNode | null = tree.resolveInner(to, -1); n; n = n.parent) {
      if (uncut.has(n.name) && n.from >= from && n.from < to && to < n.to) b = n.to;
    }
    return { from: a, to: b };
  };
  // Whether pos is between an empty pair pressing it before left (`**|**`;
  // `*|*` in `***|***`, not in `**|**`), to be taken away again.
  const emptyPair = (pos: number) => {
    const run = (step: -1 | 1) => {
      let n = 0;
      for (let p = step < 0 ? pos - 1 : pos; state.sliceDoc(p, p + 1) === s[0]; p += step) n++;
      return n;
    };
    const n = run(-1);
    return n === run(1) && (s === "*" ? n % 2 === 1 : n >= s.length) && !around(pos, pos, -1);
  };
  const tr = state.changeByRange((range) => {
    let { from, to } = range;
    if (from < body) {
      if (to <= body) return { range };
      from = body;
    }
    const doc = state.doc;
    const line = doc.lineAt(from);
    // Over several paragraphs, headings or table cells: each one's text.
    const spans = from < to ? textSpans(state, tree, from, to) : [];
    if (line.number !== doc.lineAt(to).number || spans.length > 1) {
      if (!spans.length) return { range };
      const snapped = spans.map((x) => snap(x.from, x.to));
      const styled = snapped.map((x) => around(x.from, x.to, 1));
      const changes = state.changes(
        styled.every(Boolean)
          ? styled.flatMap((n) => marksOf(n!))
          : snapped.flatMap((x, i) => (styled[i] ? [] : wrap(x.from, x.to))),
      );
      return {
        changes,
        range: EditorSelection.range(
          changes.mapPos(snapped[0].from, 1),
          changes.mapPos(snapped[snapped.length - 1].to, -1),
        ),
      };
    }
    const pair = from === to && emptyPair(from);
    // In a code block or display equation, anywhere on its lines (the
    // indentation too, the end of the closing fence), marks would be text.
    // But for an empty pair opening one (`~~|~~` reads as a fence).
    for (let n: SyntaxNode | null = tree.resolveInner(line.to, -1); n; n = n.parent) {
      if (
        blockCode.has(n.name) &&
        doc.lineAt(n.from).from <= from &&
        !(pair && n.from >= line.from)
      )
        return { range };
    }
    if (pair) {
      const changes = state.changes([
        { from: from - s.length, to: from },
        { from, to: from + s.length },
      ]);
      return { changes, range: EditorSelection.cursor(from - s.length) };
    }
    if (from < to) {
      // The text selected, without a line's marks (`> `, `- `, `# `) or the
      // white space around: `** b**` wouldn't be bold.
      if (spans.length === 1) ({ from, to } = spans[0]);
      else {
        const t = state.sliceDoc(from, to);
        from += t.length - t.trimStart().length;
        to = Math.max(from, to - (t.length - t.trimEnd().length));
      }
    }
    // Already inside, or selected whole: remove the marks around it.
    const inside = around(from, from, -1) ?? (from < to ? around(from, to, 1) : null);
    const marks = inside ? marksOf(inside) : [];
    if (marks.length) {
      const changes = state.changes(marks);
      return { changes, range: EditorSelection.range(from, to).map(changes) };
    }
    if (from === to) {
      const word = state.wordAt(from);
      if (word) ({ from, to } = word);
    }
    // In inline code or math, or a link's target, marks would be text.
    for (let n: SyntaxNode | null = tree.resolveInner(from, 1); n; n = n.parent) {
      if (codeNodes.has(n.name) && n.from < from && n.to > to) return { range };
      const target = n.name === "URL" && /^(Link|Image|Autolink)$/.test(n.parent?.name ?? "");
      if (target && n.from <= from && n.to >= to) return { range };
    }
    if (from === to) {
      return {
        changes: { from, insert: s + s },
        range: EditorSelection.cursor(from + s.length),
      };
    }
    ({ from, to } = snap(from, to));
    const changes = state.changes(wrap(from, to));
    return {
      changes,
      range: EditorSelection.range(changes.mapPos(from, 1), changes.mapPos(to, -1)),
    };
  });
  view.dispatch(tr, { userEvent: "input.format" });
  view.focus();
  return true;
}

// textSpans are the stretches of text from–to takes in: one per paragraph,
// heading or table cell, without its heading marks, a note's `[^1]:` and the
// white space around. Figures, table captions and the table of contents are
// left as written: marks around them would undo them.
function textSpans(state: EditorState, tree: Tree, from: number, to: number) {
  const out: { from: number; to: number }[] = [];
  const items = state.field(itemsField);
  tree.iterate({
    from,
    to,
    enter: (n) => {
      const atx = n.name.startsWith("ATXHeading");
      const cell = n.name === "TableCell";
      if (n.name !== "Paragraph" && !atx && !cell && !n.name.startsWith("SetextHeading")) return;
      let a = n.from;
      let b = n.to;
      const text = state.sliceDoc(a, b);
      if (!cell && (tocRe.test(text.trim()) || items.some((x) => x.from < b && x.to > a)))
        return false;
      const first = n.node.firstChild;
      const last = n.node.lastChild;
      if (atx && first?.name === "HeaderMark") a = first.to;
      if (last?.name === "HeaderMark" && last.from > a) b = last.from; // a closing `##`, an underline
      a += /^\[\^[^\]\s]+\]:/.exec(text)?.[0].length ?? 0;
      a = Math.max(a, from);
      b = Math.min(b, to);
      const t = state.sliceDoc(a, b);
      a += t.length - t.trimStart().length;
      b -= t.length - t.trimEnd().length;
      if (a < b) out.push({ from: a, to: b });
      return false;
    },
  });
  return out;
}

// clearFormatting removes bold, italic, strikethrough, highlight and code
// marks from the selection: those it holds both of.
export function clearFormatting(view: EditorView) {
  const state = view.state;
  const to = state.selection.main.to;
  const from = Math.max(state.selection.main.from, state.field(frontMatterEnd));
  if (from >= to) return;
  const styles = new Set(Object.values(markNode));
  const changes: ChangeSpec[] = [];
  (ensureSyntaxTree(state, to, 200) ?? syntaxTree(state)).iterate({
    from,
    to,
    enter: (n) => {
      if (!styles.has(n.name) || n.from < from || n.to > to) return;
      const open = n.node.firstChild;
      const close = n.node.lastChild;
      if (open && close && open.to <= close.from && open.name === close.name) {
        changes.push({ from: open.from, to: open.to }, { from: close.from, to: close.to });
      }
    },
  });
  if (!changes.length) return;
  const set = state.changes(changes);
  view.dispatch({
    changes: set,
    selection: { anchor: set.mapPos(from, 1), head: set.mapPos(to, -1) },
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
  const setext = setextAt(state, line);
  if (setext) return `h${setext.name.slice(-1)}` as BlockStyle;
  const h = /^(#{1,6})\s/.exec(line.text);
  if (h) return `h${Math.min(h[1].length, 4)}` as BlockStyle;
  if (/^\s*>/.test(line.text)) return "quote";
  if (/^\s*([-*+]|\d+[.)])\s/.test(line.text)) return "list";
  return "p";
}

// setextAt is the underlined heading (`Title` over `===`) line is part of,
// text or underline, if any.
function setextAt(state: EditorState, line: Line): SyntaxNode | null {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(line.to, -1); n; n = n.parent) {
    if (n.name.startsWith("SetextHeading")) return n;
  }
  return null;
}

// selectedLines are the lines the selection touches, but not the one it ends
// at the start of (as selecting whole lines leaves it), nor the front
// matter's.
function selectedLines(state: EditorState) {
  const lines: Line[] = [];
  const body = state.field(frontMatterEnd);
  const { from, to } = state.selection.main;
  const end = to > from && state.doc.lineAt(to).from === to ? to - 1 : to;
  for (let p = state.doc.lineAt(from).from; p <= end;) {
    const line = state.doc.lineAt(p);
    if (line.from >= body) lines.push(line);
    p = line.to + 1;
    if (line.to >= state.doc.length) break;
  }
  return lines;
}

// styledLines are the selected lines a line style can go on: not those of
// code blocks, display equations and tables, where `# `, `> ` or `- ` would
// be text, or break them (and taking one off, a code comment's `#`), nor,
// from several lines, the blank lines beside them (`> ` there would be an
// empty quote).
function styledLines(state: EditorState) {
  const doc = state.doc;
  const tree = ensureSyntaxTree(state, state.selection.main.to + 1, 200) ?? syntaxTree(state);
  const raw = (n: number) => {
    if (n < 1 || n > doc.lines) return false;
    for (let x: SyntaxNode | null = tree.resolveInner(doc.line(n).to, -1); x; x = x.parent) {
      if (blockCode.has(x.name) || x.name === "Table") return true;
    }
    return false;
  };
  const lines = selectedLines(state);
  return lines.filter(
    (line) =>
      !raw(line.number) &&
      (lines.length === 1 ||
        line.text.trim() !== "" ||
        !(raw(line.number - 1) || raw(line.number + 1))),
  );
}

// setBlockStyle makes the selected lines a heading, a quote or plain text.
// An underlined heading loses its underline: a heading is written with #s,
// on one line.
export function setBlockStyle(view: EditorView, style: BlockStyle) {
  const { state } = view;
  const doc = state.doc;
  const prefix = style === "p" ? "" : style === "quote" ? "> " : "#".repeat(Number(style[1])) + " ";
  const lines = styledLines(state);
  const changes: ChangeSpec[] = [];
  const setexts = new Set<number>();
  for (const line of lines) {
    // Blank lines between the selected paragraphs stay blank, not empty headings.
    if (style[0] === "h" && lines.length > 1 && line.text.trim() === "") continue;
    const setext = setextAt(state, line);
    if (!setext) {
      const m = prefixRe.exec(line.text)!;
      changes.push({ from: line.from + m[1].length, to: line.from + m[0].length, insert: prefix });
      continue;
    }
    if (setexts.has(setext.from)) continue;
    setexts.add(setext.from);
    // In place, so the cursor stays in its text: the prefix before it, the
    // underline gone, and its lines run into one for a #-heading.
    changes.push({ from: setext.from, insert: prefix });
    const underline = doc.lineAt(setext.lastChild!.from);
    for (let n = doc.lineAt(setext.from).number + 1; n < underline.number; n++) {
      const l = doc.line(n);
      const markers = l.from + /^[ \t>]*/.exec(l.text)![0].length; // a quote's or list's
      if (style === "quote") changes.push({ from: markers, insert: "> " });
      else if (style !== "p") changes.push({ from: l.from - 1, to: markers, insert: " " });
    }
    changes.push({ from: underline.from - 1, to: underline.to });
  }
  const set = state.changes(changes);
  // A cursor at a line's start goes after its new prefix, where the text is.
  view.dispatch({
    changes: set,
    selection: state.selection.map(set, 1),
    userEvent: "input.format",
  });
  view.focus();
}

export function toggleList(view: EditorView, kind: "bullet" | "ordered") {
  const styled = styledLines(view.state);
  const lines = styled.filter((l) => l.text.trim() !== "");
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
    // On a blank line: a list starts there.
    const pos = view.state.selection.main.head;
    if (!styled.some((l) => l.from <= pos && pos <= l.to)) return;
    view.dispatch({
      changes: { from: pos, insert: kind === "bullet" ? "- " : "1. " },
      selection: { anchor: pos + (kind === "bullet" ? 2 : 3) },
      userEvent: "input.format",
    });
  } else view.dispatch({ changes, userEvent: "input.format" });
  view.focus();
}

// A list item's first line, after any quote markers: its indentation, marker
// and the space after it.
const itemRe = /^([ \t]*)(?:[-*+]|(\d+)([.)]))([ \t]*)/;

// columns counts the width of white space, a tab running to the next
// multiple of four.
function columns(ws: string): number {
  let c = 0;
  for (const ch of ws) c = ch === "\t" ? c + 4 - (c % 4) : c + 1;
  return c;
}

// quoteMarks is the length of up to depth quote markers (`> `) text starts
// with.
function quoteMarks(text: string, depth: number): number {
  let at = 0;
  for (let d = 0; d < depth; d++) {
    const m = /^[ \t]*>[ \t]?/.exec(text.slice(at));
    if (!m) break;
    at += m[0].length;
  }
  return at;
}

interface ItemLine {
  node: SyntaxNode; // the ListItem
  line: Line;
  depth: number; // the quotes it's in
  indent: number; // column of the marker, after the quote markers
  content: number; // column of the text
  num?: { from: number; to: number; value: number }; // an ordered item's number
}

// itemLine is the list item starting on line (in quotes or not), or null.
function itemLine(state: EditorState, line: Line): ItemLine | null {
  const quote = quoteMarks(line.text, Infinity);
  const m = itemRe.exec(line.text.slice(quote));
  if (!m) return null;
  const start = line.from + quote + m[1].length;
  const mark = syntaxTree(state).resolveInner(start, 1);
  const node = mark.name === "ListMark" ? mark.parent : null;
  if (node?.name !== "ListItem" || state.doc.lineAt(node.from).number !== line.number) return null;
  let depth = 0;
  for (let p = node.parent; p; p = p.parent) if (p.name === "Blockquote") depth++;
  if (quoteMarks(line.text, depth) !== quote) return null;
  const indent = columns(m[1]);
  const markWidth = m[0].length - m[1].length - m[4].length;
  const space = columns(m[4]);
  return {
    node,
    line,
    depth,
    indent,
    content: indent + markWidth + (space === 0 || space > 4 ? 1 : space),
    num: m[2] ? { from: start, to: start + m[2].length, value: Number(m[2]) } : undefined,
  };
}

function itemAt(state: EditorState, node: SyntaxNode | null): ItemLine | null {
  return node?.name === "ListItem" ? itemLine(state, state.doc.lineAt(node.from)) : null;
}

// pastQuoteMarks steps over the quote markers the parse tree puts between a
// quoted list's items.
function pastQuoteMarks(n: SyntaxNode | null, back: boolean): SyntaxNode | null {
  while (n?.name === "QuoteMark") n = back ? n.prevSibling : n.nextSibling;
  return n;
}

// indentList nests the list item the selection starts on under the one
// before it (more) or lifts it out to its parent's level (!more), with its
// sub-items and the selected lines after it. Numbers follow: a nested item
// carries on the sub-list it joins, or starts one at 1. Off a list item it
// indents the lines as CodeMirror does; the first item and a top-level one
// can't move, and stay.
function indentList(view: EditorView, more: boolean): boolean {
  const { state } = view;
  const lines = selectedLines(state);
  const userEvent = more ? "input.indent" : "delete.dedent";
  const it = lines.length ? itemLine(state, lines[0]) : null;
  if (!it) {
    const indent = more ? indentMore : indentLess;
    const body = state.field(frontMatterEnd);
    const { from, to } = state.selection.main;
    if (!lines.length || from >= body) return indent(view);
    // From where the text begins.
    return indent({
      state: state.update({ selection: { anchor: body, head: to } }).state,
      dispatch: (tr) => view.dispatch({ changes: tr.changes, userEvent }),
    });
  }

  let target: number;
  let number: number | undefined;
  const changes: ChangeSpec[] = [];
  if (more) {
    const prev = itemAt(state, pastQuoteMarks(it.node.prevSibling, true));
    if (!prev) return true;
    // Joining a sub-list the item before already has.
    const sub = pastQuoteMarks(prev.node.lastChild, true);
    const subLast = /List$/.test(sub?.name ?? "")
      ? itemAt(state, pastQuoteMarks(sub!.lastChild, true))
      : null;
    target = subLast?.indent ?? prev.content;
    number = subLast?.num ? subLast.num.value + 1 : 1;
  } else {
    const parent = itemAt(state, it.node.parent?.parent ?? null);
    if (!parent) return true;
    target = parent.indent;
    number = parent.num ? parent.num.value + 1 : 1;
    // The items after it in its sub-list become its own, starting at 1.
    const next = itemAt(state, pastQuoteMarks(it.node.nextSibling, false));
    if (next?.num) changes.push({ from: next.num.from, to: next.num.to, insert: "1" });
  }
  if (it.num) changes.push({ from: it.num.from, to: it.num.to, insert: String(number) });

  const delta = target - it.indent;
  const last = Math.max(lines.at(-1)!.number, state.doc.lineAt(it.node.to).number);
  for (let n = it.line.number; n <= last; n++) {
    const line = state.doc.line(n);
    const from = line.from + quoteMarks(line.text, it.depth);
    const ws = /^[ \t]*/.exec(state.sliceDoc(from, line.to))![0];
    if (from + ws.length === line.to) continue;
    const insert = " ".repeat(Math.max(0, columns(ws) + delta));
    if (insert !== ws) changes.push({ from, to: from + ws.length, insert });
  }
  view.dispatch({ changes, userEvent });
  return true;
}

export const indentListMore = (view: EditorView) => indentList(view, true);
export const indentListLess = (view: EditorView) => indentList(view, false);

// toggleCodeBlock fences the selected lines, or removes the fences around
// the code block the cursor is in.
export function toggleCodeBlock(view: EditorView) {
  const state = view.state;
  const lines = selectedLines(state);
  const a = lines[0];
  if (!a) return;
  // From the line's end: in a list or quote the fence follows its marker.
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(a.to, -1); n; n = n.parent) {
    if (n.name !== "FencedCode") continue;
    const open = state.doc.lineAt(n.from);
    const close = state.doc.lineAt(n.to);
    const last = n.lastChild;
    const closed = close.number > open.number && last?.name === "CodeMark" && last.from > n.from;
    // The opening fence goes with the next line's markers up to its column (a
    // list item's indent, a quote's `>`), its own staying: the code joins the
    // item or quote it was in. A block of only its fence takes nothing more.
    let openTo = open.to;
    if (close.number > open.number) {
      const next = state.doc.line(open.number + 1);
      openTo = next.from + Math.min(n.from - open.from, /^[ \t>]*/.exec(next.text)![0].length);
    }
    const changes = !closed
      ? [{ from: n.from, to: openTo }]
      : close.number === open.number + 1
        ? [{ from: n.from, to: close.to }]
        : [
            { from: n.from, to: openTo },
            { from: close.from - 1, to: close.to },
          ];
    view.dispatch({ changes, userEvent: "input.format" });
    view.focus();
    return;
  }
  const b = lines[lines.length - 1];
  const body = state.sliceDoc(a.from, b.to);
  // Longer than any fence in it, which would close it early.
  const fence = "`".repeat(
    Math.max(3, ...[...body.matchAll(/^ {0,3}(`{3,})/gm)].map((m) => m[1].length + 1)),
  );
  insertBlock(view, `${fence}\n${body}\n${fence}`, {
    replace: { from: a.from, to: b.to },
    cursorOffset: fence.length + 1,
  });
}

// insertBlock puts text in a paragraph of its own at the cursor (or in place
// of replace), with blank lines around it, and returns where it starts. text
// may depend on where that is. From within the front matter it goes after it.
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
    let pos = Math.max(opts.at ?? state.selection.main.head, state.field(frontMatterEnd));
    // Not into a code block, display equation or table (its indentation
    // too): after it.
    const end = state.doc.lineAt(pos).to;
    const tree = ensureSyntaxTree(state, end, 200) ?? syntaxTree(state);
    for (let n: SyntaxNode | null = tree.resolveInner(end, -1); n; n = n.parent) {
      if ((blockCode.has(n.name) || n.name === "Table") && state.doc.lineAt(n.from).from < pos)
        pos = Math.max(pos, n.to);
    }
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

// insertDivider puts a divider at the cursor: `---`, or `***` where `---`
// would make front matter of the text above it: at the very start of the
// document, or below a `---` the document opens with.
export function insertDivider(view: EditorView) {
  const { state } = view;
  const opened = !state.field(frontMatterEnd) && state.doc.line(1).text === "---";
  insertBlock(view, (start) => (start === 0 || opened ? "***" : "---"));
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

// insertFootnote adds a footnote reading text: a numbered mark at the
// cursor, and its note with the others, in order, renumbering the notes
// after it. The cursor stays after the mark.
export function insertFootnote(view: EditorView, text: string) {
  const fn = view.state.field(footnotesField);
  const used = [...fn.marks, ...fn.notes].map((x) => x.label).filter((l) => /^\d+$/.test(l));
  const label = String(Math.max(0, ...used.map(Number)) + 1);
  const pos = Math.max(view.state.selection.main.head, view.state.field(frontMatterEnd));
  addNote(view, label, pos, true, text);
}

// noteText is label's note as the footnote dialog edits it: its lines
// unindented. "" when there's no note.
export function noteText(view: EditorView, label: string): string {
  const note = view.state.field(footnotesField).notes.find((n) => n.label === label);
  return note ? note.text.replace(/\n( {4}|\t)/g, "\n") : "";
}

// writeNote sets the note for label's mark to text: rewriting its note, or
// adding one if it has none.
export function writeNote(view: EditorView, label: string, text: string) {
  const { marks, notes } = view.state.field(footnotesField);
  const note = notes.find((n) => n.label === label);
  if (note) {
    view.dispatch({
      changes: {
        from: note.textFrom,
        to: Math.max(note.to, note.textFrom),
        insert: noteBody(text),
      },
      userEvent: "input",
      filter: false, // past the focus guard: the note may be outside the section shown
    });
    view.focus();
    return;
  }
  const mark =
    marks.find((m) => m.label === label && !m.inNote) ?? marks.find((m) => m.label === label);
  if (mark) addNote(view, label, mark.to, false, text);
}

// noteBody is text as a note's Markdown: lines after the first indented, to
// stay in the note.
function noteBody(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((l, i) => (i === 0 || !l.trim() ? l.trimEnd() : `    ${l.trimEnd()}`))
    .join("\n");
}

// addNote adds a note for label reading text (and its mark at pos, if
// mark): after the note of the nearest mark before pos, or before the first
// note, or at the end, then renumbers. The cursor stays where it is, or after
// the new mark.
function addNote(view: EditorView, label: string, pos: number, mark: boolean, text: string) {
  const state = view.state;
  const { marks, notes } = state.field(footnotesField);
  const head = `[^${label}]: ${noteBody(text)}`;
  // Right after a closing front matter fence, on a line of its own.
  const body = state.field(frontMatterEnd);
  const open = pos > 0 && pos === body && state.sliceDoc(pos - 1, pos) !== "\n";
  const markText = `${open ? "\n" : ""}[^${label}]`;
  const prev = marks.filter(
    (m) => !m.inNote && m.to <= pos && m.label !== label && notes.some((n) => n.label === m.label),
  );
  const after = prev.length
    ? notes.find((n) => n.label === prev[prev.length - 1].label)
    : undefined;
  let at: number;
  let note: string;
  if (after) {
    at = after.to;
    note = `\n\n${head}`;
  } else if (notes.length) {
    at = notes[0].from;
    note = `${head}\n\n`;
  } else {
    const doc = state.doc.toString();
    at = doc.length;
    note = `${doc.endsWith("\n\n") ? "" : doc.endsWith("\n") ? "\n" : "\n\n"}${head}`;
  }
  const added = state.changes([
    ...(mark ? [{ from: pos, insert: markText }] : []),
    { from: at, insert: note },
  ]);
  const doc = added.apply(state.doc);
  const renumbered = ChangeSet.of(renumberFootnotes(doc.toString()), doc.length);
  // After the mark, which may share pos with the note (at the end).
  const markEnd = mark ? renumbered.mapPos(added.mapPos(pos, -1) + markText.length, 1) : 0;
  view.dispatch({
    changes: added.compose(renumbered),
    selection: mark ? { anchor: markEnd } : state.selection.map(added.compose(renumbered)),
    userEvent: "input",
    filter: false, // past the focus guard: the note may be outside the section shown
  });
  view.focus();
}

// inlineMath wraps text selected within a line as math ($…$), and tells
// whether it did: with no such selection, one in the front matter, code or
// math, or one that `$…$` wouldn't read whole (holding a `$`, ending in a
// `\`, a digit right after), nothing happens.
export function inlineMath(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const text = doc.sliceString(from, to);
  const tex = text.trim();
  if (!tex || doc.lineAt(from).number !== doc.lineAt(to).number) return false;
  if (from < view.state.field(frontMatterEnd)) return false;
  // Not in code or math, where the dollars would be text.
  const tree = ensureSyntaxTree(view.state, to, 200) ?? syntaxTree(view.state);
  for (let n: SyntaxNode | null = tree.resolveInner(from, 1); n; n = n.parent) {
    if (codeNodes.has(n.name) && n.from <= from && n.to >= to) return false;
  }
  // Math can't start or end with a space: keep any outside the dollars.
  const lead = text.indexOf(tex);
  // Read as the math parser reads it: a backslash escapes what follows.
  const bare = tex.replace(/\\[^]/g, "");
  const end = from + lead + tex.length;
  if (bare.includes("$") || bare.endsWith("\\") || /\d/.test(doc.sliceString(end, end + 1)))
    return false;
  const start = from + lead + 1;
  view.dispatch({
    changes: { from: from + lead, to: from + lead + tex.length, insert: `$${tex}$` },
    selection: { anchor: start, head: start + tex.length },
    userEvent: "input",
  });
  view.focus();
  return true;
}
