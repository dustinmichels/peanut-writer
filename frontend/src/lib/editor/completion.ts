// Completion of cross-references: `@` offers the labelled figures, tables
// and equations.

import type { Completion, CompletionContext } from "@codemirror/autocomplete";
import { type Item, kindName, plain } from "@/lib/markdown";
import { itemsField } from "./fields";

const completionType: Record<Item["kind"], string> = {
  figure: "variable",
  table: "class",
  equation: "constant",
};

export function refCompletions(ctx: CompletionContext) {
  const word = ctx.matchBefore(/@[\w:-]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (word.from > 0 && /\w/.test(ctx.state.sliceDoc(word.from - 1, word.from))) return null;
  const options: Completion[] = ctx.state
    .field(itemsField)
    .filter((x) => x.label)
    .map((x) => ({
      label: "@" + x.label,
      detail: `${kindName[x.kind]} ${x.number}`,
      info: plain(x.caption),
      type: completionType[x.kind],
    }));
  return options.length ? { from: word.from, options, validFor: /^@[\w:-]*$/ } : null;
}
