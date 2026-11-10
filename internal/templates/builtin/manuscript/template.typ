// Manuscript: a submission-ready paper in the APA manner. Times 12pt,
// double spaced, half-inch paragraph indents, bold centered top-level
// headings and a page number at the top right.

#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("Times New Roman", "Times", "Libertinus Serif"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Courier New", "Courier", "DejaVu Sans Mono"))
#let size = custom-size("fontSize", 12pt)
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
  set page(
    paper: "us-letter",
    margin: 1in,
    header: context grid(columns: (1fr, auto), get("organization"), counter(page).display()),
  )
  set text(font: font, size: size, fill: ink, lang: "en")
  // Double spacing: the gap between paragraphs is the gap between lines.
  set par(leading: 1.3em, spacing: 1.3em, first-line-indent: 0.5in)

  show heading: set text(font: heading-font, size: size, fill: heading-color, weight: "bold")
  show heading: set block(above: 1.3em, below: 1.3em)
  show heading.where(level: 1): set align(center)
  show heading.where(level: 3): set text(style: "italic")

  set figure.caption(separator: [. ])
  show figure.caption: it => align(left, text(fill: caption-color)[
    #text(weight: "bold")[#it.supplement #context it.counter.display(it.numbering)]#it.separator#emph(it.body)
  ])
  set figure.caption(position: top)
  show figure: set block(above: 1.3em, below: 1.3em)
  show figure: set par(leading: 0.65em)
  set table(
    stroke: (x, y) => if y == 0 { (top: 0.6pt + rule, bottom: 0.6pt + rule) } else { none },
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 6pt, y: 5pt),
  )
  show table: t => box(stroke: (bottom: 0.6pt + rule), t)

  show raw: set text(font: mono-font, size: size - 1pt)
  show raw.where(block: true): set par(leading: 0.65em)
  show quote.where(block: true): it => pad(left: 0.5in, it.body)
  show footnote.entry: set par(leading: 0.65em, first-line-indent: 0pt)
  set outline(title: [Contents], indent: auto)

  // Title block, centered and bold.
  align(center)[
    #set par(first-line-indent: 0pt)
    #v(2em)
    #if get("title") != "" { text(font: heading-font, weight: "bold", fill: title-color, get("title")) }
    #if get("subtitle") != "" { linebreak(); text(font: heading-font, weight: "bold", get("subtitle")) }
    #if get("author") != "" { v(1.3em); get("author") }
    #if get("date") != "" { linebreak(); get("date") }
    #v(1.3em)
  ]
  if get("abstract") != "" {
    align(center, text(weight: "bold")[Abstract])
    block(below: 1.3em, par(first-line-indent: 0pt, get("abstract")))
  }
  body
}
