// The document scan the editor's parts share: items, front matter and
// footnotes kept up to date as state fields, cross-references, and whether
// the Markdown is shown.

import { syntaxTree } from "@codemirror/language";
import { EditorState, Facet, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";
import { type Footnotes, type Item, readFrontMatter, scan, scanFootnotes } from "@/lib/markdown";

export const itemsField = StateField.define<Item[]>({
  create: (s) => scan(s.doc.toString()),
  update: (items, tr) => (tr.docChanged ? scan(tr.state.doc.toString()) : items),
});

// Where the front matter ends (0 without one).
export const frontMatterEnd = StateField.define<number>({
  create: (s) => readFrontMatter(s.doc.toString()).to,
  update: (end, tr) => (tr.docChanged ? readFrontMatter(tr.state.doc.toString()).to : end),
});

// The footnote marks and notes.
export const footnotesField = StateField.define<Footnotes>({
  create: (s) => scanFootnotes(s.doc.toString()),
  update: (fn, tr) => (tr.docChanged ? scanFootnotes(tr.state.doc.toString()) : fn),
});

// bodyHint shows "Begin typing…" where the text goes while there's none, under
// the properties too (CodeMirror's placeholder only shows in an empty document).
class BodyHint extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-placeholder";
    span.setAttribute("aria-hidden", "true");
    span.textContent = "Begin typing…";
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

export const bodyHint = EditorView.decorations.compute(["doc", frontMatterEnd], (s) => {
  const doc = s.doc;
  const fmEnd = s.field(frontMatterEnd);
  if (doc.lineAt(doc.length).from < fmEnd || doc.sliceString(fmEnd).trim()) return Decoration.none;
  return Decoration.set(Decoration.widget({ widget: new BodyHint(), side: 1 }).range(doc.length));
});

// startSelection puts the cursor under the properties of a document with no
// text yet, where its first words go.
export function startSelection(doc: string): { anchor: number } | undefined {
  return doc.slice(readFrontMatter(doc).to).trim() ? undefined : { anchor: doc.length };
}

const refRe = /(^|[^\w])@((?:fig|tbl|eq):[A-Za-z0-9_-]*[A-Za-z0-9_])/g;

interface RefSpan {
  from: number;
  to: number;
  label: string;
}

// crossRefs finds the cross-references (`@fig:name`) in the text, outside the
// front matter, code and math. Code is told by tree, which by default is as
// far as the editor has parsed: what it shows.
export function crossRefs(state: EditorState, tree: Tree = syntaxTree(state)): RefSpan[] {
  const text = state.doc.toString();
  const fm = readFrontMatter(text).to;
  const inCode = (pos: number) => {
    for (let n: SyntaxNode | null = tree.resolve(pos, 1); n; n = n.parent) {
      if (/^(InlineCode|FencedCode|CodeBlock|InlineMath|BlockMath)$/.test(n.name)) return true;
    }
    return false;
  };
  const refs: RefSpan[] = [];
  for (const m of text.matchAll(refRe)) {
    const from = m.index! + m[1].length;
    if (from >= fm && !inCode(from)) refs.push({ from, to: from + m[2].length + 1, label: m[2] });
  }
  return refs;
}

// Whether the editor shows the document's Markdown as plain text (mono, only
// syntax colors), or hides its marks and puts figures and tables in place
// of theirs.
export const showMarkdown = Facet.define<boolean, boolean>({
  combine: (v) => v.some(Boolean),
});
export const fenceRe = /^\s{0,3}(```|~~~)/;
