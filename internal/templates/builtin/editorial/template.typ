// Editorial: a modern magazine feature. Iowan Old Style text, Avenir Next
// headings, a brick-red accent, a big left-aligned headline with a kicker
// rule, pull-quote block quotes and a running footer.

#import "style.typ": custom-color, custom-font, custom-size

#let serif = custom-font("bodyFont", ("Iowan Old Style", "Charter", "Georgia", "Libertinus Serif"))
#let sans = custom-font("headingFont", ("Avenir Next", "Avenir", "Helvetica Neue", "Libertinus Sans", "DejaVu Sans"))
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))
#let accent = custom-color("accentColor", rgb("#B23A26"))
#let ink = custom-color("textColor", rgb("#1C1B1A"))
#let heading-color = custom-color("headingColor", ink)
#let title-color = custom-color("titleColor", ink)
#let caption-color = custom-color("captionColor", rgb("#5F5A55"))
#let header-fill = custom-color("tableHeaderFill", none)
#let quiet = rgb("#8A847D")

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 1.15in, top: 1in, bottom: 1.1in),
    footer: context {
      set text(font: sans, size: 8pt, fill: quiet, tracking: 0.06em)
      grid(
        columns: (auto, 1fr, auto),
        column-gutter: 1em,
        text(weight: "bold", fill: accent, counter(page).display()),
        upper(get("title")),
        upper(get("header")),
      )
    },
  )
  set text(font: serif, size: custom-size("fontSize", 11pt), fill: ink, lang: "en")
  set par(leading: 0.78em, spacing: 1.1em)

  show heading: set text(font: sans, fill: heading-color)
  show heading: set block(above: 1.9em, below: 0.75em, sticky: true)
  show heading.where(level: 1): set text(size: 19pt, weight: "bold", tracking: -0.01em)
  show heading.where(level: 2): set text(size: 13.5pt, weight: "semibold")
  show heading.where(level: 3): it => block(above: 1.6em, below: 0.7em, sticky: true, text(
    size: 9pt,
    weight: "bold",
    fill: accent,
    tracking: 0.12em,
    upper(it.body),
  ))

  set figure.caption(separator: [ ])
  show figure.caption: it => text(font: sans, size: 8.5pt, fill: caption-color)[
    #text(weight: "bold", fill: accent, upper[#it.supplement #context it.counter.display(it.numbering)])#h(0.3em)#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.8em, below: 1.8em)
  set table(
    stroke: (x, y) => (bottom: if y == 0 { 1.2pt + ink } else { 0.5pt + rgb("#DDD8D2") }),
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 7pt, y: 6pt),
  )
  show table: set text(font: sans, size: 9pt)

  show link: set text(fill: accent)
  show raw: set text(font: mono-font, size: 0.85em)
  show raw.where(block: true): block.with(fill: rgb("#F5F2EE"), inset: 11pt, width: 100%)
  // Block quotes as pull quotes.
  show quote.where(block: true): it => block(
    above: 1.6em,
    below: 1.6em,
    inset: (left: 18pt, y: 2pt),
    stroke: (left: 2.5pt + accent),
    text(size: 1.25em, style: "italic", fill: ink, it.body),
  )
  set list(marker: text(fill: accent)[■], body-indent: 0.6em)
  set enum(numbering: n => text(font: sans, weight: "bold", fill: accent, size: 0.9em)[#n.])
  set outline(title: [Contents])
  show outline.entry.where(level: 1): set text(font: sans, weight: "semibold")

  // Title block: kicker rule, headline, deck, byline.
  let byline = (get("author"), get("topic"), get("date")).filter(s => s != "")
  if get("title") != "" or get("subtitle") != "" or byline.len() > 0 {
    line(length: 0.9in, stroke: 3pt + accent)
    v(0.9em)
  }
  if get("title") != "" {
    block(below: 0.9em, text(font: sans, size: 34pt, weight: "bold", fill: title-color, tracking: -0.02em, par(
      leading: 0.3em,
      get("title"),
    )))
  }
  if get("subtitle") != "" {
    block(below: 1.1em, text(size: 15pt, style: "italic", fill: rgb("#4A4642"), par(leading: 0.55em, get("subtitle"))))
  }
  if byline.len() > 0 {
    block(below: 2em, text(font: sans, size: 8.5pt, fill: quiet, tracking: 0.1em, upper(byline.join("   ·   "))))
  }
  if get("abstract") != "" {
    block(below: 2em, text(size: 12.5pt, fill: rgb("#3A3633"), par(leading: 0.7em, get("abstract"))))
  }
  body
}
