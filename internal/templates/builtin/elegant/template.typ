// Elegant: a finely set book page. Old-style serif, justified text with
// indents, small-caps headings, a centered title and a deep claret accent.

#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("Hoefler Text", "EB Garamond", "Garamond", "Baskerville", "Palatino", "Libertinus Serif"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))
#let claret = custom-color("accentColor", rgb("#7A1F2B"))
#let heading-color = custom-color("headingColor", rgb("#7A1F2B"))
#let title-color = custom-color("titleColor", rgb("#7A1F2B"))
#let ink = custom-color("textColor", rgb("#222222"))
#let caption-color = custom-color("captionColor", ink)
#let header-fill = custom-color("tableHeaderFill", none)

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 1.3in, top: 1.2in, bottom: 1.2in),
    header: if get("header") != "" {
      align(center, smallcaps(all: true, text(size: 9pt, tracking: 0.08em, fill: claret, get("header"))))
    },
    footer: context align(center, text(size: 9.5pt, fill: claret)[— #counter(page).display() —]),
  )
  set text(font: font, size: custom-size("fontSize", 11.5pt), fill: ink, lang: "en", number-type: "old-style")
  set par(justify: true, leading: 0.7em, spacing: 0.7em, first-line-indent: 1.5em)

  show heading: set text(font: heading-font, weight: "regular", fill: heading-color)
  show heading: set block(above: 1.8em, below: 1em)
  show heading.where(level: 1): it => block(above: 2.2em, below: 1.2em, width: 100%, align(center, stack(
    spacing: 0.6em,
    smallcaps(all: true, text(size: 15pt, tracking: 0.08em, it.body)),
    line(length: 0.4in, stroke: 0.5pt + claret),
  )))
  show heading.where(level: 2): set text(size: 13pt, style: "italic")
  show heading.where(level: 3): it => block(above: 1.4em, below: 0.8em, smallcaps(all: true, text(size: 11pt, tracking: 0.06em, it.body)))

  set figure.caption(separator: [. ])
  show figure.caption: it => text(size: 10pt, fill: caption-color)[
    #smallcaps(all: true, text(fill: claret, tracking: 0.05em)[#it.supplement #context it.counter.display(it.numbering)])#it.separator#emph(it.body)
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.8em, below: 1.8em)
  set table(
    stroke: (x, y) => if y == 0 { (bottom: 0.5pt + claret) } else { none },
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 8pt, y: 5pt),
  )
  show table: t => box(stroke: (top: 1pt + claret, bottom: 1pt + claret), t)
  show table: set par(justify: false)

  show link: set text(fill: claret)
  show raw: set text(font: mono-font, size: 0.85em)
  show raw.where(block: true): block.with(inset: (x: 1.5em, y: 6pt), width: 100%)
  show quote.where(block: true): it => pad(x: 2em, text(style: "italic", it.body))
  set list(marker: text(fill: claret)[•])
  set outline(title: [Contents], indent: auto)

  // Title block, centered.
  align(center)[
    #set par(first-line-indent: 0pt, justify: false)
    #set text(font: heading-font)
    #v(1.2em)
    #if get("title") != "" { text(size: 28pt, fill: title-color, get("title")) }
    #if get("subtitle") != "" { v(0.2em); text(size: 14pt, style: "italic", get("subtitle")) }
    #if get("title") != "" or get("subtitle") != "" { v(0.6em); line(length: 1.2in, stroke: 0.5pt + claret) }
    #if get("author") != "" { v(0.4em); smallcaps(all: true, text(size: 12pt, tracking: 0.1em, get("author"))) }
    #if get("topic") != "" { linebreak(); text(size: 10.5pt, get("topic")) }
    #if get("date") != "" { linebreak(); text(size: 10.5pt, style: "italic", get("date")) }
    #v(1.8em)
  ]
  if get("abstract") != "" {
    pad(x: 2.5em, bottom: 1.8em, text(size: 10.5pt, par(first-line-indent: 0pt)[
      #smallcaps(all: true, text(fill: claret, tracking: 0.08em)[Abstract]) #h(0.4em) #get("abstract")
    ]))
  }
  body
}
