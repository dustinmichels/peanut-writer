# Editor (`frontend/src`)

The editor's numbering (`lib/markdown.ts` `scan`) mirrors `internal/doc`, checked by the shared samples in
`internal/doc/testdata/numbering/`: each `.want` is what `doc.Parse` numbers (`go test ./internal/doc -update` rewrites
them), and `bun test` in `frontend` checks `scan` against it. Where they still differ:

- Figures, tables and equations in footnotes are numbered by Go where the note's mark is (once per mark); the editor
  leaves them out.
- Reference-style images (`![a][ref]` with `[ref]: a.png` elsewhere) are figures in Go, not in the editor.
- Go runs figure attribute blocks through the typographer, so `{#fig:a--b}` is labelled `fig:a–b` (en dash) and
  `{#fig:it's}` `fig:it’s`; the editor keeps them as typed. Go's side is the odd one out.

Figures and tables in lists and quotes are numbered, but shown as Markdown: no widget, so no dialog or dragging. Adding
a label from the cross-reference dialog keeps their list or quote markers.

Other gaps:

- `FigureDialog.vue` reference count counts `@fig:a` inside `@fig:ab` (only used in a hint).
- Footnotes (`scanFootnotes`): renumbering on paste or drop relabels notes in place, so their order in the Markdown can
  differ from their numbers (the output is unaffected). A note within a note is shown as written, unnumbered. Deleting
  a note's `[^1]: ` with Backspace leaves its text as a paragraph and its mark as `?`. A note's second paragraph
  (indented 4 spaces) is styled as a code block, since CodeMirror's parser doesn't know footnotes.
