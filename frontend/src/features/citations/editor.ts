// The citation manager's hints in the editor: `[@` (or `; @` inside the
// brackets) completes the document's reference keys, and hovering a citation
// says what it cites. Not in code, math or the front matter, where `@` cites
// nothing.

import type { Completion, CompletionContext, CompletionSource } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView, hoverTooltip } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { codeNodes, frontMatterEnd } from "@/lib/editor/fields";
import { citations } from "@/lib/markdown";
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
