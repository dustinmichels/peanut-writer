// Editing commands for the ribbon and the keyboard: inline styles, block
// styles, lists, code blocks, and inserting blocks, footnotes and inline math.

import { indentLess, indentMore } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import {
  ChangeSet,
  type ChangeSpec,
  EditorSelection,
  EditorState,
  type Line,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { renumberFootnotes } from "@/lib/markdown";
import { footnotesField } from "./fields";

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
        // Its marks as written (`__` too, or a run of backticks).
        const open = n.firstChild;
        const close = n.lastChild;
        if (open && close && open.to <= close.from && open.name === close.name) {
          const changes = state.changes([
            { from: open.from, to: open.to },
            { from: close.from, to: close.to },
          ]);
          return { changes, range: range.map(changes) };
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

// clearFormatting removes bold, italic, strikethrough, highlight and code
// marks from the selection.
export function clearFormatting(view: EditorView) {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  // Not underscores: they're more often in names than marks.
  const text = view.state
    .sliceDoc(from, to)
    .replace(/(\*\*|~~|==|\*|`)(?=\S)([\s\S]*?\S)\1/g, "$2");
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

// selectedLines are the lines the selection touches, but not the one it ends
// at the start of (as selecting whole lines leaves it).
function selectedLines(state: EditorState) {
  const lines: Line[] = [];
  const { from, to } = state.selection.main;
  const end = to > from && state.doc.lineAt(to).from === to ? to - 1 : to;
  for (let p = state.doc.lineAt(from).from; p <= end;) {
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
  const lines = selectedLines(view.state);
  // Blank lines between the selected paragraphs stay blank, not empty headings.
  const changes = lines
    .filter((line) => style[0] !== "h" || lines.length === 1 || line.text.trim() !== "")
    .map((line) => {
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

// A list item's first line, unquoted: its indentation, marker and the space
// after it.
const itemRe = /^([ \t]*)(?:[-*+]|(\d+)([.)]))([ \t]*)/;

// columns counts the width of white space, a tab running to the next
// multiple of four.
function columns(ws: string): number {
  let c = 0;
  for (const ch of ws) c = ch === "\t" ? c + 4 - (c % 4) : c + 1;
  return c;
}

interface ItemLine {
  node: SyntaxNode; // the ListItem
  line: Line;
  indent: number; // column of the marker
  content: number; // column of the text
  num?: { from: number; to: number; value: number }; // an ordered item's number
}

// itemLine is the list item starting on line, outside quotes, or null.
function itemLine(state: EditorState, line: Line): ItemLine | null {
  const m = itemRe.exec(line.text);
  if (!m) return null;
  const mark = syntaxTree(state).resolveInner(line.from + m[1].length, 1);
  const node = mark.name === "ListMark" ? mark.parent : null;
  if (node?.name !== "ListItem" || state.doc.lineAt(node.from).number !== line.number) return null;
  const indent = columns(m[1]);
  const markWidth = m[0].length - m[1].length - m[4].length;
  const space = columns(m[4]);
  const numFrom = line.from + m[1].length;
  return {
    node,
    line,
    indent,
    content: indent + markWidth + (space === 0 || space > 4 ? 1 : space),
    num: m[2] ? { from: numFrom, to: numFrom + m[2].length, value: Number(m[2]) } : undefined,
  };
}

function itemAt(state: EditorState, node: SyntaxNode | null): ItemLine | null {
  return node?.name === "ListItem" ? itemLine(state, state.doc.lineAt(node.from)) : null;
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
  const it = itemLine(state, lines[0]);
  if (!it) return more ? indentMore(view) : indentLess(view);

  let target: number;
  let number: number | undefined;
  const changes: ChangeSpec[] = [];
  if (more) {
    const prev = itemAt(state, it.node.prevSibling);
    if (!prev) return true;
    // Joining a sub-list the item before already has.
    const sub = prev.node.lastChild;
    const subLast = /List$/.test(sub?.name ?? "") ? itemAt(state, sub!.lastChild) : null;
    target = subLast?.indent ?? prev.content;
    number = subLast?.num ? subLast.num.value + 1 : 1;
  } else {
    const parent = itemAt(state, it.node.parent?.parent ?? null);
    if (!parent) return true;
    target = parent.indent;
    number = parent.num ? parent.num.value + 1 : 1;
    // The items after it in its sub-list become its own, starting at 1.
    const next = itemAt(state, it.node.nextSibling);
    if (next?.num) changes.push({ from: next.num.from, to: next.num.to, insert: "1" });
  }
  if (it.num) changes.push({ from: it.num.from, to: it.num.to, insert: String(number) });

  const delta = target - it.indent;
  const last = Math.max(lines.at(-1)!.number, state.doc.lineAt(it.node.to).number);
  for (let n = it.line.number; n <= last; n++) {
    const line = state.doc.line(n);
    const ws = /^[ \t]*/.exec(line.text)![0];
    if (ws.length === line.length) continue;
    const insert = " ".repeat(Math.max(0, columns(ws) + delta));
    if (insert !== ws) changes.push({ from: line.from, to: line.from + ws.length, insert });
  }
  view.dispatch({ changes, userEvent: more ? "input.indent" : "delete.dedent" });
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

// insertFootnote adds a footnote reading text: a numbered mark at the
// cursor, and its note with the others, in order, renumbering the notes
// after it. The cursor stays after the mark.
export function insertFootnote(view: EditorView, text: string) {
  const fn = view.state.field(footnotesField);
  const used = [...fn.marks, ...fn.notes].map((x) => x.label).filter((l) => /^\d+$/.test(l));
  const label = String(Math.max(0, ...used.map(Number)) + 1);
  addNote(view, label, view.state.selection.main.head, true, text);
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
    ...(mark ? [{ from: pos, insert: `[^${label}]` }] : []),
    { from: at, insert: note },
  ]);
  const doc = added.apply(state.doc);
  const renumbered = ChangeSet.of(renumberFootnotes(doc.toString()), doc.length);
  // After the mark, which may share pos with the note (at the end).
  const markEnd = mark ? renumbered.mapPos(added.mapPos(pos, -1) + `[^${label}]`.length, 1) : 0;
  view.dispatch({
    changes: added.compose(renumbered),
    selection: mark ? { anchor: markEnd } : state.selection.map(added.compose(renumbered)),
    userEvent: "input",
  });
  view.focus();
}

// inlineMath wraps text selected within a line as math ($…$), and tells
// whether it did: with no such selection, nothing happens.
export function inlineMath(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const text = doc.sliceString(from, to);
  const tex = text.trim();
  if (!tex || doc.lineAt(from).number !== doc.lineAt(to).number) return false;
  // Math can't start or end with a space: keep any outside the dollars.
  const lead = text.indexOf(tex);
  const start = from + lead + 1;
  view.dispatch({
    changes: { from: from + lead, to: from + lead + tex.length, insert: `$${tex}$` },
    selection: { anchor: start, head: start + tex.length },
    userEvent: "input",
  });
  view.focus();
  return true;
}
