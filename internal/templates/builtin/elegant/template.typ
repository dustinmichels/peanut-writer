// Elegant: a finely set book page. Old-style serif, justified text with
// indents, small-caps headings, a centered title and a deep claret accent.

#let font = ("Hoefler Text", "EB Garamond", "Garamond", "Baskerville", "Palatino", "Libertinus Serif")
#let claret = rgb("#7A1F2B")
#let ink = rgb("#222222")

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 1.3in, top: 1.2in, bottom: 1.2in),
    footer: context align(center, text(size: 9.5pt, fill: claret)[— #counter(page).display() —]),
  )
  set text(font: font, size: 11.5pt, fill: ink, lang: "en", number-type: "old-style")
  set par(justify: true, leading: 0.7em, spacing: 0.7em, first-line-indent: 1.5em)

  show heading: set text(weight: "regular", fill: claret)
  show heading: set block(above: 1.8em, below: 1em)
  show heading.where(level: 1): it => block(above: 2.2em, below: 1.2em, width: 100%, align(center, stack(
    spacing: 0.6em,
    smallcaps(all: true, text(size: 15pt, tracking: 0.08em, it.body)),
    line(length: 0.4in, stroke: 0.5pt + claret),
  )))
  show heading.where(level: 2): set text(size: 13pt, style: "italic")
  show heading.where(level: 3): it => block(above: 1.4em, below: 0.8em, smallcaps(all: true, text(size: 11pt, tracking: 0.06em, it.body)))

  set figure.caption(separator: [. ])
  show figure.caption: it => text(size: 10pt)[
    #smallcaps(all: true, text(fill: claret, tracking: 0.05em)[#it.supplement #context it.counter.display(it.numbering)])#it.separator#emph(it.body)
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.8em, below: 1.8em)
  set table(
    stroke: (x, y) => if y == 0 { (bottom: 0.5pt + claret) } else { none },
    inset: (x: 8pt, y: 5pt),
  )
  show table: t => box(stroke: (top: 1pt + claret, bottom: 1pt + claret), t)
  show table: set par(justify: false)

  show link: set text(fill: claret)
  show raw: set text(font: ("Menlo", "DejaVu Sans Mono"), size: 0.85em)
  show raw.where(block: true): block.with(inset: (x: 1.5em, y: 6pt), width: 100%)
  show quote.where(block: true): it => pad(x: 2em, text(style: "italic", it.body))
  set list(marker: text(fill: claret)[•])
  set outline(title: [Contents], indent: auto)

  // Title block, centered.
  align(center)[
    #set par(first-line-indent: 0pt, justify: false)
    #v(1.2em)
    #if get("title") != "" { text(size: 28pt, fill: claret, get("title")) }
    #if get("subtitle") != "" { v(0.2em); text(size: 14pt, style: "italic", get("subtitle")) }
    #if get("title") != "" or get("subtitle") != "" { v(0.6em); line(length: 1.2in, stroke: 0.5pt + claret) }
    #if get("author") != "" { v(0.4em); smallcaps(all: true, text(size: 12pt, tracking: 0.1em, get("author"))) }
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
