package docx

import (
	"encoding/xml"
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"peanut-writer/internal/doc"
)

// runProps are the character properties that nesting accumulates.
type runProps struct {
	b, i, strike, code, mark bool
	style                    string  // character style
	lower                    float64 // points to lower the run by (an inline equation)
}

// rPr is the run properties element, "" when there are none.
func (w *writer) rPr(p runProps) string {
	style, font := p.style, ""
	if p.code {
		if style == "" {
			style = "VerbatimChar"
		} else {
			font = w.st.MonoFont
		}
	}
	props := rpr(font, p.b, p.i, "", 0)
	if p.strike {
		props += "<w:strike/>"
	}
	if p.lower != 0 {
		props += fmt.Sprintf(`<w:position w:val="%d"/>`, -half(p.lower))
	}
	if p.mark {
		props += `<w:highlight w:val="yellow"/>`
	}
	if style != "" {
		props = `<w:rStyle w:val="` + style + `"/>` + props
	}
	if props == "" {
		return ""
	}
	return "<w:rPr>" + props + "</w:rPr>"
}

// run is text as a run; tabs become Word tabs and newlines line breaks.
func (w *writer) run(text string, p runProps) string {
	text = clean(text)
	if text == "" {
		return ""
	}
	var b strings.Builder
	b.WriteString("<w:r>")
	b.WriteString(w.rPr(p))
	start := 0
	flush := func(end int) {
		if end > start {
			b.WriteString(`<w:t xml:space="preserve">` + esc(text[start:end]) + `</w:t>`)
		}
	}
	for i := range len(text) {
		switch text[i] {
		case '\t':
			flush(i)
			b.WriteString("<w:tab/>")
			start = i + 1
		case '\n':
			flush(i)
			b.WriteString("<w:br/>")
			start = i + 1
		}
	}
	flush(len(text))
	b.WriteString("</w:r>")
	return b.String()
}

// field writes a complex field with instruction instr and the cached result.
func (w *writer) field(sb *strings.Builder, instr, result string, p runProps) {
	rpr := w.rPr(p)
	sb.WriteString(`<w:r>` + rpr + `<w:fldChar w:fldCharType="begin"/></w:r>`)
	sb.WriteString(`<w:r>` + rpr + `<w:instrText xml:space="preserve"> ` + esc(instr) + ` </w:instrText></w:r>`)
	sb.WriteString(`<w:r>` + rpr + `<w:fldChar w:fldCharType="separate"/></w:r>`)
	sb.WriteString(w.run(result, p))
	sb.WriteString(`<w:r>` + rpr + `<w:fldChar w:fldCharType="end"/></w:r>`)
}

func (w *writer) inlines(xs []doc.Inline, p runProps) string {
	var sb strings.Builder
	w.inline(&sb, xs, p)
	return sb.String()
}

func (w *writer) inline(sb *strings.Builder, xs []doc.Inline, p runProps) {
	for _, x := range xs {
		q := p
		switch x.Type {
		case doc.InlineText:
			sb.WriteString(w.run(x.Text, p))
		case doc.InlineStrong:
			q.b = true
			w.inline(sb, x.Children, q)
		case doc.InlineEmph:
			q.i = true
			w.inline(sb, x.Children, q)
		case doc.InlineStrike:
			q.strike = true
			w.inline(sb, x.Children, q)
		case doc.InlineHighlight:
			q.mark = true
			w.inline(sb, x.Children, q)
		case doc.InlineCode:
			q.code = true
			sb.WriteString(w.run(strings.ReplaceAll(x.Text, "\n", " "), q))
		case doc.InlineLink:
			w.link(sb, x, p)
		case doc.InlineLineBreak:
			sb.WriteString("<w:r><w:br/></w:r>")
		case doc.InlineImage:
			sb.WriteString(w.inlineImage(x.Src, p))
		case doc.InlineRef:
			w.ref(sb, x, p)
		case doc.InlineFootnote:
			w.footnote(sb, x, p)
		case doc.InlineMath:
			sb.WriteString(w.math(x, p))
		}
	}
}

// link writes a link: to a heading, figure, table or equation (`#anchor`)
// as a link within the document, and to anything else as an external one.
// A link to an anchor that isn't there is plain text.
func (w *writer) link(sb *strings.Builder, x doc.Inline, p runProps) {
	target := strings.TrimSpace(x.URL)
	q := p
	q.style = "Hyperlink"
	if anchor, ok := strings.CutPrefix(target, "#"); ok {
		if a, err := url.PathUnescape(anchor); err == nil {
			anchor = a
		}
		name := w.anchors[anchor]
		if name == "" {
			w.inline(sb, x.Children, p)
			return
		}
		fmt.Fprintf(sb, `<w:hyperlink w:anchor="%s" w:history="1">`, name)
	} else if target == "" {
		w.inline(sb, x.Children, p)
		return
	} else {
		id := w.part.add(relHyperlink, w.linkTarget(target), true)
		fmt.Fprintf(sb, `<w:hyperlink r:id="%s" w:history="1">`, id)
	}
	w.inline(sb, x.Children, q)
	sb.WriteString(`</w:hyperlink>`)
}

// linkTarget is where a link outside the document goes. A file path (no
// scheme) is relative to the document's folder, not the Word file's, which
// may be saved elsewhere: it becomes a file: URL to where the file is.
func (w *writer) linkTarget(target string) string {
	u, err := url.Parse(target)
	if err != nil { // a % that escapes nothing, as in a path like 100%.pdf
		u, err = url.Parse(strings.ReplaceAll(target, "%", "%25"))
	}
	if err != nil || u.Scheme != "" || u.Host != "" || u.Path == "" || w.dir == "" {
		return strings.ReplaceAll(target, " ", "%20")
	}
	p := filepath.FromSlash(u.Path)
	if !filepath.IsAbs(p) {
		p = filepath.Join(w.dir, p)
	}
	p = filepath.ToSlash(p)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p // C:/… on Windows
	}
	return (&url.URL{Scheme: "file", Path: p, RawQuery: u.RawQuery, Fragment: u.Fragment}).String()
}

// ref is "Figure N", "Table N" or "Equation N" as a REF field to the
// bookmarked number; an unknown reference is a bold "??", as LaTeX writes
// it.
func (w *writer) ref(sb *strings.Builder, x doc.Inline, p runProps) {
	word := ""
	switch x.Kind {
	case doc.KindFigure:
		word = "Figure"
	case doc.KindTable:
		word = "Table"
	case doc.KindEquation:
		// The bookmark holds just the number, which is shown in brackets.
		sb.WriteString(w.run("Equation ", p))
		if name := w.bookmarks[x.Label]; name != "" {
			w.field(sb, "REF "+name+` \h`, strconv.Itoa(x.Number), p)
		} else {
			sb.WriteString(w.run(strconv.Itoa(x.Number), p))
		}
		return
	default:
		q := p
		q.b = true
		sb.WriteString(w.run("??", q))
		return
	}
	text := fmt.Sprintf("%s %d", word, x.Number)
	if name := w.bookmarks[x.Label]; name != "" {
		w.field(sb, "REF "+name+` \h`, text, p)
	} else {
		sb.WriteString(w.run(text, p))
	}
}

const footnoteMark = `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>`

// footnote writes the note's reference mark and its text into footnotes.xml.
func (w *writer) footnote(sb *strings.Builder, x doc.Inline, p runProps) {
	if w.inNote {
		// Word has no notes within notes: the text goes in brackets.
		sb.WriteString(w.run(" (", p))
		w.flatText(sb, x.Blocks, p, false)
		sb.WriteString(w.run(")", p))
		return
	}
	id := len(w.notes) + 1
	var body strings.Builder
	out, part, style, indent, right := w.out, w.part, w.paraStyle, w.indent, w.right
	w.out, w.part, w.paraStyle, w.inNote, w.prefix = &body, &w.noteRels, "FootnoteText", true, footnoteMark
	w.indent, w.right = 0, 0 // the note starts at its own margin, wherever its mark is
	// The mark starts the note's first paragraph (in a quote, too), or is one
	// of its own before a table, list, picture or the like (not in its first
	// cell or item).
	first := x.Blocks
	for len(first) > 0 && first[0].Type == doc.BlockQuote {
		first = first[0].Children
	}
	if len(first) > 0 {
		switch first[0].Type {
		case doc.BlockParagraph, doc.BlockHeading:
		default:
			w.para("FootnoteText", "", "")
		}
	}
	w.blocks(x.Blocks)
	if w.prefix != "" {
		w.para("FootnoteText", "", "")
	}
	w.out, w.part, w.paraStyle, w.inNote, w.indent, w.right = out, part, style, false, indent, right
	w.notes = append(w.notes, fmt.Sprintf(`<w:footnote w:id="%d">%s</w:footnote>`, id, body.String()))
	fmt.Fprintf(sb, `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="%d"/></w:r>`, id)
	// The note's numbered figures, tables and equations show plain numbers;
	// hidden SEQ fields here count them where the mark is, keeping Word's
	// numbering of later ones in the text in step.
	doc.Walk(x.Blocks, func(b *doc.Block) {
		if kind := seqKind(b); kind != "" {
			sb.WriteString(w.hiddenSeq(kind))
		}
	}, func(*doc.Inline) {})
}

// seqKind is the SEQ name of a numbered figure, table or equation; "" for
// any other block.
func seqKind(b *doc.Block) string {
	if b.Number > 0 {
		switch b.Type {
		case doc.BlockFigure:
			return "Figure"
		case doc.BlockTable:
			return "Table"
		case doc.BlockEquation:
			return "Equation"
		}
	}
	return ""
}

// flatText writes blocks in a line, for a note within a note: paragraphs, a
// list's items, a quote's text, code, an equation, a table's caption and
// cells and a figure's pictures and caption, a space between each (and
// before the first when gap). It reports whether anything went before what
// comes next.
func (w *writer) flatText(sb *strings.Builder, bs []doc.Block, p runProps, gap bool) bool {
	add := func(runs string) {
		if runs == "" {
			return
		}
		if gap {
			sb.WriteString(w.run(" ", p))
		}
		sb.WriteString(runs)
		gap = true
	}
	for i := range bs {
		b := &bs[i]
		switch b.Type {
		case doc.BlockParagraph, doc.BlockHeading:
			add(w.inlines(b.Inlines, p))
		case doc.BlockCode:
			q := p
			q.code = true
			add(w.run(strings.ReplaceAll(strings.TrimSuffix(b.Text, "\n"), "\n", " "), q))
		case doc.BlockEquation:
			runs := w.math(doc.Inline{Type: doc.InlineMath, Text: b.Text, Display: true, Error: b.Error}, p)
			if b.Number > 0 {
				runs += w.run(fmt.Sprintf(" (%d)", b.Number), p)
			}
			add(runs)
		case doc.BlockFigure:
			var runs strings.Builder
			caption := doc.PlainText(b.Caption)
			if len(b.Pictures) > 0 {
				// As wide as in a grid (see pictureGrid), so a row fits a line.
				colW := w.availW()
				if b.Width > 0 {
					colW = int(float64(colW) * b.Width / 100)
				}
				width := float64(max(colW/max(b.Columns, 1)-2*gridCellPad, 20)) / 20
				for i, pic := range b.Pictures {
					if i > 0 {
						runs.WriteString(w.run(" ", p))
					}
					alt := doc.PlainText(pic.Alt)
					if alt == "" {
						alt = caption
					}
					runs.WriteString(w.flatPicture(pic.Src, pic.Missing, width, alt, p))
				}
			} else {
				want := 0.0
				if b.Width > 0 {
					want = b.Width / 100 * float64(w.availW()) / 20
				}
				runs.WriteString(w.flatPicture(b.Src, b.Missing, want, caption, p))
			}
			if len(b.Caption) > 0 || b.Label != "" {
				runs.WriteString(w.run(" ", p) + w.captionRuns("Figure", b))
			}
			add(runs.String())
		case doc.BlockTable:
			if len(b.Caption) > 0 || b.Label != "" {
				add(w.captionRuns("Table", b))
			}
			for _, row := range append([][][]doc.Inline{b.Header}, b.Rows...) {
				for _, cell := range row {
					add(w.inlines(cell, p))
				}
			}
		}
		gap = w.flatText(sb, b.Children, p, gap)
		for _, item := range b.Items {
			gap = w.flatText(sb, item, p, gap)
		}
	}
	return gap
}

// flatPicture is a figure's picture in a line, widthPt wide (0 for its
// natural size).
func (w *writer) flatPicture(src, missing string, widthPt float64, alt string, p runProps) string {
	if src == "" {
		p.i = true
		return w.run("[missing image: "+missing+"]", p)
	}
	return w.picture(src, widthPt, alt)
}

// clean drops characters XML can't hold (and carriage returns).
func clean(s string) string {
	ok := func(r rune) bool {
		return r == '\t' || r == '\n' || r >= 0x20 && r <= 0xD7FF || r >= 0xE000 && r <= 0xFFFD || r >= 0x10000 && r <= 0x10FFFF
	}
	for _, r := range s {
		if !ok(r) {
			return strings.Map(func(r rune) rune {
				if ok(r) {
					return r
				}
				return -1
			}, s)
		}
	}
	return s
}

// esc escapes text for XML content or attributes.
func esc(s string) string {
	var b strings.Builder
	xml.EscapeText(&b, []byte(clean(s)))
	return b.String()
}

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
