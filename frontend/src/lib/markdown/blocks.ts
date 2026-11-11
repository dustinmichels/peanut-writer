// Block structure, read as goldmark reads it.

import { type Fence, displayMathClose, fenceCloses, fenceOpen } from "./fences";

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
  constructor(readonly s: string) {}
  get rest(): string {
    return this.s.slice(this.pos);
  }
  get blank(): boolean {
    return this.rest.trim() === "";
  }
  column(): number {
    return this.col - this.virt;
  }
  // indent is the columns of white space ahead.
  indent(): number {
    let w = this.virt;
    let col = this.col;
    for (let i = this.pos; i < this.s.length; i++) {
      const t = this.s[i] === " " ? 1 : this.s[i] === "\t" ? 4 - (col % 4) : 0;
      if (!t) break;
      w += t;
      col += t;
    }
    return w;
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
interface ParaLine {
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
  heading?: boolean; // underlined (`---`, `===`): a heading
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

interface Container {
  type: "root" | "quote" | "item" | "note";
  indent: number; // columns its lines' text is indented by (item, note)
  children: Block[];
  empty: boolean; // item: nothing in it yet
  line: number; // 0-based line it starts on
}

export type Block = Paragraph | TableBlock | Equation | Container | { type: "other" };

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
const htmlAttr = String.raw`(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>${"`"}\x00-\x20]+|'[^']*'|"[^"]*"))?)`;
const htmlTagLine = new RegExp(String.raw`^<(\/ *)?([a-zA-Z][a-zA-Z0-9-]*)(${htmlAttr}*) *\/?> *$`);

// htmlStart reads the start of an HTML block, which runs to a line holding
// end, or to a blank line when end is null. A lone tag of another kind can't
// interrupt a paragraph.
function htmlStart(line: string, inParagraph: boolean): { end: RegExp | null } | null {
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
// front matter).
export function readBlocks(text: string, from: number): Container {
  const root: Container = { type: "root", indent: 0, children: [], empty: false, line: 0 };
  const open: Container[] = [root];
  let leaf: Leaf | null = null;
  // A blank line came after a list item with nothing in it: goldmark ends
  // every list at the next line, unless it starts an item.
  let afterEmpty = false;
  const lines = text.split("\n");
  for (let i = 0, start = 0; i < lines.length; start += lines[i].length + 1, i++) {
    if (start < from) continue;
    const line = lines[i].replace(/\r$/, "");
    const end = start + line.length;
    const cur = new Cursor(line);

    // The containers the line carries on.
    let matched = 1;
    for (; matched < open.length; matched++) {
      const c = open[matched];
      if (c.type === "quote") {
        if (cur.indent() > 3 || cur.rest.trimStart()[0] !== ">") break;
        cur.skipSpace();
        cur.advance(1);
        if (cur.rest[0] === " " || cur.rest[0] === "\t") cur.skip(1);
      } else if (cur.blank) {
        // Blank lines carry on lists and footnotes.
      } else if (cur.indent() >= c.indent && !(afterEmpty && c.type === "item")) {
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
      cur.skipSpace();
      const r = cur.rest.trimEnd();
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
        if (splitParagraph(p.lines).text.length) {
          p.heading = true;
          leaf = null;
          taken = true;
          break;
        }
        leaf = null;
        p = null;
      }
      if (/^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(r)) {
        commit();
        add({ type: "other" });
        taken = true;
        break;
      }
      const li = /^(?:[-+*]|(\d{1,9})[.)])(?=[ \t]|$)/.exec(r);
      const empty = !!li && r.slice(li[0].length).trim() === "";
      // Only a non-empty item, numbered 1 if numbered, interrupts a paragraph.
      if (li && !(p && (empty || (li[1] !== undefined && Number(li[1]) !== 1)))) {
        commit();
        cur.advance(li[0].length);
        // goldmark measures the space after a marker as if the container's
        // text started at column 0.
        cur.col = cur.pos - base;
        const w = cur.indent();
        const offset = empty || w > 4 ? 1 : w;
        if (!empty) cur.skip(offset);
        cur.recount();
        const item: Container = {
          type: "item",
          indent: ind + li[0].length + offset,
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
        add({ type: "other" });
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
      const html = htmlStart(r, !!para());
      if (html) {
        commit();
        add({ type: "other" });
        if (!html.end?.test(r)) leaf = { type: "html", end: html.end };
        taken = true;
        break;
      }
      const note = /^\[\^([^\]]+)\]:/.exec(r);
      if (note && note[1].trim()) {
        commit();
        const c: Container = { type: "note", indent: 4, children: [], empty: false, line: i };
        add(c);
        open.push(c);
        matched = open.length;
        opened = true;
        cur.advance(note[0].length);
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
  return root;
}

// A link reference definition (`[name]: url "title"`), which goldmark takes
// out of the paragraph it starts.
const linkDefinition =
  /^\[(?:\\.|[^[\]\\])+\]:\s*(?:<[^>]*>|\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/;

// delimiterColumns counts the columns of a table's delimiter row
// (`|:--|--:|`); -1 when line isn't one.
function delimiterColumns(line: string): number {
  if (!/^[\s|:-]*$/.test(line) || /^-*$/.test(line.trim())) return -1;
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

// splitParagraph splits a paragraph's lines as goldmark does: a table starts
// at the first delimiter row (if the line above has no more cells; otherwise
// there's none) and runs to the end, and link reference definitions starting
// the lines before it are taken out.
function splitParagraph(lines: ParaLine[]): { text: ParaLine[]; table: ParaLine[] | null } {
  let table: ParaLine[] | null = null;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].indent > 3 ? -1 : delimiterColumns(lines[i].text);
    if (cols < 0) continue;
    // A header with fewer cells is filled out; one with more isn't a table.
    if (headerCells(lines[i - 1].text) <= cols) {
      table = lines.slice(i - 1);
      lines = lines.slice(0, i - 1);
    }
    break;
  }
  let k = 0;
  while (k < lines.length && linkDefinition.test(lines[k].text)) k++;
  return { text: lines.slice(k), table };
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
    const { text, table } = splitParagraph(b.lines);
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
