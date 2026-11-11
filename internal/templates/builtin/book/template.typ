// Book: long writing in chapters. Palatino, justified with indented
// paragraphs, a title page, each top-level heading a chapter opening a new
// page under a "Chapter n" label, a small-caps running head and centered
// folios. A bronze accent marks labels, rules and links.

#import "style.typ": custom-color, custom-font, custom-size

#let font = custom-font("bodyFont", ("Palatino", "Palatino Linotype", "Book Antiqua", "Libertinus Serif"))
#let heading-font = custom-font("headingFont", font)
#let mono-font = custom-font("monoFont", ("Menlo", "DejaVu Sans Mono"))
#let ink = custom-color("textColor", rgb("#1A1816"))
#let accent = custom-color("accentColor", rgb("#8A6A3B"))
#let heading-color = custom-color("headingColor", ink)
#let title-color = custom-color("titleColor", ink)
#let caption-color = custom-color("captionColor", rgb("#4F4A44"))
#let header-fill = custom-color("tableHeaderFill", none)
#let muted = luma(115)

#let template(meta, body) = {
  let get(k) = meta.at(k, default: "")
  let has-title-page = ("title", "subtitle", "author", "topic", "date", "abstract").any(k => get(k) != "")
  // Chapters: the document's top-level headings, not the outline's title.
  let chapters = heading.where(level: 1, outlined: true)
  let chapter = counter("book-chapter")
  // Pages that open a chapter, and the title page, go without running head.
  let bare = () => {
    let p = here().page()
    (has-title-page and p == 1) or query(chapters).any(h => h.location().page() == p)
  }
  set document(
    title: if get("title") != "" { get("title") } else { none },
    author: if get("author") != "" { get("author") } else { () },
  )
  set page(
    paper: "us-letter",
    margin: (x: 1.2in, top: 1.15in, bottom: 1.1in),
    header: context if not bare() {
      let running = if get("header") != "" { get("header") } else { get("title") }
      align(center, text(size: 8.5pt, fill: muted, tracking: 0.14em, upper(running)))
    },
    footer: context if not (has-title-page and here().page() == 1) {
      align(center, text(size: 9pt, fill: muted, counter(page).display()))
    },
  )
  set text(font: font, size: custom-size("fontSize", 11pt), fill: ink, lang: "en", number-type: "old-style")
  set par(justify: true, leading: 0.72em, spacing: 0.72em, first-line-indent: 1.4em)

  // Every chapter is numbered; sections aren't.
  show heading: set text(font: heading-font, fill: heading-color, number-type: "lining")
  show heading: set par(justify: false)
  show chapters: it => {
    pagebreak(weak: true)
    chapter.step()
    v(1.1in)
    block(below: 1.1em, text(size: 8.5pt, fill: accent, tracking: 0.24em, upper[Chapter #context chapter.display("1")]))
    block(below: 0.9em, text(size: 24pt, weight: "regular", it.body))
    block(below: 2.6em, line(length: 0.6in, stroke: 0.6pt + accent))
  }
  show heading.where(level: 1, outlined: false): set text(size: 20pt, weight: "regular")
  show heading.where(level: 1, outlined: false): set block(above: 0.4in, below: 1.6em)
  show heading.where(level: 2): set text(size: 13pt, weight: "regular", style: "italic")
  show heading.where(level: 2): set block(above: 2em, below: 0.9em)
  show heading.where(level: 3): it => block(above: 1.6em, below: 0.7em, sticky: true, text(
    size: 10pt,
    tracking: 0.08em,
    smallcaps(it.body),
  ))

  set figure.caption(separator: [. ])
  show figure.caption: it => text(size: 9.5pt, fill: caption-color)[
    #smallcaps[#it.supplement #context it.counter.display(it.numbering)]#it.separator#emph(it.body)
  ]
  show figure.where(kind: table): set figure.caption(position: top)
  show figure: set block(above: 1.8em, below: 1.8em)
  set table(
    stroke: (x, y) => if y == 0 { (bottom: 0.5pt + accent) } else { none },
    fill: (x, y) => if y == 0 { header-fill },
    inset: (x: 7pt, y: 4pt),
  )
  show table: t => box(stroke: (top: 0.8pt + ink, bottom: 0.8pt + ink), t)
  show table: set par(justify: false)

  show link: set text(fill: accent)
  show raw: set text(font: mono-font, size: 0.85em)
  show raw.where(block: true): block.with(inset: (left: 1.4em, y: 4pt), width: 100%)
  show quote.where(block: true): it => pad(x: 1.6em, y: 0.3em, text(size: 0.95em, it.body))
  set list(indent: 0.6em)
  set enum(indent: 0.6em)
  set footnote.entry(separator: line(length: 25%, stroke: 0.4pt + muted))
  show footnote.entry: set text(size: 8.5pt)
  set outline(title: [Contents], indent: auto)
  show outline.entry.where(level: 1): set block(above: 1em)

  // Title page.
  if has-title-page {
    set par(justify: false, first-line-indent: 0pt)
    align(center, {
      v(2.2in)
      if get("title") != "" { block(below: 1.2em, text(font: heading-font, size: 32pt, fill: title-color, par(leading: 0.4em, get("title")))) }
      if get("subtitle") != "" { block(below: 1.2em, text(font: heading-font, size: 14pt, style: "italic", fill: muted, get("subtitle"))) }
      block(above: 1.6em, below: 1.6em, line(length: 0.8in, stroke: 0.6pt + accent))
      if get("author") != "" { block(below: 0.8em, text(size: 13pt, tracking: 0.12em, upper(get("author")))) }
      let rest = (get("topic"), get("date")).filter(s => s != "")
      if rest.len() > 0 { text(size: 10pt, fill: muted, rest.join([#h(0.5em)·#h(0.5em)])) }
      if get("abstract") != "" {
        v(1fr)
        block(width: 75%, text(size: 10pt, style: "italic", par(justify: true, get("abstract"))))
        v(0.4in)
      }
    })
    pagebreak()
  }
  body
}
