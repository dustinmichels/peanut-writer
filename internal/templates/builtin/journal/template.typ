// Journal: a two-column conference or journal paper. STIX Two at 10 pt,
// justified columns, numbered small-caps sections, a title and abstract
// across both columns, booktabs tables.

#import "style.typ": custom-color, custom-font, custom-size

#let body-font = custom-font("bodyFont", ("STIX Two Text", "Times New Roman", "Libertinus Serif"))
#let heading-font = custom-font("headingFont", body-font)
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))
#let ink = custom-color("textColor", black)
#let heading-color = custom-color("headingColor", ink)
#let title-color = custom-color("titleColor", ink)
#let caption-color = custom-color("captionColor", ink)
#let rule = custom-color("accentColor", black)
#let header-fill = custom-color("tableHeaderFill", none)

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 0.75in, top: 0.85in, bottom: 0.9in),
    columns: 2,
    numbering: "1",
    number-align: center,
    header: if get("header") != "" { text(size: 8pt, style: "italic", fill: luma(90), get("header")) },
  )
  set columns(gutter: 0.25in)
  set text(font: body-font, size: custom-size("fontSize", 10pt), fill: ink, lang: "en")
  set par(justify: true, leading: 0.5em, spacing: 0.5em, first-line-indent: 1em)

  // 1 INTRODUCTION; 1.1 Italic subsection; run-in third level.
  set heading(numbering: "1.1")
  show heading: set text(font: heading-font, fill: heading-color, size: 10pt)
  show heading.where(level: 1): it => block(above: 1.3em, below: 0.7em, sticky: true, text(
    weight: "bold",
    tracking: 0.04em,
  )[#if it.numbering != none { counter(heading).display(it.numbering) + h(0.7em) }#upper(it.body)])
  show heading.where(level: 2): it => block(above: 1.1em, below: 0.6em, sticky: true, text(
    weight: "bold",
    style: "italic",
  )[#if it.numbering != none { counter(heading).display(it.numbering) + h(0.6em) }#it.body])
  show heading.where(level: 3): set text(weight: "regular", style: "italic")
  show heading.where(level: 3): set block(above: 1em, below: 0.5em)

  set figure.caption(separator: [. ])
  show figure.caption: it => text(size: 8pt, fill: caption-color)[
    #smallcaps[#it.supplement #context it.counter.display(it.numbering)]#it.separator#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.2em, below: 1.2em)
  set table(
    stroke: (x, y) => if y == 0 { (bottom: 0.5pt + rule) } else { none },
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 4pt, y: 3pt),
  )
  show table: t => box(stroke: (top: 0.8pt + rule, bottom: 0.8pt + rule), t)
  show table: set text(size: 8.5pt)
  show table: set par(justify: false)

  show raw: set text(font: mono-font, size: 0.82em)
  show raw.where(block: true): block.with(inset: (x: 0.6em, y: 4pt), width: 100%)
  show quote.where(block: true): it => pad(x: 1.2em, text(size: 0.95em, it.body))
  show link: set text(fill: rgb("#1F3A93"))
  set footnote.entry(separator: line(length: 30%, stroke: 0.4pt))
  show footnote.entry: set text(size: 8pt)
  set outline(title: [Contents], indent: auto)

  // Title block across both columns.
  let has-title = ("title", "subtitle", "author", "topic", "date", "abstract").any(k => get(k) != "")
  if has-title {
    place(top + center, float: true, scope: "parent", clearance: 1.8em, {
      set par(first-line-indent: 0pt, justify: false)
      set text(font: heading-font)
      if get("title") != "" { block(below: 12pt, text(size: 22pt, fill: title-color, get("title"))) }
      if get("subtitle") != "" { block(below: 12pt, text(size: 13pt, style: "italic", get("subtitle"))) }
      if get("author") != "" { block(above: 14pt, below: 5pt, text(size: 11pt, get("author"))) }
      if get("topic") != "" { block(below: 5pt, text(size: 9.5pt, get("topic"))) }
      if get("date") != "" { block(below: 5pt, text(size: 9.5pt, style: "italic", get("date"))) }
      if get("abstract") != "" {
        v(1em)
        block(width: 82%, align(left, par(justify: true, text(size: 9pt)[
          #text(weight: "bold", style: "italic")[Abstract]---#get("abstract")
        ])))
      }
      v(0.4em)
      line(length: 100%, stroke: 0.4pt + rule)
    })
  }
  body
}
