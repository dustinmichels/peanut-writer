// Footnotes in the editor: marks shown as their numbers, and the heads of
// notes as theirs.

import { EditorView, WidgetType } from "@codemirror/view";
import { plain } from "@/lib/markdown";
import { footnotesField } from "@/lib/editor/fields";
import { goTo } from "@/lib/editor/reveal";
import type { Handlers } from "@/lib/editor/types";

// noteTip is a note's text for a tooltip: plain, on one line, not too long.
function noteTip(text: string): string {
  const t = plain(text.replace(/\s+/g, " ")).trim();
  return t.length > 300 ? `${t.slice(0, 300)}…` : t;
}

// FootnoteMarkWidget stands in for a footnote mark: its number, raised, which
// shows the note's text on hover and opens the note to edit on a click. A
// mark with no note reads "?", and a click asks for the note.
export class FootnoteMarkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly number: number,
    readonly note: string | null,
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: FootnoteMarkWidget) {
    return o.label === this.label && o.number === this.number && o.note === this.note;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className =
      this.note === null
        ? "pw-footnote-ref pw-footnote-mark broken"
        : "pw-footnote-ref pw-footnote-mark";
    el.textContent = this.number > 0 ? String(this.number) : "?";
    el.title =
      this.note === null
        ? `No note is labelled ${this.label}. Click to add it.`
        : `${noteTip(this.note) || "(The note is empty.)"}\n\nClick to edit the note.`;
    el.onmousedown = (e) => e.preventDefault();
    el.onclick = () => this.handlers.editNote(this.label);
    return el;
  }
}

// NoteHeadWidget stands in for a note's `[^label]: `: the note's number, a
// click going back to its mark. A note nothing marks reads "?".
export class NoteHeadWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly number: number,
    readonly marked: boolean,
  ) {
    super();
  }
  eq(o: NoteHeadWidget) {
    return o.label === this.label && o.number === this.number && o.marked === this.marked;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = this.marked ? "pw-note-head" : "pw-note-head orphan";
    el.textContent = this.number > 0 ? String(this.number) : this.marked ? this.label : "?";
    el.title = this.marked
      ? "Click to go back to the footnote's mark."
      : `Nothing in the text marks this note (${this.label}): it isn't printed.`;
    el.onmousedown = (e) => e.preventDefault();
    el.onclick = () => {
      const marks = view.state.field(footnotesField).marks.filter((m) => m.label === this.label);
      const mark = marks.find((m) => !m.inNote) ?? marks[0];
      if (mark) goTo(view, mark.to);
    };
    return el;
  }
}
