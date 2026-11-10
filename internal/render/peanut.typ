// Peanut Writer's document renderer: turns the document model (doc.json,
// written from internal/doc) into Typst content. Templates style the result
// with show and set rules; this file only says what each element is.

// LaTeX math is read by mitex (bundled, so nothing is downloaded).
#import "mitex/lib.typ": mimath

#let _align(a) = if a == "left" { left } else if a == "center" { center } else if a == "right" { right } else { auto }

// The live preview (not PDF export) compiles with `--input peanut-preview=1`.
#let _preview = sys.inputs.at("peanut-preview", default: "") == "1"

// `--input peanut-math=source` shows all math as its LaTeX source: the
// preview's fallback when mitex can't read some of it.
#let _math_source = sys.inputs.at("peanut-math", default: "") == "source"

// _math is LaTeX math (display: on its own line), or its source in red when
// it can't be read.
#let _math(n, display: false, ..args) = {
  if n.at("error", default: "") != "" or _math_source {
    let src = text(fill: rgb("#b42318"), raw(n.text))
    if display { block(width: 100%, align(center, src)) } else { src }
  } else {
    mimath(n.text, block: display, ..args)
  }
}

// Whether content is being laid out inside the outline.
#let _in_outline = state("peanut-in-outline", false)

#let _missing(what) = block(
  width: 60%,
  height: 3cm,
  stroke: (paint: luma(170), dash: "dashed", thickness: 0.8pt),
  radius: 4pt,
  inset: 8pt,
  align(center + horizon, text(fill: luma(120), size: 0.85em)[Missing image \ #raw(what)]),
)

// node renders one block or inline (one function, since Typst functions
// can't call each other before they're defined).
#let node(n) = {
  let all(xs) = { for x in xs { node(x) } }
  let blocks(xs) = xs.map(node).join(parbreak())
  let t = n.type

  // Inlines.
  if t == "text" { n.text }
  else if t == "strong" { strong(all(n.children)) }
  else if t == "emph" { emph(all(n.children)) }
  else if t == "strike" { strike(all(n.children)) }
  else if t == "code" { raw(n.text) }
  else if t == "link" { link(n.url, all(n.children)) }
  else if t == "linebreak" { linebreak() }
  else if t == "math" { _math(n, display: n.at("display", default: false)) }
  else if t == "image" {
    if n.at("src", default: "") != "" { box(image(n.src, height: 1.2em), baseline: 20%) } else { [\[image\]] }
  }
  else if t == "ref" {
    if n.at("kind", default: "") == "equation" and _math_source { text(weight: "bold")[??] }
    else if n.at("kind", default: "") != "" { ref(label(n.label)) } else { text(weight: "bold")[??] }
  }
  else if t == "footnote" {
    // A note whose text isn't typed yet ("[^1]: ") has no blocks.
    let body = blocks(n.at("blocks", default: ()))
    // A heading's note stays out of the outline's copy of the heading (a
    // show rule can't hide it: it would still be numbered and listed).
    context if not _in_outline.get() { footnote(if body == none [] else { body }) }
  }

  // Blocks. Paragraphs are separated with parbreak() by whoever lays them out.
  else if t == "paragraph" { all(n.at("inlines", default: ())) }
  else if t == "heading" {
    // In the preview each heading carries an invisible link to its source
    // line, which the outline pane finds in the SVG to scroll to it.
    let line = n.at("line", default: 0)
    let mark = if _preview and line > 0 { link("peanut:" + str(line), box(width: 0.01pt, height: 0.01pt)) }
    heading(level: n.level, [#mark#all(n.at("inlines", default: ()))])
  }
  else if t == "list" {
    // Tight items: a nested list follows its text without a paragraph break.
    let tight = n.at("tight", default: false)
    let items = n.items.map(xs => if tight { xs.map(node).join() } else { blocks(xs) })
    if n.at("ordered", default: false) {
      enum(start: n.at("start", default: 1), tight: n.at("tight", default: false), ..items)
    } else {
      list(tight: n.at("tight", default: false), ..items)
    }
  }
  else if t == "quote" { quote(block: true, blocks(n.children)) }
  else if t == "codeblock" { raw(n.text, block: true, lang: n.at("lang", default: none)) }
  else if t == "rule" { block(above: 1.2em, below: 1.2em, line(length: 100%, stroke: 0.6pt + luma(160))) }
  else if t == "pagebreak" { pagebreak(weak: true) }
  else if t == "toc" { outline() }
  else if t == "equation" {
    // Only a labelled equation is numbered.
    let numbered = n.at("number", default: 0) > 0 and not _math_source
    let eq = _math(n, display: true, numbering: if numbered { "(1)" } else { none })
    if numbered [#eq#label(n.label)] else { eq }
  }
  else if t == "figure" {
    let w = n.at("width", default: 0)
    let pics = n.at("pictures", default: ())
    let body = if pics.len() > 0 {
      // A grid: the pictures fill equal columns, together w wide (or the
      // full width).
      block(width: if w > 0 { w * 1% } else { 100% }, grid(
        columns: (1fr,) * n.at("columns", default: pics.len()),
        gutter: 0.6em,
        align: center + horizon,
        ..pics.map(p => if p.at("src", default: "") != "" {
          image(p.src, width: 100%)
        } else { _missing(p.at("missing", default: "")) }),
      ))
    } else if n.at("src", default: "") != "" {
      image(n.src, width: if w > 0 { w * 1% } else { auto })
    } else { _missing(n.at("missing", default: "")) }
    let cap = n.at("caption", default: ())
    let f = figure(body, kind: image, caption: if cap.len() > 0 { all(cap) } else { none })
    let l = n.at("label", default: "")
    let f = if l != "" [#f#label(l)] else { f }
    // Left and right figures take their caption with them, as in Word.
    let pos = n.at("position", default: "")
    if pos == "" { f } else {
      show figure: set align(_align(pos))
      f
    }
  }
  else if t == "table" {
    let header = n.at("header", default: ())
    let rows = n.at("rows", default: ())
    let cols = calc.max(header.len(), 1)
    let tbl = table(
      columns: cols,
      align: (x, y) => _align(n.align.at(x, default: "")),
      table.header(..header.map(c => strong(all(c)))),
      ..rows.map(r => r.map(c => all(c))).flatten(),
    )
    let cap = n.at("caption", default: ())
    let f = figure(tbl, kind: table, caption: if cap.len() > 0 { all(cap) } else { none })
    let l = n.at("label", default: "")
    if l != "" [#f#label(l)] else { f }
  }
}

// render renders the whole document body.
#let render(doc) = {
  // Footnote numbers are drawn smaller and raised rather than with the
  // font's superscript glyphs: many fonts have ¹ ² ³ but not 4 and up.
  set super(typographic: false)
  // Braille (the editor's ⠿ grip, written in prose) is in few text fonts, and
  // Typst's own fallback can pick macOS's LastResort, which draws a box.
  // Name fonts that have it: macOS, Linux, Windows.
  show regex("[\u{2800}-\u{28FF}]+"): set text(font: ("Apple Braille", "Apple Symbols", "DejaVu Sans", "Segoe UI Symbol"))
  // Outline entries repeat heading text: leave the preview's marks and
  // footnotes out.
  show outline: it => {
    show link: l => if type(l.dest) == str and l.dest.starts-with("peanut:") { none } else { l }
    _in_outline.update(true)
    it
    _in_outline.update(false)
  }
  doc.blocks.map(node).join(parbreak())
}
