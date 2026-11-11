// view.ts toggles the panes and modes of the window.

import { focusedLines, focusSection, setShowMarkdown } from "@/lib/editor";
import { editor, state } from "@/lib/store";

export function toggleMarkdown() {
  state.showMarkdown = !state.showMarkdown;
  localStorage.setItem("showMarkdown", state.showMarkdown ? "1" : "0");
  if (editor.value) setShowMarkdown(editor.value, state.showMarkdown);
}

export function toggleOutline() {
  state.outlineOpen = !state.outlineOpen;
  localStorage.setItem("outline", state.outlineOpen ? "1" : "0");
}

export function toggleFocusSection() {
  state.focusSection = !state.focusSection;
  localStorage.setItem("focusSection", state.focusSection ? "1" : "0");
  if (editor.value && !state.focusSection) focusSection(editor.value, null);
  else focusCurrentSection();
}

// sectionOf is the top-level heading whose section holds line n: the last
// heading of the outline's top level at or above it (or, above the first of
// those, the last heading of any level).
export function sectionOf(n: number): number | undefined {
  const top = Math.min(...state.outline.map((h) => h.level));
  const above = state.outline.filter((h) => h.line <= n);
  return (above.findLast((h) => h.level === top) ?? above.at(-1))?.line;
}

// focusCurrentSection, focused on sections, shows the top-level section the
// editor is scrolled to (the first above any heading) unless it already shows one.
export function focusCurrentSection() {
  const view = editor.value;
  if (!view || !state.focusSection || focusedLines(view.state)) return;
  const line = sectionOf(state.currentHeading || (state.outline[0]?.line ?? 0));
  if (line) focusSection(view, line);
}

export function toggleVersions() {
  state.versionsOpen = !state.versionsOpen;
  localStorage.setItem("versions", state.versionsOpen ? "1" : "0");
}

export function togglePreview() {
  state.previewOpen = !state.previewOpen;
  localStorage.setItem("preview", state.previewOpen ? "1" : "0");
}

// restoreView puts the panes and modes of the window back as they first
// were: Markdown hidden, the outline and preview shown at an even split, the
// versions hidden, no section focused and the preview fit to its width.
export function restoreView() {
  if (state.showMarkdown) toggleMarkdown();
  if (!state.outlineOpen) toggleOutline();
  if (state.focusSection) toggleFocusSection();
  if (state.versionsOpen) toggleVersions();
  if (!state.previewOpen) togglePreview();
  state.split = 0.5;
  localStorage.removeItem("split");
  state.zoom = 0;
}
