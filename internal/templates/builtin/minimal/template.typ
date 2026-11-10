// Minimal: quiet Swiss-style sans. Black and grays only, generous white
// space, hairline rules, page numbers at the bottom right.

#let font = ("Helvetica Neue", "Helvetica", "Arial", "Libertinus Sans", "DejaVu Sans")
#let ink = rgb("#111111")
#let gray = luma(115)

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 1.1in, top: 1.1in, bottom: 1.1in),
    footer: context align(right, text(font: font, size: 8.5pt, fill: gray, counter(page).display())),
  )
  set text(font: font, size: 10.5pt, fill: ink, lang: "en")
  set par(leading: 0.8em, spacing: 1.3em)

  show heading: set text(weight: "bold")
  show heading: set block(above: 2em, below: 0.9em)
  show heading.where(level: 1): set text(size: 16pt)
  show heading.where(level: 2): set text(size: 12.5pt)
  show heading.where(level: 3): set text(size: 10.5pt, fill: gray)

  set figure.caption(separator: [ #h(0.3em)])
  show figure.caption: it => text(size: 8.5pt, fill: gray)[
    #text(fill: ink, weight: "bold")[#it.supplement #context it.counter.display(it.numbering)]#it.separator#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.8em, below: 1.8em)
  set table(
    stroke: (x, y) => (bottom: if y == 0 { 0.8pt + ink } else { 0.4pt + luma(215) }),
    inset: (x: 6pt, y: 6pt),
  )
  show table: set text(size: 9.5pt)

  show link: underline.with(stroke: 0.4pt + gray, offset: 2pt)
  show raw: set text(font: ("Menlo", "DejaVu Sans Mono"), size: 0.88em)
  show raw.where(block: true): block.with(stroke: (left: 0.8pt + ink), inset: (left: 12pt, y: 4pt), width: 100%)
  show quote.where(block: true): it => block(inset: (left: 18pt, y: 2pt), text(size: 12pt, fill: gray, it.body))
  set list(marker: [–])
  set outline(title: [Contents])

  // Title block.
  if get("title") != "" {
    block(below: 0.5em, text(size: 32pt, weight: "bold", tracking: -0.02em, get("title")))
  }
  if get("subtitle") != "" {
    block(below: 0.8em, text(size: 14pt, fill: gray, get("subtitle")))
  }
  let byline = (get("author"), get("date")).filter(s => s != "")
  if byline.len() > 0 {
    block(below: 0.9em, text(size: 9pt, fill: gray, byline.join(h(1.5em))))
  }
  if get("title") != "" or byline.len() > 0 {
    block(below: 2em, line(length: 100%, stroke: 0.4pt + ink))
  }
  if get("abstract") != "" {
    block(below: 2em, grid(
      columns: (1.2in, 1fr),
      text(size: 8.5pt, weight: "bold", fill: gray, upper[Abstract]),
      get("abstract"),
    ))
  }
  body
}
