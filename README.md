# Peanut Writer

A word processor that feels like Word but writes Markdown, with a few good ideas from LaTeX: figures, tables and
equations that number themselves, cross-references that keep up, LaTeX math, footnotes, and a table of contents. You
type on the left and see the typeset pages on the right. Export to **PDF** or **Word (.docx)**.

Go + [Wails 3](https://v3.wails.io) for the app, Vue + [CodeMirror](https://codemirror.net) for the editor,
[Typst](https://typst.app) for typesetting. Tools are pinned with [mise](https://mise.jdx.dev).

## Using it

- **Ribbon**: File, Home (formatting, lists, styles), Insert (picture, picture grid, table, link, footnote, equation,
  code, divider, page break), References (cross-reference, footnote, contents), Design (templates, managing your own
  templates, document properties) and View (Markdown, outline).
- **Command palette**: ⇧⌘P (View → Command Palette…) lists every menu and ribbon command, plus one per template to
  switch to it. Type to filter (each word matches the start of a word: “ex wo” finds Export as Word), ↑↓ to choose,
  Return to run, Esc to close. Commands that wouldn't do anything right now are dimmed. Palette-only: **Lorem Ipsum**
  inserts sample headings, text, figures and tables for trying out a template.
- **Pictures**: drag one onto the editor, paste one, or use Insert → Picture. It's copied into an `images/` folder
  beside the document and shown in the editor. Hover a picture to place it left, centered or right, drag its corner
  to resize it, or drag its grip (⠿) to move it elsewhere in the document; **Edit figure** sets its caption, reference
  name, size and position.
- **Picture grids**: Insert → Picture Grid takes several pictures and sets them side by side as one figure with one
  caption. **Edit figure** adds, removes, reorders and replaces its pictures and sets the number of columns; adding a
  picture to a single figure makes it a grid.
- **Markdown**: the editor hides the Markdown. Headings, bold, italics, links, quotes and bullets read as formatted
  text; figures, tables, cross-references and document properties as what they are. View → Markdown (⌘/) shows the
  Markdown to read and edit, with each figure's picture below it.
- **Outline**: View → Outline (or the button beside the zoom controls) lists the document's headings to the left of
  the editor, highlighting the section you're scrolled to. Click a heading to jump there in both the editor and the
  preview.
- **Scroll sync**: the editor and the preview scroll together, lined up at each heading.
- **Settings**: the top bar's settings button, Design → Settings, or File → Settings… (⌘,). Two panes:
  **Global** settings apply to every document
  and are kept in `~/Library/Application Support/Peanut Writer/settings.json`; **This Document** settings override
  them for one document and are kept in `Name.settings.json` beside `Name.md` (an untitled document's are written
  when it's first saved; Save As brings them along). Both are plain JSON (`{"autoFormat": true, "titleCase": true}`)
  and can be edited by hand; a key a document's file leaves out uses the global value. **Auto format** tidies the
  Markdown with [oxfmt](https://oxc.rs/docs/guide/usage/formatter) each time you save (⌘S, Save As, Sync files):
  blank lines, list markers, table columns, trailing spaces. **Title case headings** also puts headings in title case
  (“The Lord of the Rings”; NASA, iPhone and code are left alone). It's one undoable edit; autosaves don't format.
  Needs `oxfmt` and Node.js installed (`npm install -g oxfmt`, or `mise install`); they aren't bundled in the app.
  **Default author** (Global only, `"author"`) is put in the properties of each new document; until it's set it's
  the computer user's full name, and `""` means none. **Show Peanut** (`"peanut"`, on unless set to `false`) shows
  Peanut beside the ribbon tabs.
- **Tables**: Insert → Table, pick a size, fill in the grid. **Edit table** above any table reopens the grid (add and
  remove rows and columns, align columns, caption); drag the grip (⠿) at the left of its bar to move it, caption and
  all, elsewhere in the document.
- **Cross-references**: References → Cross-reference lists every figure, table and numbered equation with its current
  number, or type `@` for suggestions. In the editor a reference reads “Figure 2”; when things move, every number
  updates. Renaming a figure's reference name updates the references to it.
- **Equations**: Insert → Equation adds an equation block to type LaTeX into (with text selected in a line, it makes
  that text math instead). Math is shown as its LaTeX in the editor and typeset in the preview.
- **Templates**: the Design tab shows each template on a sample page. Built in: _Classic_ (a fresh Word document),
  _Academic_ (a LaTeX article), _Report_ (a business report), _Minimal_ (quiet Swiss-style sans), _Manuscript_ (an
  APA-style double-spaced paper), _Elegant_ (a book page with small-caps headings), _Editorial_ (a magazine feature),
  _Journal_ (a two-column paper) and _Peanut_. The choice is saved in the document.
- **Documents are packages**: New (⌘N), Save As and the first save of an untitled document ask for a name and a
  place, then make `Name.peanut` there: a folder Finder shows as one file, holding `Name.md`, its settings, template,
  `images/` and `backups/`. Right-click → Show Package Contents opens it; elsewhere it's a plain folder. Open takes a
  package or any Markdown file. Save As starts beside the current document and brings its pictures along. Choosing a
  name whose package already holds that document asks before replacing it.
- **Export**: the Export button (or ⌘E, ⇧⌘E). The PDF is exactly the preview. The Word file uses real Word styles
  (Title, Heading 1–6, Caption, Quote…), numbered captions and live cross-reference fields, so it stays editable.
- **Sync files**: the Sync files button (or ⇧⌘Y, File → Sync Files) saves the document, then writes `Name.pdf` and
  `Name.docx` beside `Name.peanut` (or beside `Name.md`, for a Markdown file outside a package), replacing earlier
  copies, with no dialogs. An unsaved document asks where to save first. The folder button beside it shows the
  document's files in Finder.
- **Auto-save**: a document with a file saves itself 2 seconds after you stop typing, and before opening another or
  quitting; nothing asks. An untitled document still needs ⌘S, and asks before its changes are lost.
- **Backups**: a saved document is copied as `Name.md` and `Name.docx` into a `backups/2026-11-10T14-03-22/` folder
  beside it when opened, every 10 minutes, and when closed or replaced, each time only if it changed since its last
  backup. The newest 10 of each document are kept. Pictures aren't copied: the Word file embeds them, but the Markdown
  one's picture paths are relative to the document's folder, so they don't resolve from `backups/`.
- **Versions**: File → Versions (or View → Versions) opens a pane to save the document under a name, or load an
  earlier version. Each is a `versions/<name>/` folder beside the document holding `Name.md`, its `Name.template.json`
  and `Name.settings.json` if it has them, and `Name.docx` and `Name.pdf` copies. Loading one asks first, backs up the
  current text, and replaces the document's text, template and settings.
- **Peanut**: a little 3D Peanut keeps you company at the top right, by the Export button. He breathes, blinks, sits
  down and stands up, now and then puts on a cowboy hat or a party hat, cheers every few minutes while you're writing
  and at each 250 words, and says something nice when clicked. His words fade away soon after he says them.
- **Recent documents**: File → Open Recent… (⇧⌘O), the File → Open Recent submenu, or the ribbon's File → Recent lists the last 10 documents opened or saved.
  In the ribbon's list, the × beside a document takes it off the list.

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
template: report # classic (the default), academic, report, minimal, manuscript, elegant, editorial, journal, peanut, or a custom one
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

Text with a note.[^1] The area is $\pi r^2$, as @eq:area says:

$$
A = \pi r^2
$$ {#eq:area}

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
- `@fig:…` / `@tbl:…` / `@eq:…` become “Figure n” / “Table n” / “Equation n”; one with no matching name shows as
  **??**, as in LaTeX, and is listed in the status bar's notes.
- Math is LaTeX: `$…$` in a sentence, an equation between `$$` lines (or `$$ … $$` on one line), numbered when its
  attribute block names it `#eq:…`. As in Pandoc, `$` opens math only before a non-space and closes it only after a
  non-space and before a non-digit, so prices ("$5 or $10") stay text; `\$` is always a dollar sign. The preview and PDF
  typeset it with the [mitex](https://github.com/mitex-rs/mitex) Typst package (bundled in `internal/render/mitex`,
  Apache-2.0); the Word file gets each formula as a picture drawn by Typst.

## Customizing a document's template

Design → **Customize** gives the open document its own template, based on the template it uses at the time. The editor
pane turns into a base template choice and font and color choices (body, heading and code fonts, body size; text,
heading, title, caption, accent and table header colors), and the preview shows each change. Changing the base keeps
the changes. **Save as Template** copies the base's `template.typ` into a new folder of your templates, with a
`template.json` holding the resulting Word styles and the changes as `style`. **Done** goes back to the editor;
**Remove Customization** goes back to the base template.

The document's template is kept beside it as `Name.template.json` (the base template's id and the changes; an untitled
document's is written when it's first saved, and Save As copies it), and its front matter says `template: custom`. It
shows first in the template gallery. The changes reach Word through the base's Word styles and Typst through
`style.json`, which the built-in templates read with `#import "style.typ": custom-font, custom-color, custom-size`; a
template of your own that doesn't import `style.typ` only changes in Word.

## Your own templates

A template is a folder in your templates folder (`~/Library/Application Support/Peanut Writer/templates/<name>/`) with:

- `template.typ`: a Typst file exporting `template(meta, body)`, a show rule that sets up the page, fonts, headings,
  captions and tables, and writes the title block from `meta` (`title`, `subtitle`, `author`, `date`, `abstract`).
- `template.json`: its name, description, and how it looks in Word (`docx`: paper, margins, fonts, sizes, colors, heading
  numbering…; see `DocxStyle` in `internal/templates/templates.go`).

Edits to a template show up in the preview on the next keystroke. Folders named like a built-in template, or `custom`,
are skipped.

Design → **Manage Templates** lists your own templates (not the built-in ones). For each you can use it, rename it and
change its description, show its files in Finder to edit them, **share** it (saves a `.zip` holding `template.typ` and
`template.json`, to send to someone) or delete it (a document using it goes back to Classic). **Import…** adds a shared
`.zip` (the two files at its top or in one folder) as a new template; **Open Folder** shows the templates folder.

## Development

```sh
mise install       # go, bun, wails3, typst
mise run dev       # the app with hot reload
mise run build     # bin/peanut-writer
mise run package   # bin/peanut-writer.app, with typst inside
mise run test      # Go tests
mise run check     # type-check the editor
mise run fmt       # gofmt + oxfmt
mise run cleanup   # delete build output, unregister stale .app bundles
mise run docs      # the documentation site (docs/, VitePress) with hot reload
mise run docs:build # build it into docs/.vitepress/dist
```

Layout:

- `main.go`: the window and the menu bar (menu commands reach the editor as `menu` events).
- `service.go`: `DocService`, bound to the editor: open, save, backups, render, export, pictures, templates.
- `internal/backup`: `.md` + `.docx` backups in timestamped `backups/<datetime>/` folders, keeping the newest 10 per
  document.
- `internal/versions`: named versions in `versions/<name>/` folders: the Markdown and its JSON sidecars, with Word and
  PDF copies; listing and restoring them.
- `internal/doc`: Markdown → document model (figures, captions, numbering, references).
- `internal/render`: the model → Typst (`peanut.typ` renders it, the template styles it) → SVG pages and PDF. Finds
  `typst` beside the executable, on `PATH`, or where Homebrew and mise install it.
- `internal/docx`: the model → .docx, written directly (no Word or pandoc needed).
- `internal/mdfmt`: Auto Format: runs `oxfmt` (finding it and `node` on `PATH` or where Homebrew, mise, Volta and nvm
  install them) and title-cases headings.
- `starter/`: the welcome guide.
- `frontend/`: the editor (`src/lib/editor.ts` is CodeMirror with the figure, table, reference and properties widgets;
  `src/lib/markdown.ts` mirrors the Go numbering rules while typing). `src/peanut/` is the three.js Peanut, trimmed
  from [dustinmichels/peanut](https://github.com/dustinmichels/peanut); `src/components/PeanutBuddy.vue` animates him.
