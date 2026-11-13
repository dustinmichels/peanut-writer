// Peanut Writer's document renderer: turns the document model (doc.json,
// written from internal/doc) into Typst content. Templates style the result
// with show and set rules; this file only says what each element is.

// LaTeX math is read by mitex (bundled, so nothing is downloaded).
#import "mitex/lib.typ": mimath

#let _align(a) = if a == "left" { left } else if a == "center" { center } else if a == "right" { right } else { auto }

// The live preview (not PDF export) compiles with `--input peanut-preview=1`.
#let _preview = sys.inputs.at("peanut-preview", default: "") == "1"

// _math is LaTeX math (display: on its own line), or its source in red when
// it can't be read: displayed, still an equation, so its number and the
// references to it stay. Empty math has no text (doc.json omits empty
// fields).
#let _math(n, display: false, ..args) = {
  let tex = n.at("text", default: "")
  if n.at("error", default: "") != "" {
    let src = text(fill: rgb("#b42318"), raw(tex))
    if display { math.equation(block: true, src, ..args) } else { src }
  } else {
    mimath(tex, block: display, ..args)
  }
}

// In the preview, blocks carry an invisible `peanut:<line>` link to their
// source line, which the app finds in the SVG: to keep the editor and
// preview scrolled together, and to show where a click on a page is in the
// source. _mark puts it where a block (or a heading's text) starts, without
// moving anything; lists and quotes have their blocks marked instead.
#let _mark(line) = if _preview and line > 0 { place(link("peanut:" + str(line), box(width: 0.01pt, height: 0.01pt))) }
#let _placed(n) = if n.type in ("paragraph", "codeblock", "equation", "figure", "table") { _mark(n.at("line", default: 0)) }
// _unmarked drops the marks from content shown twice (the outline's copy of
// headings) or out of source order (footnotes, at the page's foot). The
// place a block's mark sits in goes too: left empty, it would split a
// footnote's number from its text.
#let _peanut-link(l) = type(l.dest) == str and l.dest.starts-with("peanut:")
#let _unmarked(body) = {
  show place: p => if p.body.func() == link and _peanut-link(p.body) { none } else { p }
  show link: l => if _peanut-link(l) { none } else { l }
  body
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

// overlong lets a word too wide for its line (a long URL, a hash, a key held
// down) break anywhere, rather than run off the page: Typst breaks lines only
// where the script allows. A word here is a run of letters, digits and the
// marks lines don't break around (not brackets, slashes, dashes, ? or !),
// in scripts that don't break between letters (as CJK and Thai do). One
// that fits is left as it is. The broken word's lines are filled one by one:
// Typst's optimized (justified) line breaking can take seconds over a word's
// thousands of break points. Where Typst hyphenates (justified text), a word
// of letters under 40 long is left to it: one in a box can't be hyphenated.
#let overlong(body) = {
  show regex("[\p{L}\p{M}\p{N}\p{Pc}.,:;=&#@*~^<>+$%\\\\'\"--[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}\p{Thai}\p{Lao}\p{Khmer}\p{Myanmar}]]{20,}"): it => context {
    let hyphenates = if text.hyphenate == auto { par.justify } else { text.hyphenate }
    let word = it.text.match(regex("^[^\p{L}\p{M}\p{N}]*[\p{L}\p{M}']+[^\p{L}\p{M}\p{N}]*$")) != none
    if hyphenates and word and it.text.clusters().len() < 40 { it } else {
      box(layout(size => {
        if measure(it).width > size.width {
          set par(linebreaks: "simple")
          it.text.clusters().join("\u{200B}")
        } else { it }
      }))
    }
  }
  body
}

// node renders one block or inline (one function, since Typst functions
// can't call each other before they're defined). In a note (note: true), as
// in Word and the web page, a heading is bold text, kept out of the outline
// and its numbering, and a note within the note is its text in brackets,
// not a note numbered among the others.
#let node(n, note: false) = {
  // doc.json omits empty fields: an empty code block's text, a link's
  // children (`[](url)`) or URL (`[a]()`), an empty quote's blocks.
  let all(xs) = { for x in xs { node(x, note: note) } }
  let kids = n.at("children", default: ())
  let marked(x) = { _placed(x); node(x, note: note) }
  // Quotes, list items and notes are containers, where a page break (ours,
  // or a template's before chapter headings) is an error that stops the
  // whole document: there they're left out.
  let contained(c) = { show pagebreak: none; c }
  let blocks(xs) = contained(xs.map(marked).join(parbreak()))
  let t = n.type

  // Inlines.
  if t == "text" { n.at("text", default: "") }
  else if t == "strong" { strong(all(kids)) }
  else if t == "emph" { emph(all(kids)) }
  else if t == "strike" { strike(all(kids)) }
  else if t == "highlight" { highlight(all(kids)) }
  else if t == "code" { raw(n.at("text", default: "")) }
  else if t == "link" {
    // Typst can't link to an empty URL.
    let url = n.at("url", default: "")
    if url == "" { all(kids) } else { link(url, all(kids)) }
  }
  else if t == "linebreak" { linebreak() }
  else if t == "math" { _math(n, display: n.at("display", default: false)) }
  else if t == "image" {
    if n.at("src", default: "") != "" { box(image(n.src, height: 1.2em), baseline: 20%) } else { [\[image\]] }
  }
  else if t == "ref" {
    if n.at("kind", default: "") != "" { ref(label(n.label)) } else { text(weight: "bold")[??] }
  }
  else if t == "cite" {
    // Citations side by side are one group, "(Lee, 2019; Smith, 2020)". A
    // source the references lack is its key, as LaTeX shows one.
    for c in n.cites {
      if c.at("missing", default: false) { text(weight: "bold", "[" + c.key + "?]") }
      else if c.at("locator", default: "") != "" { cite(label(c.key), supplement: c.locator) }
      else { cite(label(c.key)) }
    }
  }
  else if t == "footnote" {
    // A note whose text isn't typed yet ("[^1]: ") has no blocks.
    let bs = n.at("blocks", default: ())
    if note { [ (#bs.map(x => node(x, note: true)).join([ ]))] } else {
      let body = bs.map(x => { _placed(x); node(x, note: true) }).join(parbreak())
      // A heading's note stays out of the outline's copy of the heading (a
      // show rule can't hide it: it would still be numbered and listed).
      context if not _in_outline.get() { footnote(_unmarked(contained(if body == none [] else { body }))) }
    }
  }

  // Blocks. Paragraphs are separated with parbreak() by whoever lays them out.
  else if t == "paragraph" { all(n.at("inlines", default: ())) }
  else if t == "heading" {
    if note { strong(all(n.at("inlines", default: ()))) } else {
      // The heading's mark is in its text, where the outline pane looks for
      // it; boxed, as a bare place would split the number from the text.
      let mark = _mark(n.at("line", default: 0))
      heading(level: n.level, [#if mark != none { box(mark) }#all(n.at("inlines", default: ()))])
    }
  }
  else if t == "list" {
    // Tight items: a nested list follows its text without a paragraph break.
    let tight = n.at("tight", default: false)
    let items = n.items.map(xs => if tight { contained(xs.map(marked).join()) } else { blocks(xs) })
    if n.at("ordered", default: false) {
      enum(start: n.at("start", default: 1), tight: n.at("tight", default: false), ..items)
    } else {
      list(tight: n.at("tight", default: false), ..items)
    }
  }
  else if t == "quote" { quote(block: true, blocks(kids)) }
  else if t == "codeblock" { raw(n.at("text", default: ""), block: true, lang: n.at("lang", default: none)) }
  else if t == "rule" { block(above: 1.2em, below: 1.2em, line(length: 100%, stroke: 0.6pt + luma(160))) }
  else if t == "pagebreak" { pagebreak(weak: true) }
  else if t == "toc" { outline(depth: 3) } // levels 1–3, as in Word and the web page
  else if t == "bibliography" {
    // The style is set only when a citation is of a source refs.bib has.
    let style = n.at("text", default: "")
    if style != "" { bibliography("/refs.bib", title: none, style: style) }
  }
  else if t == "equation" {
    // Only a labelled equation is numbered (doc.json leaves the label out
    // when an earlier block has it).
    let numbered = n.at("number", default: 0) > 0
    let eq = _math(n, display: true, numbering: if numbered { "(1)" } else { none })
    let l = n.at("label", default: "")
    if numbered and l != "" [#eq#label(l)] else { eq }
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
  // font's superscript glyphs: many fonts have ¹ ² ³ but not 4 and up. The
  // size and rise are set, not read from the font (Typst's default): some
  // fonts' metrics (Optima, Helvetica Neue) make them specks.
  set super(typographic: false, size: 0.6em, baseline: -0.5em)
  // Braille (the editor's ⠿ grip, written in prose) is in few text fonts, and
  // Typst's own fallback can pick macOS's LastResort, which draws a box.
  // Name fonts that have it: macOS, Linux, Windows.
  show regex("[\u{2800}-\u{28FF}]+"): set text(font: ("Apple Braille", "Apple Symbols", "DejaVu Sans", "Segoe UI Symbol"))
  // A display equation too wide for its line (Typst doesn't break one, and
  // its number would be drawn over it) is drawn smaller, to fit.
  show math.equation.where(block: true): it => layout(size => {
    let w = measure(it).width
    if w <= size.width { it } else {
      set text(size: text.size * (size.width / w))
      it
    }
  })
  // Outline entries repeat heading text: leave the preview's marks and
  // footnotes out.
  show outline: it => {
    show: _unmarked
    _in_outline.update(true)
    it
    _in_outline.update(false)
  }
  doc.blocks.map(b => { _placed(b); node(b) }).join(parbreak())
}
