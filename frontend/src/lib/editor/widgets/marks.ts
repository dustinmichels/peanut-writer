// Widgets standing in for hidden Markdown marks: a heading's #s, a quote's
// >, bullets, rules and code fences.

import { WidgetType } from "@codemirror/view";

// HeadingMarkWidget shows a heading's #s, which stay out of the cursor's way
// like the rest of the line's prefix.
export class HeadingMarkWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }
  eq(o: HeadingMarkWidget) {
    return o.level === this.level;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-heading-mark";
    el.textContent = "#".repeat(this.level) + " ";
    return el;
  }
}

// QuoteMarkWidget shows a quote's >, so a quote just begun shows it's one.
export class QuoteMarkWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-quote-mark";
    el.textContent = "> ";
    return el;
  }
}

export class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-bullet";
    el.textContent = "•";
    return el;
  }
}

export class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-rule";
    return el;
  }
}

export class FenceWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }
  eq(o: FenceWidget) {
    return o.lang === this.lang;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "pw-fence";
    el.textContent = this.lang;
    return el;
  }
}
