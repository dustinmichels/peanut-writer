// Academic: in the spirit of a LaTeX article. Computer Modern, numbered
// sections, justified paragraphs with first-line indents, a centered title,
// booktabs-style tables.

#import "style.typ": custom-color, custom-font, custom-size

#let body-font = custom-font("bodyFont", ("New Computer Modern",))
#let heading-font = custom-font("headingFont", body-font)
#let mono-font = custom-font("monoFont", ("New Computer Modern Mono", "DejaVu Sans Mono"))
#let ink = custom-color("textColor", black)
#let heading-color = custom-color("headingColor", ink)
#let title-color = custom-color("titleColor", ink)
#let caption-color = custom-color("captionColor", ink)
#let rule = custom-color("accentColor", black)
#let header-fill = custom-color("tableHeaderFill", none)

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(paper: "us-letter", margin: (x: 1.35in, y: 1.25in), numbering: "1", number-align: center)
  set text(font: body-font, size: custom-size("fontSize", 11pt), fill: ink, lang: "en")
  set par(justify: true, leading: 0.55em, spacing: 0.55em, first-line-indent: 1.8em)

  set heading(numbering: "1.1")
  show heading: set text(font: heading-font, fill: heading-color, weight: "bold")
  show heading: set block(above: 1.6em, below: 1em)
  show heading.where(level: 1): set text(size: 14.4pt)
  show heading.where(level: 2): set text(size: 12pt)
  show heading.where(level: 3): set text(size: 11pt)

  set figure.caption(separator: [: ])
  show figure.caption: set text(size: 10pt, fill: caption-color)
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.6em, below: 1.6em)
  // Booktabs: a heavy rule above and below, a light one under the header.
  set table(
    stroke: (x, y) => if y == 0 { (bottom: 0.5pt + rule) } else { none },
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 6pt, y: 4pt),
  )
  show table: t => box(stroke: (top: 0.9pt + rule, bottom: 0.9pt + rule), t)

  show raw: set text(font: mono-font)
  show quote.where(block: true): it => pad(x: 2.5em, it.body)
  show link: set text(fill: rgb("#1F3A93"))
  set outline(title: [Contents], indent: auto)

  // Title block, centered, as \maketitle.
  align(center)[
    #set text(font: heading-font)
    #v(0.6em)
    #if get("title") != "" { text(size: 17.28pt, fill: title-color, get("title")) }
    #if get("subtitle") != "" { linebreak(); text(size: 13pt, get("subtitle")) }
    #if get("author") != "" { v(1.1em); text(size: 12pt, get("author")) }
    #if get("date") != "" { v(0.6em); text(size: 12pt, get("date")) }
    #v(1.6em)
  ]
  if get("abstract") != "" {
    align(center, text(size: 10pt, weight: "bold")[Abstract])
    pad(x: 3em, bottom: 1.5em, text(size: 10pt, par(first-line-indent: 0pt, get("abstract"))))
  }
  body
}
