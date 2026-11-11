// Technical: documentation and specifications. PT Sans text, numbered
// headings with their numbers in a slate-blue accent, code in tinted panels
// with an accent bar, block quotes as note callouts, a running header with
// the title and project over a hairline.

#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("PT Sans", "Helvetica Neue", "Arial", "Libertinus Sans", "DejaVu Sans"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))
#let ink = custom-color("textColor", rgb("#1D232B"))
#let accent = custom-color("accentColor", rgb("#2F5F8F"))
#let heading-color = custom-color("headingColor", rgb("#17212B"))
#let title-color = custom-color("titleColor", rgb("#17212B"))
#let caption-color = custom-color("captionColor", luma(80))
#let header-fill = custom-color("tableHeaderFill", rgb("#EDF2F7"))
#let gray = luma(110)
#let panel = rgb("#F4F6F8")

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 1in, top: 1.05in, bottom: 1in),
    header: context if here().page() > 1 {
      set text(font: font, size: 8pt, fill: gray)
      grid(columns: (1fr, auto), get("title"), get("header"))
      v(-3pt)
      line(length: 100%, stroke: 0.4pt + luma(205))
    },
    footer: context align(right, text(font: font, size: 8pt, fill: gray, counter(page).display())),
  )
  set text(font: font, size: custom-size("fontSize", 10.5pt), fill: ink, lang: "en")
  set par(leading: 0.72em, spacing: 1.15em)

  // Numbers in the accent, hung before the heading text.
  set heading(numbering: "1.1")
  let numbered(it, gap) = {
    if it.numbering != none { text(fill: accent, counter(heading).display(it.numbering)) + h(gap) }
    it.body
  }
  show heading: set text(font: heading-font, fill: heading-color, weight: "bold")
  show heading.where(level: 1): it => block(above: 2em, below: 0.9em, sticky: true, {
    text(size: 16pt, numbered(it, 0.6em))
    v(-0.45em)
    line(length: 100%, stroke: 0.5pt + luma(215))
  })
  show heading.where(level: 2): it => block(above: 1.7em, below: 0.75em, sticky: true, text(size: 12.5pt, numbered(it, 0.5em)))
  show heading.where(level: 3): it => block(above: 1.4em, below: 0.6em, sticky: true, text(size: 10.5pt, numbered(it, 0.45em)))

  set figure.caption(separator: [ #h(0.2em)])
  show figure.caption: it => text(size: 8.5pt, fill: caption-color)[
    #text(weight: "bold", fill: accent)[#it.supplement #context it.counter.display(it.numbering)]#it.separator#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.6em, below: 1.6em)
  set table(
    stroke: (x, y) => (bottom: if y == 0 { 0.8pt + accent } else { 0.4pt + luma(218) }),
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 7pt, y: 5pt),
  )
  show table: set text(size: 9.5pt)
  show table.cell.where(y: 0): set text(weight: "bold")

  show link: set text(fill: accent)
  show raw: set text(font: mono-font, size: 0.86em)
  show raw.where(block: false): box.with(fill: panel, inset: (x: 2.5pt), outset: (y: 2.5pt), radius: 2pt)
  show raw.where(block: true): block.with(fill: panel, stroke: (left: 2.5pt + accent), inset: (x: 11pt, y: 9pt), width: 100%)
  // Block quotes as notes.
  show quote.where(block: true): it => block(
    fill: rgb("#EEF3F8"),
    stroke: (left: 2.5pt + accent),
    inset: (x: 12pt, y: 9pt),
    width: 100%,
    [#text(size: 8pt, weight: "bold", fill: accent, tracking: 0.1em)[NOTE] \ #it.body],
  )
  set list(marker: (text(fill: accent)[▪], text(fill: accent)[–]), indent: 0.3em)
  set enum(indent: 0.3em)
  set outline(title: [Contents], indent: auto)
  show outline.entry.where(level: 1): set text(weight: "bold")

  // Title block: project label, title, subtitle, a field grid.
  if get("header") != "" {
    block(below: 0.8em, text(size: 9pt, weight: "bold", fill: accent, tracking: 0.12em, upper(get("header"))))
  }
  if get("title") != "" {
    block(below: 0.7em, text(font: heading-font, size: 28pt, weight: "bold", fill: title-color, tracking: -0.01em, par(leading: 0.4em, get("title"))))
  }
  if get("subtitle") != "" {
    block(below: 0.9em, text(font: heading-font, size: 13.5pt, fill: gray, get("subtitle")))
  }
  let fields = (("Author", get("author")), ("Project", get("topic")), ("Date", get("date"))).filter(f => f.at(1) != "")
  if fields.len() > 0 {
    block(above: 1.2em, below: 1.4em, grid(
      columns: fields.len() * (auto,),
      column-gutter: 2.4em,
      row-gutter: 0.45em,
      ..fields.map(f => text(size: 7.5pt, weight: "bold", fill: gray, tracking: 0.1em, upper(f.at(0)))),
      ..fields.map(f => text(size: 10pt, f.at(1))),
    ))
  }
  if get("title") != "" or fields.len() > 0 {
    block(below: 1.6em, line(length: 100%, stroke: 0.8pt + accent))
  }
  if get("abstract") != "" {
    block(below: 1.8em, fill: panel, inset: 12pt, radius: 2pt, width: 100%)[
      #text(size: 8pt, weight: "bold", fill: accent, tracking: 0.1em)[OVERVIEW] \
      #get("abstract")
    ]
  }
  body
}
