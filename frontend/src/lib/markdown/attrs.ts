// Attribute blocks, `{#id key=value}`, read as internal/doc reads them.

// Where a figure sits across the text width; "" is centered.
export type Position = "" | "left" | "right";

// parseAttrs reads an attribute block, `{#id key=value key="quoted value"}`,
// as internal/doc does: a value that isn't a number (`width=50px`,
// `columns=2x`) counts for nothing.
export function parseAttrs(block: string | undefined): {
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
