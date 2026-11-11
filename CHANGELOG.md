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
- **Auto format** on save is on by default. Figure dialog: **Go to** puts the cursor on the figure in the text.
- The preview gets a header with a hide button, like the outline's. A hidden outline or preview leaves a thin
  labelled rail at its edge; click it to show the pane again.
- **Highlight** (`==text==`, ⇧⌘H, Home tab): yellow in the editor, preview, PDF, Word and web page. Quote lines show
  their `>` in the editor. **Tab / ⇧Tab on a list item** (bulleted or numbered) nests it under the item above or lifts
  it out, with its sub-items, numbering the sub-list from 1.
- Refine pass (details in `refine.md`): fixed a crash on self-marking footnotes, an editor crash loop on links split
  across lines, `javascript:` links in web pages, and data-loss paths (New Document over the open file, saving with a
  dialog open, restores after a failed backup, concurrent `state.json` writes, silent export overwrites, BOM files).
  A `.peanut` given on the command line while the app runs now opens. Auto format no longer rewrites code samples,
  and leaves the text as written wherever formatting would change what the document says. The figure and link
  dialogs keep math and code in captions and link text as written; `$\|x\|$` in a table cell draws |x|. Later
  fixes: a quick document switch after a Customize change no longer writes one document's style into the other; Save
  As under a differently-cased name no longer deletes the document's own settings; non-UTF-8 files are refused
  instead of saved with �; odd hand-edited template styles no longer produce Word files Word rejects; the ribbon no
  longer widens the window past its edge.
- One unreadable picture, an empty link, code fence or quote, or a page break (or Book chapter heading) in a quote,
  list or note no longer stops the whole preview and PDF.
- Faster on long documents: Markdown parsing (13×), typing (the editor rereads only around each edit: 15× less work
  per keystroke) and cursor moves, and the preview reuses unchanged pages instead of reloading them.

## 2026-11-10

- **Focus on section**, a toggle at the top of the outline: the editor shows only the selected top-level section.
  Clicking a heading, or a place in the preview, picks the top-level section holding it, which the
  outline boxes in blue while its usual highlight follows the heading scrolled to inside it; Select All and typing stay
  inside it; the preview keeps scrolling in step. Remembered across launches.
- Frontend reorganized into modules: `lib/editor/`, `lib/markdown/`, `lib/actions/` and `lib/store/` folders (each
  with an `index.ts` API), components grouped into `layout/`, `ribbon/`, `panes/`, `dialogs/` and `ui/`, App logic
  in `composables/`, global CSS in `styles/`, `@/` and `@bindings/` import aliases. No behavior change.
- Clicking a footnote's number in the editor opens its note in the Footnote dialog to edit, instead of jumping to it.
