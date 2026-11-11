// Display equations in the editor: a bar naming the equation over the
// equation drawn, standing in for its `$$` lines.

import { EditorView, WidgetType } from "@codemirror/view";
import type { DisplayEquation } from "@/lib/markdown";
import { equationsField } from "@/lib/editor/fields";
import { startMove } from "@/lib/editor/move";
import type { Handlers } from "@/lib/editor/types";
import { gripIcon } from "./icons";

export class EquationWidget extends WidgetType {
  constructor(
    readonly math: DisplayEquation,
    readonly number: number, // 0 when it isn't numbered
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: EquationWidget) {
    return (
      o.math.tex === this.math.tex && o.math.label === this.math.label && o.number === this.number
    );
  }
  toDOM(view: EditorView) {
    const root = document.createElement("div");
    root.className = "pw-equation";
    // The equation as the document has it now (this widget may be older).
    const current = () => {
      const pos = view.posAtDOM(root);
      return view.state.field(equationsField).find((x) => Math.abs(x.from - pos) <= 1);
    };
    const open = () => {
      const eq = current();
      if (eq) this.handlers.editEquation(eq);
    };

    const bar = document.createElement("div");
    bar.className = "pw-tablebar";
    const grip = document.createElement("div");
    grip.className = "pw-tablebar-grip";
    grip.title = "Drag to move";
    grip.append(gripIcon());
    grip.onpointerdown = (e) => startMove(view, root, grip, e, current);
    const badge = document.createElement("span");
    badge.className = "pw-badge";
    badge.textContent = this.number ? `Equation ${this.number}` : "Equation";
    const name = document.createElement("span");
    name.className = "pw-tablebar-caption";
    name.textContent = this.math.label ? `@${this.math.label}` : "Not numbered";
    const edit = document.createElement("button");
    edit.className = "pw-widget-btn";
    edit.textContent = "Edit equation";
    edit.onmousedown = (e) => e.preventDefault();
    edit.onclick = open;
    bar.append(grip, badge, name, edit);

    // The TeX until it's drawn, and in its place when it can't be.
    const body = document.createElement("div");
    body.className = "pw-equation-body";
    body.ondblclick = open;
    const tex = document.createElement("code");
    tex.className = "pw-equation-tex";
    tex.textContent = this.math.tex || "Empty equation";
    body.append(tex);
    if (this.math.tex) {
      this.handlers.equationURL(this.math.tex).then((url) => {
        if (!url) {
          body.classList.add("unreadable");
          body.title = "This TeX can't be read";
          return;
        }
        const img = document.createElement("img");
        img.src = url;
        img.alt = this.math.tex;
        img.draggable = false;
        tex.replaceWith(img);
      });
    }
    if (this.number) {
      const no = document.createElement("span");
      no.className = "pw-equation-number";
      no.textContent = `(${this.number})`;
      body.append(no);
    }
    root.append(bar, body);
    return root;
  }
  ignoreEvent() {
    return true;
  }
}
