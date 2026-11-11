// Completion of cross-references: `@` offers the labelled figures, tables
// and equations, those whose label a reference can hold (`fig:café` reads as
// `@fig:caf`, `cat` as no reference). Not in code, math or the front matter,
// where `@` is no reference (and Enter would take a `@fi…` decorator).

import type { Completion, CompletionContext } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { type Item, kindName, plain } from "@/lib/markdown";
import { codeNodes, frontMatterEnd, itemsField } from "./fields";

const completionType: Record<Item["kind"], string> = {
  figure: "variable",
  table: "class",
  equation: "constant",
};

// A label a reference reads whole (as crossRefs and internal/doc do).
const referable = /^(?:fig|tbl|eq):[A-Za-z0-9_-]*[A-Za-z0-9_]$/;

export function refCompletions(ctx: CompletionContext) {
  const word = ctx.matchBefore(/@[\w:-]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (word.from > 0 && /\w/.test(ctx.state.sliceDoc(word.from - 1, word.from))) return null;
  if (word.from < ctx.state.field(frontMatterEnd)) return null;
  for (
    let n: SyntaxNode | null = syntaxTree(ctx.state).resolveInner(word.from, 1);
    n;
    n = n.parent
  ) {
    if (codeNodes.has(n.name)) return null;
  }
  const options: Completion[] = ctx.state
    .field(itemsField)
    .filter((x) => referable.test(x.label))
    .map((x) => ({
      label: "@" + x.label,
      detail: `${kindName[x.kind]} ${x.number}`,
      info: plain(x.caption),
      type: completionType[x.kind],
    }));
  return options.length ? { from: word.from, options, validFor: /^@[\w:-]*$/ } : null;
}
