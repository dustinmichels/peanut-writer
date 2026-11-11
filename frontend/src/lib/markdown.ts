// Reading and writing the parts of Peanut Writer's Markdown the editor
// helps with: front matter, figures, tables, equations, captions and labels.
// The Go side (internal/doc) is what renders; this mirrors its rules closely
// enough to number things the same way while typing.

export interface Meta {
  title: string;
  subtitle: string;
  author: string;
  topic: string; // what it's about (an assignment, a subject), beside the author and date
  date: string;
  header: string; // a class, team, project or company, for page headers and footers
  abstract: string;
  template: string;
  hide: string; // the fields kept out of the output, comma-separated
  "peanut-version": string; // the app's version that last saved it
}

const metaKeys: (keyof Meta)[] = [
  "title",
  "subtitle",
  "author",
  "topic",
  "date",
  "header",
  "abstract",
  "template",
  "hide",
  "peanut-version",
];

interface FrontMatter {
  meta: Meta;
  // Character offsets of the whole block (both fences); 0,0 when absent.
  from: number;
  to: number;
  // Lines this editor doesn't know, kept as they are.
  extra: string[];
}

function emptyMeta(): Meta {
  return {
    title: "",
    subtitle: "",
    author: "",
    topic: "",
    date: "",
    header: "",
    abstract: "",
    template: "",
    hide: "",
    "peanut-version": "",
  };
}

export function readFrontMatter(text: string): FrontMatter {
  const meta = emptyMeta();
  const none = { meta, from: 0, to: 0, extra: [] };
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return none;
  const lines = text.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "---" || t === "...") {
      end = i;
      break;
    }
  }
  if (end < 0) return none;
  const extra: string[] = [];
  for (const line of lines.slice(1, end)) {
    const m = /^\s*([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line.replace(/\r$/, ""));
    const key = m?.[1].toLowerCase() as keyof Meta | undefined;
    if (m && key && metaKeys.includes(key)) meta[key] = unquote(m[2].trim());
    else if (line.trim()) extra.push(line);
  }
  const to = lines.slice(0, end + 1).join("\n").length + (end + 1 < lines.length ? 1 : 0);
  return { meta, from: 0, to, extra };
}

function unquote(v: string): string {
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    if (v[0] === '"') {
      try {
        return JSON.parse(v);
      } catch {
        /* fall through */
      }
    }
    return v.slice(1, -1);
  }
  return v;
}

function quoteIfNeeded(v: string): string {
  return /^[\s"'[{>|*&!%@`#-]|:\s|\s$|#/.test(v) ? JSON.stringify(v) : v;
}

// writeFrontMatter is the front matter block for meta (and lines kept from
// before); "" when there's nothing to say.
export function writeFrontMatter(meta: Meta, extra: string[] = []): string {
  const lines = metaKeys
    .filter((k) => meta[k].trim() !== "")
    .map((k) => `${k}: ${quoteIfNeeded(meta[k].replace(/\s*\n\s*/g, " ").trim())}`);
  lines.push(...extra);
  return lines.length ? `---\n${lines.join("\n")}\n---\n` : "";
}

// --- Figures, tables and equations -----------------------------------------

export type Kind = "figure" | "table" | "equation";

// What a reference to each kind reads as: "Figure 2".
export const kindName: Record<Kind, string> = {
  figure: "Figure",
  table: "Table",
  equation: "Equation",
};

export interface Picture {
  src: string;
  alt: string; // a grid picture's own description; "" for a single picture
}

export interface Item {
  kind: Kind;
  number: number;
  label: string; // "" when it has none
  // as written (Markdown); an equation's is its TeX on one line
  caption: string;
  // Figure: its paragraph (the image, or a grid's pictures through its
  // `Figure:` caption). Table: from the header row through the caption (or
  // the last row when there's no caption). Equation: its first `$$` line
  // through the closing one. Inside a list or quote these start at the
  // block's text, after the markers.
  from: number;
  to: number;
  line: number; // 1-based line of `from`
  // Inside a list item or block quote: what begins each further line of it
  // ("> ", spaces), for text written there. Such items are numbered but
  // shown as Markdown, not as widgets. Undefined at the top level.
  prefix?: string;
  // figure: one picture, or two or more in a grid
  pictures?: Picture[];
  columns?: number; // grid: pictures to a row
  width?: number; // percent; 0 = natural (a grid: the full width)
  position?: Position;
  // table
  tableFrom?: number;
  tableTo?: number; // end of the last row
  captionFrom?: number; // the caption paragraph, when there is one
  captionTo?: number;
}

// A cross-reference in the text: `@label` from `from` to `to`, and what it
// reads as ("Figure 2", or "" when nothing has the label).
export interface RefAt {
  from: number;
  to: number;
  label: string;
  text: string;
}

// relabelChanges points every reference to one label in text at another.
export function relabelChanges(
  text: string,
  from: string,
  to: string,
): { from: number; to: number; insert: string }[] {
  if (!from || from === to) return [];
  const re = new RegExp(
    `(^|[^\\w])@${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:-]*[A-Za-z0-9_])`,
    "g",
  );
  return [...text.matchAll(re)].map((m) => {
    const at = m.index! + m[1].length + 1;
    return { from: at, to: at + from.length, insert: to };
  });
}

const image = String.raw`!\[((?:\\.|[^\]\\])*)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)`;
// A paragraph holding only an image, and maybe an attribute block.
const figureRe = new RegExp(String.raw`^${image}\s*(\{[^{}]*\})?\s*$`);
const imageAt = new RegExp(image, "y");
const trailingAttrs = /\s*(\{[^{}]*\})\s*$/;
const tableCaption = /^(?:table:|:\s)/i;
const figureCaption = /^figure:/i;

interface Fence {
  char: string;
  len: number;
}

// fenceOpen reads a code fence: three or more backticks or tildes (a
// backtick fence's info string holds no backtick).
function fenceOpen(line: string): Fence | null {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m || (m[1][0] === "`" && m[2].includes("`"))) return null;
  return { char: m[1][0], len: m[1].length };
}

// fenceCloses tells whether line closes fence f: at least as many of the
// same character, and nothing else.
function fenceCloses(line: string, f: Fence): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(line);
  return !!m && m[1][0] === f.char && m[1].length >= f.len;
}

// displayMathStart is where the `$$` opening a display equation is on line,
// or -1: a line starting (after up to three spaces) with `$$`.
export function displayMathStart(line: string): number {
  const m = /^ {0,3}\$\$/.exec(line);
  return m ? m[0].length - 2 : -1;
}

// displayMathClose finds the `$$` closing a display equation on line, looking
// from `from`: the line's text, less an optional attribute block, ends with
// it. Null when line doesn't close the equation.
export function displayMathClose(
  line: string,
  from: number,
): { at: number; attrs: string; attrsFrom: number } | null {
  const m = /\$\$[ \t]*(\{[^{}]*\})?\s*$/.exec(line.slice(from));
  if (!m) return null;
  const at = from + m.index;
  return {
    at,
    attrs: m[1] ?? "",
    attrsFrom: m[1] ? at + m[0].indexOf("{") : -1,
  };
}

// Where a figure sits across the text width; "" is centered.
export type Position = "" | "left" | "right";

// parseAttrs reads an attribute block, `{#id key=value key="quoted value"}`,
// as internal/doc does: a value that isn't a number (`width=50px`,
// `columns=2x`) counts for nothing.
function parseAttrs(block: string | undefined): {
  id: string;
  width: number;
  position: Position;
  columns: number;
} {
  const out = { id: "", width: 0, position: "" as Position, columns: 0 };
  if (!block) return out;
  const kv = new Map<string, string>();
  for (const f of attrFields(block.slice(1, -1))) {
    const eq = f.indexOf("=");
    if (f.startsWith("#")) out.id = f.slice(1);
    else if (eq >= 0) {
      kv.set(f.slice(0, eq).toLowerCase(), f.slice(eq + 1).replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""));
    }
  }
  const w = (kv.get("width") ?? "").trim().replace(/%$/, "").trim();
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(w) && Number(w) > 0) {
    out.width = Math.min(Number(w), 100);
  }
  const a = (kv.get("align") ?? "").toLowerCase();
  if (a === "left" || a === "right") out.position = a;
  const c = (kv.get("columns") ?? "").trim();
  if (/^[+-]?\d+$/.test(c) && Number(c) > 0) out.columns = Number(c);
  return out;
}

// attrFields splits an attribute block's text on spaces outside quotes.
function attrFields(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = "";
  for (const c of s) {
    if (quote) {
      if (c === quote || (quote === "“" && c === "”")) quote = "";
      cur += c;
    } else if (c === '"' || c === "'" || c === "“") {
      quote = c;
      cur += c;
    } else if (c === " " || c === "\t") {
      if (cur) out.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// texReads mirrors internal/doc's check of an equation's TeX: one with a `}`
// that closes nothing isn't drawn, so it isn't numbered.
function texReads(tex: string): boolean {
  let depth = 0;
  for (let i = 0; i < tex.length; i++) {
    if (tex[i] === "\\") i++;
    else if (tex[i] === "{") depth++;
    else if (tex[i] === "}" && --depth < 0) return false;
  }
  return true;
}

// --- Block structure ---------------------------------------------------------
//
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

interface Paragraph {
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

type Block = Paragraph | TableBlock | Equation | Container | { type: "other" };

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
function readBlocks(text: string, from: number): Container {
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
function paragraphs(blocks: Block[]): Block[] {
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

const unescapeAlt = (s: string) => s.replace(/\\([\]\\[])/g, "$1");

// figureOf reads a paragraph holding only an image and maybe an attribute
// block, or a grid: two or more images apart only by white space, then a
// `Figure:` caption, straight after the last image or on a line of its own.
function figureOf(p: Paragraph): Omit<Item, "number"> | null {
  const text = p.lines.map((l) => l.text).join("\n");
  const first = p.lines[0];
  const at = {
    from: p.prefix === undefined ? first.lineFrom : first.from,
    to: p.lines[p.lines.length - 1].to,
    line: first.line + 1,
    prefix: p.prefix,
  };
  const fig = figureRe.exec(text);
  if (fig) {
    const a = parseAttrs(fig[3]);
    return {
      kind: "figure",
      label: a.id,
      caption: unescapeAlt(fig[1]),
      ...at,
      pictures: [{ src: fig[2], alt: "" }],
      width: a.width,
      position: a.position,
    };
  }
  const pictures: Picture[] = [];
  let pos = 0;
  let gap = "";
  for (let m; (imageAt.lastIndex = pos), (m = imageAt.exec(text));) {
    pictures.push({ src: m[2], alt: unescapeAlt(m[1]) });
    gap = /^\s*/.exec(text.slice(imageAt.lastIndex))![0];
    pos = imageAt.lastIndex + gap.length;
  }
  const rest = text.slice(pos);
  if (pictures.length < 2 || !figureCaption.test(rest) || (gap && !gap.includes("\n"))) {
    return null;
  }
  let caption = rest.replace(figureCaption, "");
  const attrs = trailingAttrs.exec(caption);
  if (attrs) caption = caption.slice(0, attrs.index);
  const a = parseAttrs(attrs?.[1]);
  return {
    kind: "figure",
    label: a.id,
    caption: caption.trim(),
    ...at,
    pictures,
    columns: Math.min(a.columns || 3, pictures.length),
    width: a.width,
    position: a.position,
  };
}

// scan finds the document's figures, tables and labelled equations, numbered
// in order the way internal/doc numbers them, in lists and quotes too. Ones in
// footnotes, which the Go side numbers where the note's mark is, are left
// out.
export function scan(text: string): Item[] {
  const items: Item[] = [];
  const count: Record<Kind, number> = { figure: 0, table: 0, equation: 0 };
  const push = (x: Omit<Item, "number">) => items.push({ ...x, number: ++count[x.kind] });
  const visit = (blocks: Block[]) => {
    const list = paragraphs(blocks);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.type === "paragraph") {
        const fig = figureOf(b);
        if (fig) push(fig);
      } else if (b.type === "table") {
        const first = b.lines[0];
        const from = b.prefix === undefined ? first.lineFrom : first.from;
        const to = b.lines[b.lines.length - 1].to;
        const table: Omit<Item, "number"> = {
          kind: "table",
          label: "",
          caption: "",
          from,
          to,
          line: first.line + 1,
          prefix: b.prefix,
          tableFrom: from,
          tableTo: to,
        };
        // The paragraph after it, when it starts `Table:` or `: `.
        const next = list[i + 1];
        const raw =
          next?.type === "paragraph"
            ? next.lines
                .map((l) => l.text)
                .join("\n")
                .trim()
            : "";
        if (next?.type === "paragraph" && tableCaption.test(raw)) {
          let caption = raw.replace(tableCaption, "");
          const attrs = trailingAttrs.exec(caption);
          if (attrs) caption = caption.slice(0, attrs.index);
          table.caption = caption.trim();
          table.label = parseAttrs(attrs?.[1]).id;
          table.captionFrom =
            next.prefix === undefined ? next.lines[0].lineFrom : next.lines[0].from;
          table.captionTo = table.to = next.lines[next.lines.length - 1].to;
          i++;
        }
        push(table);
      } else if (b.type === "equation") {
        const id = parseAttrs(b.attrs || undefined).id;
        if (b.closed && id.startsWith("eq:") && texReads(b.tex.trim())) {
          push({
            kind: "equation",
            label: id,
            caption: b.tex.replace(/\s+/g, " ").trim(),
            from: b.from,
            to: b.to,
            line: b.line + 1,
            prefix: b.prefix,
          });
        }
      } else if (b.type === "root" || b.type === "quote" || b.type === "item") {
        visit(b.children);
      }
    }
  };
  visit(readBlocks(text, readFrontMatter(text).to).children);
  return items;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[*_`~[\]()]/g, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .slice(0, 4)
      .join("-") || "item"
  );
}

// uniqueLabel is `<prefix>:<slug of text>`, numbered if it's taken.
export function uniqueLabel(
  prefix: "fig" | "tbl" | "eq",
  text: string,
  items: Item[],
  except = "",
): string {
  const taken = new Set(items.map((x) => x.label).filter((l) => l && l !== except));
  const fallback = { fig: "figure", tbl: "table", eq: "equation" }[prefix];
  const base = `${prefix}:${slug(text || fallback)}`;
  let label = base;
  for (let n = 2; taken.has(label); n++) label = `${base}-${n}`;
  return label;
}

function escapeCaption(s: string): string {
  return s.replace(/([\][\\])/g, "\\$1").replace(/\s*\n\s*/g, " ");
}

export interface FigureSpec {
  pictures: Picture[]; // one, or two or more for a grid
  caption: string;
  label: string;
  width: number; // percent; 0 = natural (a grid: the full width)
  position: Position;
  columns: number; // grid: pictures to a row
}

// figureMarkdown writes one picture as `![caption](src){attrs}`, and a grid
// as its pictures one to a line, then `Figure: caption {attrs}`.
export function figureMarkdown(f: FigureSpec): string {
  const grid = f.pictures.length > 1;
  const attrs = [
    f.label ? `#${f.label}` : "",
    grid ? `columns=${Math.min(Math.max(1, Math.round(f.columns)), f.pictures.length)}` : "",
    f.width > 0 ? `width=${Math.round(f.width)}%` : "",
    f.position ? `align=${f.position}` : "",
  ].filter(Boolean);
  const block = attrs.length ? `{${attrs.join(" ")}}` : "";
  if (!grid) return `![${escapeCaption(f.caption)}](${f.pictures[0]?.src ?? ""})${block}`;
  const caption = f.caption.replace(/\s*\n\s*/g, " ").trim();
  return [
    ...f.pictures.map((p) => `![${escapeCaption(p.alt)}](${p.src})`),
    ["Figure:", caption, block].filter(Boolean).join(" "),
  ].join("\n");
}

// figureSpec is what figureMarkdown writes for item.
export function figureSpec(item: Item): FigureSpec {
  const pictures = item.pictures ?? [];
  return {
    pictures,
    caption: item.caption,
    label: item.label,
    width: item.width ?? 0,
    position: item.position ?? "",
    columns: item.columns ?? Math.min(pictures.length, 3),
  };
}

export function captionMarkdown(caption: string, label: string): string {
  return `Table: ${caption.replace(/\s*\n\s*/g, " ").trim()}${label ? ` {#${label}}` : ""}`.replace(
    /:\s+\{/,
    ": {",
  );
}

// --- Tables ---------------------------------------------------------------

export type Align = "" | "left" | "center" | "right";

export interface Table {
  align: Align[];
  header: string[];
  rows: string[][];
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (c === "`") {
      code = !code;
      cur += c;
    } else if (c === "|" && !code) {
      cells.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseTable(src: string): Table {
  const lines = src.split("\n").filter((l) => l.trim() !== "");
  const header = splitRow(lines[0] ?? "");
  const align = splitRow(lines[1] ?? "").map((c): Align => {
    const l = c.startsWith(":");
    const r = c.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : "";
  });
  const n = header.length;
  const fit = (r: string[]) => Array.from({ length: n }, (_, i) => r[i] ?? "");
  return {
    header,
    align: fit(align as string[]) as Align[],
    rows: lines.slice(2).map((l) => fit(splitRow(l))),
  };
}

const escapeCell = (s: string) =>
  s
    .replace(/\n/g, " ")
    .replace(/(?<!\\)\|/g, "\\|")
    .trim();

// writeTable lays a table out with padded columns.
export function writeTable(t: Table): string {
  const n = t.header.length;
  const rows = [t.header, ...t.rows].map((r) =>
    Array.from({ length: n }, (_, i) => escapeCell(r[i] ?? "")),
  );
  const widths = Array.from({ length: n }, (_, i) =>
    Math.max(3, ...rows.map((r) => [...r[i]].length)),
  );
  const pad = (s: string, w: number, a: Align) => {
    const gap = w - [...s].length;
    if (a === "right") return " ".repeat(gap) + s;
    if (a === "center") return " ".repeat(Math.floor(gap / 2)) + s + " ".repeat(Math.ceil(gap / 2));
    return s + " ".repeat(gap);
  };
  const line = (r: string[]) =>
    `| ${r.map((c, i) => pad(c, widths[i], t.align[i] ?? "")).join(" | ")} |`;
  // Each delimiter cell is as wide as its column, colons included.
  const delim = `|${widths
    .map((w, i) => {
      const a = t.align[i] ?? "";
      if (a === "center") return ` :${"-".repeat(w - 2)}: `;
      if (a === "right") return ` ${"-".repeat(w - 1)}: `;
      if (a === "left") return ` :${"-".repeat(w - 1)} `;
      return ` ${"-".repeat(w)} `;
    })
    .join("|")}|`;
  return [line(rows[0]), delim, ...rows.slice(1).map(line)].join("\n");
}

export function emptyTable(cols: number, rows: number): Table {
  return {
    align: Array(cols).fill(""),
    header: Array.from({ length: cols }, (_, i) => `Column ${i + 1}`),
    rows: Array.from({ length: rows }, () => Array(cols).fill("")),
  };
}

// parseDelimited reads text copied from a spreadsheet (tab-separated, as
// Excel and Google Sheets put on the clipboard) or CSV (comma or semicolon)
// into a table whose first row is the header. Quoted cells may hold
// delimiters, newlines, and "" for a quote. Null when there's nothing in it.
export function parseDelimited(text: string): Table | null {
  const src = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!src.trim()) return null;
  const first = src.slice(0, src.indexOf("\n") + 1 || undefined);
  const sep = src.includes("\t")
    ? "\t"
    : first.split(";").length > first.split(",").length
      ? ";"
      : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (src[i + 1] === '"') ((cell += '"'), i++);
      else quoted = false;
    } else if (c === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (c === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  rows.push(row);

  const kept = rows.filter((r) => r.some((c) => c !== ""));
  const n = Math.max(...kept.map((r) => r.length));
  const fit = (r: string[]) => Array.from({ length: n }, (_, i) => r[i] ?? "");
  return {
    align: Array(n).fill(""),
    header: fit(kept[0]),
    rows: kept.length > 1 ? kept.slice(1).map(fit) : [Array(n).fill("")],
  };
}

// --- Footnotes -------------------------------------------------------------

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
const blockStart = /^\s{0,3}(?:[#>|]|[-*+]\s|\d+[.)]\s|```|~~~|\$\$|(?:[-*_]\s*){3,}$)/;

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

// --- Words ---------------------------------------------------------------

export function wordCount(text: string): number {
  const body = text.slice(readFrontMatter(text).to);
  const words = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, " ")
    .replace(/\{#[^}]*\}/g, " ")
    .replace(/[#>*_`~|:-]+/g, " ")
    .match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu);
  return words ? words.length : 0;
}

// plain strips Markdown inline marks, for showing captions in lists.
export function plain(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\\(.)/g, "$1");
}
