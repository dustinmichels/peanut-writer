// Basic: plain and compact. Times New Roman 11pt, single spaced, black
// throughout, on 1-inch margins. Headings stand out by weight, not size:
// bold at (nearly) body size, the third level bold italic. A bold title,
// a one-line byline and a centered page number.

#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("Times New Roman", "Times", "Libertinus Serif"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Courier New", "Courier", "DejaVu Sans Mono"))
#let size = custom-size("fontSize", 11pt)
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
    margin: 1in,
    header: if get("header") != "" { align(right, text(size: 9pt, get("header"))) },
    footer: context align(center, text(size: 9pt, counter(page).display())),
  )
  set text(font: font, size: size, fill: ink, lang: "en")
  set par(leading: 0.55em, spacing: 0.75em)

  show heading: set text(font: heading-font, size: size, fill: heading-color, weight: "bold")
  show heading: set block(above: 1.2em, below: 0.6em)
  show heading.where(level: 1): set text(size: size + 1pt)
  show heading.where(level: 3): set text(style: "italic")
  show heading.where(level: 3): set block(above: 1em, below: 0.5em)

  set figure.caption(separator: [. ])
  show figure.caption: it => text(size: size - 1pt, fill: caption-color)[
    #text(weight: "bold")[#it.supplement #context it.counter.display(it.numbering)]#it.separator#it.body
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.1em, below: 1.1em)
  set table(
    stroke: (x, y) => if y == 0 { (top: 0.6pt + rule, bottom: 0.6pt + rule) } else { none },
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 6pt, y: 4pt),
  )
  show table.cell.where(y: 0): set text(weight: "bold")
  show table: t => box(stroke: (bottom: 0.6pt + rule), t)

  show raw: set text(font: mono-font, size: 0.9em)
  show raw.where(block: true): block.with(inset: (left: 1em, y: 2pt), width: 100%)
  show quote.where(block: true): it => pad(left: 0.4in, it.body)
  set list(indent: 0.4em)
  set enum(indent: 0.4em)
  set outline(title: [Contents], indent: auto)

  // Title block: left aligned, bold rather than big.
  let byline = (get("author"), get("topic"), get("date")).filter(s => s != "")
  if get("title") != "" {
    block(below: 0.4em, text(font: heading-font, size: size + 3pt, weight: "bold", fill: title-color, get("title")))
  }
  if get("subtitle") != "" {
    block(below: 0.4em, text(font: heading-font, style: "italic", get("subtitle")))
  }
  if byline.len() > 0 {
    block(below: 1.2em, byline.join([ #sym.dot.c ]))
  } else if get("title") != "" or get("subtitle") != "" { v(0.8em) }
  if get("abstract") != "" {
    block(inset: (x: 0.4in), below: 1.2em)[
      #set text(size: size - 1pt)
      #text(weight: "bold")[Abstract.] #get("abstract")
    ]
  }
  body
}
