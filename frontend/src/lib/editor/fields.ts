// The document scan the editor's parts share: items, front matter and
// footnotes kept up to date as state fields, cross-references, and whether
// the Markdown is shown.

import { syntaxTree } from "@codemirror/language";
import { type ChangeSet, EditorState, Facet, StateField, type Text } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";
import {
  type DisplayEquation,
  type FootnoteScan,
  type Item,
  type ItemScan,
  readFrontMatter,
  rescanFootnotes,
  rescanItems,
  scanFootnotes,
  scanItems,
} from "@/lib/markdown";

// textOf is doc as a string, made once for all the fields and filters.
const texts = new WeakMap<Text, string>();
export function textOf(doc: Text): string {
  let s = texts.get(doc);
  if (s === undefined) texts.set(doc, (s = doc.toString()));
  return s;
}

// edited is what changes did as one edit: fromA–toA of the old text became
// fromA–toB.
function edited(changes: ChangeSet): [number, number, number] {
  let fromA = -1;
  let toA = 0;
  let toB = 0;
  changes.iterChangedRanges((fa, ta, _fb, tb) => {
    if (fromA < 0) fromA = fa;
    toA = ta;
    toB = tb;
  });
  return [fromA, toA, toB];
}

// The items and display equations, read again after an edit only from
// around it.
const itemScan = StateField.define<ItemScan>({
  create: (s) => scanItems(textOf(s.doc)),
  update: (scan, tr) =>
    tr.docChanged ? rescanItems(scan, textOf(tr.state.doc), ...edited(tr.changes)) : scan,
});

export const itemsField = StateField.define<Item[]>({
  create: (s) => s.field(itemScan).items,
  update: (_, tr) => tr.state.field(itemScan).items,
  provide: () => itemScan,
});

// The display equations at the top level.
export const equationsField = StateField.define<DisplayEquation[]>({
  create: (s) => s.field(itemScan).equations,
  update: (_, tr) => tr.state.field(itemScan).equations,
  provide: () => itemScan,
});

// The start of the display equation being typed, -1 for none. Typing its
// closing `$$` would otherwise turn it into a block under the cursor, before
// its label is typed; it stays as its Markdown until the cursor leaves it.
export const typedEquation = StateField.define<number>({
  create: () => -1,
  update(at, tr) {
    const head = tr.state.selection.main.head;
    const eq = tr.state.field(equationsField).find((x) => head > x.from && head <= x.to);
    if (!eq) return -1;
    const held = at >= 0 && tr.changes.mapPos(at) === eq.from;
    return held || tr.isUserEvent("input.type") ? eq.from : -1;
  },
});

// shownEquations are the display equations shown as blocks: all but the one
// being typed.
export function shownEquations(state: EditorState): DisplayEquation[] {
  const typed = state.field(typedEquation);
  return state.field(equationsField).filter((x) => x.from !== typed);
}

// Where the front matter ends (0 without one).
export const frontMatterEnd = StateField.define<number>({
  create: (s) => readFrontMatter(textOf(s.doc)).to,
  update: (end, tr) => (tr.docChanged ? readFrontMatter(textOf(tr.state.doc)).to : end),
});

// The footnote marks and notes, read again after an edit only from around
// it.
export const footnotesField = StateField.define<FootnoteScan>({
  create: (s) => scanFootnotes(textOf(s.doc)),
  update: (fn, tr) =>
    tr.docChanged ? rescanFootnotes(fn, textOf(tr.state.doc), ...edited(tr.changes)) : fn,
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
// Code and math: text read as written, no Markdown inside.
export const codeNodes = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "InlineMath",
  "BlockMath",
]);

interface RefSpan {
  from: number;
  to: number;
  label: string;
}

// crossRefs finds the cross-references (`@fig:name`) in the text, outside the
// front matter, code and math. Code is told by tree, which by default is as
// far as the editor has parsed: what it shows.
export function crossRefs(state: EditorState, tree: Tree = syntaxTree(state)): RefSpan[] {
  const text = textOf(state.doc);
  const fm = readFrontMatter(text).to;
  const inCode = (pos: number) => {
    for (let n: SyntaxNode | null = tree.resolve(pos, 1); n; n = n.parent) {
      if (codeNodes.has(n.name)) return true;
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
