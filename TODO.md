# Known gaps and incomplete features

Things the app doesn't do yet, or does differently in different places. Each entry names where the gap lives.

## Markdown dialect (`internal/doc`)

- **Figures in footnotes** aren't figures: the image shows inline with its `{#fig:…}` block as text, unnumbered and
  not referable (goldmark adds a backlink to the footnote's last paragraph, so `figure()` rejects it).
- **Labels must start `fig:` or `tbl:`** to be referable. `{#chart}` is accepted but `@chart` is plain text.
- **`\@fig:a` isn't an escape**: it still becomes a reference.
- **Front matter is flat `key: value`**: no multi-line values (`|`, `>`), no `''` escapes in single quotes; unknown
  keys are dropped silently.
- **HTML**: HTML blocks are dropped; inline HTML other than `<br>` is dropped.
- **Online images** (`https://…`) aren't fetched; they show as missing with a note.

## Editor (`frontend/src`)

The editor's numbering (`lib/markdown.ts` `scan`) mirrors `internal/doc` but not completely, so editor labels and the
preview can disagree:

- Only top-level blocks are scanned: figures and tables inside lists or quotes are numbered by Go but not the editor.
- Multi-line table captions aren't recognised; Go accepts them.
- A picture grid is only recognised with its `Figure:` caption on a line of its own, and a multi-line caption isn't;
  Go accepts both (the editor writes neither).
- A 4-backtick fence closed by 3 backticks, and indented code blocks, are handled differently from Go.
- `parseAttrs` doesn't split quoted values with spaces like Go; `width=50px` is 50 in the editor, 0 in Go.

Other gaps:

- `date: today` shows as "today" on the properties card; only Go expands it.
- No Heading 4 style in the ribbon, though shortcuts and `blockStyleAt` produce `h4` (H4–H6); no style is highlighted on
  those lines.
- Inserting a divider (`---`) at offset 0 of a document with a later `---` line turns the top into front matter.
- Dropping a `.md` file on the editor shows an error instead of opening it (only pictures are handled).
- Menu → Find opens the search panel behind an open dialog; the cheat sheet replaces any open dialog.
- `TemplateGallery.vue`: preview blob URLs are never revoked, and previews aren't refreshed after a custom template is
  edited (the Go side caches by source hash, but the gallery never asks again).
- ⌘S twice quickly on an untitled document queues a second Save dialog, shown if the first is canceled.
- Backups started when switching documents run in the background and may be cut short by quitting right after.
- `FigureDialog.vue` reference count counts `@fig:a` inside `@fig:ab` (only used in a hint).
- `applyTable` always writes a `Table:` caption line with a generated label, even with an empty caption.

## Word export (`internal/docx`)

- Lists inside quotes or footnotes use List Paragraph, losing the quote look / footnote size; a quote inside a footnote
  is body-sized.
- Code blocks, tables, quotes and figures inside list items aren't indented with the list; tables are always full
  width.
- A footnote starting with an uncaptioned table puts its number mark in the first cell.
- Links to `#anchors` are written as plain text; relative file links become external links.
- Numbered headings number levels 1–3 only; parity with the Typst templates is unchecked.
- Code block language is ignored (no highlighting).
- WebP figures and size-less SVGs without `width=` are drawn full width; PNG/JPEG natural size assumes 96 dpi; JPEG
  EXIF rotation is ignored (rotated photos may be stretched).
- Without Typst, SVG and WebP images become an `[image: name]` placeholder.

## App and templates (`service.go`, `internal/templates`, `internal/render`)

- **Broken user templates fail silently**: a template folder whose `template.json` doesn't parse is skipped by
  `templates.List`, and a document naming it falls back to Classic with no note.
- Customizing a custom template names it "X (custom) (custom)".
- **Save As copies only inline images** found by a regex (`imageRef`): reference-style images (`![a][ref]`) and paths
  containing `)` are left behind.
- One document per window, one window: `DocService` holds a single open document.
- `Reveal` on Linux opens the folder rather than selecting the file.
- Typst is found beside the executable, on `PATH`, or in Homebrew/mise/cargo locations; Windows and Linux have no
  install-location fallbacks.
- `go build ./...` fails on the Wails scaffold package `build/ios` (no `main`); build the app with `go build .` or
  `mise run build`. The Android/iOS/Docker/server tasks in `Taskfile.yml` are untouched Wails scaffolding.
