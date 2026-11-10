// Peanut Writer's document renderer: turns the document model (doc.json,
// written from internal/doc) into Typst content. Templates style the result
// with show and set rules; this file only says what each element is.

#let _align(a) = if a == "left" { left } else if a == "center" { center } else if a == "right" { right } else { auto }

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
  else if t == "image" {
    if n.at("src", default: "") != "" { box(image(n.src, height: 1.2em), baseline: 20%) } else { [\[image\]] }
  }
  else if t == "ref" {
    if n.at("kind", default: "") != "" { ref(label(n.label)) } else { text(weight: "bold")[??] }
  }
  else if t == "footnote" { footnote(blocks(n.blocks)) }

  // Blocks. Paragraphs are separated with parbreak() by whoever lays them out.
  else if t == "paragraph" { all(n.inlines) }
  else if t == "heading" { heading(level: n.level, all(n.inlines)) }
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
  else if t == "figure" {
    let w = n.at("width", default: 0)
    let body = if n.at("src", default: "") != "" {
      image(n.src, width: if w > 0 { w * 1% } else { auto })
    } else { _missing(n.at("missing", default: "")) }
    let cap = n.at("caption", default: ())
    let f = figure(body, kind: image, caption: if cap.len() > 0 { all(cap) } else { none })
    let l = n.at("label", default: "")
    if l != "" [#f#label(l)] else { f }
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
#let render(doc) = doc.blocks.map(node).join(parbreak())
