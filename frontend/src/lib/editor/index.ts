// The Markdown editor: CodeMirror with Word-like conveniences. Unless the
// Markdown is shown, its marks are out of sight: headings, emphasis, links,
// quotes and bullets read as formatted text, figures, tables and display
// equations as pictures, grids and drawn math, cross-references as "Figure
// 2", and the front matter as a document properties card. Math in a line
// stays as its TeX, set apart.

export {
  activeMarks,
  type BlockStyle,
  blockStyleAt,
  clearFormatting,
  insertBlock,
  insertDivider,
  inlineMath,
  insertFootnote,
  insertText,
  noteText,
  type Mark,
  setBlockStyle,
  toggleCodeBlock,
  toggleList,
  toggleMark,
  writeNote,
} from "./commands";
export { crossRefs, equationsField, itemsField } from "./fields";
export { focusedLines, focusSection } from "./focus";
export { goTo, lineScrollTop, revealLine, revealSource } from "./reveal";
export { createEditor, replaceDoc } from "./setup";
export { setShowMarkdown } from "./theme";
export type { Handlers } from "./types";
export { pictureURL } from "./widgets/figure";
