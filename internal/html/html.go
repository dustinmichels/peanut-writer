// Package html writes a document as a single, self-contained web page:
// plain semantic HTML, styled from a template's DocxStyle, with pictures
// embedded as data URLs and math as pictures drawn by Options.Equations.
// Headings get ids, and the table of contents, cross-references and
// footnotes link to what they point at.
package html

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/gif" // picture formats checked before they're embedded
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"mime"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

// Options are what the writer needs from outside.
type Options struct {
	// Title is the page's title when the front matter has none.
	Title string
	// Equations draws each formula with sizePt text as SVG, math in a line
	// with its baseline at the picture's middle; the pictures are in the
	// formulas' order. Without it, or for a nil picture, math shows as its
	// LaTeX source.
	Equations func(ms []doc.Math, sizePt float64) [][]byte
}

// Write renders d as an HTML page in style st.
func Write(d *doc.Document, st templates.DocxStyle, opt Options) []byte {
	w := &writer{
		st:       st,
		opt:      opt,
		headings: map[*doc.Block]heading{},
		placed:   map[string]bool{},
		images:   map[string]string{},
		math:     map[string]*mathPic{},
	}
	w.collectHeadings(d.Blocks)
	w.drawMath(d.Blocks)
	var body strings.Builder
	w.out = &body
	m := d.Meta.Shown()
	w.titleBlock(m)
	w.blocks(d.Blocks)
	w.footnotes()

	title := strings.TrimSpace(d.Meta.Title)
	if title == "" {
		title = opt.Title
	}
	var page strings.Builder
	page.WriteString("<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n")
	page.WriteString("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
	fmt.Fprintf(&page, "<title>%s</title>\n", esc(title))
	if a := strings.TrimSpace(m.Author); a != "" {
		fmt.Fprintf(&page, "<meta name=\"author\" content=\"%s\">\n", esc(a))
	}
	page.WriteString("<meta name=\"generator\" content=\"Peanut Writer\">\n<style>\n")
	page.WriteString(w.css())
	page.WriteString("</style>\n</head>\n<body>\n<article>\n")
	page.WriteString(body.String())
	page.WriteString("</article>\n</body>\n</html>\n")
	return []byte(page.String())
}

type writer struct {
	st  templates.DocxStyle
	opt Options
	out *strings.Builder

	headings map[*doc.Block]heading
	toc      []tocEntry
	// placed holds the ids given out: headings', then each label's on its
	// first block (a label used twice marks only the first, as references
	// resolve).
	placed map[string]bool
	notes  []string
	inNote bool
	inLink bool                // writing a link's text, where no other link can go
	inTOC  bool                // writing the table of contents, which leaves notes out
	images map[string]string   // path → data URL, "" when unreadable
	math   map[string]*mathPic // nil when it can't be drawn
}

type heading struct{ id, number string }

type tocEntry struct {
	level      int
	id, number string
	heading    *doc.Block
}

func (w *writer) printf(format string, a ...any) { fmt.Fprintf(w.out, format, a...) }

// collectHeadings gives each heading outside footnotes its id
// (doc.HeadingIDs), and a number when the style numbers headings (levels
// 1–3: 1, 1.1, 1.1.1), and lists levels 1–3 for the table of contents, before
// any of them is written: the table of contents can come first.
func (w *writer) collectHeadings(bs []doc.Block) {
	var counts [3]int
	ids := doc.HeadingIDs(bs)
	var walk func([]doc.Block)
	walk = func(bs []doc.Block) {
		for i := range bs {
			b := &bs[i]
			switch b.Type {
			case doc.BlockHeading:
				text := strings.TrimSpace(doc.PlainText(b.Inlines))
				level := min(max(b.Level, 1), 6)
				h := heading{id: ids[b]}
				if w.st.NumberedHeadings && level <= 3 {
					counts[level-1]++
					for j := level; j < 3; j++ {
						counts[j] = 0
					}
					parts := make([]string, level)
					for j := range level {
						parts[j] = strconv.Itoa(counts[j])
					}
					h.number = strings.Join(parts, ".")
				}
				w.headings[b] = h
				w.placed[h.id] = true
				if level <= 3 && text != "" {
					w.toc = append(w.toc, tocEntry{level, h.id, h.number, b})
				}
			case doc.BlockList:
				for j := range b.Items {
					walk(b.Items[j])
				}
			case doc.BlockQuote:
				walk(b.Children)
			}
		}
	}
	walk(bs)
}

// idAttr is ` id="label"` for the first block with label, else "". A label
// that is a heading's id or a footnote's (fn:1, fnref:1) gets none: an id
// names one element, and those can't be referred to anyway.
func (w *writer) idAttr(label string) string {
	if label == "" || w.placed[label] || strings.HasPrefix(label, "fn:") || strings.HasPrefix(label, "fnref:") {
		return ""
	}
	w.placed[label] = true
	return ` id="` + esc(label) + `"`
}

// titleBlock writes the running header, then the front matter's title,
// subtitle, author, topic, date and abstract, each only when given.
func (w *writer) titleBlock(m doc.Meta) {
	if h := strings.TrimSpace(m.Header); h != "" {
		w.printf("<p class=\"running\">%s</p>\n", esc(h))
	}
	type line struct{ class, text string }
	var names []line
	for _, l := range []line{{"subtitle", m.Subtitle}, {"author", m.Author}, {"topic", m.Topic}, {"date", m.Date}} {
		if strings.TrimSpace(l.text) != "" {
			names = append(names, l)
		}
	}
	title := strings.TrimSpace(m.Title)
	var abstract []string
	for _, p := range strings.Split(m.Abstract, "\n") {
		if p = strings.TrimSpace(p); p != "" {
			abstract = append(abstract, p)
		}
	}
	if title == "" && len(names) == 0 && len(abstract) == 0 {
		return
	}
	w.out.WriteString("<header class=\"title\">\n")
	if title != "" || len(names) > 0 {
		w.out.WriteString("<div class=\"names\">\n")
		if title != "" {
			w.printf("<h1>%s</h1>\n", esc(title))
		}
		for _, l := range names {
			w.printf("<p class=\"%s\">%s</p>\n", l.class, esc(strings.TrimSpace(l.text)))
		}
		w.out.WriteString("</div>\n")
	}
	if len(abstract) > 0 {
		w.out.WriteString("<section class=\"abstract\">\n<p class=\"abstract-title\">Abstract</p>\n")
		for _, p := range abstract {
			w.printf("<p>%s</p>\n", esc(p))
		}
		w.out.WriteString("</section>\n")
	}
	w.out.WriteString("</header>\n")
}

func (w *writer) blocks(bs []doc.Block) {
	for i := range bs {
		w.block(&bs[i])
	}
}

func (w *writer) block(b *doc.Block) {
	switch b.Type {
	case doc.BlockParagraph:
		w.printf("<p>%s</p>\n", w.inlines(b.Inlines))
	case doc.BlockHeading:
		if w.inNote {
			// A heading in a footnote stays out of the outline.
			w.printf("<p><strong>%s</strong></p>\n", w.inlines(b.Inlines))
			return
		}
		level := min(max(b.Level, 1), 6)
		h := w.headings[b]
		num := ""
		if h.number != "" {
			num = `<span class="num">` + h.number + `</span> `
		}
		w.printf("<h%d id=\"%s\">%s%s</h%d>\n", level, h.id, num, w.inlines(b.Inlines), level)
	case doc.BlockList:
		w.list(b)
	case doc.BlockQuote:
		w.out.WriteString("<blockquote>\n")
		w.blocks(b.Children)
		w.out.WriteString("</blockquote>\n")
	case doc.BlockCode:
		class := ""
		if b.Lang != "" {
			class = ` class="language-` + esc(b.Lang) + `"`
		}
		w.printf("<pre><code%s>%s</code></pre>\n", class, esc(strings.TrimSuffix(b.Text, "\n")))
	case doc.BlockFigure:
		w.figure(b)
	case doc.BlockTable:
		w.table(b)
	case doc.BlockRule:
		w.out.WriteString("<hr>\n")
	case doc.BlockPageBreak:
		w.out.WriteString("<div class=\"pagebreak\"></div>\n")
	case doc.BlockTOC:
		w.tocBlock()
	case doc.BlockEquation:
		w.equation(b)
	}
}

// list writes a list; a tight list's paragraphs are bare text in their items.
func (w *writer) list(b *doc.Block) {
	tag := "ul"
	if b.Ordered {
		tag = "ol"
	}
	if b.Ordered && b.Start != 1 {
		w.printf("<ol start=\"%d\">\n", b.Start)
	} else {
		w.printf("<%s>\n", tag)
	}
	for _, item := range b.Items {
		w.out.WriteString("<li>")
		for i := range item {
			if c := &item[i]; b.Tight && c.Type == doc.BlockParagraph {
				w.out.WriteString(w.inlines(c.Inlines))
			} else {
				w.out.WriteString("\n")
				w.block(c)
			}
		}
		w.out.WriteString("</li>\n")
	}
	w.printf("</%s>\n", tag)
}

// figure writes the picture (or a grid's pictures), centered unless placed
// left or right, then its caption.
func (w *writer) figure(b *doc.Block) {
	class := "figure"
	if b.Position == "left" || b.Position == "right" {
		class += " " + b.Position
	}
	w.printf("<figure class=\"%s\"%s>\n", class, w.idAttr(b.Label))
	width := ""
	if b.Width > 0 {
		width = "width:" + num(b.Width) + "%"
	}
	caption := doc.PlainText(b.Caption)
	if len(b.Pictures) > 0 {
		style := fmt.Sprintf("grid-template-columns:repeat(%d,1fr)", max(b.Columns, 1))
		if width != "" {
			style += ";" + width
		}
		w.printf("<div class=\"grid\" style=\"%s\">\n", style)
		for _, p := range b.Pictures {
			alt := doc.PlainText(p.Alt)
			if alt == "" {
				alt = caption
			}
			w.printf("%s\n", w.picture(p.Src, p.Missing, alt, ""))
		}
		w.out.WriteString("</div>\n")
	} else {
		w.printf("%s\n", w.picture(b.Src, b.Missing, caption, width))
	}
	if len(b.Caption) > 0 || b.Label != "" {
		w.printf("<figcaption>%s</figcaption>\n", w.caption("Figure", b))
	}
	w.out.WriteString("</figure>\n")
}

// picture is an image as an img element, style its inline style; a
// placeholder when it's missing or can't be read.
func (w *writer) picture(src, missing, alt, style string) string {
	if src == "" {
		return `<em class="missing">[missing image: ` + esc(missing) + `]</em>`
	}
	u := w.image(src)
	if u == "" {
		return `<em class="missing">[image: ` + esc(filepath.Base(src)) + `]</em>`
	}
	if style != "" {
		style = ` style="` + style + `"`
	}
	return `<img src="` + u + `" alt="` + esc(alt) + `"` + style + `>`
}

// image is the file at path as a data URL, "" when it can't be read or isn't
// a picture a browser draws (see pictureType).
func (w *writer) image(path string) string {
	if u, ok := w.images[path]; ok {
		return u
	}
	u := ""
	if b, err := os.ReadFile(path); err == nil {
		if typ := pictureType(path, b); typ != "" {
			u = dataURL(typ, b)
		}
	}
	w.images[path] = u
	return u
}

// pictureType is the MIME type data, the file at path, is shown by; "" when
// it's surely broken, as the PDF and Word file find it: empty, a .png, .jpg
// or .gif that doesn't decode, or a .svg that isn't an SVG (see isSVG).
// Formats Go can't read (WebP, …) are taken on trust.
func pictureType(path string, data []byte) string {
	if _, format, err := image.DecodeConfig(bytes.NewReader(data)); err == nil {
		return "image/" + format // as Word shows it, whatever its name says
	}
	typ := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	switch {
	case len(data) == 0, typ == "image/png", typ == "image/jpeg", typ == "image/gif":
		return ""
	case typ == "image/svg+xml":
		if !isSVG(data) {
			return ""
		}
	case typ == "":
		typ = "application/octet-stream"
	}
	return typ
}

// entityDecl is a general entity declared in a DOCTYPE, as Illustrator
// writes them (`<!ENTITY ns_svg "http://…">`).
var entityDecl = regexp.MustCompile(`<!ENTITY\s+([^\s%]+)\s+(?:"([^"]*)"|'([^']*)')`)

// isSVG reports whether data is XML a browser (and Typst) draws as an SVG:
// well-formed, UTF-8, entities declared, one root, an svg element; no
// attribute twice, no undeclared prefix (`xlink:href` without its xmlns).
func isSVG(data []byte) bool {
	dec := xml.NewDecoder(bytes.NewReader(bytes.TrimPrefix(data, []byte("\uFEFF"))))
	// Another declared encoding is read as UTF-8: plain ASCII passes, as in
	// Typst.
	dec.CharsetReader = func(_ string, r io.Reader) (io.Reader, error) { return r, nil }
	dec.Entity = map[string]string{}
	spaces := map[string]bool{"xmlns": true, "http://www.w3.org/XML/1998/namespace": true}
	depth, roots := 0, 0
	for start := true; ; start = false {
		tok, err := dec.Token()
		if err == io.EOF {
			return roots == 1
		} else if err != nil {
			return false
		}
		switch t := tok.(type) {
		case xml.ProcInst:
			if t.Target == "xml" && !start { // the declaration comes first or not at all
				return false
			}
		case xml.Directive:
			for _, m := range entityDecl.FindAllStringSubmatch(string(t), -1) {
				dec.Entity[m[1]] = m[2] + m[3]
			}
		case xml.StartElement:
			if depth == 0 {
				if roots++; roots > 1 || t.Name.Local != "svg" {
					return false
				}
			}
			depth++
			for i, a := range t.Attr {
				if a.Name.Space == "xmlns" || a.Name.Space == "" && a.Name.Local == "xmlns" {
					spaces[a.Value] = true
				}
				for _, b := range t.Attr[:i] {
					if a.Name == b.Name {
						return false
					}
				}
			}
			// Go leaves an undeclared prefix as the name's space.
			for _, a := range t.Attr {
				if a.Name.Space != "" && !spaces[a.Name.Space] {
					return false
				}
			}
			if t.Name.Space != "" && !spaces[t.Name.Space] {
				return false
			}
		case xml.EndElement:
			depth--
		case xml.CharData:
			if depth == 0 && len(bytes.TrimSpace(t)) > 0 {
				return false
			}
		}
	}
}

func dataURL(typ string, b []byte) string {
	return "data:" + typ + ";base64," + base64.StdEncoding.EncodeToString(b)
}

// caption is "Figure N: caption" (or "Table N: …"); just the caption when
// unnumbered.
func (w *writer) caption(kind string, b *doc.Block) string {
	s := ""
	if b.Number > 0 {
		s = `<span class="label">` + kind + " " + strconv.Itoa(b.Number) + `</span>`
		if len(b.Caption) > 0 {
			s += ": "
		}
	}
	return s + w.inlines(b.Caption)
}

// table writes the caption above, then the table.
func (w *writer) table(b *doc.Block) {
	cols := len(b.Align)
	if cols == 0 {
		return
	}
	w.printf("<figure class=\"table\"%s>\n", w.idAttr(b.Label))
	if len(b.Caption) > 0 || b.Label != "" {
		w.printf("<figcaption>%s</figcaption>\n", w.caption("Table", b))
	}
	row := func(cells [][]doc.Inline, tag string) {
		w.out.WriteString("<tr>")
		for c := range cols {
			var cell []doc.Inline
			if c < len(cells) {
				cell = cells[c]
			}
			align := ""
			switch b.Align[c] {
			case "left", "center", "right":
				align = ` style="text-align:` + b.Align[c] + `"`
			}
			w.printf("<%s%s>%s</%s>", tag, align, w.inlines(cell), tag)
		}
		w.out.WriteString("</tr>\n")
	}
	w.out.WriteString("<table>\n<thead>\n")
	row(b.Header, "th")
	w.out.WriteString("</thead>\n<tbody>\n")
	for _, r := range b.Rows {
		row(r, "td")
	}
	w.out.WriteString("</tbody>\n</table>\n</figure>\n")
}

// tocBlock writes the table of contents: headings of levels 1–3, linked.
func (w *writer) tocBlock() {
	w.out.WriteString("<nav class=\"toc\">\n<p class=\"toc-title\">Contents</p>\n<ul>\n")
	for _, e := range w.toc {
		num := ""
		if e.number != "" {
			num = `<span class="num">` + e.number + `</span> `
		}
		w.printf("<li class=\"l%d\"><a href=\"#%s\">%s%s</a></li>\n", e.level, e.id, num, w.tocText(e.heading.Inlines))
	}
	w.out.WriteString("</ul>\n</nav>\n")
}

// tocText is a heading's text as the table of contents shows it: in a
// link, so references and links are plain text, and without its notes'
// marks.
func (w *writer) tocText(xs []doc.Inline) string {
	inLink, inTOC := w.inLink, w.inTOC
	w.inLink, w.inTOC = true, true
	s := w.inlines(xs)
	w.inLink, w.inTOC = inLink, inTOC
	return s
}

// equation writes an equation block, centered; a numbered one has "(N)" at
// the right.
func (w *writer) equation(b *doc.Block) {
	id := ""
	if b.Number > 0 {
		id = w.idAttr(b.Label)
	}
	w.printf("<div class=\"equation\"%s>", id)
	if p := w.mathPic(b.Text, true); b.Error == "" && p != nil {
		w.printf(`<img class="math" src="%s" alt="%s" style="width:%spt">`, p.url, esc(b.Text), num(p.w))
	} else {
		w.printf("<code>%s</code>", esc(b.Text))
	}
	if b.Number > 0 {
		w.printf("<span class=\"eqno\">(%d)</span>", b.Number)
	}
	w.out.WriteString("</div>\n")
}

// footnotes writes the notes, numbered, each linking back to its mark.
func (w *writer) footnotes() {
	if len(w.notes) == 0 {
		return
	}
	w.out.WriteString("<section class=\"footnotes\">\n<hr>\n<ol>\n")
	for _, n := range w.notes {
		w.out.WriteString(n)
	}
	w.out.WriteString("</ol>\n</section>\n")
}

func (w *writer) inlines(xs []doc.Inline) string {
	var sb strings.Builder
	w.inline(&sb, xs)
	return sb.String()
}

func (w *writer) inline(sb *strings.Builder, xs []doc.Inline) {
	for _, x := range xs {
		switch x.Type {
		case doc.InlineText:
			sb.WriteString(esc(x.Text))
		case doc.InlineStrong:
			w.wrap(sb, "strong", x.Children)
		case doc.InlineEmph:
			w.wrap(sb, "em", x.Children)
		case doc.InlineStrike:
			w.wrap(sb, "del", x.Children)
		case doc.InlineHighlight:
			w.wrap(sb, "mark", x.Children)
		case doc.InlineCode:
			sb.WriteString("<code>" + esc(x.Text) + "</code>")
		case doc.InlineLink:
			if u := strings.TrimSpace(x.URL); u != "" && !w.inLink && !scriptURL(u) {
				sb.WriteString(`<a href="` + esc(strings.ReplaceAll(u, " ", "%20")) + `">`)
				w.inLink = true
				w.inline(sb, x.Children)
				w.inLink = false
				sb.WriteString("</a>")
			} else {
				w.inline(sb, x.Children)
			}
		case doc.InlineLineBreak:
			sb.WriteString("<br>\n")
		case doc.InlineImage:
			if x.Src == "" {
				sb.WriteString(`<em class="missing">[missing image]</em>`)
			} else if u := w.image(x.Src); u == "" {
				sb.WriteString(`<em class="missing">[image: ` + esc(filepath.Base(x.Src)) + `]</em>`)
			} else {
				sb.WriteString(`<img class="inline" src="` + u + `" alt="` + esc(filepath.Base(x.Src)) + `">`)
			}
		case doc.InlineRef:
			w.ref(sb, x)
		case doc.InlineFootnote:
			w.footnote(sb, x)
		case doc.InlineMath:
			w.inlineMath(sb, x)
		}
	}
}

func (w *writer) wrap(sb *strings.Builder, tag string, xs []doc.Inline) {
	sb.WriteString("<" + tag + ">")
	w.inline(sb, xs)
	sb.WriteString("</" + tag + ">")
}

// ref is "Figure N", "Table N" or "Equation N", linked to what it names
// (but not in a link's text); an unknown reference is a bold "??", as LaTeX
// writes it.
func (w *writer) ref(sb *strings.Builder, x doc.Inline) {
	word := ""
	switch x.Kind {
	case doc.KindFigure:
		word = "Figure"
	case doc.KindTable:
		word = "Table"
	case doc.KindEquation:
		word = "Equation"
	default:
		sb.WriteString("<strong>??</strong>")
		return
	}
	if w.inLink {
		fmt.Fprintf(sb, "%s %d", word, x.Number)
		return
	}
	fmt.Fprintf(sb, `<a class="ref" href="#%s">%s %d</a>`, esc(x.Label), word, x.Number)
}

// footnote writes the note's mark (unlinked in a link's text) and keeps its
// text for the end; a note within a note goes in brackets.
func (w *writer) footnote(sb *strings.Builder, x doc.Inline) {
	if w.inTOC {
		return
	}
	if w.inNote {
		sb.WriteString(" (")
		w.flatText(sb, x.Blocks, false)
		sb.WriteString(")")
		return
	}
	n := len(w.notes) + 1
	var body strings.Builder
	out, inLink := w.out, w.inLink
	w.out, w.inNote, w.inLink = &body, true, false
	w.blocks(x.Blocks)
	w.out, w.inNote, w.inLink = out, false, inLink
	note := body.String()
	back := fmt.Sprintf(` <a class="back" href="#fnref:%d" aria-label="Back to the text">↩</a>`, n)
	if strings.HasSuffix(note, "</p>\n") {
		note = strings.TrimSuffix(note, "</p>\n") + back + "</p>\n"
	} else {
		note += "<p>" + back + "</p>\n"
	}
	w.notes = append(w.notes, fmt.Sprintf("<li id=\"fn:%d\">\n%s</li>\n", n, note))
	if w.inLink {
		fmt.Fprintf(sb, `<sup class="fnref" id="fnref:%d">%d</sup>`, n, n)
		return
	}
	fmt.Fprintf(sb, `<sup class="fnref"><a id="fnref:%d" href="#fn:%d">%d</a></sup>`, n, n, n)
}

// flatText writes blocks in a line, for a note within a note: paragraphs, a
// list's items, a quote's text, code, an equation, a table's caption and
// cells and a figure's pictures and caption, a space between each (and
// before the first when gap). Labelled figures, tables and equations keep
// their ids. It reports whether anything went before what comes next.
func (w *writer) flatText(sb *strings.Builder, bs []doc.Block, gap bool) bool {
	add := func(write func(*strings.Builder)) {
		var t strings.Builder
		write(&t)
		if t.Len() == 0 {
			return
		}
		if gap {
			sb.WriteString(" ")
		}
		sb.WriteString(t.String())
		gap = true
	}
	text := func(xs []doc.Inline) { add(func(t *strings.Builder) { w.inline(t, xs) }) }
	for i := range bs {
		b := &bs[i]
		switch b.Type {
		case doc.BlockParagraph, doc.BlockHeading:
			text(b.Inlines)
		case doc.BlockCode:
			if s := strings.ReplaceAll(strings.TrimSuffix(b.Text, "\n"), "\n", " "); s != "" {
				add(func(t *strings.Builder) { t.WriteString("<code>" + esc(s) + "</code>") })
			}
		case doc.BlockEquation:
			add(func(t *strings.Builder) {
				var m strings.Builder
				w.inlineMath(&m, doc.Inline{Type: doc.InlineMath, Text: b.Text, Display: true, Error: b.Error})
				if b.Number > 0 {
					fmt.Fprintf(&m, " (%d)", b.Number)
					t.WriteString(w.withID(b.Label, m.String()))
				} else {
					t.WriteString(m.String())
				}
			})
		case doc.BlockFigure:
			var s []string
			caption := doc.PlainText(b.Caption)
			if len(b.Pictures) > 0 {
				width := 100.0
				if b.Width > 0 {
					width = b.Width
				}
				style := "max-width:100%;width:" + num(width/float64(max(b.Columns, 1))-1) + "%"
				for _, p := range b.Pictures {
					alt := doc.PlainText(p.Alt)
					if alt == "" {
						alt = caption
					}
					s = append(s, w.picture(p.Src, p.Missing, alt, style))
				}
			} else {
				style := "max-width:100%"
				if b.Width > 0 {
					style += ";width:" + num(b.Width) + "%"
				}
				s = append(s, w.picture(b.Src, b.Missing, caption, style))
			}
			if len(b.Caption) > 0 || b.Label != "" {
				s = append(s, w.caption("Figure", b))
			}
			add(func(t *strings.Builder) { t.WriteString(w.withID(b.Label, strings.Join(s, " "))) })
		case doc.BlockTable:
			if len(b.Caption) > 0 || b.Label != "" {
				add(func(t *strings.Builder) { t.WriteString(w.withID(b.Label, w.caption("Table", b))) })
			}
			for _, row := range append([][][]doc.Inline{b.Header}, b.Rows...) {
				for _, cell := range row {
					text(cell)
				}
			}
		}
		gap = w.flatText(sb, b.Children, gap)
		for _, item := range b.Items {
			gap = w.flatText(sb, item, gap)
		}
	}
	return gap
}

// withID is s in a span with label as its id (see idAttr); s itself when
// the label gets none.
func (w *writer) withID(label, s string) string {
	if id := w.idAttr(label); id != "" {
		return "<span" + id + ">" + s + "</span>"
	}
	return s
}

// mathPic is math drawn as SVG, its size in points.
type mathPic struct {
	url  string
	w, h float64
}

func mathKey(tex string, display bool) string { return fmt.Sprintf("%t\x00%s", display, tex) }

// drawMath draws all the math in bs, in one call of Options.Equations.
func (w *writer) drawMath(bs []doc.Block) {
	if w.opt.Equations == nil {
		return
	}
	ms := doc.ReadableMath(bs)
	if len(ms) == 0 {
		return
	}
	pics := w.opt.Equations(ms, w.fontSize())
	for i, m := range ms {
		var p *mathPic
		if i < len(pics) && pics[i] != nil {
			if wPt, hPt, ok := svgSize(pics[i]); ok {
				p = &mathPic{dataURL("image/svg+xml", pics[i]), wPt, hPt}
			}
		}
		w.math[mathKey(m.TeX, m.Display)] = p
	}
}

// mathPic is tex as drawMath drew it; nil when it couldn't be.
func (w *writer) mathPic(tex string, display bool) *mathPic {
	return w.math[mathKey(tex, display)]
}

// inlineMath is math in a line. Its picture's middle is its baseline, so
// it's lowered by half its height; display math (`$$…$$` in text) is
// centered on the line instead, a quarter of the text size above the
// baseline.
func (w *writer) inlineMath(sb *strings.Builder, x doc.Inline) {
	p := w.mathPic(x.Text, x.Display)
	if x.Error != "" || p == nil {
		sb.WriteString("<code>" + esc(strings.ReplaceAll(x.Text, "\n", " ")) + "</code>")
		return
	}
	lower := p.h / 2
	if x.Display {
		lower -= w.fontSize() / 4
	}
	fmt.Fprintf(sb, `<img class="math" src="%s" alt="%s" style="width:%spt;vertical-align:%spt">`, p.url, esc(x.Text), num(p.w), num(-lower))
}

// svgSize is an SVG's size in points, from its root element's width and
// height (Typst writes them in pt).
func svgSize(data []byte) (wPt, hPt float64, ok bool) {
	dec := xml.NewDecoder(bytes.NewReader(data))
	for {
		tok, err := dec.Token()
		if err != nil {
			return 0, 0, false
		}
		se, isStart := tok.(xml.StartElement)
		if !isStart {
			continue
		}
		if se.Name.Local != "svg" {
			return 0, 0, false
		}
		for _, a := range se.Attr {
			switch a.Name.Local {
			case "width":
				wPt = svgLength(a.Value)
			case "height":
				hPt = svgLength(a.Value)
			}
		}
		return wPt, hPt, wPt > 0 && hPt > 0
	}
}

// svgLength is an SVG length in pt or px (or unitless, as px) in points;
// 0 for anything else.
func svgLength(s string) float64 {
	s = strings.TrimSpace(s)
	scale := 0.75
	if v, found := strings.CutSuffix(s, "pt"); found {
		s, scale = v, 1
	} else {
		s = strings.TrimSuffix(s, "px")
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || v <= 0 {
		return 0
	}
	return v * scale
}

// --- Style --------------------------------------------------------------

func (w *writer) fontSize() float64 {
	if w.st.FontSize > 0 {
		return w.st.FontSize
	}
	return 11
}

// css is the page's style sheet, from the template's Word style.
func (w *writer) css() string {
	st := w.st
	fs := w.fontSize()
	text := colorOr(st.TextColor, "222222")
	accent := colorOr(st.AccentColor, "999999")
	lineHeight := 1.4
	if st.LineSpacing > 0 {
		lineHeight = 1.2 * st.LineSpacing
	}
	var c strings.Builder
	p := func(format string, a ...any) { fmt.Fprintf(&c, format+"\n", a...) }

	p("body { margin: 0; background: #fff; color: #%s; font-family: %s; font-size: %spt; line-height: %s; }",
		text, fontStack(st.BodyFont, "serif"), num(fs), num(lineHeight))
	p("article { max-width: 42em; margin: 0 auto; padding: 3em 1.5em 4em; }")
	p("p { margin: 0 0 %spt; }", num(max(st.SpaceAfter, 0)))
	if st.FirstLineIndent > 0 {
		// A paragraph after a paragraph, as in the PDF; not the first after
		// the running header.
		p("article > p:not(.running) + p, blockquote > p + p { text-indent: %sin; }", num(st.FirstLineIndent))
	}
	if st.Justify {
		p("article > p, blockquote > p, li { text-align: justify; hyphens: auto; }")
	}
	weight := "normal"
	if st.HeadingBold {
		weight = "bold"
	}
	p("h1, h2, h3, h4, h5, h6 { font-family: %s; color: #%s; font-weight: %s; line-height: 1.25; margin: 1.4em 0 0.5em; }",
		fontStack(st.HeadingFont, "serif"), colorOr(st.HeadingColor, text), weight)
	sizes := st.HeadingSizes
	if len(sizes) == 0 {
		sizes = []float64{fs * 1.6, fs * 1.3, fs * 1.1}
	}
	for level := 1; level <= 6; level++ {
		size := sizes[min(level, len(sizes))-1]
		if size <= 0 {
			size = fs
		}
		p("h%d { font-size: %spt; }", level, num(size))
	}
	p(".num { margin-right: 0.25em; }")

	titleSize := st.TitleSize
	if titleSize <= 0 {
		titleSize = fs * 2
	}
	align := "left"
	if st.TitleAlign == "center" || st.TitleAlign == "right" {
		align = st.TitleAlign
	}
	p(".running { margin: 0 0 2em; text-align: right; font-size: 0.85em; opacity: 0.7; }")
	p("header.title { text-align: %s; margin-bottom: 2.5em; }", align)
	p("header.title h1 { font-size: %spt; color: #%s; margin: 0 0 0.3em; }", num(titleSize), colorOr(st.TitleColor, text))
	p("header.title .subtitle { font-size: 1.25em; margin-bottom: 0.6em; }")
	p("header.title .author, header.title .topic, header.title .date { margin: 0 0 0.2em; }")
	if st.TitleRule {
		p("header.title .names { border-bottom: 1px solid #%s; padding-bottom: 1em; }", accent)
	}
	p(".abstract { margin: 1.5em auto 0; max-width: 34em; text-align: justify; font-size: 0.92em; }")
	p(".abstract-title { font-weight: bold; text-align: center; margin-bottom: 0.4em; }")

	monoFont := fontStack(st.MonoFont, "monospace")
	p("code { font-family: %s; font-size: 0.9em; }", monoFont)
	p("pre { font-family: %s; font-size: 0.9em; line-height: 1.4; background: #f5f5f4; padding: 0.8em 1em; border-radius: 4px; overflow-x: auto; margin: 0 0 1em; }", monoFont)
	p("pre code { font-size: 1em; }")
	p("blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #%s; }", accent)
	p("hr { border: 0; border-top: 1px solid #%s; margin: 1.5em 0; }", accent)
	p("ul, ol { margin: 0 0 %spt; padding-left: 1.6em; }", num(max(st.SpaceAfter, 6)))
	p("li > p { margin-bottom: 0.4em; }")

	captionSize := st.CaptionSize
	if captionSize <= 0 {
		captionSize = fs * 0.9
	}
	italic := "normal"
	if st.CaptionItalic {
		italic = "italic"
	}
	p("figure { margin: 1.5em 0; text-align: center; }")
	p("figure.left { text-align: left; }")
	p("figure.right { text-align: right; }")
	p("figure img { max-width: 100%%; height: auto; }")
	p("figcaption { font-size: %spt; color: #%s; font-style: %s; margin-top: 0.5em; }", num(captionSize), colorOr(st.CaptionColor, text), italic)
	p("figure.table figcaption { margin: 0 0 0.5em; }")
	p(".grid { display: grid; gap: 0.5em; align-items: center; margin: 0 auto; }")
	p(".grid img { width: 100%%; }")
	p("figure.left .grid { margin-left: 0; }")
	p("figure.right .grid { margin-right: 0; }")

	p("table { border-collapse: collapse; width: 100%%; font-size: 0.95em; text-align: left; }")
	p("th, td { border-top: 1px solid #%s; border-bottom: 1px solid #%s; padding: 0.35em 0.6em; vertical-align: top; }", accent, accent)
	if fill := color(st.TableHeaderFill); fill != "" {
		p("th { background: #%s; }", fill)
	}

	p(".equation { position: relative; text-align: center; margin: 1em 0; }")
	p(".eqno { position: absolute; right: 0; top: 50%%; transform: translateY(-50%%); }")
	p("img.math { max-width: 100%%; height: auto; }")
	p("img.inline { height: 1.2em; vertical-align: -0.25em; }")
	p(".missing { opacity: 0.7; }")

	p(".toc { margin: 1.5em 0 2em; }")
	p(".toc-title { font-family: %s; font-weight: bold; font-size: 1.2em; margin-bottom: 0.5em; }", fontStack(st.HeadingFont, "serif"))
	p(".toc ul { list-style: none; padding: 0; margin: 0; }")
	p(".toc .l2 { padding-left: 1.5em; }")
	p(".toc .l3 { padding-left: 3em; }")
	p(".toc a, a.ref, .fnref a, a.back { color: inherit; text-decoration: none; }")
	p(".toc a:hover, a.ref:hover, .fnref a:hover { text-decoration: underline; }")
	p(".fnref { line-height: 0; }")
	p(".footnotes { margin-top: 3em; font-size: 0.9em; }")
	p(".footnotes hr { width: 30%%; margin-left: 0; }")
	p(".footnotes p { text-indent: 0; }")
	p(".pagebreak { break-after: page; }")
	p("@media print { article { max-width: none; padding: 0; } a { color: inherit; } }")
	return c.String()
}

// fontStack is font, quoted, then generic: "sans-serif" for fonts whose
// name says they are, else generic as given.
func fontStack(font, generic string) string {
	font = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`"'\<>;{}`, r) || unicode.IsControl(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(font))
	if font == "" {
		return generic
	}
	if generic == "serif" && sansFont.MatchString(font) {
		generic = "sans-serif"
	}
	return `"` + font + `", ` + generic
}

var sansFont = regexp.MustCompile(`(?i)sans|helvetica|arial|avenir|aptos|inter|verdana|segoe|futura|gill`)

var hexColor = regexp.MustCompile(`^[0-9A-Fa-f]{6}$`)

// color is an RRGGBB color (a leading # allowed), or "" when it isn't one.
func color(c string) string {
	c = strings.TrimPrefix(strings.TrimSpace(c), "#")
	if !hexColor.MatchString(c) {
		return ""
	}
	return strings.ToUpper(c)
}

func colorOr(c, fallback string) string {
	if c = color(c); c != "" {
		return c
	}
	return fallback
}

// num is v for CSS: at most two decimals, no trailing zeros.
func num(v float64) string {
	return strconv.FormatFloat(math.Round(v*100)/100, 'f', -1, 64)
}

// scriptURL is whether a link to u would run code when followed (a
// javascript:, vbscript: or data: URL), read as browsers do: ignoring the
// tabs, newlines and other control characters in it, and what esc drops.
func scriptURL(u string) bool {
	u = strings.Map(func(r rune) rune {
		if r <= ' ' || dropped(r) {
			return -1
		}
		return r
	}, u)
	scheme, _, ok := strings.Cut(u, ":")
	if !ok {
		return false
	}
	switch strings.ToLower(scheme) {
	case "javascript", "vbscript", "data":
		return true
	}
	return false
}

// dropped is whether esc leaves r out: characters HTML can't hold, and
// carriage returns.
func dropped(r rune) bool {
	return r < 0x20 && r != '\t' && r != '\n' || r == 0x7F || r == 0xFFFE || r == 0xFFFF
}

// esc escapes text for HTML content or attributes, leaving out dropped
// characters.
func esc(s string) string {
	s = strings.Map(func(r rune) rune {
		if dropped(r) {
			return -1
		}
		return r
	}, s)
	return escaper.Replace(s)
}

var escaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")
