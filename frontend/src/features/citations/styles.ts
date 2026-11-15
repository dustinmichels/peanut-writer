// The citation styles as people know them, and where a document's reference
// list is.

// What each style internal/doc offers (doc.Styles) is called, and how a
// citation of Smith (2020) reads in it (as Typst writes it).
const known: Record<string, { name: string; sample: string }> = {
  apa: { name: "APA (7th edition)", sample: "(Smith, 2020)" },
  "chicago-author-date": { name: "Chicago (author-date)", sample: "(Smith 2020)" },
  "harvard-cite-them-right": { name: "Harvard (Cite Them Right)", sample: "(Smith, 2020)" },
  ieee: { name: "IEEE", sample: "[1]" },
  mla: { name: "MLA (9th edition)", sample: "(Smith)" },
  nature: { name: "Nature", sample: "superscript ¹" },
  vancouver: { name: "Vancouver", sample: "(1)" },
};

export function styleInfo(id: string) {
  return known[id] ?? { name: id, sample: "" };
}

// referenceLists finds the paragraphs that are only `[References]` (as
// internal/doc's parser reads them): their character ranges, line breaks
// left out. Fenced code is skipped.
export function referenceLists(text: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const lines = text.split("\n");
  let fence = "";
  let at = 0;
  for (let i = 0; i < lines.length; at += lines[i].length + 1, i++) {
    const t = lines[i].trim();
    const open = /^(`{3,}|~{3,})/.exec(t)?.[1];
    if (fence) {
      if (open && open[0] === fence[0] && open.length >= fence.length && t === open) fence = "";
      continue;
    }
    if (open) {
      fence = open;
      continue;
    }
    const alone = !lines[i - 1]?.trim() && !lines[i + 1]?.trim();
    if (alone && (t === "[References]" || t === "[references]") && /^ {0,3}\S/.test(lines[i])) {
      out.push({ from: at, to: at + lines[i].length });
    }
  }
  return out;
}
