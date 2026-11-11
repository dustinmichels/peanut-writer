# Coming from other Markdown apps

Peanut Writer reads [CommonMark](https://spec.commonmark.org) with GitHub's tables and strikethrough, footnotes, and
the extras in [Markdown syntax](./syntax) for figures, captions, cross-references and math. If you've written Markdown
elsewhere, these are the differences.

## Differences

- **Punctuation is typeset.** Straight quotes become curly, `--` an en dash (–), `---` in a sentence an em dash (—),
  `...` an ellipsis (…) and `<<` `>>` « ». The file keeps what you typed. A backslash keeps one as typed: `\"`, `\-\-`.
- **One tilde is strikethrough**, as on GitHub: `~one~` and `~~two~~` both strike through. There's no subscript or
  superscript; use math: `$\mathrm{H_2O}$`, `$x^2$`.
- **HTML isn't drawn.** A block of HTML is dropped; an inline tag is dropped but its text stays. `<br>` breaks the line,
  and `<!-- … -->` makes a note to yourself that never prints.
- **Bare web addresses aren't links.** Write `<https://example.com>` or `[text](https://example.com)`; email addresses
  work in angle brackets too.
- **A single newline is a space**, as in CommonMark (Obsidian breaks the line). Leave a blank line for a new paragraph;
  end a line with a backslash, two spaces or `<br>` to break it.
- **`{…}` attributes work only on figures, table captions and equations.** Elsewhere they're text:
  `## Introduction {#sec:intro}` prints the braces, and headings can't be cross-referenced. A picture inside a sentence
  is drawn small, at text height; only a picture alone in its paragraph is a figure.
- **Footnotes gather at the end.** A note written anywhere moves down to the others once you type outside it, notes are
  numbered in the order their marks appear whatever their labels, and a note nothing points to isn't printed.
- **Pictures must be inside the document's folder**, and properties aren't full YAML. Both are in
  [Markdown syntax](./syntax).

These print as typed: task lists (`- [ ] task`), callouts (`> [!NOTE]`), wiki links (`[[Page]]`), emoji codes
(`:smile:`), definition lists (`Term` then `: Definition`).

## In other Markdown apps

The file is ordinary Markdown, so it opens anywhere; the extras just show less well. Elsewhere `@fig:chart` reads as
written, `{#fig:chart width=70%}` shows as text after the picture, `[TOC]` and `\pagebreak` are plain text, and a
`Table:` caption is a paragraph. GitHub and Obsidian draw `$…$` math, and Obsidian `==highlight==`. Pandoc with the
[pandoc-crossref](https://lierdakil.github.io/pandoc-crossref/) filter reads most of it.
