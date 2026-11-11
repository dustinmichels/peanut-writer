# Style apart from content

The biggest idea in Peanut Writer is also the simplest: **you decide what your document says; a template decides how
it looks.**

## The problem with formatting by hand

In most word processors, every heading carries its own font, size, color and spacing. You pick them, one heading at a
time, and so does everyone else who edits the document. A few drafts later, one heading is 14 pt Calibri, another is
14.5 pt Aptos, and the figure numbers skip from 3 to 5 because someone deleted a picture. Changing the look of the
whole document means visiting every page.

Word has a cure for this, styles, but it's optional, so it rarely survives a busy week.

## How Peanut Writer does it

In Peanut Writer, there is no font menu next to your text. Instead, you say what each part of the document **is**:

| You say…                 | You don't say…                                  |
| ------------------------ | ----------------------------------------------- |
| This is a heading.       | 16 pt, bold, dark blue, 12 pt space above.      |
| This is a quotation.     | Indented 0.5 inch, italic, gray.                |
| This picture is a figure | Centered, with "Figure 3:" in small type below. |
| This is the title.       | 24 pt, centered, followed by the author's name. |

The template fills in everything in the right-hand column, the same way, everywhere. Your document only ever holds
the left-hand column.

## What you get

**Consistency for free.** Every heading at the same level looks the same, because none of them has a look of its
own.

**Change the whole look in one click.** The Design tab shows each template on a sample page. Choose _Manuscript_ for a
double-spaced paper to submit, then _Report_ for the version you send to your team. Not a word changes; only the
page does.

**Focus on writing.** When there's nothing to fiddle with, you don't fiddle. The page on the right is already
finished.

**The same document, in PDF and in Word.** Because the document says "this is a heading" rather than "this is 16 pt
bold", Peanut Writer can turn it into a typeset PDF _and_ a Word file that uses Word's own styles: Title, Heading 1,
Caption, Quote and so on. Whoever opens the Word file can keep editing it properly.

## The built-in templates

| Template       | Looks like                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Classic**    | Timeless and calm: Georgia, pine-green headings, italic subheads, 1-inch margins. Default.      |
| **Wordy**      | A fresh Word document: Aptos, blue headings, 1-inch margins.                                    |
| **Academic**   | A LaTeX article: Computer Modern, numbered sections, justified text, centered title.            |
| **Report**     | A business report: serif body, crisp sans headings, a teal accent, running headers.             |
| **Minimal**    | Quiet Swiss-style sans: black and grays, generous white space, hairline rules.                  |
| **Manuscript** | An APA-style paper ready to submit: Times 12 pt, double spaced, indented paragraphs.            |
| **Elegant**    | A finely set book page: old-style serif, justified text, small-caps headings, claret.           |
| **Editorial**  | A modern magazine feature: Iowan Old Style text, Avenir Next headlines, brick red, pull quotes. |
| **Journal**    | A two-column paper: STIX Two at 10 pt, numbered sections, title and abstract across the top.    |
| **Peanut**     | Warm and friendly: rounded headings, roasted-peanut browns, soft cream table headers.           |

## "But I want a different font"

You can have it, just not one heading at a time. **Design → Customize** gives the open document its own version of
its template: pick the body, heading and code fonts, the body size, and colors for text, headings, the title,
captions, accents and table headers. The preview follows each change. The choice still applies to the whole
document, so it stays consistent. See [Templates](./templates#customizing-one-document).

If you want something entirely your own, a template is just a small folder of files you can write, share and import.
See [Making your own template](../reference/custom-templates).

## Under the hood

For the curious: the document itself is a plain text file. At the top it records which template it uses:

```markdown
---
title: Quarterly Update
author: Ann
template: report
---

# Sales

Sales went up.
```

Change `report` to `academic` and the same words are set as a LaTeX-style article. That one line is the only place
style appears in your document.
