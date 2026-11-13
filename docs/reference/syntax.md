# Markdown syntax

Everything on the ribbon is plain text underneath. You never have to type it, but you can whenever that's quicker, and
it's what you'll see in **View → Markdown** (⌘/). This is the same list as Help → Markdown Cheat Sheet.

## Everyday formatting

| Type this                          | To get                                 |
| ---------------------------------- | -------------------------------------- |
| `**bold**` `*italic*` `~~strike~~` | Bold (⌘B), italic (⌘I), strikethrough  |
| `==highlight==`                    | Highlighted text (⇧⌘H)                 |
| `` `code` ``                       | Code in a sentence                     |
| `# Heading 1` `## Heading 2`       | Headings (⌥⌘1 – ⌥⌘4)                   |
| `- item` `1. item`                 | Bulleted and numbered lists; Tab nests |
| `> quoted`                         | A quotation                            |
| `[text](https://…)`                | A link                                 |
| `Text[^1]` … `[^1]: The note.`     | A footnote                             |
| `[TOC]`                            | Table of contents                      |
| `\pagebreak`                       | Start a new page                       |
| `---`                              | A divider line                         |

## Figures

A figure is a paragraph holding only a picture. The text in the brackets is its caption, and the optional part in
braces gives it a reference name, a size and a position:

```markdown
![Sales over time](images/chart.png){#fig:chart width=70% align=left}
```

- `#fig:chart` is the name you refer to it by.
- `width` is a percentage of the text width.
- `align` is `left` or `right`; leave it out to center the figure.

A picture's path is relative to the document, and the picture must be in the document's folder (its `.peanut`
package, or the folder holding its Markdown file). Pictures elsewhere on your computer or on the web aren't shown; the
status bar says so. Pictures you paste, drop or insert are copied into `images/` for you.

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

## Citations

`[@key]` cites a source from the document's references, by its citation key. A page or section goes after a comma,
and several sources go together, apart by semicolons:

```markdown
Peanuts are legumes [@smith2020, p. 4], not nuts [@lee2019; @smith2020].
```

- Keys are the ones [Better BibTeX](https://retorque.re/zotero-better-bibtex/) gives your Zotero sources. The sources
  cited are kept in `Name.bib` beside the document. Setting it up: [Citations with Zotero](../guide/citations).
- The reference list goes at the end under a **References** heading, or where a line holds just `[References]` (then
  under whatever heading you write above it).
- A key `Name.bib` doesn't have shows as `[key?]` in bold, and is listed in the status bar's notes.
- `[@fig:a]` is a cross-reference in brackets, not a citation.

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
- An equation being typed stays as its Markdown until the cursor leaves it. To insert one with a dialog, see
  [Equations](../guide/figures-and-tables#equations).
- Dollar signs in ordinary text stay as they are: math must start right after its `$` (no space) and end right before
  a `$` that isn't followed by a digit, with no other `$` in between. So "$5 or $10" and "from $5–$10" are text. To be
  sure, write `\$`.
- Math that can't be read shows as its LaTeX, in red, with a note in the status bar.

## Properties

The block between `---` lines at the very top holds the document's properties and its template:

```markdown
---
title: My Report
subtitle: Third quarter
author: Ann
topic: Essay 2
date: today
header: HIST 101
abstract: One paragraph.
template: report
hide: subtitle, date
citation-style: ieee
---
```

The block is read one `key: value` line at a time, not as full YAML: no lists, nested values or comments (a `#` is part
of the value). Double quotes are allowed around a value. Unknown keys are kept but ignored. `date` is `today` or any
fixed text.

`template` is a [built-in template](../guide/templates#built-in-templates)'s name in lowercase (`classic` is the
default), `custom` for a [customized document](../guide/templates#customizing-one-document), or the name of one of
[your own templates](./custom-templates).

`hide` lists properties (`title`, `subtitle`, `author`, `topic`, `date`, `header`, `abstract`), separated by commas, that
the document keeps but doesn't show.

`citation-style` is how citations and the reference list are written: `apa` (the default), `chicago-author-date`,
`harvard-cite-them-right`, `ieee`, `mla`, `nature` or `vancouver`.

## Everything else

Standard Markdown, as in any other Markdown app. What differs is in
[Coming from other Markdown apps](./markdown-flavor).
