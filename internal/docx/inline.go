package docx

import (
	"encoding/xml"
	"fmt"
	"regexp"
	"strings"

	"peanut-writer/internal/doc"
)

// runProps are the character properties that nesting accumulates.
type runProps struct {
	b, i, strike, code bool
	style              string // character style
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
	if style == "" && !p.b && !p.i && !p.strike {
		return ""
	}
	var b strings.Builder
	b.WriteString("<w:rPr>")
	if style != "" {
		fmt.Fprintf(&b, `<w:rStyle w:val="%s"/>`, style)
	}
	if font != "" {
		fmt.Fprintf(&b, `<w:rFonts w:ascii="%[1]s" w:hAnsi="%[1]s" w:cs="%[1]s"/>`, esc(font))
	}
	if p.b {
		b.WriteString("<w:b/><w:bCs/>")
	}
	if p.i {
		b.WriteString("<w:i/><w:iCs/>")
	}
	if p.strike {
		b.WriteString("<w:strike/>")
	}
	b.WriteString("</w:rPr>")
	return b.String()
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
		}
	}
}

func (w *writer) link(sb *strings.Builder, x doc.Inline, p runProps) {
	url := strings.TrimSpace(x.URL)
	if url == "" || strings.HasPrefix(url, "#") {
		// Nothing outside the document to link to.
		w.inline(sb, x.Children, p)
		return
	}
	id := w.part.add(relHyperlink, strings.ReplaceAll(url, " ", "%20"), true)
	q := p
	q.style = "Hyperlink"
	fmt.Fprintf(sb, `<w:hyperlink r:id="%s" w:history="1">`, id)
	w.inline(sb, x.Children, q)
	sb.WriteString(`</w:hyperlink>`)
}

// ref is "Figure N" or "Table N" as a REF field to the caption's bookmark;
// an unknown reference is a bold "??", as LaTeX writes it.
func (w *writer) ref(sb *strings.Builder, x doc.Inline, p runProps) {
	word := ""
	switch x.Kind {
	case doc.KindFigure:
		word = "Figure"
	case doc.KindTable:
		word = "Table"
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
		for i, b := range x.Blocks {
			if i > 0 {
				sb.WriteString(w.run(" ", p))
			}
			w.inline(sb, b.Inlines, p)
		}
		sb.WriteString(w.run(")", p))
		return
	}
	id := len(w.notes) + 1
	var body strings.Builder
	out, part, style := w.out, w.part, w.paraStyle
	w.out, w.part, w.paraStyle, w.inNote, w.prefix = &body, &w.noteRels, "FootnoteText", true, footnoteMark
	w.blocks(x.Blocks)
	if w.prefix != "" {
		w.para("FootnoteText", "", "")
	}
	w.out, w.part, w.paraStyle, w.inNote = out, part, style, false
	w.notes = append(w.notes, fmt.Sprintf(`<w:footnote w:id="%d">%s</w:footnote>`, id, body.String()))
	fmt.Fprintf(sb, `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="%d"/></w:r>`, id)
}

// plainText is inlines' text, for alt text.
func plainText(xs []doc.Inline) string {
	var b strings.Builder
	var walk func([]doc.Inline)
	walk = func(xs []doc.Inline) {
		for _, x := range xs {
			switch x.Type {
			case doc.InlineText, doc.InlineCode:
				b.WriteString(x.Text)
			case doc.InlineLineBreak:
				b.WriteString(" ")
			}
			walk(x.Children)
		}
	}
	walk(xs)
	return b.String()
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
