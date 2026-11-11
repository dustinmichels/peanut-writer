// The document properties card, standing in for the front matter.

import { WidgetType } from "@codemirror/view";
import type { Handlers } from "@/lib/editor/types";
import { block } from "./block";

export class PropertiesCard extends WidgetType {
  constructor(
    readonly title: string,
    readonly byline: string,
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: PropertiesCard) {
    return o.title === this.title && o.byline === this.byline;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "pw-props";
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "pw-props-title";
    title.textContent = this.title || "Untitled document";
    const by = document.createElement("div");
    by.className = "pw-props-by";
    by.textContent = this.byline || "Document properties";
    text.append(title, by);
    const hint = document.createElement("span");
    hint.className = "pw-props-edit";
    hint.textContent = "Edit header";
    // The whole card opens the dialog; keep the editor's focus and selection.
    el.title = "Edit title, author and other properties";
    el.onmousedown = (e) => e.preventDefault();
    el.onclick = () => this.handlers.editProperties();
    el.append(text, hint);
    return block(el, "pw-props-block");
  }
  ignoreEvent() {
    return true;
  }
}
