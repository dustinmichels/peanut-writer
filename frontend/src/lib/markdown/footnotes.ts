// Footnotes: their marks and notes, renumbered and gathered at the end.

import { type Fence, displayMathClose, displayMathStart, fenceCloses, fenceOpen } from "./fences";
import { readFrontMatter } from "./frontMatter";

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
  notes: FootnoteNote[];
}

const noteHead = /^( {0,3})\[\^([^\]\s]+)\]:[ \t]?/;
const footMark = /\[\^([^\]\s]+)\]/g;
// Code spans and inline math, which hold no marks.
const codeOrMath = /(`+)[\s\S]*?\1|\$\$?(?:\\.|[^$\\])+\$\$?/g;
// Lines that start a block of their own rather than carry on a paragraph.
export const blockStart = /^\s{0,3}(?:[#>|]|[-*+]\s|\d+[.)]\s|```|~~~|\$\$|(?:[-*_]\s*){3,}$)/;

// scanFootnotes finds the footnote marks and notes outside code and math, as
// goldmark reads them: a note runs on through blank and indented lines (and
// lines straight after its text), to a line that isn't.
export function scanFootnotes(text: string): Footnotes {
  const lines = text.split("\n");
  const marks: FootnoteMark[] = [];
  const notes: FootnoteNote[] = [];
  const fm = readFrontMatter(text).to;
  let note: FootnoteNote | null = null;
  let afterBlank = false;
  let inFence: Fence | null = null;
  let inMath = false;
  for (let i = 0, start = 0; i < lines.length; start += lines[i].length + 1, i++) {
    const line = lines[i];
    if (start < fm) continue;
    const blank = line.trim() === "";
    const indented = /^( {4}|\t)/.test(line);
    const head = inFence || inMath ? null : noteHead.exec(line);
    if (note) {
      if (blank) {
        afterBlank = true;
        continue;
      }
      const lazy = !afterBlank && !head && !inFence && !inMath && !blockStart.test(line);
      if (indented || lazy) note.to = start + line.length;
      else note = null;
    }
    afterBlank = false;
    if (head && !note) {
      note = {
        label: head[2],
        from: start,
        labelFrom: start + head[1].length + 2,
        textFrom: start + head[0].length,
        to: start + line.length,
        line: i + 1,
        text: "",
      };
      notes.push(note);
    }
    // A note's blocks are indented by four.
    const body = note && indented ? line.replace(/^( {4}|\t)/, "") : line;
    if (inFence) {
      if (fenceCloses(body, inFence)) inFence = null;
      continue;
    }
    inFence = fenceOpen(body);
    if (inFence) continue;
    if (inMath) {
      if (displayMathClose(body, 0)) inMath = false;
      continue;
    }
    const math = displayMathStart(body);
    if (math >= 0) {
      inMath = !displayMathClose(body, math + 2);
      continue;
    }
    const masked = line.replace(codeOrMath, (s) => " ".repeat(s.length));
    const from = head && note?.from === start ? head[0].length : 0;
    for (const m of masked.slice(from).matchAll(footMark)) {
      const at = from + m.index!;
      if (masked[at - 1] === "\\") continue;
      marks.push({
        label: m[1],
        from: start + at,
        to: start + at + m[0].length,
        inNote: !!note,
        number: 0,
      });
    }
  }
  const noted = new Set(notes.map((n) => n.label));
  let n = 0;
  for (const m of marks) if (!m.inNote && noted.has(m.label)) m.number = ++n;
  for (const x of notes) x.text = text.slice(x.textFrom, Math.max(x.to, x.textFrom));
  return { marks, notes };
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
