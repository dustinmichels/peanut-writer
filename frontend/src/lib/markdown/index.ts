// Reading and writing the parts of Peanut Writer's Markdown the editor
// helps with: front matter, figures, tables, equations, captions and labels.
// The Go side (internal/doc) is what renders; this mirrors its rules closely
// enough to number things the same way while typing.

export type { Position } from "./attrs";
export { displayMathClose } from "./fences";
export {
  type FootnoteMark,
  type Footnotes,
  gatherFootnotes,
  renumberFootnotes,
  scanFootnotes,
} from "./footnotes";
export { type Meta, readFrontMatter, writeFrontMatter } from "./frontMatter";
export {
  captionMarkdown,
  type DisplayEquation,
  displayEquations,
  equationMarkdown,
  type FigureSpec,
  figureMarkdown,
  figureSpec,
  type Item,
  type Kind,
  kindName,
  type Picture,
  type RefAt,
  relabelChanges,
  scan,
  uniqueLabel,
} from "./items";
export {
  type Align,
  emptyTable,
  parseDelimited,
  parseTable,
  type Table,
  writeTable,
} from "./tables";
export { plain, readable, sentenceAround, wordCount } from "./text";
