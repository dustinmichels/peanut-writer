// Highlighted text in the editor's Markdown: `==text==`, read as
// strikethrough's `~~` is: exactly two `=`, opening before a non-space and
// closing after one (internal/doc follows the same rules).

import type { DelimiterType, MarkdownConfig } from "@lezer/markdown";
import { Tag, tags as t } from "@lezer/highlight";

export const highlightTag = Tag.define();

const equals = 61;
const delim: DelimiterType = { resolve: "Highlight", mark: "HighlightMark" };
const punctuation = /[\p{P}\p{S}]/u;

export const highlight: MarkdownConfig = {
  defineNodes: [
    { name: "Highlight", style: { "Highlight/...": highlightTag } },
    { name: "HighlightMark", style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: "Highlight",
      parse(cx, next, pos) {
        if (next !== equals || cx.char(pos + 1) !== equals || cx.char(pos + 2) === equals)
          return -1;
        if (cx.char(pos - 1) === equals) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = punctuation.test(before);
        const pAfter = punctuation.test(after);
        return cx.addDelimiter(
          delim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      after: "Emphasis",
    },
  ],
};
