// Figures, tables and equations: finding and numbering them, their labels
// and cross-references, and the Markdown written for them.

import { type Position, parseAttrs } from "./attrs";
import { type Block, type Paragraph, paragraphs, readBlocks } from "./blocks";
import { readFrontMatter } from "./frontMatter";
import { type Restarts, reread, splice } from "./restart";

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

// Code spans and math bind tighter than an alt text's brackets, and keep
// their backslashes (goldmark; math as lib/editor/math.ts reads it). masked
// hides their brackets and backslashes from the image patterns below; it
// keeps text's length, so matches index text.
const literalRe =
  /(?<![\\`])(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)|(?<!\\)\$\$(?:\\.|[^$\\]|\$(?!\$))*\$\$|(?<!\\)\$(?![\s$])(?:\\.|[^$\\])*(?<!\s)\$(?!\d)/g;
const masked = (text: string) => text.replace(literalRe, (m) => m.replace(/[[\]\\]/g, "\u0001"));

// group is match m's group i, from text: m was matched against masked(text),
// with indices ("d").
const group = (m: RegExpExecArray, text: string, i: number) => {
  const at = m.indices![i];
  return at && text.slice(...at);
};

// An image as goldmark reads it: alt text with balanced brackets, then a
// destination, `<…>` (spaces allowed) or bare (balanced parentheses, maybe
// empty), and maybe a title. Groups: alt, `<…>` destination, bare one.
const image = String.raw`!\[((?:\\.|[^[\]\\]|\[(?:\\.|[^[\]\\])*\])*)\]\(\s*(?:<((?:\\.|[^<>\n\\])*)>|((?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))*))(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^()\\])*\)))?\s*\)`;
// A paragraph holding only an image, and maybe an attribute block (after
// white space or a `\` line break).
const figureRe = new RegExp(String.raw`^${image}(?:\s|\\\n)*(\{[^{}]*\})?\s*$`, "d");
const imageAt = new RegExp(image, "yd");
const trailingAttrs = /\s*(\{[^{}]*\})\s*$/;
const tableCaption = /^(?:table:|:\s)/i;
const figureCaption = /^figure:/i;

// imageSrc is an image's destination as goldmark reads it (internal/doc's
// destination): escapes undone, then numeric character references
// (`&#38;`, `&#x26;`), then named ones (`&amp;`).
const imageSrc = (m: RegExpExecArray, text: string) =>
  (group(m, text, 2) ?? group(m, text, 3)!)
    .replace(/\\([!-/:-@[-`{-~])/g, "$1")
    .replace(/&#(?:[xX]([0-9a-fA-F]+)|([0-9]{1,7}));/g, (_, hex?: string, dec?: string) => {
      // goldmark parses decimal ones with Go's base prefixes: a leading 0
      // reads as octal, and as 0 when it isn't.
      const code =
        hex !== undefined
          ? parseInt(hex, 16)
          : dec!.length > 1 && dec![0] === "0"
            ? /[89]/.test(dec!)
              ? 0
              : parseInt(dec!, 8)
            : Number(dec);
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
        ? String.fromCodePoint(code)
        : "\ufffd";
    })
    .replace(/&[A-Za-z0-9]+;/g, entity);

// entity is what a named character reference (`&amp;`) stands for, as
// written when it's no HTML entity. The web view's own decoder knows them
// all; without one (tests) only the common ones are known.
let decoder: HTMLTextAreaElement | undefined;
const commonEntities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": "\u00a0",
};
function entity(ref: string): string {
  if (typeof document === "undefined") return commonEntities[ref] ?? ref;
  decoder ??= document.createElement("textarea");
  decoder.innerHTML = ref;
  const s = decoder.value;
  // A name the decoder doesn't know whole can start with one it knows
  // without its `;` (`&ampx;` reads `&x;`): goldmark leaves those be.
  return s.endsWith(";") && s !== ";" ? ref : s;
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

// outsideLiteral applies f to s outside its code spans and math, which keep
// their backslashes as written.
function outsideLiteral(s: string, f: (part: string) => string): string {
  let out = "";
  let last = 0;
  for (const m of s.matchAll(literalRe)) {
    out += f(s.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + f(s.slice(last));
}

const unescapeAlt = (s: string) => outsideLiteral(s, (p) => p.replace(/\\([\]\\[])/g, "$1"));

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
  const hidden = masked(text);
  const fig = figureRe.exec(hidden);
  if (fig) {
    const a = parseAttrs(fig[4]);
    return {
      kind: "figure",
      label: a.id,
      caption: unescapeAlt(group(fig, text, 1)!),
      ...at,
      pictures: [{ src: imageSrc(fig, text), alt: "" }],
      width: a.width,
      position: a.position,
    };
  }
  const pictures: Picture[] = [];
  let pos = 0;
  let gap = "";
  for (let m; (imageAt.lastIndex = pos), (m = imageAt.exec(hidden));) {
    pictures.push({ src: imageSrc(m, text), alt: unescapeAlt(group(m, text, 1)!) });
    gap = /^(?:\s|\\\n)*/.exec(text.slice(imageAt.lastIndex))![0];
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
  return scanItems(text).items;
}

// A display equation at the top level of the document, which the editor
// shows as a block: its TeX, and its label (`eq:` ones only, as internal/doc
// reads them).
export interface DisplayEquation {
  from: number; // its opening `$$` line
  to: number; // the end of its closing `$$` line
  tex: string;
  label: string;
}

// A reading of the document: its items (see scan), its closed display
// equations outside lists, quotes and footnotes, labelled or not, and where
// it can be read again from after an edit.
export interface ItemScan {
  items: Item[];
  equations: DisplayEquation[];
  restarts: Restarts;
}

type Read = Pick<ItemScan, "items" | "equations">;

// scanItems reads text whole.
export function scanItems(text: string): ItemScan {
  const fm = readFrontMatter(text).to;
  const restarts: Restarts = { at: [], line: [] };
  let line = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < fm; i = text.indexOf("\n", i + 1)) line++;
  const read = readItems(text, fm, line, (at, l) => {
    restarts.at.push(at);
    restarts.line.push(l);
    return false;
  });
  return { items: numbered(read.items), equations: read.equations, restarts };
}

// rescanItems reads text again after the edit that made it from the text
// prev read: fromA–toA of that text became fromA–toB.
export function rescanItems(
  prev: ItemScan,
  text: string,
  fromA: number,
  toA: number,
  toB: number,
): ItemScan {
  // The front matter is where reading starts, the first restart point.
  if (readFrontMatter(text).to !== prev.restarts.at[0]) return scanItems(text);
  let fresh: Read = { items: [], equations: [] };
  const r = reread(prev.restarts, fromA, toA, toB, (from, line, point) => {
    fresh = readItems(text, from, line, point);
  });
  if (!r) return scanItems(text);
  const { shift, lines } = r;
  const move = <T extends { from: number; to: number }>(x: T): T => ({
    ...x,
    from: x.from + shift,
    to: x.to + shift,
  });
  const items = splice(prev.items, fresh.items, r, (x) => {
    const y = move(x);
    y.line += lines;
    if (y.tableFrom !== undefined) y.tableFrom += shift;
    if (y.tableTo !== undefined) y.tableTo += shift;
    if (y.captionFrom !== undefined) y.captionFrom += shift;
    if (y.captionTo !== undefined) y.captionTo += shift;
    return y;
  });
  return {
    items: numbered(items),
    equations: splice(prev.equations, fresh.equations, r, move),
    restarts: r.restarts,
  };
}

// numbered numbers items in order, by kind.
function numbered(items: Item[]): Item[] {
  const count: Record<Kind, number> = { figure: 0, table: 0, equation: 0 };
  return items.map((x) => {
    const number = ++count[x.kind];
    return x.number === number ? x : { ...x, number };
  });
}

// readItems reads the items and display equations from a restart point (see
// readBlocks), unnumbered.
function readItems(
  text: string,
  from: number,
  line: number,
  point: (at: number, line: number) => boolean,
): Read {
  const items: Item[] = [];
  const push = (x: Omit<Item, "number">) => items.push({ ...x, number: 0 });
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
  const root = readBlocks(text, from, line, point);
  visit(root.children);
  const equations: DisplayEquation[] = [];
  for (const b of root.children) {
    if (b.type !== "equation" || !b.closed) continue;
    const id = parseAttrs(b.attrs || undefined).id;
    equations.push({
      from: b.from,
      to: b.to,
      tex: b.tex.trim(),
      label: id.startsWith("eq:") ? id : "",
    });
  }
  return { items, equations };
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

// escapeCaption escapes brackets and backslashes, leaving code spans and
// math (`$\alpha$`) as written: goldmark reads them before the brackets.
function escapeCaption(s: string): string {
  return outsideLiteral(s.replace(/\s*\n\s*/g, " "), (p) => p.replace(/([\][\\])/g, "\\$1"));
}

// linkText makes Markdown (text selected in the editor) a link's text: its
// brackets escaped, outside code and math, and a backslash ending it doubled,
// so they can't end the link early. Its other escapes stay as they are.
export function linkText(md: string): string {
  return outsideLiteral(md, (p) => p.replace(/(?<!\\)[[\]]/g, "\\$&")).replace(
    /(?<!\\)(\\\\)*\\$/,
    "$&\\",
  );
}

// destination writes src as an image's destination, between `<…>` when it
// holds spaces or parentheses (`images/my picture (1).png`).
function destination(src: string): string {
  return /[\s()<>]/.test(src) ? `<${src.replace(/[<>]/g, "\\$&")}>` : src;
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
  if (!grid)
    return `![${escapeCaption(f.caption)}](${destination(f.pictures[0]?.src ?? "")})${block}`;
  const caption = f.caption.replace(/\s*\n\s*/g, " ").trim();
  return [
    ...f.pictures.map((p) => `![${escapeCaption(p.alt)}](${destination(p.src)})`),
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

// equationMarkdown writes a display equation on lines of its own, its label
// after the closing `$$`.
export function equationMarkdown(tex: string, label: string): string {
  return `$$\n${tex.trim()}\n$$${label ? ` {#${label}}` : ""}`;
}
