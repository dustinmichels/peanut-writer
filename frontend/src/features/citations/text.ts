// How a reference reads in the citation manager's lists and hints: plainly,
// not in the document's citation style (Typst writes that).

import type { Reference } from "@bindings/peanut-writer/internal/refs/models";

// BibLaTeX's braces ({DNA} keeps its capitals) aren't shown.
export const plain = (s: string) => s.replace(/[{}]/g, "");

const lastName = (a: string) =>
  plain(a.includes(",") ? a.split(",")[0] : (a.trim().split(/\s+/).at(-1) ?? ""));

// "Smith", "Smith & Doe", "Smith et al."
export function authorsShort(a: string[] | null) {
  if (!a?.length) return "";
  if (a.length > 2) return `${lastName(a[0])} et al.`;
  return a.map(lastName).join(" & ");
}

// "Smith & Doe 2021"
export function whoWhen(r: Reference) {
  return [authorsShort(r.authors), r.year].filter(Boolean).join(" ") || "No author";
}

// "Smith & Doe 2021. The DNA of Peanuts. Nut Science 7."
export function describe(r: Reference) {
  const inside = [plain(r.container), r.volume].filter(Boolean).join(" ");
  return [whoWhen(r), plain(r.title) || "Untitled", inside]
    .filter(Boolean)
    .map((s) => (/[.?!]$/.test(s) ? s : s + "."))
    .join(" ");
}

// blank is an empty reference of type, to fill in.
export function blank(type = "article"): Reference {
  return {
    key: "",
    type,
    authors: [],
    title: "",
    year: "",
    container: "",
    publisher: "",
    volume: "",
    issue: "",
    pages: "",
    doi: "",
    url: "",
  };
}
