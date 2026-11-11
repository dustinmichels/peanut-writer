// The actions: what the menus, the ribbon and the dialogs do to the document.

export { insertCrossRef, unlinkCrossRef } from "./crossrefs";
export {
  contentChanged,
  forgetRecent,
  loadDoc,
  loadSettings,
  newDoc,
  openDoc,
  openRecent,
  openWelcome,
  showRecent,
} from "./documents";
export {
  exportDocx,
  exportHtml,
  exportPdf,
  packageOf,
  showInFolder,
  showPackageContents,
  syncFiles,
} from "./export";
export { menu } from "./menu";
export {
  addPictures,
  applyFigure,
  choosePicture,
  choosePictureGrid,
  deleteBlock,
  insertImageFiles,
  insertImages,
  replacePicture,
} from "./pictures";
export { docsUrl, repoUrl } from "./run";
export { autoFormat, defaultSettings, effectiveSettings, save, saveAs } from "./saving";
export { applyTable } from "./tables";
export {
  customizeTemplate,
  deleteTemplate,
  editTemplate,
  importTemplate,
  openTemplatesFolder,
  refreshTemplates,
  removeCustomTemplate,
  renameTemplate,
  saveCustomTemplate,
  setMeta,
  setTemplate,
  setTemplateBase,
  setTemplateStyle,
  shareTemplate,
} from "./templates";
export { editLink, insertLoremIpsum, newFootnote } from "./text";
export { loadBackup, loadVersion, saveVersion } from "./versions";
export {
  focusCurrentSection,
  restoreView,
  sectionOf,
  toggleFocusSection,
  toggleMarkdown,
  toggleOutline,
  togglePreview,
  toggleVersions,
} from "./view";
