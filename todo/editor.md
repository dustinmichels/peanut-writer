# Editor (`frontend/src`)

The editor's numbering (`lib/markdown.ts` `scan`) mirrors `internal/doc` but not completely, so editor labels and the
preview can disagree:

- Only top-level blocks are scanned: figures and tables inside lists or quotes are numbered by Go but not the editor.
- Multi-line table captions aren't recognised; Go accepts them.
- A picture grid is only recognised with its `Figure:` caption on a line of its own, and a multi-line caption isn't;
  Go accepts both (the editor writes neither).
- A 4-backtick fence closed by 3 backticks, and indented code blocks, are handled differently from Go.
- `parseAttrs` doesn't split quoted values with spaces like Go; `width=50px` is 50 in the editor, 0 in Go.
- Nothing checks the two agree: `scan` and `doc.Parse` are only kept in step by hand. A shared set of Markdown samples
  (e.g. `internal/doc/testdata/numbering/*.md`), run through `doc.Parse` in a Go test and `scan` in a `bun test`
  comparing kind, label and number per item, would catch drift. Samples must avoid the gaps above or they get fixed
  first. Kept as two implementations because `scan` runs on every keystroke and returns the text offsets the dialogs
  edit by; Go's model has neither.

Other gaps:

- `date: today` shows as "today" on the properties card; only Go expands it.
- No Heading 4 style in the ribbon, though shortcuts and `blockStyleAt` produce `h4` (H4–H6); no style is highlighted on
  those lines.
- Inserting a divider (`---`) at offset 0 of a document with a later `---` line turns the top into front matter.
- Dropping a `.md` file on the editor shows an error instead of opening it (only pictures are handled).
- Menu → Find opens the search panel behind an open dialog; the cheat sheet replaces any open dialog.
- `TemplateGallery.vue`: preview blob URLs are never revoked, and previews of saved or imported user templates aren't
  refreshed after one is edited (they're keyed by id and loaded once; only the document's Custom template reloads).
- ⌘S twice quickly on an untitled document queues a second Save dialog, shown if the first is canceled.
- Backups started when switching documents run in the background and may be cut short by quitting right after.
- `FigureDialog.vue` reference count counts `@fig:a` inside `@fig:ab` (only used in a hint).
- `applyTable` always writes a `Table:` caption line with a generated label, even with an empty caption.
