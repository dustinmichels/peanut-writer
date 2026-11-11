// Classic: timeless and calm. Optima, a classical sans, on 1-inch margins, ragged right,
// roman and italic headings in a pine green, the template's one accent, which
// also marks rules, list markers, links and caption labels.

#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("Optima", "Candara", "Gill Sans", "Helvetica Neue", "Libertinus Sans", "DejaVu Sans"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))
#let ink = custom-color("textColor", rgb("#1C1C1C"))
#let pine = custom-color("accentColor", rgb("#2E5E4E"))
#let heading-color = custom-color("headingColor", rgb("#2E5E4E"))
#let title-color = custom-color("titleColor", ink)
#let caption-color = custom-color("captionColor", rgb("#555555"))
#let header-fill = custom-color("tableHeaderFill", none)
#let muted = luma(105)

// Small, spaced capitals for labels and the byline.
#let caps(size, fill, body) = text(size: size, tracking: 0.12em, fill: fill, upper(body))

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: 1in,
    header: if get("header") != "" { align(right, text(size: 9pt, style: "italic", fill: muted, get("header"))) },
    footer: context align(center, text(size: 9pt, fill: muted, counter(page).display())),
  )
  set text(font: font, size: custom-size("fontSize", 11pt), fill: ink, lang: "en", number-type: "old-style")
  set par(leading: 0.78em, spacing: 1.05em)

  show heading: set text(font: heading-font, weight: "regular", fill: heading-color, number-type: "lining")
  show heading: set par(leading: 0.5em)
  show heading.where(level: 1): set text(size: 18pt)
  show heading.where(level: 1): set block(above: 2.1em, below: 0.9em)
  show heading.where(level: 2): set text(size: 14pt, style: "italic")
  show heading.where(level: 2): set block(above: 1.7em, below: 0.7em)
  show heading.where(level: 3): set text(size: 11pt, weight: "bold")
  show heading.where(level: 3): set block(above: 1.4em, below: 0.6em)

  set figure.caption(separator: [#h(0.6em)])
  show figure.caption: it => text(size: 9.5pt, fill: caption-color)[
    #caps(8pt, pine)[#it.supplement #context it.counter.display(it.numbering)]#it.separator#emph(it.body)
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.7em, below: 1.7em)
  set table(
    stroke: (x, y) => if y == 0 { (bottom: 0.5pt + pine) } else { none },
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 8pt, y: 5pt),
  )
  show table.cell.where(y: 0): set text(weight: "bold")
  show table: t => box(stroke: (top: 0.9pt + ink, bottom: 0.9pt + ink), t)

  show link: set text(fill: pine)
  show raw: set text(font: mono-font, size: 0.86em)
  show raw.where(block: true): block.with(fill: rgb("#F5F4EF"), inset: (x: 11pt, y: 9pt), radius: 2pt, width: 100%)
  show quote.where(block: true): it => block(
    inset: (left: 1.1em, y: 2pt),
    stroke: (left: 1pt + pine),
    text(style: "italic", fill: luma(60), it.body),
  )
  set list(marker: text(fill: pine)[–], indent: 0.4em)
  set enum(indent: 0.4em)
  set outline(title: [Contents], indent: auto)

  // Title block: left aligned, closed by a short pine rule.
  let byline = (get("author"), get("topic"), get("date")).filter(s => s != "")
  if get("title") != "" {
    block(below: 1em, text(font: heading-font, size: 26pt, fill: title-color, get("title")))
  }
  if get("subtitle") != "" {
    block(below: 0.6em, text(font: heading-font, size: 13.5pt, style: "italic", fill: muted, get("subtitle")))
  }
  if get("title") != "" or get("subtitle") != "" or byline.len() > 0 {
    block(above: 1.4em, below: 1em, line(length: 0.6in, stroke: 1pt + pine))
  }
  if byline.len() > 0 {
    block(below: 2.2em, caps(8.5pt, muted, byline.join([#h(0.5em)·#h(0.5em)])))
  }
  if get("abstract") != "" {
    block(inset: (x: 0.35in), below: 2em)[
      #set text(size: 10pt)
      #caps(8pt, pine)[Abstract] #h(0.6em) #get("abstract")
    ]
  }
  body
}
