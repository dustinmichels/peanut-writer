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
- Refine passes: fixed a crash on self-marking footnotes, an editor crash loop on links split
  across lines, `javascript:` links in web pages, and data-loss paths (New Document over the open file, saving with a
  dialog open, failed backups before restores, backups pruned after the clock went back, concurrent `state.json`
  writes, silent export overwrites, Save As under another case, a Customize change landing in the next document,
  non-UTF-8 and BOM files). Auto format no longer rewrites code samples or changes what a document says. Styling a
  Select All no longer copies or breaks the front matter; Bold across paragraphs styles each one; Clear Formatting
  leaves code and math alone; heading styles convert underlined headings. Properties with emoji or escapes save and
  read back the same in the app and the PDF, and the editor numbers figures and notes as the PDF does.
- The preview and PDF no longer fail on one unreadable picture, an empty link, code fence or quote, a page break (or
  Book chapter heading) in a quote, list or note, or deeply nested quotes and lists; overlong words and URLs break
  instead of running off the page. Word keeps figure numbers in notes within notes on Update Fields.
- Faster on long documents: Markdown parsing (13×), typing (the editor rereads only around each edit: 15× less work
  per keystroke) and cursor moves, and the preview reuses unchanged pages instead of reloading them.
- Go 1.27.4 and `golang.org/x/mod` v0.42.0.
- Docs rewritten around keeping content apart from style, each fact in one place: the Markdown and LaTeX page is gone,
  built-in templates live under **Templates**, equations under **Figures, tables and references**, and new pages cover
  **Install** (disk image, Homebrew tap), **Peanut**, **The .peanut format** and **Coming from other Markdown apps**.
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
