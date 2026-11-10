# Making your own template

Most people never need this: pick a [built-in template](../guide/style-and-content#the-built-in-templates) and
[customize](../guide/templates#customizing-one-document) its fonts and colors. But if you want a look that's entirely
your own, a template is a small folder you can write, share and import.

## Where templates live

Each template is a folder in your templates folder:

```text
~/Library/Application Support/Peanut Writer/templates/<name>/
├── template.typ    how it looks in the PDF and the preview
└── template.json   its name, description, and how it looks in Word
```

Design → Manage Templates → **Open Folder** opens it. Folders named like a built-in template, or `custom`, are skipped.
Edits to a template show up in the preview on the next keystroke, so it's easy to work with the preview open.

The quickest start is to copy a built-in template's two files from
[`internal/templates/builtin`](https://github.com/dustinmichels/peanut-writer/tree/main/internal/templates/builtin) and
change them.

## `template.typ`

A [Typst](https://typst.app/docs) file exporting `template(meta, body)`: a function that sets up the page, fonts,
headings, captions and tables, writes the title block from `meta` (`title`, `subtitle`, `author`, `date`,
`abstract`), then shows `body`. `meta` also has `organization` (a class, team, project or company), which the built-in
templates show in the page header or footer. Missing properties are absent, so read them with a default.

```typst
#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("Helvetica Neue", "Arial"))
#let ink = custom-color("textColor", rgb("#111111"))

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set page(
    paper: "us-letter",
    margin: 1in,
    header: if get("organization") != "" { align(right, text(size: 9pt, get("organization"))) },
  )
  set text(font: font, size: custom-size("fontSize", 11pt), fill: ink)
  show heading.where(level: 1): set text(size: 16pt)

  if get("title") != "" {
    block(below: 1em, text(size: 28pt, weight: "bold", get("title")))
  }
  body
}
```

Importing `style.typ` and wrapping your fonts, colors and size in `custom-font`, `custom-color` and `custom-size` is
optional, but it's what lets **Customize** change them. A template that doesn't import `style.typ` can only be
customized in Word.

## `template.json`

Its name and description, and a `docx` block describing how it looks in Word. Colors are `RRGGBB`. A template saved
from **Customize** also has a `style` block: its font and color changes, passed to Typst through `style.typ`.

```json
{
  "name": "Minimal",
  "description": "Quiet Swiss-style sans: black and grays, generous white space, hairline rules.",
  "docx": {
    "paper": "letter",
    "margin": 1.1,
    "bodyFont": "Helvetica Neue",
    "headingFont": "Helvetica Neue",
    "monoFont": "Menlo",
    "fontSize": 10.5,
    "lineSpacing": 1.25,
    "spaceAfter": 10,
    "firstLineIndent": 0,
    "justify": false,
    "textColor": "111111",
    "headingColor": "111111",
    "headingSizes": [16, 12.5, 10.5],
    "headingBold": true,
    "numberedHeadings": false,
    "titleSize": 32,
    "titleColor": "111111",
    "titleAlign": "left",
    "captionSize": 8.5,
    "captionColor": "737373",
    "captionItalic": false,
    "accentColor": "111111",
    "tableHeaderFill": "",
    "pageNumbers": true
  }
}
```

| Key                | Meaning                                                    |
| ------------------ | ---------------------------------------------------------- |
| `paper`            | `letter` or `a4`                                           |
| `margin`           | Inches, every side                                         |
| `columns`          | Text columns below the title block; leave out for one. The PDF needs `page(columns: 2)` in `template.typ` too |
| `bodyFont`, `headingFont`, `monoFont` | Body text; headings and title; code      |
| `fontSize`         | Body text, points                                          |
| `lineSpacing`      | Multiple of single spacing                                 |
| `spaceAfter`       | Points after each paragraph                                |
| `firstLineIndent`  | Inches; `0` for none                                       |
| `justify`          | Justify body text                                          |
| `headingSizes`     | Points for levels 1–3; deeper levels use the last          |
| `headingBold`      | Bold headings                                              |
| `numberedHeadings` | Number headings 1, 1.1, 1.1.1                              |
| `titleSize`, `titleColor`, `titleAlign` | Title block; align is `left` or `center` |
| `captionSize`, `captionColor`, `captionItalic` | Figure and table captions         |
| `accentColor`      | Rules and table borders                                    |
| `tableHeaderFill`  | Table header background; `""` for none                     |
| `pageNumbers`      | Page numbers centered in the footer                        |

## Sharing

Design → Manage Templates → **Share** saves a `.zip` holding `template.typ` and `template.json`. Whoever receives it
uses **Import…** to add it as a new template. The two files can be at the top of the zip or in one folder inside it.
