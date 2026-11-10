// Reading and writing the parts of Peanut Writer's Markdown the editor
// helps with: front matter, figures, tables, captions and labels. The Go
// side (internal/doc) is what renders; this mirrors its rules closely
// enough to number things the same way while typing.

export interface Meta {
  title: string;
  subtitle: string;
  author: string;
  date: string;
  abstract: string;
  template: string;
}

export const metaKeys: (keyof Meta)[] = [
  "title",
  "subtitle",
  "author",
  "date",
  "abstract",
  "template",
];

export interface FrontMatter {
  meta: Meta;
  // Character offsets of the whole block (both fences); 0,0 when absent.
  from: number;
  to: number;
  // Lines this editor doesn't know, kept as they are.
  extra: string[];
}

export function emptyMeta(): Meta {
  return { title: "", subtitle: "", author: "", date: "", abstract: "", template: "" };
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
    const m = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line.replace(/\r$/, ""));
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

// --- Figures and tables ---------------------------------------------------

export type Kind = "figure" | "table";

export interface Item {
  kind: Kind;
  number: number;
  label: string; // "" when it has none
  caption: string; // as written (Markdown)
  // Figure: the image line. Table: from the header row through the caption
  // line (or the last row when there's no caption).
  from: number;
  to: number;
  line: number; // 1-based line of `from`
  // figure
  src?: string;
  width?: number; // percent; 0 = natural
  position?: Position;
  // table
  tableFrom?: number;
  tableTo?: number; // end of the last row
  captionFrom?: number; // the caption line, when there is one
  captionTo?: number;
}

export const figureLine =
  /^!\[((?:\\.|[^\]\\])*)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)\s*(\{[^{}]*\})?\s*$/;
const delimiterRow = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
export const captionLine = /^(?:Table:|:\s)\s*(.*?)\s*(\{[^{}]*\})?\s*$/i;
const fence = /^\s{0,3}(```|~~~)/;

// Where a figure sits across the text width; "" is centered.
export type Position = "" | "left" | "right";

export function parseAttrs(block: string | undefined): {
  id: string;
  width: number;
  position: Position;
} {
  const out = { id: "", width: 0, position: "" as Position };
  if (!block) return out;
  for (const f of block.slice(1, -1).trim().split(/\s+/)) {
    if (f.startsWith("#")) out.id = f.slice(1);
    else if (/^width=/i.test(f)) {
      const n = parseFloat(f.slice(6).replace(/["'%]/g, ""));
      if (n > 0) out.width = Math.min(n, 100);
    } else if (/^align=/i.test(f)) {
      const a = f.slice(6).replace(/["']/g, "").toLowerCase();
      if (a === "left" || a === "right") out.position = a;
    }
  }
  return out;
}

// scan finds the document's figures and tables, numbered in order.
export function scan(text: string): Item[] {
  const lines = text.split("\n");
  const starts: number[] = [];
  let pos = 0;
  for (const l of lines) {
    starts.push(pos);
    pos += l.length + 1;
  }
  const end = (i: number) => starts[i] + lines[i].length;
  const blank = (i: number) => i < 0 || i >= lines.length || lines[i].trim() === "";

  const items: Item[] = [];
  let figs = 0;
  let tables = 0;
  let i = 0;
  const fm = readFrontMatter(text);
  if (fm.to > 0) while (i < lines.length && starts[i] < fm.to) i++;

  let inFence: string | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = fence.exec(line);
    if (inFence) {
      if (f && f[1] === inFence) inFence = null;
      continue;
    }
    if (f) {
      inFence = f[1];
      continue;
    }
    const prevBoundary = blank(i - 1) || /^\s{0,3}#/.test(lines[i - 1]);
    const fig = figureLine.exec(line.trim());
    if (fig && prevBoundary && blank(i + 1)) {
      const a = parseAttrs(fig[3]);
      items.push({
        kind: "figure",
        number: ++figs,
        label: a.id,
        caption: fig[1].replace(/\\([\]\\[])/g, "$1"),
        from: starts[i],
        to: end(i),
        line: i + 1,
        src: fig[2],
        width: a.width,
        position: a.position,
      });
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      delimiterRow.test(lines[i + 1]) &&
      prevBoundary
    ) {
      let j = i + 2;
      while (j < lines.length && !blank(j)) j++;
      const lastRow = j - 1;
      const item: Item = {
        kind: "table",
        number: ++tables,
        label: "",
        caption: "",
        from: starts[i],
        to: end(lastRow),
        line: i + 1,
        tableFrom: starts[i],
        tableTo: end(lastRow),
      };
      let k = j;
      while (k < lines.length && blank(k)) k++;
      const cap = k < lines.length ? captionLine.exec(lines[k]) : null;
      if (cap && blank(k + 1)) {
        item.caption = cap[1];
        item.label = parseAttrs(cap[2]).id;
        item.captionFrom = starts[k];
        item.captionTo = end(k);
        item.to = end(k);
        i = k;
      } else {
        i = lastRow;
      }
      items.push(item);
    }
  }
  return items;
}

export function slug(s: string): string {
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
  prefix: "fig" | "tbl",
  text: string,
  items: Item[],
  except = "",
): string {
  const taken = new Set(items.map((x) => x.label).filter((l) => l && l !== except));
  const base = `${prefix}:${slug(text || (prefix === "fig" ? "figure" : "table"))}`;
  let label = base;
  for (let n = 2; taken.has(label); n++) label = `${base}-${n}`;
  return label;
}

export function escapeCaption(s: string): string {
  return s.replace(/([\][\\])/g, "\\$1").replace(/\s*\n\s*/g, " ");
}

export interface FigureSpec {
  src: string;
  caption: string;
  label: string;
  width: number; // percent; 0 = natural
  position: Position;
}

export function figureMarkdown(f: FigureSpec): string {
  const attrs = [
    f.label ? `#${f.label}` : "",
    f.width > 0 ? `width=${Math.round(f.width)}%` : "",
    f.position ? `align=${f.position}` : "",
  ].filter(Boolean);
  return `![${escapeCaption(f.caption)}](${f.src})${attrs.length ? `{${attrs.join(" ")}}` : ""}`;
}

// figureSpec is what figureMarkdown writes for item.
export function figureSpec(item: Item): FigureSpec {
  return {
    src: item.src ?? "",
    caption: item.caption,
    label: item.label,
    width: item.width ?? 0,
    position: item.position ?? "",
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
