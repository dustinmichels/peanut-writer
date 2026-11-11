// Footnotes: their marks and notes, renumbered and gathered at the end.

import {
  type Block,
  type ParaLine,
  delimiterColumns,
  footnoteLabel,
  htmlAttr,
  readBlocks,
  splitParagraph,
} from "./blocks";
import { readFrontMatter } from "./frontMatter";
import { hiddenAlts, masked } from "./items";
import { type Restarts, reread, splice } from "./restart";

// A footnote mark in the text: `[^label]`.
export interface FootnoteMark {
  label: string;
  from: number;
  to: number;
  inNote: boolean; // in a note's own text
  // What it reads as: marks with a note, outside notes, count 1, 2, 3… in
  // order, each its own footnote (a note marked twice is printed twice), as
  // the Typst, Word and web outputs number them. 0 for the rest.
  number: number;
}

// A footnote's note: `[^label]: text`, with the indented lines after it.
export interface FootnoteNote {
  label: string;
  from: number; // start of its first line
  labelFrom: number;
  textFrom: number; // after `[^label]: `
  to: number; // end of its last line with text
  line: number; // 1-based line of `from`
  text: string; // as written
}

export interface Footnotes {
  marks: FootnoteMark[];
  notes: FootnoteNote[]; // those at the top level, which the editor keeps at the end
}

// A note inside a list, quote or another note: it gives marks their numbers
// like any other, but stays where it is.
export interface NestedNote {
  label: string;
  from: number; // its `[`
}

// A reading of the footnotes, and where it can be read again from after an
// edit.
export interface FootnoteScan extends Footnotes {
  nested: NestedNote[];
  restarts: Restarts;
}

type Read = Omit<FootnoteScan, "restarts">;

// A mark: its label as goldmark reads it, on one line.
const footMark = new RegExp(String.raw`\[\^${footnoteLabel}\]`, "g");
// Raw HTML and autolinks in text, which hold no marks.
const rawHTML = new RegExp(
  String.raw`<!--->|<!-->|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![A-Za-z][^>]*>|<!\[CDATA\[[\s\S]*?\]\]>|<[A-Za-z][A-Za-z0-9-]*${htmlAttr}*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>|<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>`,
  "g",
);
// Lines that start a block of their own rather than carry on a paragraph.
export const blockStart = /^\s{0,3}(?:[#>|]|[-*+]\s|\d+[.)]\s|```|~~~|\$\$|(?:[-*_]\s*){3,}$)/;

// scanFootnotes finds the footnote marks and notes as goldmark reads them:
// in paragraphs, headings and table cells, in lists, quotes and notes, but
// not in code, math, HTML or the alt text of a picture that isn't a figure.
export function scanFootnotes(text: string): FootnoteScan {
  const fm = readFrontMatter(text).to;
  const restarts: Restarts = { at: [], line: [] };
  let line = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < fm; i = text.indexOf("\n", i + 1)) line++;
  const read = readFootnotes(text, fm, line, (at, l) => {
    restarts.at.push(at);
    restarts.line.push(l);
    return false;
  });
  return { ...numbered(read), restarts };
}

// rescanFootnotes reads text again after the edit that made it from the
// text prev read: fromA–toA of that text became fromA–toB.
export function rescanFootnotes(
  prev: FootnoteScan,
  text: string,
  fromA: number,
  toA: number,
  toB: number,
): FootnoteScan {
  // The front matter is where reading starts, the first restart point.
  if (readFrontMatter(text).to !== prev.restarts.at[0]) return scanFootnotes(text);
  let fresh: Read = { marks: [], notes: [], nested: [] };
  const r = reread(prev.restarts, fromA, toA, toB, (from, line, point) => {
    fresh = readFootnotes(text, from, line, point);
  });
  if (!r) return scanFootnotes(text);
  const { shift, lines } = r;
  const marks = splice(prev.marks, fresh.marks, r, (m) => ({
    ...m,
    from: m.from + shift,
    to: m.to + shift,
  }));
  const notes = splice(prev.notes, fresh.notes, r, (n) => ({
    ...n,
    from: n.from + shift,
    labelFrom: n.labelFrom + shift,
    textFrom: n.textFrom + shift,
    to: n.to + shift,
    line: n.line + lines,
  }));
  const nested = splice(prev.nested, fresh.nested, r, (n) => ({ ...n, from: n.from + shift }));
  return { ...numbered({ marks, notes, nested }), restarts: r.restarts };
}

// numbered numbers the marks outside notes that have a note.
function numbered({ marks, notes, nested }: Read): Read {
  const noted = new Set([...notes, ...nested].map((n) => n.label));
  let n = 0;
  return {
    marks: marks.map((m) => {
      const number = !m.inNote && noted.has(m.label) ? ++n : 0;
      return m.number === number ? m : { ...m, number };
    }),
    notes,
    nested,
  };
}

// Text read inline as one: a paragraph's lines, a heading's, a table cell.
type Span = Pick<ParaLine, "text" | "from">;

// readFootnotes reads the marks and notes from offset from, the start of
// 0-based line first, unnumbered, from the blocks readBlocks reads (calling
// point as it does).
function readFootnotes(
  text: string,
  from: number,
  first: number,
  point: (at: number, line: number) => boolean,
): Read {
  const read: Read = { marks: [], notes: [], nested: [] };
  // marksIn reads the marks in spans, joined by line breaks: not in code
  // spans, math or HTML, nor in the alt texts internal/doc leaves out (all of
  // them in a heading or table cell).
  const marksIn = (spans: Span[], inNote: boolean, everyAlt: boolean) => {
    const s = spans.length === 1 ? spans[0].text : spans.map((x) => x.text).join("\n");
    if (!s.includes("[^")) return;
    const hidden = hiddenAlts(s, everyAlt);
    let m = masked(s);
    if (m.includes("<")) m = m.replace(rawHTML, (h) => h.replace(/[[\]\\]/g, "\u0001"));
    let k = 0;
    let base = 0; // where spans[k] starts in s
    for (const x of m.matchAll(footMark)) {
      const at = x.index;
      let escapes = 0;
      while (m[at - 1 - escapes] === "\\") escapes++;
      if (escapes % 2 || hidden.some(([a, b]) => at >= a && at < b)) continue;
      while (at > base + spans[k].text.length) base += spans[k++].text.length + 1;
      const src = spans[k].from + at - base;
      const label = s.slice(at + 2, at + x[0].length - 1);
      read.marks.push({ label, from: src, to: src + x[0].length, inNote, number: 0 });
    }
  };
  // A table's cells, as goldmark splits its rows (cut to the delimiter
  // row's columns).
  const tableMarks = (rows: ParaLine[], inNote: boolean) => {
    const cols = delimiterColumns(rows[1].text, true);
    for (let r = 0; r < rows.length; r++) {
      if (r === 1 || !rows[r].text.includes("[^")) continue;
      const { text: row, from: rowFrom } = rows[r];
      let pos = row[0] === "|" ? 1 : 0;
      const limit = row.trimEnd().endsWith("|") ? row.trimEnd().length - 1 : row.length;
      for (let c = 0; c < cols && pos < limit; c++) {
        let end = pos;
        while (end < limit && !(row[end] === "|" && row[end - 1] !== "\\")) end++;
        marksIn([{ text: row.slice(pos, end), from: rowFrom + pos }], inNote, true);
        pos = end + 1;
      }
    }
  };
  const visit = (blocks: Block[], inNote: boolean, top: boolean) => {
    for (const b of blocks) {
      if (b.type === "paragraph") {
        const { text: lines, table } = splitParagraph(b.lines, b.underlined);
        // An underlined paragraph is a heading after its table.
        if (!b.heading) marksIn(lines, inNote, false);
        if (table) tableMarks(table, inNote);
        if (b.heading) marksIn(lines, inNote, true);
      } else if (b.type === "heading") marksIn([b.line], inNote, true);
      else if (b.type === "quote" || b.type === "item") visit(b.children, inNote, false);
      else if (b.type === "note") {
        const n = b.note!;
        if (top) read.notes.push({ ...n, line: b.line + 1, text: "" });
        else read.nested.push({ label: n.label, from: n.from });
        visit(b.children, true, false);
      }
    }
  };
  visit(readBlocks(text, from, first, point).children, false, true);
  for (const x of read.notes) x.text = text.slice(x.textFrom, Math.max(x.to, x.textFrom));
  return read;
}

// renumberFootnotes relabels numbered footnotes 1, 2, 3… in the order their
// marks come, then notes nothing marks, then marks with no note; named ones
// (`[^source]`) stay.
export function renumberFootnotes(text: string): { from: number; to: number; insert: string }[] {
  const { marks, notes } = scanFootnotes(text);
  const noted = new Set(notes.map((n) => n.label));
  const next = new Map<string, string>();
  for (const l of [
    ...marks.filter((m) => noted.has(m.label)).map((m) => m.label),
    ...notes.map((n) => n.label),
    ...marks.map((m) => m.label),
  ]) {
    if (/^\d+$/.test(l) && !next.has(l)) next.set(l, String(next.size + 1));
  }
  const changes: { from: number; to: number; insert: string }[] = [];
  const relabel = (label: string, from: number) => {
    const to = next.get(label);
    if (to && to !== label) changes.push({ from, to: from + label.length, insert: to });
  };
  for (const m of marks) relabel(m.label, m.from + 2);
  for (const n of notes) relabel(n.label, n.labelFrom);
  return changes.sort((a, b) => a.from - b.from);
}

// gatherFootnotes moves the notes to the end of the text, after all else, in
// the order their marks come (notes nothing in the text marks last), where
// the editor keeps them. Nothing moves while cursor is in a note or the blank
// lines after it, being written, nor if they're all there already.
export function gatherFootnotes(
  text: string,
  cursor = -1,
  { marks, notes }: Footnotes = scanFootnotes(text),
): { from: number; to: number; insert: string }[] {
  if (!notes.length) return [];
  const len = text.length;
  // Each note's span: to the start of the next line with text, or the end.
  const ws = /\s*/y;
  const ends: number[] = [];
  for (const n of notes) {
    ws.lastIndex = n.to;
    ws.exec(text);
    const next = ws.lastIndex;
    if (cursor >= n.from && cursor <= next) return [];
    ends.push(next === len ? len : text.lastIndexOf("\n", next - 1) + 1);
  }
  // The notes already at the end, with only blank lines between them.
  let tail = notes.length;
  while (tail > 0 && ends[tail - 1] === (tail === notes.length ? len : notes[tail].from)) tail--;
  const first = new Map<string, number>();
  for (const m of marks) if (!m.inNote && !first.has(m.label)) first.set(m.label, m.from);
  const sorted = notes
    .map((n) => ({ n, at: first.get(n.label) ?? Infinity }))
    .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1))
    .map((x) => x.n);
  if (tail === 0 && sorted.every((n, i) => n === notes[i])) return [];

  const changes: { from: number; to: number; insert: string }[] = [];
  for (let i = 0; i < tail; i++) {
    // Keep a blank line between the text above and below.
    const from = notes[i].from;
    const tight = from > 1 && text[from - 2] !== "\n" && ends[i] < len;
    changes.push({ from, to: ends[i], insert: tight ? "\n" : "" });
  }
  let end = tail < notes.length ? notes[tail].from : len;
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  const block = sorted.map((n) => text.slice(n.from, n.to)).join("\n\n");
  changes.push({ from: end, to: len, insert: `${end > 0 ? "\n\n" : ""}${block}\n` });
  return changes;
}
