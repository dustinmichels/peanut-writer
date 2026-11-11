// The Markdown editor: CodeMirror with Word-like conveniences. Unless the
// Markdown is shown, its marks are out of sight: headings, emphasis, links,
// quotes and bullets read as formatted text, figures and tables as pictures
// and grids, cross-references as "Figure 2", and the front matter as a
// document properties card. Math stays as its TeX, set apart.

export {
  activeMarks,
  type BlockStyle,
  blockStyleAt,
  clearFormatting,
  insertBlock,
  insertDivider,
  insertEquation,
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
export { crossRefs, itemsField } from "./fields";
export { focusedLines, focusSection } from "./focus";
export { goTo, lineScrollTop, revealLine, revealSource } from "./reveal";
export { createEditor, replaceDoc } from "./setup";
export { setShowMarkdown } from "./theme";
export type { Handlers } from "./types";
export { pictureURL } from "./widgets/figure";
