# Style apart from content

**You decide what your document says; a template decides how it looks.** That's the one idea behind Peanut Writer.

## Why

In most word processors each heading carries its own font, size and spacing, picked by whoever typed it. A few drafts
later one heading is 14 pt Calibri, another 14.5 pt Aptos, and restyling the document means visiting every page. Word's
styles fix this, but only if everyone sticks to them.

## How it works

There's no font menu beside your text. You say what each part **is**; the template decides how it looks:

| You say                   | The template decides                            |
| ------------------------- | ----------------------------------------------- |
| This is a heading.        | 16 pt, bold, dark blue, 12 pt space above.      |
| This is a quotation.      | Indented 0.5 inch, italic, gray.                |
| This picture is a figure. | Centered, with "Figure 3:" in small type below. |
| This is the title.        | 24 pt, centered, followed by the author's name. |

Your document holds only the left column. So:

- **Every heading at a level matches**, because none has a look of its own.
- **One click changes the whole look.** Turn a double-spaced _Manuscript_ into a _Report_ for your team without
  changing a word.
- **PDF, Word and web page come from the same text.** The Word file uses Word's own styles (Title, Heading 1, Caption,
  Quote…), so whoever opens it can keep editing properly.
- **There's nothing to fiddle with**, so you write.

## Where each one lives

The content is a plain text file. The only trace of style in it is the line naming the template:

```markdown
---
title: Quarterly Update
author: Ann
template: report
---

# Sales

Sales went up.
```

Change `report` to `academic` and the same words are set as a LaTeX-style article. The style itself is the template, or
`Name.template.json` beside the document once you customize it. [The .peanut format](./peanut-format) keeps the two
together.

## Changing the look

- **Choose** a [built-in template](./templates#built-in-templates) on the Design tab.
- **Customize** one document's fonts and colors ([how](./templates#customizing-one-document)). The change still applies
  to the whole document.
- **Write your own** template: [Making your own template](../reference/custom-templates).
