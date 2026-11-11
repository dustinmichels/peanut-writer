# Writing

The window has two halves. You type on the left; the typeset pages appear on the right, updating as you go.

## The ribbon

Everything you can do is a button on the ribbon across the top:

| Tab            | What's there                                                                      |
| -------------- | --------------------------------------------------------------------------------- |
| **File**       | New, open, save, recent documents, export, settings                               |
| **Home**       | Bold, italic, strikethrough, code, headings, lists, quotes                        |
| **Insert**     | Picture, picture grid, table, link, footnote, equation, code, divider, page break |
| **References** | Cross-reference, footnote, table of contents                                      |
| **Design**     | Templates, Customize, Manage Templates, document properties, settings             |
| **View**       | Markdown view, outline, preview, versions                                         |
| **Help**       | Welcome guide, Markdown cheat sheet                                               |

## The command palette

Press **⇧⌘P** (View → Command Palette…) to search every command by name. Each word you type matches the start of a
word, so "ex wo" finds _Export as Word_. Use ↑ and ↓ to choose, Return to run it and Esc to close. There's one command
per template too, so "acad" switches to _Academic_. Commands that wouldn't do anything right now are dimmed.

![The command palette, finding the export commands from "ex"](/screenshots/command-palette.png)

_Lorem Ipsum_ (palette only) inserts sample headings, text, math, figures and tables at the cursor, handy for seeing how
a template looks. Its pictures are saved in the document's `images/` folder.

## Text that looks like itself

Headings, bold, italics, links, quotes and bullets read as formatted text in the editor, not as symbols. Figures,
tables, cross-references and the document's properties appear as what they are. If you know
[Markdown](./markdown-and-latex#what-is-markdown) you can type it and it formats as you go; if you don't, use the
ribbon.

**View → Markdown** (⌘/) shows the plain text underneath in a monospaced font, with headings, quotes and code still set
apart, to read or edit directly. Press ⌘/ again to go back.

![View → Markdown: the plain text behind the document, beside the typeset page](/screenshots/markdown-view.png)

## Title, author and abstract

A document's title, subtitle, author, topic, date, header/footer and abstract are its **properties** (Design →
Properties). The template decides where and how they appear on the first page. The topic is optional: what the
document is about (an assignment, a subject), shown beside the author and date. The date can be a fixed text or
`today`. The header/footer is who or what the document is for (a class like `HIST 101`, a team, a project or a
company); templates show it in the page header or footer, and Word copies in the page header. Saving fills in an
empty title (the file's name), author (the default author from [Settings](./settings)) and date (today). The eye
beside each property in the dialog hides it from the preview, PDF and Word file without deleting it.

## Outline and scrolling

**View → Outline** (or the button beside the zoom controls) lists your headings to the left of the editor and
highlights the section you're in. Click a heading to jump there in both the editor and the preview.

![The outline beside the editor](/screenshots/outline.png)

The preview and the editor scroll together, lined up at each heading, so the page on the right always shows what you're
working on: scroll either one and the other follows. To look elsewhere in one pane without moving the other, click the
link button on the bar between the two panes; it turns into a broken link. Click it again to link them and bring the
preview back to where the editor is. Clicking a heading in the outline links them again too.

Click anywhere on a page in the preview to put the cursor at that spot in the editor.

**View → Preview** (or the button beside the outline's, by the zoom controls) hides the preview so the editor fills the
window; click it again to bring it back, lined up with the editor. The preview always shows while you customize a
template.

## Footnotes, contents and page breaks

- **References → Footnote** asks for the note's text, then adds a numbered mark at the cursor, which stays where it
  was. The note goes with the other notes at the end of the document, in order, under a **Footnotes** rule, and the
  template places it at the foot of the page; click its number to go back to the text.
- In the text, a footnote shows as its number. Point at it to read the note, and click it to go to the note. Notes are
  numbered in the order they appear, and adding or deleting one renumbers the rest. Deleting a footnote's number deletes
  its note too (cutting it doesn't, so it can be pasted elsewhere).
- A number with no note shows as a red **?**: click it to write the note. A note nothing points to also shows a red
  **?** and isn't printed. Both are listed in the status bar.
- **References → Contents** inserts a table of contents built from your headings. It updates by itself.
- **Insert → Page Break** starts a new page. **Insert → Divider** draws a line between sections.

## Peanut

A little 3D Peanut keeps you company at the top right, by the Export button. He breathes, blinks, sits down and stands
up, now and then puts on a cowboy hat or a party hat, and says something nice when you click him — he never speaks on
his own. His words fade away soon after he says them.
