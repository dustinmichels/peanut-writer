// tables.ts writes tables into the document.

import { insertBlock, itemsField } from "@/lib/editor";
import { captionMarkdown, type Item, type Table, uniqueLabel, writeTable } from "@/lib/markdown";
import { view } from "./run";

// applyTable writes table in place of item's, or inserts it, with its caption
// line; a table with neither caption nor name gets none.
export function applyTable(item: Item | undefined, table: Table, caption: string, label: string) {
  const v = view();
  const items = v.state.field(itemsField);
  const id = label || (caption && uniqueLabel("tbl", caption, items, item?.label ?? ""));
  const text = writeTable(table) + (caption || id ? `\n\n${captionMarkdown(caption, id)}` : "");
  if (item) {
    v.dispatch({
      changes: { from: item.tableFrom!, to: item.to, insert: text },
      userEvent: "input",
    });
    v.focus();
  } else {
    insertBlock(v, text);
  }
}
