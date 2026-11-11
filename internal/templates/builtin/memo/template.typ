// Memo: an office memorandum. Helvetica Neue throughout, the organization
// (header) over a bold "Memo", a From / Date / Re / Subject block between
// navy rules, a summary set off by a bar, short bold headings and a footer
// with the subject and "Page n of N".

#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("Helvetica Neue", "Helvetica", "Arial", "Libertinus Sans", "DejaVu Sans"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))
#let ink = custom-color("textColor", rgb("#1B1F24"))
#let navy = custom-color("accentColor", rgb("#1F3B5C"))
#let heading-color = custom-color("headingColor", navy)
#let title-color = custom-color("titleColor", navy)
#let caption-color = custom-color("captionColor", luma(85))
#let header-fill = custom-color("tableHeaderFill", rgb("#E8EDF3"))
#let gray = luma(110)

#let field-name(s) = text(size: 8pt, weight: "bold", fill: gray, tracking: 0.1em, upper(s))

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 1in, top: 0.9in, bottom: 1in),
    footer: context {
      set text(font: font, size: 8pt, fill: gray)
      line(length: 100%, stroke: 0.4pt + luma(210))
      v(-2pt)
      grid(columns: (1fr, auto), get("title"), [Page #counter(page).display() of #counter(page).final().first()])
    },
  )
  set text(font: font, size: custom-size("fontSize", 10.5pt), fill: ink, lang: "en")
  set par(leading: 0.7em, spacing: 1.1em)

  show heading: set text(font: heading-font, fill: heading-color, weight: "bold")
  show heading: set block(above: 1.6em, below: 0.7em)
  show heading.where(level: 1): set text(size: 13pt)
  show heading.where(level: 2): set text(size: 11pt)
  show heading.where(level: 3): set text(size: 10.5pt, fill: custom-color("headingColor", ink))

  set figure.caption(separator: [ #h(0.2em)])
  show figure.caption: it => text(size: 8.5pt, fill: caption-color)[
    #text(weight: "bold", fill: navy)[#it.supplement #context it.counter.display(it.numbering)]#it.separator#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.5em, below: 1.5em)
  set table(
    stroke: (x, y) => (bottom: if y == 0 { 0.8pt + navy } else { 0.4pt + luma(215) }),
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 7pt, y: 5pt),
  )
  show table: set text(size: 9.5pt)
  show table.cell.where(y: 0): set text(weight: "bold")

  show link: set text(fill: navy)
  show raw: set text(font: mono-font, size: 0.88em)
  show raw.where(block: true): block.with(fill: luma(245), inset: 9pt, radius: 2pt, width: 100%)
  show quote.where(block: true): it => block(inset: (left: 14pt, y: 2pt), stroke: (left: 2pt + luma(200)), text(fill: luma(70), it.body))
  set list(marker: text(fill: navy)[•], indent: 0.3em)
  set enum(indent: 0.3em)
  set outline(title: [Contents])

  // Memo head: organization, "Memo", then the fields between rules.
  if get("header") != "" {
    block(below: 0.5em, text(size: 9pt, weight: "bold", fill: gray, tracking: 0.14em, upper(get("header"))))
  }
  block(below: 0.9em, text(font: heading-font, size: 30pt, weight: "bold", fill: title-color, tracking: -0.01em)[Memo])
  line(length: 100%, stroke: 2.5pt + navy)
  let subject = if get("subtitle") != "" and get("title") != "" {
    [#strong(get("title")) --- #get("subtitle")]
  } else if get("title") != "" { strong(get("title")) } else { get("subtitle") }
  let rows = (
    ("From", get("author")),
    ("Date", get("date")),
    ("Re", get("topic")),
    ("Subject", subject),
  ).filter(r => r.at(1) != "")
  if rows.len() > 0 {
    block(above: 1.1em, below: 1.1em, grid(
      columns: (0.95in, 1fr),
      row-gutter: 0.85em,
      align: (left + horizon, left + horizon),
      ..rows.map(r => (field-name(r.at(0)), r.at(1))).flatten(),
    ))
  }
  line(length: 100%, stroke: 0.6pt + navy)
  v(1.2em)
  if get("abstract") != "" {
    block(below: 1.6em, inset: (left: 12pt, y: 3pt), stroke: (left: 3pt + navy))[
      #field-name[Summary] \
      #get("abstract")
    ]
  }
  body
}
