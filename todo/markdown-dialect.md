# Markdown dialect (`internal/doc`)

- **Labels must start `fig:`, `tbl:` or `eq:`** to be referable. `{#chart}` is accepted but `@chart` is plain text.
- **`\@fig:a` isn't an escape**: it still becomes a reference.
- **`\[^1]` warns** "footnote with no note" though it's escaped text.
- **Front matter is flat `key: value`**: no multi-line values (`|`, `>`), no `''` escapes in single quotes; unknown
  keys are dropped silently.
- **HTML**: HTML blocks are dropped; inline HTML other than `<br>` is dropped.
- **Math is checked only for a stray `}`** when parsing: other LaTeX that mitex rejects (e.g. `$` inside `\text{…}`)
  is found only when Typst runs (the formula is then shown as source with a note), so the editor can't flag it.
- **Equation labels must start `eq:`**; `{#name}` after `$$` is ignored. Attribute blocks after `$$…$$` in text are
  plain text.
- **Online images** (`https://…`) aren't fetched; they show as missing with a note.
