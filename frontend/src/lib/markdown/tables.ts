// Tables: pipe tables read and written cell by cell, and tables pasted from
// spreadsheets.

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
