# Writing

The window has two halves. You type on the left; the typeset pages appear on the right, updating as you go.

## The ribbon

Everything you can do is a button on the ribbon across the top:

| Tab            | What's there                                                                           |
| -------------- | -------------------------------------------------------------------------------------- |
| **File**       | New, open, save, recent documents, export, settings                                    |
| **Home**       | Bold, italic, strikethrough, code, headings, lists, quotes                             |
| **Insert**     | Picture, picture grid, table, link, footnote, equation, code, divider, page break      |
| **References** | Cross-reference, footnote, table of contents                                           |
| **Design**     | Templates, Customize, Manage Templates, document properties, settings                  |
| **View**       | Markdown view, outline                                                                 |
| **Help**       | Welcome guide, Markdown cheat sheet                                                    |

## The command palette

Press **⇧⌘P** (View → Command Palette…) to search every command by name. Each word you type matches the start of a
word, so "ex wo" finds _Export as Word_. Use ↑ and ↓ to choose, Return to run it and Esc to close. There's one command
per template too, so "acad" switches to _Academic_. Commands that wouldn't do anything right now are dimmed.

![The command palette, finding the export commands from "ex"](/screenshots/command-palette.png)

_Lorem Ipsum_ (palette only) inserts sample headings, text, figures and tables at the cursor, handy for seeing how a
template looks. Its pictures are saved in the document's `images/` folder.

## Text that looks like itself

Headings, bold, italics, links, quotes and bullets read as formatted text in the editor, not as symbols. Figures,
tables, cross-references and the document's properties appear as what they are. If you know
[Markdown](./markdown-and-latex#what-is-markdown) you can type it and it formats as you go; if you don't, use the
ribbon.

**View → Markdown** (⌘/) shows the plain text underneath, to read or edit directly, with each figure's picture shown
below it. Press ⌘/ again to go back.

![View → Markdown: the plain text behind the document, beside the typeset page](/screenshots/markdown-view.png)

## Title, author and abstract

A document's title, subtitle, author, date, organization and abstract are its **properties** (Design → Properties,
or File → Properties…). The template decides where and how they appear on the first page. The date can be a fixed
text or `today`. The organization is who or what the document is for (a class like `HIST 101`, a team, a project
or a company); templates show it in the page header or footer, and Word copies in the page header. New documents get
the default author from [Settings](./settings).

## Outline and scrolling

**View → Outline** (or the button beside the zoom controls) lists your headings to the left of the editor and
highlights the section you're in. Click a heading to jump there in both the editor and the preview.

![The outline beside the editor](/screenshots/outline.png)

The editor and the preview scroll together, lined up at each heading, so the page on the right always shows what
you're working on.

## Footnotes, contents and page breaks

- **References → Footnote** adds a numbered note at the cursor; the note's text goes at the end of the document and the
  template places it at the foot of the page.
- **References → Contents** inserts a table of contents built from your headings. It updates by itself.
- **Insert → Page Break** starts a new page. **Insert → Divider** draws a line between sections.

## Peanut

A little 3D Peanut keeps you company at the top right, by the Export button. He breathes, blinks, sits down and stands
up, now and then puts on a cowboy hat or a party hat, cheers every few minutes while you're writing and at every 250
words, and says something nice when you click him. His words fade away soon after he says them.
