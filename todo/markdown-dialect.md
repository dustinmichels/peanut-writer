# Markdown dialect (`internal/doc`)

- **Figures in footnotes** aren't figures: the image shows inline with its `{#fig:…}` block as text, unnumbered and
  not referable (goldmark adds a backlink to the footnote's last paragraph, so `figure()` rejects it).
- **Labels must start `fig:`, `tbl:` or `eq:`** to be referable. `{#chart}` is accepted but `@chart` is plain text.
- **`\@fig:a` isn't an escape**: it still becomes a reference.
- **Front matter is flat `key: value`**: no multi-line values (`|`, `>`), no `''` escapes in single quotes; unknown
  keys are dropped silently.
- **HTML**: HTML blocks are dropped; inline HTML other than `<br>` is dropped.
- **Math is checked only for a stray `}`**: other LaTeX that mitex rejects (e.g. `$` inside `\text{…}` in an equation)
  is found only when Typst runs, and then the preview shows _all_ math as source, and PDF export fails.
- **Equation labels must start `eq:`**; `{#name}` after `$$` is ignored. Attribute blocks after `$$…$$` in text are
  plain text.
- **Online images** (`https://…`) aren't fetched; they show as missing with a note.
