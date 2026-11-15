// The citation manager in the editor: `[@` (or `; @` inside the brackets)
// completes the document's reference keys, a citation reads as who and when
// it cites ("(Smith 2020, p. 4)"), changed with a click, and hovering it says
// what it cites. Not in code, math or the front matter, where `@` cites
// nothing.

import type { Completion, CompletionContext, CompletionSource } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { watch } from "vue";
import { codeNodes, frontMatterEnd, showMarkdown, textOf } from "@/lib/editor/fields";
import { coverage } from "@/lib/editor/hidden";
import { type Citation, citations } from "@/lib/markdown";
import { openCitations } from "./actions";
import { byKey, refs } from "./store";
import { describe, whoWhen } from "./text";

// A citation's opening up to the cursor: `[@par`, `[@a, p. 4; @par`.
const openCite = /\[(?:[^\[\]]*;\s*)?@[\p{L}\p{N}_:.#$%&\-+?<>~/]*$/u;
const keyTyped = /^@[\p{L}\p{N}_:.#$%&\-+?<>~/]*$/u;

function citable(state: EditorState, pos: number) {
  if (pos < state.field(frontMatterEnd)) return false;
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (codeNodes.has(n.name)) return false;
  }
  return true;
}

export const citationCompletions: CompletionSource = (ctx: CompletionContext) => {
  const m = ctx.matchBefore(openCite);
  if (!m) return null;
  const from = m.from + m.text.lastIndexOf("@");
  if (!citable(ctx.state, from)) return null;
  if (!refs.list.length) {
    // Nothing to cite yet: the way to add a reference, kept whatever is typed.
    return {
      from,
      filter: false,
      options: [
        { label: "New reference…", type: "text", apply: () => openCitations({ add: true }) },
      ],
    };
  }
  const options: Completion[] = refs.list.map((r) => ({
    label: "@" + r.key,
    detail: whoWhen(r),
    info: describe(r),
    type: "text",
  }));
  return { from, options, validFor: keyTyped };
};

// The key of a citation at pos, with where its `@key` stands: the one pos is
// on, or between keys (on a `;` or the locator) the nearest.
function citedAt(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);
  for (const c of citations(line.text)) {
    const from = line.from + c.from;
    if (pos < from || pos > line.from + c.to) continue;
    // A locator holds no `@`, so the citation's `@`s start its keys in order.
    const text = line.text.slice(c.from, c.to);
    let best: { key: string; from: number; to: number } | null = null;
    let bestDist = Infinity;
    let at = -1;
    for (const key of c.keys) {
      at = text.indexOf("@", at + 1);
      const kFrom = from + at;
      const kTo = kFrom + 1 + key.length;
      const dist = pos < kFrom ? kFrom - pos : pos > kTo ? pos - kTo : 0;
      if (dist < bestDist) {
        best = { key, from: kFrom, to: kTo };
        bestDist = dist;
      }
    }
    return best && citable(state, from) ? best : null;
  }
  return null;
}

function tipDom(key: string) {
  const dom = document.createElement("div");
  dom.className = "pw-cite-tip";
  const text = document.createElement("div");
  const act = document.createElement("button");
  act.className = "pw-cite-tip-act";
  const r = byKey.value.get(key);
  if (r) {
    text.textContent = describe(r);
    act.textContent = "Edit";
    act.onclick = () => openCitations({ edit: key });
  } else {
    text.className = "pw-cite-tip-missing";
    text.textContent = "Not in this document's references";
    act.textContent = "Add reference…";
    act.onclick = () => openCitations({ add: true, key });
  }
  dom.append(text, act);
  return dom;
}

const tipTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-tooltip-hover:has(.pw-cite-tip)": {
    border: "1px solid var(--border)",
    borderRadius: "10px",
    background: "var(--surface)",
    boxShadow: "var(--shadow)",
  },
  ".pw-cite-tip": {
    maxWidth: "360px",
    padding: "8px 10px",
    fontFamily: "var(--ui)",
    fontSize: "13px",
    lineHeight: "1.4",
    color: "var(--ink)",
  },
  ".pw-cite-tip-missing": { color: "var(--muted)", fontStyle: "italic" },
  ".pw-cite-tip-act": {
    marginTop: "4px",
    padding: "0",
    border: "none",
    background: "none",
    font: "inherit",
    fontWeight: "600",
    color: "var(--accent)",
    cursor: "pointer",
  },
  ".pw-cite-tip-act:hover": { textDecoration: "underline" },
});

export const citationHover: Extension = [
  hoverTooltip((view, pos) => {
    const hit = citedAt(view.state, pos);
    if (!hit) return null;
    return {
      pos: hit.from,
      end: hit.to,
      above: true,
      create: () => ({ dom: tipDom(hit.key) }),
    };
  }),
  tipTheme,
];

// A citation as it reads in the editor: who and when for each source (its
// key when it isn't in the references), in parentheses, whatever the style:
// the preview has it as the style writes it.
class CiteWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly ok: boolean,
  ) {
    super();
  }
  eq(o: CiteWidget) {
    return o.text === this.text && o.ok === this.ok;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = this.ok ? "pw-ref" : "pw-ref broken";
    el.textContent = this.text;
    el.onmousedown = (e) => e.preventDefault();
    el.onclick = () => {
      // Read where it is now: the widget may have moved since it was drawn.
      const from = view.posAtDOM(el);
      const c = citations(textOf(view.state.doc)).find((x) => x.from === from);
      if (c) openCitations({ cite: c });
    };
    return el;
  }
}

function citeText(c: Citation): { text: string; ok: boolean } {
  const known = byKey.value;
  const parts = c.keys.map((k, i) => {
    const r = known.get(k);
    const who = r ? whoWhen(r) : "@" + k;
    return c.locators[i] ? `${who}, ${c.locators[i]}` : who;
  });
  // Until the references are read, none is missing.
  return { text: `(${parts.join("; ")})`, ok: !refs.loaded || c.keys.every((k) => known.has(k)) };
}

function citeDecorations(state: EditorState): DecorationSet {
  if (state.facet(showMarkdown)) return Decoration.none;
  const out = coverage(state);
  const b = new RangeSetBuilder<Decoration>();
  for (const c of citations(textOf(state.doc))) {
    // A plugin can't replace across lines: one broken over two stays as written.
    if (out(c.from) || !citable(state, c.from) || state.doc.lineAt(c.from).to < c.to) continue;
    const { text, ok } = citeText(c);
    b.add(c.from, c.to, Decoration.replace({ widget: new CiteWidget(text, ok) }));
  }
  return b.finish();
}

// The references changed: citations read again.
const referencesRead = StateEffect.define<null>();

export const citationWidgets = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    stop: () => void;
    constructor(view: EditorView) {
      this.decorations = citeDecorations(view.state);
      this.stop = watch(
        () => [refs.list, refs.loaded],
        () => view.dispatch({ effects: referencesRead.of(null) }),
      );
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        syntaxTree(u.state) !== syntaxTree(u.startState) ||
        u.state.facet(showMarkdown) !== u.startState.facet(showMarkdown) ||
        u.transactions.some((t) => t.effects.some((e) => e.is(referencesRead)))
      )
        this.decorations = citeDecorations(u.state);
    }
    destroy() {
      this.stop();
    }
  },
  {
    decorations: (p) => p.decorations,
    provide: (p) => EditorView.atomicRanges.of((v) => v.plugin(p)?.decorations ?? Decoration.none),
  },
);
