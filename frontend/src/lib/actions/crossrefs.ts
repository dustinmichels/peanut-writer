// crossrefs.ts inserts and unlinks cross-references.

import type { ChangeSpec } from "@codemirror/state";
import { itemsField } from "@/lib/editor";
import {
  captionMarkdown,
  figureMarkdown,
  figureSpec,
  type Item,
  type RefAt,
  uniqueLabel,
} from "@/lib/markdown";
import { view } from "./run";

const labelPrefix = { figure: "fig", table: "tbl", equation: "eq" } as const;

// refLabel is a name typed in a dialog as a cross-reference can use it, after
// its kind's prefix ("cat" names a figure `fig:cat`): accents dropped, and
// anything else a reference can't hold (spaces, `'`, `.`) as a dash. "" when
// nothing is left.
export function refLabel(prefix: "fig" | "tbl" | "eq", typed: string): string {
  let l = typed.trim();
  if (l.startsWith(`${prefix}:`)) l = l.slice(prefix.length + 1);
  l = l
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return l ? `${prefix}:${l}` : "";
}

// insertCrossRef inserts a reference to item at the cursor, or in place of the
// reference at `at`, first giving the item a label if it has none.
export function insertCrossRef(item: Item, at?: RefAt) {
  const v = view();
  const items = v.state.field(itemsField);
  const changes: ChangeSpec[] = [];
  let label = item.label;
  if (!label) {
    label = uniqueLabel(labelPrefix[item.kind], item.caption, items);
    // Inside a list or quote, new lines carry its markers.
    const prefix = item.prefix ?? "";
    if (item.kind === "figure") {
      changes.push({
        from: item.from,
        to: item.to,
        insert: figureMarkdown({ ...figureSpec(item), label }).replaceAll("\n", "\n" + prefix),
      });
    } else if (item.kind === "equation") {
      changes.push({ from: item.to, insert: ` {#${label}}` });
    } else if (item.captionFrom !== undefined) {
      changes.push({
        from: item.captionFrom,
        to: item.captionTo!,
        insert: captionMarkdown(item.caption, label),
      });
    } else {
      changes.push({
        from: item.tableTo!,
        insert: `\n${prefix.trimEnd()}\n${prefix}${captionMarkdown("", label)}`,
      });
    }
  }
  const { from, to } = at ?? v.state.selection.main;
  const before = at ? "" : v.state.sliceDoc(from - 1, from);
  const text = (before && !/[\s(\[]/.test(before) ? " " : "") + "@" + label;
  changes.push({ from, to, insert: text });
  const set = v.state.changes(changes);
  // The cursor goes after the reference, wherever the other changes put it.
  v.dispatch({ changes: set, selection: { anchor: set.mapPos(to, 1) }, userEvent: "input" });
  v.focus();
}

// unlinkCrossRef turns the reference at `at` into the plain text it reads as,
// which no longer follows its target; a reference to nothing is removed.
export function unlinkCrossRef(at: RefAt) {
  const v = view();
  v.dispatch({
    changes: { from: at.from, to: at.to, insert: at.text },
    selection: { anchor: at.from + at.text.length },
    userEvent: "input",
  });
  v.focus();
}
