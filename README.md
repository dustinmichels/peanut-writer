# Peanut Writer

A word processor that feels like Word but writes Markdown, with a few good ideas from LaTeX: figures and tables that
number themselves, cross-references that keep up, footnotes, and a table of contents. You type on the left and see the
typeset pages on the right. Export to **PDF** or **Word (.docx)**.

Go + [Wails 3](https://v3.wails.io) for the app, Vue + [CodeMirror](https://codemirror.net) for the editor,
[Typst](https://typst.app) for typesetting. Tools are pinned with [mise](https://mise.jdx.dev).

## Using it

- **Ribbon**: File, Home (formatting, lists, styles), Insert (picture, picture grid, table, link, footnote, code,
  divider, page break), References (cross-reference, footnote, contents), Design (templates, document properties) and
  View (Markdown, outline).
- **Pictures**: drag one onto the editor, paste one, or use Insert → Picture. It's copied into an `images/` folder
  beside the document and shown in the editor. Hover a picture to place it left, centered or right, drag its corner
  to resize it, or drag its grip (⠿) to move it elsewhere in the document; **Edit figure** sets its caption, reference
  name, size and position.
- **Picture grids**: Insert → Picture Grid takes several pictures and sets them side by side as one figure with one
  caption. **Edit figure** adds, removes, reorders and replaces its pictures and sets the number of columns; adding a
  picture to a single figure makes it a grid.
- **Markdown**: the editor hides the Markdown. Headings, bold, italics, links, quotes and bullets read as formatted
  text; figures, tables, cross-references and document properties as what they are. The **Markdown** button at the
  top right of the editor (or View → Show Markdown, ⌘/) shows the Markdown to read and edit, with each figure's
  picture below it.
- **Outline**: View → Outline (or the button beside the zoom controls) lists the document's headings to the left of
  the editor, highlighting the section you're scrolled to. Click a heading to jump there in both the editor and the
  preview.
- **Scroll sync**: the editor and the preview scroll together, lined up at each heading.
- **Tables**: Insert → Table, pick a size, fill in the grid. **Edit table** above any table reopens the grid (add and
  remove rows and columns, align columns, caption).
- **Cross-references**: References → Cross-reference lists every figure and table with its current number, or type
  `@` for suggestions. In the editor a reference reads “Figure 2”; when things move, every number updates. Renaming a
  figure's reference name updates the references to it.
- **Templates**: the Design tab shows each template on a sample page. Built in: _Classic_ (a fresh Word document),
  _Academic_ (a LaTeX article), _Report_ (a business report), _Minimal_ (quiet Swiss-style sans), _Manuscript_ (an
  APA-style double-spaced paper), _Elegant_ (a book page with small-caps headings) and _Peanut_. The choice is saved
  in the document.
- **Export**: the Export button (or ⌘E, ⇧⌘E). The PDF is exactly the preview. The Word file uses real Word styles
  (Title, Heading 1–6, Caption, Quote…), numbered captions and live cross-reference fields, so it stays editable.
- **Sync files**: the Sync files button (or ⇧⌘Y, File → Sync Files) saves the document, then writes `Name.pdf` and
  `Name.docx` beside `Name.md`, replacing earlier copies, with no dialogs. An unsaved document asks where to save first.
- **Auto-save**: a document with a file saves itself 2 seconds after you stop typing, and before opening another or
  quitting; nothing asks. An untitled document still needs ⌘S, and asks before its changes are lost.
- **Backups**: a saved document is copied as `Name-2026-11-10T14-03-22.md` and `.docx` into a `backups` folder beside
  it when opened, every 10 minutes, and when closed or replaced, each time only if it changed since its last backup.
  The newest 10 of each document are kept. Pictures aren't copied: the Word file embeds them, but the Markdown one's
  picture paths are relative to the document's folder, so they don't resolve from `backups/`.
- **Peanut**: a little 3D Peanut keeps you company at the top right, by the Export button. He breathes, blinks, sits
  down and stands up, cheers every few minutes while you're writing and at each 250 words, and says something nice
  when clicked.
- **Recent documents**: File → Open Recent (or the ribbon's File → Recent) lists the last 10 documents opened or saved.

The first launch opens a welcome guide; later launches start a blank document and offer the recent ones. Help → Welcome
Guide opens the guide again, and Help → Markdown Cheat Sheet lists the syntax.

## The document format

Plain Markdown (CommonMark, GFM tables and strikethrough, footnotes), saved as `.md`, plus:

```markdown
---
title: My Report
author: Ann
date: today # or any text
abstract: One paragraph.
template: report # classic (the default), academic, report, minimal, manuscript, elegant, peanut, or a custom one
---

As @fig:chart shows, sales went up (@tbl:sales).

![Sales over time](images/chart.png){#fig:chart width=70% align=left}

![](images/before.png)
![](images/after.png)
Figure: Before and after {#fig:pair columns=2 width=90%}

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
  width; `align` is `left` or `right`, centered when left out, and the caption follows the picture).
- A picture grid is a paragraph of two or more pictures (one per line, or several to a line) whose last line starts
  `Figure:` and holds the shared caption and attribute block (`columns` defaults to the number of pictures, up to 3;
  `width` is the whole grid's, full width when left out). Each picture's own text is its alt text.
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
mise run cleanup   # delete build output, unregister stale .app bundles
```

Layout:

- `main.go`: the window and the menu bar (menu commands reach the editor as `menu` events).
- `service.go`: `DocService`, bound to the editor: open, save, backups, render, export, pictures, templates.
- `internal/backup`: timestamped `.md` + `.docx` backups in `backups/`, keeping the newest 10 per document.
- `internal/doc`: Markdown → document model (figures, captions, numbering, references).
- `internal/render`: the model → Typst (`peanut.typ` renders it, the template styles it) → SVG pages and PDF. Finds
  `typst` beside the executable, on `PATH`, or where Homebrew and mise install it.
- `internal/docx`: the model → .docx, written directly (no Word or pandoc needed).
- `internal/templates`: built-in templates (`builtin/`) and the user's.
- `starter/`: the welcome guide.
- `frontend/`: the editor (`src/lib/editor.ts` is CodeMirror with the figure, table, reference and properties widgets;
  `src/lib/markdown.ts` mirrors the Go numbering rules while typing). `src/peanut/` is the three.js Peanut, trimmed
  from [dustinmichels/peanut](https://github.com/dustinmichels/peanut); `src/components/PeanutBuddy.vue` animates him.
