# Peanut Writer

A word processor that feels like Word but writes Markdown, with a few good ideas from LaTeX: figures and tables that
number themselves, cross-references that keep up, footnotes, and a table of contents. You type on the left and see the
typeset pages on the right. Export to **PDF** or **Word (.docx)**.

Go + [Wails 3](https://v3.wails.io) for the app, Vue + [CodeMirror](https://codemirror.net) for the editor,
[Typst](https://typst.app) for typesetting. Tools are pinned with [mise](https://mise.jdx.dev).

## Using it

- **Ribbon**: File, Home (formatting, lists, styles), Insert (picture, table, link, footnote, code, divider, page
  break), References (cross-reference, footnote, contents) and Design (templates, document properties).
- **Pictures**: drag one onto the editor, paste one, or use Insert → Picture. It's copied into an `images/` folder
  beside the document and shown in the editor; **Edit figure** sets its caption, reference name and size.
- **Tables**: Insert → Table, pick a size, fill in the grid. **Edit table** above any table reopens the grid (add and
  remove rows and columns, align columns, caption).
- **Cross-references**: References → Cross-reference lists every figure and table with its current number, or type
  `@` for suggestions. In the editor a reference reads “Figure 2”; when things move, every number updates. Renaming a
  figure's reference name updates the references to it.
- **Templates**: the Design tab shows each template on a sample page. Built in: _Classic_ (a fresh Word document),
  _Academic_ (a LaTeX article), _Report_ (a business report) and _Peanut_. The choice is saved in the document.
- **Export**: the Export button (or ⌘E, ⇧⌘E). The PDF is exactly the preview. The Word file uses real Word styles
  (Title, Heading 1–6, Caption, Quote…), numbered captions and live cross-reference fields, so it stays editable.

The first launch opens a welcome guide; Help → Welcome Guide opens it again, and Help → Markdown Cheat Sheet lists the
syntax.

## The document format

Plain Markdown (CommonMark, GFM tables and strikethrough, footnotes), saved as `.md`, plus:

```markdown
---
title: My Report
author: Ann
date: today # or any text
abstract: One paragraph.
template: report # classic (the default), academic, report, peanut, or a custom one
---

As @fig:chart shows, sales went up (@tbl:sales).

![Sales over time](images/chart.png){#fig:chart width=70%}

| Year | Sales |
| ---- | ----: |
| 2025 |   100 |

Table: Sales by year {#tbl:sales}

Text with a note.[^1]

[TOC]

\pagebreak

[^1]: The note.
```

- A figure is a paragraph holding only a picture; the attribute block is optional (`width` is a percentage of the text
  width).
- A table's caption is the paragraph right after it, starting `Table:`.
- `@fig:…` / `@tbl:…` become “Figure n” / “Table n”; one with no matching name shows as **??**, as in LaTeX, and is
  listed in the status bar's notes.

## Custom templates

Design → **Customize** copies the current template to your templates folder
(`~/Library/Application Support/Peanut Writer/templates/<name>/`) and selects the copy. A template is a folder with:

- `template.typ`: a Typst file exporting `template(meta, body)`, a show rule that sets up the page, fonts, headings,
  captions and tables, and writes the title block from `meta` (`title`, `subtitle`, `author`, `date`, `abstract`).
- `template.json`: its name, description, and how it looks in Word (`docx`: paper, margins, fonts, sizes, colors, heading
  numbering…; see `DocxStyle` in `internal/templates/templates.go`).

Edits to a template show up in the preview on the next keystroke.

## Development

```sh
mise install       # go, bun, wails3, typst
mise run dev       # the app with hot reload
mise run build     # bin/peanut-writer
mise run package   # bin/peanut-writer.app, with typst inside
mise run test      # Go tests
mise run check     # type-check the editor
```

Layout:

- `main.go`: the window and the menu bar (menu commands reach the editor as `menu` events).
- `service.go`: `DocService`, bound to the editor: open, save, render, export, pictures, templates.
- `internal/doc`: Markdown → document model (figures, captions, numbering, references).
- `internal/render`: the model → Typst (`peanut.typ` renders it, the template styles it) → SVG pages and PDF. Finds
  `typst` beside the executable, on `PATH`, or where Homebrew and mise install it.
- `internal/docx`: the model → .docx, written directly (no Word or pandoc needed).
- `internal/templates`: built-in templates (`builtin/`) and the user's.
- `starter/`: the welcome guide.
- `frontend/`: the editor (`src/lib/editor.ts` is CodeMirror with the figure, table, reference and properties widgets;
  `src/lib/markdown.ts` mirrors the Go numbering rules while typing).
