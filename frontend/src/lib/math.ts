// LaTeX math in the editor's Markdown: `$…$` and `$$…$$` within text, and
// display equations on lines of their own from `$$` to `$$`, with an optional
// attribute block (`{#eq:name}`) after the closing one. What's inside is TeX,
// not Markdown, so none of it is parsed (internal/doc follows the same rules).

import type { Element, InlineContext, Line, MarkdownConfig } from "@lezer/markdown";
import { Tag, tags as t } from "@lezer/highlight";
import { displayMathClose } from "./markdown";

// Math is monospace, styled apart from code.
export const mathTag = Tag.define(t.monospace);

const dollar = 36;
const backslash = 92;
const space = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;
const digit = (c: number) => c >= 48 && c <= 57;

// inlineMath parses `$$…$$`, or `$…$` whose content neither starts nor ends
// with a space and whose closing `$` isn't followed by a digit (so "costs $5
// or $10" stays text). A backslash escapes the character after it.
function inlineMath(cx: InlineContext, next: number, pos: number): number {
  if (next !== dollar) return -1;
  const display = cx.char(pos + 1) === dollar;
  const open = display ? 2 : 1;
  const start = pos + open;
  if (!display && (start >= cx.end || space(cx.char(start)))) return -1;
  for (let i = start; i < cx.end; i++) {
    const c = cx.char(i);
    if (c === backslash) {
      i++;
      continue;
    }
    if (c !== dollar) continue;
    if (display) {
      if (cx.char(i + 1) !== dollar) continue;
    } else if (space(cx.char(i - 1)) || digit(cx.char(i + 1))) return -1;
    const end = i + open;
    return cx.addElement(
      cx.elt("InlineMath", pos, end, [
        cx.elt("MathMark", pos, start),
        cx.elt("MathMark", i, end),
      ]),
    );
  }
  return -1;
}

const opensDisplay = (line: Line) =>
  line.next === dollar &&
  line.text.charCodeAt(line.pos + 1) === dollar &&
  line.indent - line.baseIndent < 4;

// Line.depth (the composite blocks, quotes and lists, the line is in) isn't
// in the typings.
type DepthLine = Line & { depth: number };

export const math: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath", style: mathTag },
    { name: "BlockMath", block: true, style: mathTag },
    { name: "MathMark", style: t.processingInstruction },
    { name: "MathAttributes", style: t.meta },
  ],
  parseInline: [{ name: "InlineMath", parse: inlineMath, after: "InlineCode" }],
  parseBlock: [
    {
      name: "BlockMath",
      parse(cx, line) {
        if (!opensDisplay(line)) return false;
        const from = cx.lineStart + line.pos;
        const marks: Element[] = [cx.elt("MathMark", from, from + 2)];
        let close = displayMathClose(line.text, line.pos + 2);
        for (;;) {
          if (close) {
            const at = cx.lineStart + close.at;
            marks.push(cx.elt("MathMark", at, at + 2));
            if (close.attrsFrom >= 0) {
              const attrs = cx.lineStart + close.attrsFrom;
              marks.push(cx.elt("MathAttributes", attrs, attrs + close.attrs.length));
            }
            cx.nextLine();
            break;
          }
          // Unclosed, it runs to the end of its container, as a code fence does.
          if (!cx.nextLine() || (line as DepthLine).depth < cx.depth) break;
          marks.push(...line.markers);
          close = displayMathClose(line.text, line.basePos);
        }
        cx.addElement(cx.elt("BlockMath", from, cx.prevLineEnd(), marks));
        return true;
      },
      endLeaf: (_cx, line) => opensDisplay(line),
    },
  ],
};
