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
}

// citations finds the citations in text.
export function citations(text: string): Citation[] {
  const out: Citation[] = [];
  if (!text.includes("[@")) return out;
  for (const m of text.matchAll(citeRe)) {
    const keys = m[1].split(";").map((s) => itemRe.exec(s.trim())?.[1] ?? "");
    if (keys.some((k) => !k || /^(?:fig|tbl|eq):/.test(k))) continue;
    out.push({ from: m.index, to: m.index + m[0].length, keys });
  }
  return out;
}

// citationMarkdown is a citation of keys, the locator ("p. 4") after the last.
export function citationMarkdown(keys: string[], locator = ""): string {
  const loc = locator.trim();
  return `[${keys.map((k) => "@" + k).join("; ")}${loc ? ", " + loc : ""}]`;
}
