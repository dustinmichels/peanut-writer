// Classic: a fresh Word document. Aptos (or Calibri, Helvetica), blue
// headings, 1-inch margins on US Letter.

#let body-font = ("Aptos", "Calibri", "Helvetica Neue", "Helvetica", "Libertinus Serif")
#let heading-font = ("Aptos Display", "Aptos", "Calibri Light", "Helvetica Neue", "Helvetica")
#let blue = rgb("#0F4761")

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(paper: "us-letter", margin: 1in, numbering: "1", number-align: center)
  set text(font: body-font, size: 11pt, lang: "en")
  set par(leading: 0.72em, spacing: 1.15em)

  show heading: set text(font: heading-font, fill: blue, weight: "regular")
  show heading: set block(above: 1.5em, below: 0.7em)
  show heading.where(level: 1): set text(size: 20pt)
  show heading.where(level: 2): set text(size: 16pt)
  show heading.where(level: 3): set text(size: 14pt)

  set figure.caption(separator: [: ])
  show figure.caption: set text(size: 9pt, style: "italic", fill: rgb("#0E2841"))
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.4em, below: 1.4em)
  set table(stroke: 0.5pt + luma(110), inset: (x: 7pt, y: 5pt))

  show link: set text(fill: rgb("#0563C1"))
  show link: underline
  show raw: set text(font: ("Menlo", "DejaVu Sans Mono"), size: 0.9em)
  show raw.where(block: true): block.with(fill: luma(245), inset: 9pt, radius: 3pt, width: 100%)
  show quote.where(block: true): it => block(
    inset: (left: 14pt, y: 3pt),
    stroke: (left: 2pt + luma(190)),
    text(style: "italic", fill: luma(70), it.body),
  )
  set outline(title: [Contents])

  // Title block.
  if get("title") != "" {
    block(below: 0.35em, text(font: heading-font, size: 28pt, get("title")))
  }
  if get("subtitle") != "" {
    block(below: 0.6em, text(font: heading-font, size: 14pt, fill: luma(90), get("subtitle")))
  }
  let byline = (get("author"), get("date")).filter(s => s != "")
  if byline.len() > 0 {
    block(below: 1.2em, text(fill: luma(70), byline.join([ #h(0.4em)·#h(0.4em) ])))
  }
  if get("abstract") != "" {
    block(inset: (x: 0.4in), below: 1.6em)[
      #text(weight: "bold")[Abstract.] #get("abstract")
    ]
  }
  body
}
