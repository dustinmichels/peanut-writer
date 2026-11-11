// Report: a polished business report. Serif body, sans headings, a teal
// accent, numbered sections, a running header and "Page n of N".

#import "style.typ": custom-color, custom-font, custom-size

#let teal = custom-color("accentColor", rgb("#0F6E6E"))
#let heading-color = custom-color("headingColor", rgb("#0F6E6E"))
#let title-color = custom-color("titleColor", rgb("#0F6E6E"))
#let caption-color = custom-color("captionColor", luma(80))
#let ink = custom-color("textColor", rgb("#1F2328"))
#let header-fill = custom-color("tableHeaderFill", rgb("#DCEFEF"))
#let sans = custom-font("headingFont", ("Helvetica Neue", "Avenir Next", "Arial", "Libertinus Sans", "DejaVu Sans"))
#let serif = custom-font("bodyFont", ("Charter", "Georgia", "Libertinus Serif"))
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 1in, top: 1.1in, bottom: 1in),
    header: context {
      if here().page() > 1 {
        set text(font: sans, size: 8.5pt, fill: luma(110))
        grid(columns: (1fr, auto), get("title"), get("author"))
        v(-4pt)
        line(length: 100%, stroke: 0.5pt + luma(200))
      }
    },
    footer: context {
      set text(font: sans, size: 8.5pt, fill: luma(110))
      grid(columns: (1fr, auto), get("header"), [Page #counter(page).display() of #counter(page).final().first()])
    },
  )
  set text(font: serif, size: custom-size("fontSize", 11pt), fill: ink, lang: "en")
  set par(leading: 0.75em, spacing: 1.2em)

  set heading(numbering: "1.1")
  show heading: set text(font: sans, fill: heading-color, weight: "bold")
  show heading: set block(above: 1.7em, below: 0.8em)
  show heading.where(level: 1): set text(size: 18pt)
  show heading.where(level: 2): set text(size: 14pt)
  show heading.where(level: 3): set text(size: 12pt)

  set figure.caption(separator: [ ])
  show figure.caption: it => text(font: sans, size: 9.5pt, fill: caption-color)[
    #text(weight: "bold", fill: teal)[#it.supplement #context it.counter.display(it.numbering)]#it.separator#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.6em, below: 1.6em)
  set table(
    stroke: (x, y) => (bottom: if y == 0 { 1pt + teal } else { 0.5pt + luma(205) }),
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 8pt, y: 6pt),
  )
  show table: set text(font: sans, size: 9.5pt)

  show link: set text(fill: teal)
  show raw: set text(font: mono-font, size: 0.88em)
  show raw.where(block: true): block.with(fill: rgb("#F3F6F6"), inset: 10pt, radius: 4pt, width: 100%)
  show quote.where(block: true): it => block(
    inset: (left: 16pt, y: 4pt),
    stroke: (left: 3pt + teal),
    text(fill: luma(60), it.body),
  )
  set outline(title: [Contents])
  show outline.entry.where(level: 1): set text(weight: "bold")

  // Title block.
  rect(width: 2.6cm, height: 5pt, fill: teal)
  v(0.4em)
  if get("title") != "" {
    block(below: 1.1em, text(font: sans, size: 30pt, weight: "bold", fill: title-color, get("title")))
  }
  if get("subtitle") != "" {
    block(below: 1em, text(font: sans, size: 15pt, fill: luma(90), get("subtitle")))
  }
  let byline = (get("author"), get("topic"), get("date")).filter(s => s != "")
  if byline.len() > 0 {
    block(below: 1.6em, text(font: sans, size: 10pt, fill: luma(90), tracking: 0.04em, upper(byline.join("  ·  "))))
  }
  if get("abstract") != "" {
    block(fill: rgb("#EEF6F6"), inset: 14pt, radius: 4pt, width: 100%, below: 1.8em)[
      #text(font: sans, weight: "bold", fill: teal, size: 10pt)[SUMMARY] \
      #get("abstract")
    ]
  }
  body
}
