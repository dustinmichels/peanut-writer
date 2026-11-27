---
name: peanut-document
description: >
  Write or edit Peanut Writer documents (.peanut packages or their Markdown): front matter, figures and
  picture grids, tables, equations, cross-references, and academic citations backed by a BibLaTeX file.
  Use when asked to draft, convert, or revise a paper, report, or essay for Peanut Writer.
---

# Writing Peanut Writer documents

Peanut Writer is a Markdown word processor that typesets with Typst and exports PDF, Word and HTML. A document is
plain Markdown plus a few extras for figures, numbering and citations. Write the files directly; the app reads them
when the document is opened.

## Files

A `.peanut` document is a folder (a macOS package). `Name` is the same stem everywhere:

```text
Name.peanut/
├── Name.md                the text: front matter + Markdown
├── Name.bib               BibLaTeX references cited by [@key]
├── images/                pictures, referenced as images/…
├── Name.template.json     customized style (the app writes it; don't hand-write)
├── Name.settings.json     per-document settings (app-written)
├── backups/  versions/    app-managed; never touch
```

A plain `Name.md` outside a package works too: `Name.bib` and `images/` then sit beside it.

To create a new document: make `Name.peanut/`, write `Name.md`, add `images/` and `Name.bib` only if used.

## Front matter

Optional block at the very top. One `key: value` per line; **not YAML**: no lists, nesting or comments (`#` is part of
the value). Double quotes around a value are allowed.

```markdown
---
title: Soil Nitrogen and Peanut Yield
subtitle: A field study
author: Ann Lee
topic: AGRO 410 Final Paper
date: today
header: AGRO 410
abstract: One paragraph, on one line.
template: classic
citation-style: apa
hide: subtitle, date
---
```

- `date`: `today` or any fixed text.
- `template`: a built-in template's lowercase name (`classic` is the default), `custom`, or a user template's name.
  Leave it out unless asked.
- `citation-style`: `apa` (default), `chicago-author-date`, `harvard-cite-them-right`, `ieee`, `mla`, `nature`,
  `vancouver`. No footnote styles.
- `hide`: comma-separated properties to keep but not print.
- Put the title in `title:`; don't repeat it as a `#` heading.

## Markdown rules that differ from GitHub/Obsidian

- Single newline = space. Blank line between paragraphs.
- Straight quotes, `--`, `---`, `...` are typeset automatically. Type them plainly.
- HTML is dropped (block HTML entirely; inline tags keep their text). `<br>` breaks a line; `<!-- … -->` is a note that
  never prints.
- Bare URLs aren't links: write `<https://…>` or `[text](https://…)`.
- No sub/superscript syntax: use math (`$\mathrm{H_2O}$`, `$x^2$`).
- `==highlight==`, `~strike~`, footnotes `text[^1]` + `[^1]: Note.` (numbered in order of appearance; unreferenced
  notes don't print).
- `[TOC]` on its own line: table of contents. `\pagebreak`: new page.
- `{#…}` attributes work **only** on figures, `Table:` captions and `$$` equations. Headings can't be
  cross-referenced; `## Intro {#sec:intro}` prints the braces.
- Task lists, callouts (`> [!NOTE]`), wiki links and emoji codes print literally. Don't use them.

## Images

A figure is a paragraph containing **only** an image. Bracket text is the caption; the brace block names, sizes and
places it:

```markdown
![Yield by nitrogen treatment, 2024 season.](images/yield.png){#fig:yield width=70%}
```

- Paths are relative to `Name.md`, and the file **must be inside the document's folder**. Images elsewhere on disk or
  on the web are not shown. Copy (or download) the file into `images/` first, then reference it.
- Formats: `.png`, `.jpg`/`.jpeg`, `.gif`, `.svg`, `.webp`. Prefer SVG for charts and diagrams, PNG for screenshots.
  Use simple lowercase file names without spaces.
- `width` is a percentage of the text width. `align=left|right`; omit to center.
- A captioned figure is numbered "Figure N". Its id must start `fig:`.
- An image inside a sentence is drawn inline at text height, not as a figure. Keep figures in their own paragraph,
  with blank lines around them.
- Generating a chart? Write it to `images/<name>.svg` (e.g. matplotlib `savefig(..., format="svg")`) and embed it.

### Picture grids

Two or more images in one paragraph, one per line, ending with a `Figure:` line holding the shared caption:

```markdown
![Control plot](images/control.png)
![Treated plot](images/treated.png)
Figure: Plots at harvest {#fig:plots columns=2 width=90%}
```

`columns` defaults to the image count (max 3); `width` is the whole grid's. Each image's bracket text is its alt text.

## Tables and equations

```markdown
| Treatment | Yield (t/ha) |
| :-------- | -----------: |
| Control   |          3.1 |
| 60 kg N   |          3.8 |

Table: Mean yield by treatment {#tbl:yield}

$$
Y = \beta_0 + \beta_1 N + \varepsilon
$$ {#eq:model}
$$
```

- Caption paragraph immediately after the table, starting `Table:`. Ids start `tbl:`.
- Inline math `$…$`: no space after the opening `$` or before the closing one. A literal dollar sign: `\$`.
- Only equations with an `{#eq:…}` id are numbered. One-line form: `$$ E = mc^2 $$ {#eq:e}`.

## Cross-references

`@fig:yield`, `@tbl:yield`, `@eq:model` render as "Figure 1", "Table 1", "Equation 1". Never type numbers yourself.
Write "as @fig:yield shows", not "as Figure @fig:yield shows". `[@fig:yield]` is a bracketed cross-reference, not a
citation. An unknown id prints **??**.

## Citations

Cite by key from `Name.bib`:

```markdown
Legumes fix nitrogen [@smith2021dna], though less in dry soils [@lee2019drought, p. 14].
Both effects are well documented [@lee2019drought; @smith2021dna, ch. 3].
```

- Locator after a comma (`p. 14`, `pp. 3–5`, `ch. 3`, `sec. 2`). Multiple sources separated by `;`.
- The style (`citation-style`) decides how citations render; write the same `[@key]` for every style. Don't
  hand-format "(Smith, 2021)" or "[1]".
- The reference list is added automatically at the end under a **References** heading. To place it elsewhere (e.g.
  before an appendix), put `[References]` alone on a line under a heading you write. Only cited sources are listed.
- A key missing from `Name.bib` prints as bold `[key?]`. Every key you cite must exist in the `.bib`.

### `Name.bib`

BibLaTeX, one entry per source. Preferred fields (what the app's citation form reads and writes):

```bibtex
@article{smith2021dna,
  author = {Smith, Jane and Doe, John},
  title = {Nitrogen Fixation in Arachis hypogaea},
  journaltitle = {Journal of Legume Science},
  date = {2021},
  volume = {12},
  number = {3},
  pages = {101--118},
  doi = {10.1234/jls.2021.0042},
}

@book{lee2019drought,
  author = {Lee, Ann},
  title = {Drought and Legumes},
  publisher = {Field Press},
  date = {2019},
  isbn = {9780000000000},
}
```

- Types: `article`, `book`, `incollection` (chapter; container in `booktitle`), `inproceedings` (`booktitle`),
  `report` / `thesis` (`institution`), `online` (`url`, `urldate`), `misc`.
- Authors: `Last, First` joined by `and`. Corporate author in extra braces: `{{World Health Organization}}`.
- `date` (or `year`), `journaltitle` (or `journal`), `number` for issue, `pages` with `--`.
- Keys: first author's last name + year + first significant title word, lowercase: `smith2021dna`. Unique within the
  file. Don't rename existing keys: the text cites them.
- Appending to an existing `.bib`: read it first, reuse matching entries (same DOI, or same title and year), keep all
  existing fields and entries.
- **Never invent sources or metadata.** Cite only works the user supplied or you verified (e.g. resolve a DOI via
  `https://doi.org/<doi>` with `Accept: application/x-bibtex`, or Crossref). If a claim needs a source you can't verify,
  say so and leave a `<!-- TODO: source for … -->` note instead of a fake citation.

## Checklist before finishing

1. Front matter is flat `key: value` lines; no title duplicated as a heading.
2. Every `![…](path)` file exists under the document folder; figures are alone in their paragraph.
3. Every `@fig:`/`@tbl:`/`@eq:` reference matches an id defined exactly once.
4. Every `[@key]` exists in `Name.bib`; `.bib` entries are real and parse (balanced braces, comma-separated fields).
5. No HTML, callouts, task lists, heading ids, or hand-typed figure/table/citation numbers.
