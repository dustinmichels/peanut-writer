// Block structure, read as goldmark reads it.

import { type Fence, displayMathClose, fenceCloses, fenceOpen } from "./fences";
import { trimEnd } from "./space";

// scan reads the blocks the way goldmark (internal/doc's Markdown parser)
// does, closely enough to find the same figures, tables and equations: block
// quotes, list items and footnotes hold blocks of their own (lazily continued
// paragraphs included), and code, HTML and headings hold nothing that counts.

// Cursor walks a line, counting columns (a tab runs to the next multiple of
// four) so indentation can be taken a column at a time.
class Cursor {
  pos = 0;
  col = 0;
  virt = 0; // columns left of a tab only partly taken
  private readonly textEnd: number; // the end of the line's last non-space
  constructor(readonly s: string) {
    this.textEnd = trimEnd(s).length;
  }
  get rest(): string {
    return this.s.slice(this.pos);
  }
  get blank(): boolean {
    return this.pos >= this.textEnd;
  }
  column(): number {
    return this.col - this.virt;
  }
  // indent is the columns of white space ahead, counted up to max (a deeply
  // indented line is read once per open container).
  indent(max = Infinity): number {
    let w = this.virt;
    let col = this.col;
    for (let i = this.pos; i < this.s.length && w < max; i++) {
      const t = this.s[i] === " " ? 1 : this.s[i] === "\t" ? 4 - (col % 4) : 0;
      if (!t) break;
      w += t;
      col += t;
    }
    return w;
  }
  // peek is the character after the white space ahead.
  peek(): string | undefined {
    let i = this.pos;
    while (this.s[i] === " " || this.s[i] === "\t") i++;
    return this.s[i];
  }
  // skip takes n columns of white space.
  skip(n: number) {
    while (n > 0) {
      if (this.virt) {
        const k = Math.min(this.virt, n);
        this.virt -= k;
        n -= k;
        continue;
      }
      const c = this.s[this.pos];
      const t = c === " " ? 1 : c === "\t" ? 4 - (this.col % 4) : 0;
      if (!t) return;
      this.pos++;
      this.col += t;
      if (t > n) this.virt = t - n;
      n -= Math.min(t, n);
    }
  }
  skipSpace() {
    this.skip(this.indent());
  }
  advance(n: number) {
    this.pos += n;
    this.col += n;
    this.virt = 0;
  }
  // recount sets col from the line's start, after columns were counted from
  // elsewhere.
  recount() {
    let col = 0;
    for (let i = 0; i < this.pos; i++) col = this.s[i] === "\t" ? col + 4 - (col % 4) : col + 1;
    this.col = col;
  }
}

// A line of a paragraph.
export interface ParaLine {
  text: string; // from its first non-space
  indent: number; // columns of space before text
  from: number; // where text starts
  lineFrom: number; // where its line starts
  to: number; // end of the line
  line: number; // 0-based
}

export interface Paragraph {
  type: "paragraph";
  lines: ParaLine[];
  prefix?: string; // see Item
  underlined?: boolean; // followed by `---` or `===`, which reads its table
  heading?: boolean; // underlined, with text left over: a heading
}

interface TableBlock {
  type: "table";
  lines: ParaLine[]; // header, delimiter row, rows
  prefix?: string;
}

interface Equation {
  type: "equation";
  from: number;
  to: number;
  line: number; // 0-based
  tex: string;
  attrs: string;
  closed: boolean;
  prefix?: string;
}

// A footnote's note, from its first line `[^label]: text`.
export interface NoteHead {
  label: string;
  from: number; // its line's start at the top level; its `[` inside a list, quote or note
  labelFrom: number;
  textFrom: number; // after `[^label]: `
  to: number; // end of its last line with text
}

interface Container {
  type: "root" | "quote" | "item" | "note";
  indent: number; // columns its lines' text is indented by (item, note)
  children: Block[];
  empty: boolean; // item: nothing in it yet
  marker?: string; // item: `-`, `*`, `+`, `.` or `)`
  line: number; // 0-based line it starts on
  note?: NoteHead;
}

// A `#` heading: its line.
interface Heading {
  type: "heading";
  line: ParaLine;
}

export type Block = Paragraph | TableBlock | Equation | Container | Heading | { type: "other" };

// A footnote label as goldmark reads it: to the first `]` not escaped, no
// `[`, on one line.
export const footnoteLabel = String.raw`((?:\\[!-/:-@[-${"`"}{-~]|\\(?![!-/:-@[-${"`"}{-~])|[^[\]\\\n])+)`;
const noteStart = new RegExp(String.raw`^\[\^${footnoteLabel}\]:`);

// What the line being read continues, when it isn't a paragraph.
type Leaf =
  | { type: "paragraph"; node: Paragraph }
  | { type: "equation"; node: Equation }
  | { type: "fence"; fence: Fence }
  | { type: "html"; end: RegExp | null } // null: ends at a blank line
  | { type: "code" };

const blockTags = new Set(
  (
    "address article aside base basefont blockquote body caption center col colgroup dd details " +
    "dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 " +
    "head header hr html iframe legend li link main menu menuitem meta nav noframes ol optgroup " +
    "option p param search section summary table tbody td tfoot th thead title tr track ul"
  ).split(" "),
);
export const htmlAttr = String.raw`(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>${"`"}\x00-\x20]+|'[^']*'|"[^"]*"))?)`;
const htmlTagLine = new RegExp(String.raw`^<(\/ *)?([a-zA-Z][a-zA-Z0-9-]*)(${htmlAttr}*) *\/?> *$`);

// htmlStart reads the start of an HTML block, which runs to a line holding
// end, or to a blank line when end is null. A lone tag of another kind can't
// interrupt a paragraph.
export function htmlStart(line: string, inParagraph: boolean): { end: RegExp | null } | null {
  if (/^<(?:script|pre|style|textarea)(?:\s|\/?>|$)/i.test(line)) {
    return { end: /<\/(?:script|pre|style|textarea)>/i };
  }
  if (line.startsWith("<!--")) return { end: /-->/ };
  if (line.startsWith("<?")) return { end: /\?>/ };
  if (/^<![A-Z]/.test(line)) return { end: />/ };
  if (line.startsWith("<![CDATA[")) return { end: /\]\]>/ };
  const m = htmlTagLine.exec(line);
  if (m) {
    const tag = m[2].toLowerCase();
    if (blockTags.has(tag)) return { end: null };
    if (!inParagraph && !["script", "style", "pre"].includes(tag) && !(m[1] && m[3])) {
      return { end: null };
    }
  }
  const t = /^<(?:\/ *)?([a-zA-Z][a-zA-Z0-9-]*)(?: |\/?>|$)/.exec(line);
  return t && blockTags.has(t[1].toLowerCase()) ? { end: null } : null;
}

// endsList tells whether the rest of a line, from where a list's last
// item's text would start, ends the list in goldmark when that item is
// empty: a marker of another kind, or a rule, after under four spaces.
function endsList(cur: Cursor, marker: string): boolean {
  if (cur.indent(4) > 3) return false;
  const rest = cur.rest;
  const m = /^ *(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$)/.exec(rest);
  if (!m) return false;
  const at = m[0].length - 1;
  return rest[at] !== marker || thematicBreak.test(trimEnd(rest.slice(at)));
}

const thematicBreak = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;

// prefixOf is what begins each further line inside the open containers.
function prefixOf(open: Container[]): string | undefined {
  if (open.length < 2) return undefined;
  return open
    .slice(1)
    .map((c) => (c.type === "quote" ? "> " : " ".repeat(c.indent)))
    .join("");
}

// addEquation takes a line of an equation (after its `$$` on the first),
// closing it when the line ends with `$$` and maybe an attribute block.
function addEquation(eq: Equation, s: string, end: number) {
  const close = displayMathClose(s, 0);
  if (!close) {
    eq.tex += s + "\n";
    return;
  }
  eq.tex += s.slice(0, close.at);
  eq.attrs = close.attrs;
  eq.closed = true;
  eq.to = end;
}

// readBlocks reads the block structure of text from offset from (after the
// front matter, or a restart point), the start of 0-based line first. At
// each line nothing is open before (see restart.ts) it calls point, and
// stops when point returns true.
export function readBlocks(
  text: string,
  from: number,
  first = 0,
  point?: (at: number, line: number) => boolean,
): Container {
  const root: Container = { type: "root", indent: 0, children: [], empty: false, line: 0 };
  const open: Container[] = [root];
  let leaf: Leaf | null = null;
  // A blank line came after a list item with nothing in it: goldmark ends
  // every list at the next line, unless it starts an item.
  let afterEmpty = false;
  // The end of the line before when it has text: the notes still open after
  // it run to there.
  let textEnd = -1;
  const extendNotes = () => {
    for (let k = open.length - 1; k > 0; k--) {
      const note = open[k].note;
      if (note) note.to = textEnd;
    }
  };
  for (let i = first, start = from, next = 0; start <= text.length; i++, start = next) {
    let nl = text.indexOf("\n", start);
    if (nl < 0) nl = text.length;
    next = nl + 1;
    if (textEnd >= 0) extendNotes();
    if (point && open.length === 1 && !leaf && restartable(root) && point(start, i)) break;
    const line = text.slice(start, nl > start && text[nl - 1] === "\r" ? nl - 1 : nl);
    const end = start + line.length;
    const cur = new Cursor(line);
    textEnd = cur.blank ? -1 : end;

    // The containers the line carries on.
    let matched = 1;
    for (; matched < open.length; matched++) {
      const c = open[matched];
      if (c.type === "quote") {
        if (cur.indent(4) > 3 || cur.peek() !== ">") break;
        cur.skipSpace();
        cur.advance(1);
        if (cur.rest[0] === " " || cur.rest[0] === "\t") cur.skip(1);
      } else if (cur.blank) {
        // Blank lines carry on lists and footnotes.
      } else if (
        cur.indent(c.indent) >= c.indent &&
        !(c.type === "item" && (afterEmpty || (c.empty && endsList(cur, c.marker!))))
      ) {
        cur.skip(c.indent);
      } else break;
    }
    if (cur.blank && open.slice(1, matched).some((c) => c.type === "item" && c.empty)) {
      afterEmpty = true;
    }
    const all = matched === open.length;

    // Blocks that take whole lines end with their container.
    if (leaf && leaf.type !== "paragraph") {
      if (!all) leaf = null;
      else if (leaf.type === "fence") {
        if (cur.indent() <= 3 && fenceCloses(cur.rest.trimStart(), leaf.fence)) leaf = null;
        continue;
      } else if (leaf.type === "html") {
        if (leaf.end) {
          if (leaf.end.test(cur.rest)) leaf = null;
          continue;
        }
        if (!cur.blank) continue;
        leaf = null;
      } else if (leaf.type === "equation") {
        addEquation(leaf.node, cur.rest, end);
        if (leaf.node.closed) leaf = null;
        continue;
      } else if (cur.blank || cur.indent() >= 4) continue;
      else leaf = null;
    }

    // New blocks; once one starts, the unmatched containers are done.
    const commit = () => {
      open.length = matched;
      leaf = null;
    };
    const add = (b: Block) => {
      const parent = open[open.length - 1];
      parent.children.push(b);
      parent.empty = false;
    };
    const para = () => (leaf?.type === "paragraph" ? leaf.node : null);
    let opened = false; // a container started on this line
    let taken = false; // the line went to a block that isn't a paragraph
    for (;;) {
      if (cur.blank) break;
      const ind = cur.indent();
      const base = cur.pos;
      if (ind >= 4) {
        if (para()) break; // carries on the paragraph
        commit();
        add({ type: "other" });
        leaf = { type: "code" };
        taken = true;
        break;
      }
      const pad = cur.virt; // columns of a tab a container took part of
      cur.skipSpace();
      const r = trimEnd(cur.rest);
      // goldmark looks for list markers and HTML after spaces only, not tabs.
      const spaces = !line.slice(base, cur.pos).includes("\t");
      if (r[0] === ">") {
        commit();
        const quote: Container = { type: "quote", indent: 0, children: [], empty: false, line: i };
        add(quote);
        open.push(quote);
        matched = open.length;
        opened = true;
        cur.advance(1);
        if (cur.rest[0] === " " || cur.rest[0] === "\t") cur.skip(1);
        continue;
      }
      // A paragraph in this container, which the line could carry on.
      let p = all && !opened ? para() : null;
      if (p && /^(?:=+|-+)$/.test(r)) {
        // Underlined: a heading, unless a table takes all of it; then the
        // line is read afresh.
        p.underlined = true;
        if (splitParagraph(p.lines, true).text.length) {
          p.heading = true;
          leaf = null;
          taken = true;
          break;
        }
        leaf = null;
        p = null;
      }
      if (thematicBreak.test(r)) {
        commit();
        add({ type: "other" });
        taken = true;
        break;
      }
      const li = spaces ? /^(?:[-+*]|(\d{1,9})[.)])(?=[ \t]|$)/.exec(r) : null;
      const empty = !!li && trimEnd(r.slice(li[0].length)) === "";
      // Only a non-empty item, numbered 1 if numbered, interrupts a paragraph.
      if (li && !(p && (empty || (li[1] !== undefined && Number(li[1]) !== 1)))) {
        commit();
        cur.advance(li[0].length);
        // goldmark measures the space after a marker as if the container's
        // text started at column 0 (the columns left of a tab are spaces).
        cur.col = cur.pos - base + pad;
        const w = cur.indent();
        const offset = empty || w > 4 ? 1 : w;
        if (!empty) cur.skip(offset);
        cur.recount();
        const item: Container = {
          type: "item",
          indent: ind + li[0].length + offset,
          marker: li[0][li[0].length - 1],
          children: [],
          empty: true,
          line: i,
        };
        add(item);
        open.push(item);
        matched = open.length;
        opened = true;
        afterEmpty = false;
        continue;
      }
      if (/^#{1,6}(?:[ \t]|$)/.test(r)) {
        commit();
        const at = start + cur.pos;
        add({
          type: "heading",
          line: { text: r, indent: ind, from: at, lineFrom: start, to: end, line: i },
        });
        taken = true;
        break;
      }
      const f = fenceOpen(r);
      if (f) {
        commit();
        add({ type: "other" });
        leaf = { type: "fence", fence: f };
        taken = true;
        break;
      }
      if (r.startsWith("$$")) {
        commit();
        const eq: Equation = {
          type: "equation",
          from: open.length > 1 ? start + cur.pos : start,
          to: end,
          line: i,
          tex: "",
          attrs: "",
          closed: false,
          prefix: prefixOf(open),
        };
        add(eq);
        addEquation(eq, cur.rest.slice(2), end);
        if (!eq.closed) leaf = { type: "equation", node: eq };
        taken = true;
        break;
      }
      const html = r[0] === "<" && spaces ? htmlStart(r, !!para()) : null;
      if (html) {
        commit();
        add({ type: "other" });
        if (!html.end?.test(r)) leaf = { type: "html", end: html.end };
        taken = true;
        break;
      }
      const note = noteStart.exec(r);
      if (note && !/^[\t\n\v\f\r ]*$/.test(note[1])) {
        commit();
        const at = start + cur.pos;
        const space = cur.rest[note[0].length] === " " || cur.rest[note[0].length] === "\t" ? 1 : 0;
        // goldmark starts the note's text as many characters early as a
        // partly taken tab had columns left (`]:` for two).
        cur.advance(note[0].length - pad);
        const head: NoteHead = {
          label: note[1],
          from: open.length === 1 ? start : at,
          labelFrom: at + 2,
          textFrom: at + note[0].length + space,
          to: end,
        };
        const c: Container = {
          type: "note",
          indent: 4,
          children: [],
          empty: false,
          line: i,
          note: head,
        };
        add(c);
        open.push(c);
        matched = open.length;
        opened = true;
        continue;
      }
      break;
    }

    if (taken) continue;
    if (cur.blank) {
      open.length = matched;
      if (leaf?.type === "paragraph") leaf = null;
      continue;
    }
    const pl: ParaLine = {
      text: "",
      indent: cur.indent(),
      from: 0,
      lineFrom: start,
      to: end,
      line: i,
    };
    cur.skipSpace();
    pl.text = cur.rest;
    pl.from = start + cur.pos;
    const p = para();
    // Text after a paragraph carries it on, even (lazily) when the line
    // doesn't continue the paragraph's quote or list item.
    if (p && !opened) p.lines.push(pl);
    else {
      commit();
      const node: Paragraph = { type: "paragraph", lines: [pl], prefix: prefixOf(open) };
      add(node);
      leaf = { type: "paragraph", node };
    }
  }
  if (textEnd >= 0) extendNotes();
  return root;
}

// A link reference definition (`[name]: url "title"`), which goldmark takes
// out of the paragraph it starts: on one line, or with its url or title on
// the next.
const linkLabel = String.raw`^\[(?:\\.|[^[\]\\])+\]:\s*`;
const linkURL = String.raw`(?:<[^>]*>|\S+)`;
const linkTitle = String.raw`(?:"[^"]*"|'[^']*'|\([^)]*\))`;
const linkDefinition = new RegExp(String.raw`${linkLabel}${linkURL}(?:\s+${linkTitle})?\s*$`);
const linkLabelOnly = new RegExp(String.raw`${linkLabel}$`);
const linkURLLine = new RegExp(String.raw`^${linkURL}(?:\s+${linkTitle})?\s*$`);
const linkURLOnly = new RegExp(String.raw`${linkLabel}${linkURL}\s*$`);
const linkTitleLine = new RegExp(String.raw`^${linkTitle}\s*$`);

// definitionLines is how many lines the link reference definition starting
// at lines[k] takes, 0 for none.
function definitionLines(lines: ParaLine[], k: number): number {
  const s = lines[k].text;
  const next = lines[k + 1]?.text;
  if (next !== undefined && linkLabelOnly.test(s)) return linkURLLine.test(next) ? 2 : 0;
  if (next !== undefined && linkURLOnly.test(s) && linkTitleLine.test(next)) return 2;
  return linkDefinition.test(s) ? 1 : 0;
}

// delimiterColumns counts the columns of a table's delimiter row
// (`|:--|--:|`); -1 when line isn't one.
export function delimiterColumns(line: string, dashes = false): number {
  if (!/^[\s|:-]*$/.test(line) || (!dashes && /^-*$/.test(line.trim()))) return -1;
  let cols = line.split("|");
  if (cols[0].trim() === "") cols = cols.slice(1);
  if (cols.length && cols[cols.length - 1].trim() === "") cols = cols.slice(0, -1);
  if (!cols.length || !cols.every((c) => /^\s*:?-+:?\s*$/.test(c))) return -1;
  return cols.length;
}

// headerCells counts a table header's cells as goldmark splits them: at
// every `|` not escaped by a backslash, code spans or not.
function headerCells(line: string): number {
  const s = line.trim();
  let pos = s[0] === "|" ? 1 : 0;
  const limit = s.length > 0 && s[s.length - 1] === "|" ? s.length - 1 : s.length;
  let n = 0;
  while (pos < limit) {
    let c = pos;
    while (c < limit && !(s[c] === "|" && (c === 0 || s[c - 1] !== "\\"))) c++;
    n++;
    pos = c + 1;
  }
  return n;
}

// splitParagraph splits a paragraph's lines as goldmark does: link
// reference definitions starting it are taken out, then a table starts at the
// first delimiter row (if the line above has no more cells; otherwise there's
// none) and runs to the end. An underlined paragraph's lines are
// read without their indentation, so any delimiter row counts, and dashes
// alone make one but on the last line (goldmark keeps the others' line
// breaks, which aren't dashes).
export function splitParagraph(
  lines: ParaLine[],
  underlined = false,
): { text: ParaLine[]; table: ParaLine[] | null } {
  let k = 0;
  for (let n; k < lines.length && (n = definitionLines(lines, k));) k += n;
  lines = lines.slice(k);
  let table: ParaLine[] | null = null;
  for (let i = 1; i < lines.length; i++) {
    const cols =
      lines[i].indent > 3 && !underlined
        ? -1
        : delimiterColumns(lines[i].text, underlined && i < lines.length - 1);
    if (cols < 0) continue;
    // A header with fewer cells is filled out; one with more isn't a table.
    if (headerCells(lines[i - 1].text) <= cols) {
      table = lines.slice(i - 1);
      lines = lines.slice(0, i - 1);
    }
    break;
  }
  return { text: lines, table };
}

// restartable tells whether reading can restart after root's blocks (with
// nothing open): not after a table, whose caption is the block after it.
function restartable(root: Container): boolean {
  const last = root.children[root.children.length - 1];
  return (
    last?.type !== "paragraph" ||
    !!last.heading ||
    !splitParagraph(last.lines, last.underlined).table
  );
}

// paragraphs splits paragraphs into text and tables. An underlined one is a
// heading after its table.
export function paragraphs(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type !== "paragraph") {
      out.push(b);
      continue;
    }
    const { text, table } = splitParagraph(b.lines, b.underlined);
    if (b.heading) {
      if (table) out.push({ type: "table", lines: table, prefix: b.prefix });
      out.push({ type: "other" });
      continue;
    }
    if (text.length) out.push({ ...b, lines: text });
    if (table) out.push({ type: "table", lines: table, prefix: b.prefix });
  }
  return out;
}
