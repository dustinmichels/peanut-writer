// The table of contents in the editor: `[TOC]` shown as a bar to move or
// delete whole.

import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import { type Span, startMove } from "@/lib/editor/move";
import { block } from "./block";
import { gripIcon } from "./icons";

export const tocRe = /^\[(TOC|toc)\]$/;

// tocBlocks are the paragraphs of only `[TOC]`, which internal/doc reads as
// the table of contents.
export function tocBlocks(state: EditorState): Span[] {
  const out: Span[] = [];
  for (let n = syntaxTree(state).topNode.firstChild; n; n = n.nextSibling)
    if (n.name === "Paragraph" && tocRe.test(state.sliceDoc(n.from, n.to).trim()))
      out.push({ from: n.from, to: n.to });
  return out;
}

// TocWidget stands in for `[TOC]`: it is kept or deleted whole, and moved by
// its grip.
export class TocWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM(view: EditorView) {
    const bar = document.createElement("div");
    bar.className = "pw-tablebar pw-toc";
    const current = () => {
      const pos = view.posAtDOM(bar);
      return tocBlocks(view.state).find((x) => Math.abs(x.from - pos) <= 1);
    };
    const grip = document.createElement("div");
    grip.className = "pw-tablebar-grip";
    grip.title = "Drag to move";
    grip.append(gripIcon());
    grip.onpointerdown = (e) => startMove(view, bar, grip, e, current);
    const badge = document.createElement("span");
    badge.className = "pw-badge";
    badge.textContent = "TOC";
    const cap = document.createElement("span");
    cap.className = "pw-tablebar-caption";
    cap.textContent = "Table of contents";
    bar.append(grip, badge, cap);
    return block(bar, "pw-toc-block");
  }
  ignoreEvent() {
    return true;
  }
}
