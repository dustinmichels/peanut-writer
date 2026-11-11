// Tables in the editor: a bar naming the table over a grid drawing it.

import { EditorView, WidgetType } from "@codemirror/view";
import { type Item, plain, type Table } from "@/lib/markdown";
import { itemsField } from "@/lib/editor/fields";
import { startMove } from "@/lib/editor/move";
import type { Handlers } from "@/lib/editor/types";
import { gripIcon } from "./icons";

// TableBar stands in for a table's Markdown: it names the table, opens it
// for editing and draws it below.
export class TableBar extends WidgetType {
  constructor(
    readonly item: Item,
    readonly handlers: Handlers,
    readonly table: Table,
  ) {
    super();
  }
  eq(o: TableBar) {
    return (
      o.item.number === this.item.number &&
      o.item.caption === this.item.caption &&
      JSON.stringify(o.table) === JSON.stringify(this.table)
    );
  }
  toDOM(view: EditorView) {
    const bar = document.createElement("div");
    bar.className = "pw-tablebar";
    const root = document.createElement("div");
    const badge = document.createElement("span");
    badge.className = "pw-badge";
    badge.textContent = `Table ${this.item.number}`;
    const cap = document.createElement("span");
    cap.className = "pw-tablebar-caption";
    cap.textContent = plain(this.item.caption) || "No caption yet";
    const edit = document.createElement("button");
    edit.className = "pw-widget-btn";
    edit.textContent = "Edit table";
    edit.onmousedown = (e) => e.preventDefault();
    const current = () => {
      const pos = view.posAtDOM(root);
      return view.state
        .field(itemsField)
        .find((x) => x.kind === "table" && Math.abs(x.from - pos) <= 1);
    };
    const open = () => {
      const item = current();
      if (item) this.handlers.editTable(item);
    };
    edit.onclick = open;
    const grip = document.createElement("div");
    grip.className = "pw-tablebar-grip";
    grip.title = "Drag to move";
    grip.append(gripIcon());
    grip.onpointerdown = (e) => startMove(view, root, grip, e, current);
    bar.append(grip, badge, cap, edit);

    root.className = "pw-table";
    const grid = document.createElement("table");
    const t = this.table;
    const row = (cells: string[], tag: "th" | "td") => {
      const tr = document.createElement("tr");
      cells.forEach((c, i) => {
        const cell = document.createElement(tag);
        cell.textContent = plain(c);
        if (t.align[i]) cell.style.textAlign = t.align[i];
        tr.append(cell);
      });
      return tr;
    };
    const head = document.createElement("thead");
    head.append(row(t.header, "th"));
    const body = document.createElement("tbody");
    for (const r of t.rows) body.append(row(r, "td"));
    grid.append(head, body);
    grid.ondblclick = open;
    root.append(bar, grid);
    return root;
  }
  ignoreEvent() {
    return true;
  }
}
