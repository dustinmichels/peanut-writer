// Peanut: warm and friendly. Rounded sans type, roasted-peanut browns, cream
// table headers, and a little peanut here and there.

#import "style.typ": custom-color, custom-font, custom-size

#let shell = custom-color("accentColor", rgb("#D99E82"))
#let roast = rgb("#8B5528")
#let heading-color = custom-color("headingColor", roast)
#let title-color = custom-color("titleColor", roast)
#let caption-color = custom-color("captionColor", roast)
#let skin = rgb("#C1694F")
#let cream = rgb("#F6E3CC")
#let header-fill = custom-color("tableHeaderFill", cream)
#let ink = custom-color("textColor", rgb("#3B2A1E"))
#let font = custom-font("bodyFont", ("Avenir Next", "Nunito", "Helvetica Neue", "Libertinus Sans", "DejaVu Sans"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))

// A tiny peanut: two overlapping blobs.
#let peanut(size: 8pt) = box(baseline: 15%, stack(
  dir: ttb,
  spacing: -size * 0.32,
  ellipse(width: size * 0.82, height: size * 0.86, fill: shell),
  ellipse(width: size * 0.95, height: size, fill: shell),
))

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: 1in,
    header: if get("header") != "" { align(right, text(size: 9pt, fill: roast, get("header"))) },
    footer: context align(center, text(size: 9pt, fill: roast)[
      #peanut(size: 7pt) #h(3pt) #counter(page).display()
    ]),
  )
  set text(font: font, size: custom-size("fontSize", 11pt), fill: ink, lang: "en")
  set par(leading: 0.8em, spacing: 1.25em)

  show heading: set text(font: heading-font, fill: heading-color, weight: "bold")
  show heading: set block(above: 1.6em, below: 0.75em)
  show heading.where(level: 1): it => block(above: 1.8em, below: 0.9em)[
    #set text(size: 20pt)
    #peanut(size: 13pt) #h(4pt) #it.body
  ]
  show heading.where(level: 2): set text(size: 15pt)
  show heading.where(level: 3): set text(size: 12.5pt, fill: custom-color("headingColor", skin))

  set figure.caption(separator: [ #h(2pt)])
  show figure.caption: it => text(size: 9.5pt, fill: caption-color)[
    #box(fill: cream, inset: (x: 6pt, y: 2.5pt), radius: 6pt, text(weight: "bold")[#it.supplement #context it.counter.display(it.numbering)])#it.separator#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.6em, below: 1.6em)
  set table(
    stroke: 0.6pt + custom-color("accentColor", rgb("#E6CBAE")),
    fill: (x, y) => if y == 0 { header-fill } else if calc.even(y) { rgb("#FFFBF5") },
    inset: (x: 8pt, y: 6pt),
  )

  show link: set text(fill: skin)
  show link: underline.with(stroke: 0.6pt + shell, offset: 2pt)
  show raw: set text(font: mono-font, size: 0.88em, fill: roast)
  show raw.where(block: true): block.with(fill: rgb("#FBF4EA"), inset: 10pt, radius: 8pt, width: 100%)
  show quote.where(block: true): it => block(
    fill: rgb("#FFF8EE"),
    inset: (left: 14pt, rest: 10pt),
    radius: (right: 8pt),
    stroke: (left: 3pt + shell),
    text(style: "italic", it.body),
  )
  set list(marker: text(fill: shell)[●])
  set outline(title: [Contents])

  // Title block.
  if get("title") != "" {
    block(below: 1.1em, text(font: heading-font, size: 30pt, weight: "bold", fill: title-color, get("title")))
  }
  if get("subtitle") != "" {
    block(below: 1.2em, text(font: heading-font, size: 14pt, fill: skin, get("subtitle")))
  }
  let byline = (get("author"), get("topic"), get("date")).filter(s => s != "")
  if byline.len() > 0 {
    block(below: 1.1em, byline.map(s => box(fill: cream, inset: (x: 8pt, y: 4pt), radius: 10pt, text(size: 9.5pt, fill: roast, s))).join(h(6pt)))
  }
  if get("title") != "" or byline.len() > 0 {
    block(below: 1.4em, line(length: 100%, stroke: (paint: shell, thickness: 1.2pt, dash: "loosely-dotted")))
  }
  if get("abstract") != "" {
    block(fill: rgb("#FFF8EE"), inset: 14pt, radius: 10pt, width: 100%, below: 1.6em)[
      #text(weight: "bold", fill: roast)[In a nutshell] \
      #get("abstract")
    ]
  }
  body
}
