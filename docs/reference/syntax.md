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

`@fig:name` and `@tbl:name` become "Figure 1" and "Table 1". One with no matching name shows as **??** and is listed in
the status bar's notes.

```markdown
As @fig:chart shows, sales went up (@tbl:sales).
```

## Properties

The block between `---` lines at the very top holds the document's properties and its template:

```markdown
---
title: My Report
subtitle: Third quarter
author: Ann
date: today # or any text
abstract: One paragraph.
template: report
---
```

`template` is one of `classic` (the default), `academic`, `report`, `minimal`, `manuscript`, `elegant`, `peanut`,
`custom` for a [customized document](../guide/templates#customizing-one-document), or the name of one of
[your own templates](./custom-templates).

## The rest

Everything else is standard Markdown ([CommonMark](https://commonmark.org)) with GitHub-style tables and
strikethrough, and footnotes, so the file reads well in any other Markdown app.
