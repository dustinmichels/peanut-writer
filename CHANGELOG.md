# Changelog

## 2026-11-11

- Command palette: **Toggle Focus on Section** (View), dimmed while the document has no headings.
- View ribbon: the Markdown toggle gets its own **Markdown** group; Outline, Preview and Versions sit under **Panes**.
  **Restore Defaults** (also in the command palette) hides the Markdown and versions, shows the outline and preview
  at an even split, leaves section focus and fits the preview's zoom.

## 2026-11-10

- **Focus on section**, a toggle at the top of the outline: the editor shows only the selected top-level section.
  Clicking a heading, or a place in the preview, picks the top-level section holding it, which the
  outline boxes in blue while its usual highlight follows the heading scrolled to inside it; Select All and typing stay
  inside it; the preview keeps scrolling in step. Remembered across launches.
- Frontend reorganized into modules: `lib/editor/`, `lib/markdown/`, `lib/actions/` and `lib/store/` folders (each
  with an `index.ts` API), components grouped into `layout/`, `ribbon/`, `panes/`, `dialogs/` and `ui/`, App logic
  in `composables/`, global CSS in `styles/`, `@/` and `@bindings/` import aliases. No behavior change.
- Clicking a footnote's number in the editor opens its note in the Footnote dialog to edit, instead of jumping to it.
