# Writing

You type on the left; the typeset pages appear on the right, updating as you go.

## The ribbon

| Tab            | What's there                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **File**       | New, open, save, recent documents, export, settings                                                                            |
| **Home**       | Bold, italic, strikethrough, highlight, code, headings, lists, quotes                                                          |
| **Insert**     | Picture, picture grid, table, link, footnote, equation, code, divider, page break                                              |
| **References** | Cross-reference, footnote, all notes, table of contents, figure and table previews, and Zotero citations (once on in Settings) |
| **Design**     | Templates, Customize, Manage Templates, document properties, settings                                                          |
| **View**       | Markdown view, outline, preview, versions                                                                                      |
| **Help**       | Welcome guide, Markdown cheat sheet                                                                                            |

## The command palette

**⇧⌘P** (View → Command Palette…) searches every command by name. Each word you type matches the start of a word, so "ex
wo" finds _Export as Word_ and "acad" switches to the _Academic_ template. ↑ and ↓ choose, Return runs, Esc closes.
Commands that wouldn't do anything right now are dimmed.

![The command palette, finding the export commands from "ex"](/screenshots/command-palette.png)

_Lorem Ipsum_ (palette only) inserts sample headings, text, footnotes, math, figures and tables, handy for trying a
template.

## Text that looks like itself

Headings, bold, lists, quotes, figures, tables and references show as what they are, not as symbols. The ribbon does
everything; if you know Markdown, typing it works too ([syntax](../reference/syntax)).

**View → Markdown** (⌘/) shows the plain text underneath, to read or edit directly. ⌘/ again goes back.

![View → Markdown: the plain text behind the document, beside the typeset page](/screenshots/markdown-view.png)

## Title, author and abstract

Title, subtitle, author, topic, date, header/footer and abstract are the document's **properties** (Design →
Properties); the template decides where they appear. The topic (an assignment, a subject) shows beside the author and
date. The date is fixed text or `today`. The header/footer is who the document is for (a class like `HIST 101`, a
team, a company), shown in the page header or footer. Saving fills in an empty title (the file's name), author (the
default author from [Settings](./settings)) and date (today). The eye beside each property hides it without deleting
it.

## Outline and scrolling

**View → Outline** lists your headings left of the editor and highlights the section you're in; click one to jump there
in both panes. **Focus on section**, at the top of the outline, shows one section alone in the editor: the one you're
in, then whichever heading (or place in the preview) you click.

![The outline beside the editor](/screenshots/outline.png)

The editor and preview scroll together, lined up at each heading. To look elsewhere in one pane alone, click the link
button between them to break the link; click it again, or a heading in the outline, to relink. Clicking a page in the
preview puts the cursor there in the editor.

**View → Preview** hides the preview so the editor fills the window; it always shows while you customize a template.

## Footnotes, contents and page breaks

- **References → Footnote** asks for the note, then adds a numbered mark at the cursor. In the text the mark shows as
  its number: point at it to read the note, click it to edit. Notes are numbered in order and renumber as you add or
  delete them; deleting a mark deletes its note (cutting it doesn't). The notes are kept together at the end of the
  Markdown, and the template places each at the foot of its page.
- A mark with no note, or a note nothing points to, shows a red **?** and is listed in the status bar. Unused notes
  aren't printed.
- **References → All Notes** lists every note beside its sentence; click either to go there.
- **References → Contents** inserts a table of contents that updates itself. In the editor it's a **TOC** bar: drag its
  grip (⠿) to move it, or backspace into it to delete it.
- **Insert → Page Break** starts a new page; **Insert → Divider** draws a line.
