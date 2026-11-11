// Cross-references in the editor, shown as what they print ("Figure 2").

import { EditorView, WidgetType } from "@codemirror/view";
import type { Handlers } from "@/lib/editor/types";

export class RefWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly text: string,
    readonly ok: boolean,
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: RefWidget) {
    return o.label === this.label && o.text === this.text && o.ok === this.ok;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = this.ok ? "pw-ref" : "pw-ref broken";
    el.textContent = this.text;
    el.title = this.ok
      ? `Cross-reference to ${this.label}. Click to change or unlink it.`
      : `Nothing is labelled ${this.label}. Click to change or remove it.`;
    el.onmousedown = (e) => e.preventDefault();
    el.onclick = () => {
      // The widget may have moved since it was drawn.
      const from = view.posAtDOM(el);
      this.handlers.editRef({
        from,
        to: from + this.label.length + 1,
        label: this.label,
        text: this.ok ? this.text : "",
      });
    };
    return el;
  }
}
