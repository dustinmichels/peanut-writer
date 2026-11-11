# Changelog

## 2026-11-11

- Three new built-in templates: **Technical** (docs and specs: numbered headings, code panels, note callouts),
  **Memo** (From / Date / Re / Subject block, summary bar) and **Book** (title page, "Chapter n" openings on new
  pages, running heads).
- **Equations are blocks** in the editor, like figures and tables: drawn by Typst, numbered when named, moved by their
  grip, and edited (LaTeX and reference name, with a live drawing and buttons for fractions, roots, sums, Greek
  letters and symbols) in a dialog from **Edit equation** or a double click. **Insert → Equation** opens that dialog
  for a new one; selected text in a line still becomes inline math.
- Command palette: **Toggle Focus on Section** (View), dimmed while the document has no headings.
- View ribbon: the Markdown toggle gets its own **Markdown** group; Outline, Preview and Versions sit under **Panes**.
  **Restore Defaults** (also in the command palette) hides the Markdown and versions, shows the outline and preview
  at an even split, leaves section focus and fits the preview's zoom.
- **Auto format** on save is on by default.
- Figure dialog: **Go to** closes it and puts the cursor on the figure in the text.
- The preview gets a header with a hide button, like the outline's. A hidden outline or preview leaves a thin
  labelled rail at its edge; click it to show the pane again.
- `mise run docs:demo` records a captioned demo video of the app (server mode in WebKit, drawn cursor, title cards)
  with a generated soundtrack into `demo/` (gitignored; how it's made in `demo/README.md`). The tour starts from a
  blank saved document, gets a pep talk from Peanut, pastes a table from a spreadsheet, adds the title block late and
  names a version; `-- <name>` writes `demo/<name>.mp4` beside earlier takes.

## 2026-11-10

- **Focus on section**, a toggle at the top of the outline: the editor shows only the selected top-level section.
  Clicking a heading, or a place in the preview, picks the top-level section holding it, which the
  outline boxes in blue while its usual highlight follows the heading scrolled to inside it; Select All and typing stay
  inside it; the preview keeps scrolling in step. Remembered across launches.
- Frontend reorganized into modules: `lib/editor/`, `lib/markdown/`, `lib/actions/` and `lib/store/` folders (each
  with an `index.ts` API), components grouped into `layout/`, `ribbon/`, `panes/`, `dialogs/` and `ui/`, App logic
  in `composables/`, global CSS in `styles/`, `@/` and `@bindings/` import aliases. No behavior change.
- Clicking a footnote's number in the editor opens its note in the Footnote dialog to edit, instead of jumping to it.
