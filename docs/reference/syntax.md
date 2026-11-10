# Markdown syntax

Everything on the ribbon is plain text underneath. You never have to type it, but you can whenever that's quicker, and
it's what you'll see in **View → Markdown** (⌘/). This is the same list as Help → Markdown Cheat Sheet.

## Everyday formatting

| Type this                         | To get                                         |
| --------------------------------- | ---------------------------------------------- |
| `**bold**` `*italic*` `~~strike~~` | Bold (⌘B), italic (⌘I), strikethrough          |
| `` `code` ``                      | Code in a sentence                             |
| `# Heading 1` `## Heading 2`      | Headings (⌥⌘1, ⌥⌘2, ⌥⌘3)                       |
| `- item` `1. item`                | Bulleted and numbered lists; Tab nests          |
| `> quoted`                        | A quotation                                    |
| `[text](https://…)`               | A link                                         |
| `Text[^1]` … `[^1]: The note.`    | A footnote                                     |
| `[TOC]`                           | Table of contents                              |
| `\pagebreak`                      | Start a new page                               |
| `---`                             | A divider line                                 |

## Figures

A figure is a paragraph holding only a picture. The text in the brackets is its caption, and the optional part in
braces gives it a reference name, a size and a position:

```markdown
![Sales over time](images/chart.png){#fig:chart width=70% align=left}
```

- `#fig:chart` is the name you refer to it by.
- `width` is a percentage of the text width.
- `align` is `left` or `right`; leave it out to center the figure.

## Picture grids

Two or more pictures in one paragraph, with a last line starting `Figure:` that holds the shared caption:

```markdown
![](images/before.png)
![](images/after.png)
Figure: Before and after {#fig:pair columns=2 width=90%}
```

`columns` defaults to the number of pictures, up to 3; `width` is the whole grid's, full width when left out. Each
picture's own bracket text is its alt text.

## Tables

Tables are written with pipes. A colon in the line under the header aligns a column. The caption is the paragraph right
after the table, starting `Table:`:

```markdown
| Snack    | Crunch | Rating |
| :------- | :----: | -----: |
| Peanuts  |  High  |     10 |
| Pretzels | Medium |      7 |

Table: Snacks, ranked very scientifically {#tbl:snacks}
```

## Cross-references

`@fig:name`, `@tbl:name` and `@eq:name` become "Figure 1", "Table 1" and "Equation 1". One with no matching name shows
as **??** and is listed in the status bar's notes.

```markdown
As @fig:chart shows, sales went up (@tbl:sales).
```

## Math

Math is written in [LaTeX](https://en.wikibooks.org/wiki/LaTeX/Mathematics) between dollar signs. `$…$` puts it in a
sentence; an equation goes on lines of its own between `$$` lines, and a name in braces after the closing `$$` numbers
it, "(1)", so you can refer to it:

```markdown
The area of a circle is $\pi r^2$, and Euler's identity is @eq:euler:

$$
e^{i\pi} + 1 = 0
$$ {#eq:euler}
```

- Only named equations are numbered. A name must start `eq:`.
- A short equation can be one line: `$$ E = mc^2 $$`.
- Dollar signs in ordinary text stay as they are: math must start right after its `$` (no space) and end right before
  a `$` that isn't followed by a digit, with no other `$` in between. So "$5 or $10" and "from $5–$10" are text. To be
  sure, write `\$`.
- Math that can't be read shows as its LaTeX, in red, with a note in the status bar.
- In the Word file each piece of math is a picture of the typeset formula, so it looks right but can't be edited in
  Word's equation editor.

## Properties

The block between `---` lines at the very top holds the document's properties and its template:

```markdown
---
title: My Report
subtitle: Third quarter
author: Ann
date: today # or any text
organization: HIST 101
abstract: One paragraph.
template: report
---
```

`template` is one of `classic` (the default), `academic`, `report`, `minimal`, `manuscript`, `elegant`, `editorial`,
`journal`, `peanut`,
`custom` for a [customized document](../guide/templates#customizing-one-document), or the name of one of
[your own templates](./custom-templates).

## The rest

Everything else is standard Markdown ([CommonMark](https://commonmark.org)) with GitHub-style tables and
strikethrough, and footnotes, so the file reads well in any other Markdown app.
