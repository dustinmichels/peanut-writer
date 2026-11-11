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
    const btn = document.createElement("button");
    btn.className = "pw-widget-btn";
    btn.textContent = "Edit header";
    btn.onmousedown = (e) => e.preventDefault();
    const open = () => this.handlers.editProperties();
    btn.onclick = open;
    el.ondblclick = open;
    el.append(text, btn);
    return block(el, "pw-props-block");
  }
  ignoreEvent() {
    return true;
  }
}
