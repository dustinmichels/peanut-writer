// Citations: `[@a]`, `[@a, p. 4]`, `[@a; @b]`, as internal/doc reads them
// (cite.go): a Pandoc key, then an optional locator, sources apart by `;`.
// A key like a cross-reference's label (`[@fig:a]`) isn't a citation.

const key = String.raw`[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/][\p{L}\p{N}_])*`;
const citeRe = new RegExp(String.raw`\[(@${key}[^\[\]@;]*(?:;\s*@${key}[^\[\]@;]*)*)\]`, "gu");
const itemRe = new RegExp(String.raw`^@(${key})`, "u");

export interface Citation {
  from: number;
  to: number;
  keys: string[];
  locators: string[]; // each key's ("p. 4"), "" for none
}

// citations finds the citations in text.
export function citations(text: string): Citation[] {
  const out: Citation[] = [];
  if (!text.includes("[@")) return out;
  for (const m of text.matchAll(citeRe)) {
    const items = m[1].split(";").map((s) => s.trim());
    const keys = items.map((s) => itemRe.exec(s)?.[1] ?? "");
    if (keys.some((k) => !k || /^(?:fig|tbl|eq):/.test(k))) continue;
    const locators = items.map((s, i) => s.slice(keys[i].length + 1).replace(/^\s*,?\s*/, ""));
    out.push({ from: m.index, to: m.index + m[0].length, keys, locators });
  }
  return out;
}

// citationMarkdown is a citation of keys, each with its locator ("p. 4").
export function citationMarkdown(keys: string[], locators: string[] = []): string {
  const item = (k: string, i: number) => {
    const loc = locators[i]?.trim();
    return "@" + k + (loc ? ", " + loc : "");
  };
  return `[${keys.map(item).join("; ")}]`;
}
