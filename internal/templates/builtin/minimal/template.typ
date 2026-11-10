// Minimal: quiet Swiss-style sans. Black and grays only, generous white
// space, hairline rules, page numbers at the bottom right.

#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("Helvetica Neue", "Helvetica", "Arial", "Libertinus Sans", "DejaVu Sans"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))
#let ink = custom-color("textColor", rgb("#111111"))
#let heading-color = custom-color("headingColor", ink)
#let title-color = custom-color("titleColor", ink)
#let rule = custom-color("accentColor", ink)
#let header-fill = custom-color("tableHeaderFill", none)
#let gray = luma(115)
#let caption-color = custom-color("captionColor", gray)

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
  set text(font: font, size: custom-size("fontSize", 10.5pt), fill: ink, lang: "en")
  set par(leading: 0.8em, spacing: 1.3em)

  show heading: set text(font: heading-font, fill: heading-color, weight: "bold")
  show heading: set block(above: 2em, below: 0.9em)
  show heading.where(level: 1): set text(size: 16pt)
  show heading.where(level: 2): set text(size: 12.5pt)
  show heading.where(level: 3): set text(size: 10.5pt, fill: custom-color("headingColor", gray))

  set figure.caption(separator: [ #h(0.3em)])
  show figure.caption: it => text(size: 8.5pt, fill: caption-color)[
    #text(fill: ink, weight: "bold")[#it.supplement #context it.counter.display(it.numbering)]#it.separator#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.8em, below: 1.8em)
  set table(
    stroke: (x, y) => (bottom: if y == 0 { 0.8pt + rule } else { 0.4pt + luma(215) }),
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 6pt, y: 6pt),
  )
  show table: set text(size: 9.5pt)

  show link: underline.with(stroke: 0.4pt + gray, offset: 2pt)
  show raw: set text(font: mono-font, size: 0.88em)
  show raw.where(block: true): block.with(stroke: (left: 0.8pt + rule), inset: (left: 12pt, y: 4pt), width: 100%)
  show quote.where(block: true): it => block(inset: (left: 18pt, y: 2pt), text(size: 12pt, fill: gray, it.body))
  set list(marker: [–])
  set outline(title: [Contents])

  // Title block.
  if get("title") != "" {
    block(below: 1.2em, text(font: heading-font, size: 32pt, weight: "bold", tracking: -0.02em, fill: title-color, get("title")))
  }
  if get("subtitle") != "" {
    block(below: 1em, text(font: heading-font, size: 14pt, fill: gray, get("subtitle")))
  }
  let byline = (get("author"), get("date")).filter(s => s != "")
  if byline.len() > 0 {
    block(below: 0.9em, text(size: 9pt, fill: gray, byline.join(h(1.5em))))
  }
  if get("title") != "" or byline.len() > 0 {
    block(below: 2em, line(length: 100%, stroke: 0.4pt + rule))
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
