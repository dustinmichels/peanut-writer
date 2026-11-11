// Figures, tables and equations: finding and numbering them, their labels
// and cross-references, and the Markdown written for them.

import { type Position, parseAttrs } from "./attrs";
import { type Block, type Paragraph, paragraphs, readBlocks } from "./blocks";
import { readFrontMatter } from "./frontMatter";

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
