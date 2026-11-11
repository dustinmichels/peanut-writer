// How the editor looks: syntax highlighting for hidden and shown Markdown,
// and the theme.

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { showMarkdown } from "./fields";
import { highlightTag } from "./highlight";
import { mathTag } from "./math";

export const showSlot = new Compartment();

export function showExtension(show: boolean): Extension {
  return show
    ? [
        showMarkdown.of(true),
        syntaxHighlighting(sourceHighlight),
        EditorView.editorAttributes.of({ class: "pw-source" }),
      ]
    : syntaxHighlighting(highlight);
}

// setShowMarkdown shows or hides the document's Markdown.
export function setShowMarkdown(view: EditorView, show: boolean) {
  view.dispatch({ effects: showSlot.reconfigure(showExtension(show)) });
}

const highlightCommon = [
  { tag: [t.heading1, t.heading2, t.strong], fontWeight: "700" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: "650" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: highlightTag, backgroundColor: "var(--highlight)", borderRadius: "2px" },
  { tag: t.link, color: "var(--accent-ink)", textDecoration: "underline" },
  { tag: t.url, color: "var(--muted)" },
  { tag: [t.processingInstruction, t.meta], color: "var(--marks)" },
  { tag: t.contentSeparator, color: "var(--marks)" },
  { tag: t.quote, color: "var(--quote)" },
  { tag: t.list, color: "var(--accent-ink)" },
];

const highlight = HighlightStyle.define([
  ...highlightCommon,
  { tag: t.monospace, fontFamily: "var(--mono)", fontSize: "0.92em", color: "var(--roast)" },
  { tag: mathTag, fontFamily: "var(--mono)", fontSize: "0.92em", color: "var(--math)" },
]);

// Shown Markdown is all mono already: only colors and weights.
const sourceHighlight = HighlightStyle.define([
  ...highlightCommon,
  { tag: t.monospace, color: "var(--roast)" },
  { tag: mathTag, color: "var(--math)" },
]);

export const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", fontSize: "16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--writing)",
    lineHeight: "1.7",
    overflow: "auto",
  },
  ".cm-content": {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "36px 48px 40vh",
    caretColor: "var(--roast)",
  },
  ".cm-line": { padding: "0 2px" },
  ".cm-activeLine": { backgroundColor: "rgba(217, 158, 130, 0.07)" },
  ".cm-cursor": { borderLeftColor: "var(--roast)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(217, 158, 130, 0.32) !important",
  },
  ".cm-placeholder": { color: "var(--muted)", fontStyle: "italic" },
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    borderColor: "var(--border)",
  },
});
