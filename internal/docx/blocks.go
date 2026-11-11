package docx

import (
	"fmt"
	"strconv"
	"strings"

	"peanut-writer/internal/doc"
)

// para writes a paragraph in style (none for Normal) with further paragraph
// properties ppr (which must follow pStyle in schema order) and runs.
func (w *writer) para(style, ppr, runs string) {
	w.out.WriteString("<w:p>")
	if style != "" || ppr != "" {
		w.out.WriteString("<w:pPr>")
		if style != "" {
			fmt.Fprintf(w.out, `<w:pStyle w:val="%s"/>`, style)
		}
		w.out.WriteString(ppr)
		w.out.WriteString("</w:pPr>")
	}
	w.out.WriteString(w.prefix)
	w.prefix = ""
	w.out.WriteString(runs)
	w.out.WriteString("</w:p>")
}

// titleBlock writes the front matter's title, subtitle, author, topic, date
// and abstract, each only when given. With text columns, it's a section of
// its own, across the page.
func (w *writer) titleBlock(m doc.Meta) {
	type line struct{ style, text string }
	var lines []line
	for _, l := range []line{{"Title", m.Title}, {"Subtitle", m.Subtitle}, {"Author", m.Author}, {"Topic", m.Topic}, {"Date", m.Date}} {
		if strings.TrimSpace(l.text) != "" {
			lines = append(lines, l)
		}
	}
	// The rule goes under the title and byline, above the abstract.
	ruleAt := -1
	if w.st.TitleRule {
		ruleAt = len(lines) - 1
	}
	if strings.TrimSpace(m.Abstract) != "" {
		lines = append(lines, line{"AbstractTitle", "Abstract"})
		for _, p := range strings.Split(m.Abstract, "\n") {
			if p = strings.TrimSpace(p); p != "" {
				lines = append(lines, line{"Abstract", p})
			}
		}
	}
	// A gap between the title block and the text.
	gap := fmt.Sprintf(`<w:spacing w:after="%d"/>`, twips(max(w.st.SpaceAfter*2, 18)))
	for i, l := range lines {
		ppr := ""
		if i == ruleAt {
			ppr = fmt.Sprintf(`<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="8" w:color="%s"/></w:pBdr>`, colorOr(w.st.AccentColor, "auto")) + gap
		}
		if i == len(lines)-1 {
			if i != ruleAt {
				ppr = gap
			}
			if w.cols > 1 {
				ppr += w.sectPr(1, false)
			}
		}
		w.para(l.style, ppr, w.run(l.text, runProps{}))
	}
}

func (w *writer) blocks(bs []doc.Block) {
	for i := range bs {
		w.block(&bs[i])
	}
}

func (w *writer) block(b *doc.Block) {
	switch b.Type {
	case doc.BlockParagraph:
		w.para(w.paraStyle, w.ind(w.paraStyle, 0), w.inlines(b.Inlines, runProps{}))
	case doc.BlockHeading:
		if w.inNote {
			// A heading in a footnote stays out of the outline and the TOC.
			w.para(w.paraStyle, w.ind(w.paraStyle, 0), w.inlines(b.Inlines, runProps{b: true}))
			return
		}
		runs := w.inlines(b.Inlines, runProps{})
		if name := w.headings[b]; name != "" {
			w.bookmarkID++
			runs = fmt.Sprintf(`<w:bookmarkStart w:id="%d" w:name="%s"/>%s<w:bookmarkEnd w:id="%[1]d"/>`, w.bookmarkID, name, runs)
		}
		style := fmt.Sprintf("Heading%d", min(max(b.Level, 1), 6))
		w.para(style, w.ind(style, 0), runs)
	case doc.BlockList:
		w.list(b, 0, w.indent)
	case doc.BlockQuote:
		style, left, right := w.paraStyle, w.indent, w.right
		w.paraStyle = "Quote"
		if w.inNote {
			w.paraStyle = "FootnoteQuote"
		}
		w.indent, w.right = w.indent+quoteIndent, w.right+quoteIndent
		w.blocks(b.Children)
		w.paraStyle, w.indent, w.right = style, left, right
	case doc.BlockCode:
		// The style has no space between lines; the block gets space above
		// and below on its first and last lines.
		lines := strings.Split(strings.TrimSuffix(b.Text, "\n"), "\n")
		for i, line := range lines {
			before, after := 0, 0
			if i == 0 {
				before = 120
			}
			if i == len(lines)-1 {
				after = twips(max(w.st.SpaceAfter, 6))
			}
			ppr := ""
			if before > 0 || after > 0 {
				ppr = fmt.Sprintf(`<w:spacing w:before="%d" w:after="%d"/>`, before, after)
			}
			w.para("SourceCode", ppr+w.ind("SourceCode", codePad), w.run(line, runProps{}))
		}
	case doc.BlockFigure:
		w.figure(b)
	case doc.BlockTable:
		w.table(b)
	case doc.BlockRule:
		ind := w.ind("", 0)
		if ind == "" {
			ind = `<w:ind w:firstLine="0"/>`
		}
		w.para("", fmt.Sprintf(`<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="%s"/></w:pBdr>`, colorOr(w.st.AccentColor, "auto"))+ind, "")
	case doc.BlockPageBreak:
		w.para("", "", `<w:r><w:br w:type="page"/></w:r>`)
	case doc.BlockTOC:
		w.toc()
	case doc.BlockEquation:
		w.equation(b)
	}
}

// Indents, in twips: a quote's on each side, and a code block's text from
// its shading.
const (
	quoteIndent = 720
	codePad     = 115
)

// styleIndent is how far in from each margin a paragraph style sets its
// text, in twips (see styles).
func styleIndent(style string) (left, right int) {
	switch style {
	case "Quote", "FootnoteQuote":
		return quoteIndent, quoteIndent
	case "SourceCode":
		return codePad, codePad
	}
	return 0, 0
}

// ind is the indent putting a paragraph in style pad twips inside where the
// blocks being written start (w.indent and w.right: in a list item or a
// quote); "" when the style puts it there already.
func (w *writer) ind(style string, pad int) string {
	left, right := w.indent+pad, w.right+pad
	if l, r := styleIndent(style); l == left && r == right {
		return ""
	}
	return fmt.Sprintf(`<w:ind w:left="%d" w:right="%d" w:firstLine="0"/>`, left, right)
}

// availW is the width blocks have where they're being written, in twips.
func (w *writer) availW() int { return max(w.textW-w.indent-w.right, 1440) }

// list writes a list's items at level depth, base twips in from the margin
// (where the list's container starts); nested lists go one deeper, and other
// blocks in an item start where its text does. Each ordered list has its own
// numbering instance, so it starts at Start. In a quote, items keep the
// quote's style.
func (w *writer) list(b *doc.Block, depth, base int) {
	depth = min(depth, 8)
	num := numBullets
	if b.Ordered {
		w.ordered = append(w.ordered, orderedList{depth, b.Start})
		num = w.orderedNum(len(w.ordered) - 1)
	}
	loose := ""
	if !b.Tight {
		loose = `<w:contextualSpacing w:val="0"/>`
	}
	text := base + listIndent(depth) // where the items' text starts
	numPr := fmt.Sprintf(`<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>`, depth, num)
	cont := fmt.Sprintf(`<w:ind w:left="%d" w:right="%d" w:firstLine="0"/>`, text, w.right) + loose
	style, first := "ListParagraph", numPr+loose
	// The numbering's indents are for a list at the margin in List
	// Paragraph. Anywhere else, the indent is given here; in a footnote,
	// items keep the note's size, and in a quote, its look.
	quoted := w.paraStyle == "Quote" || w.paraStyle == "FootnoteQuote"
	if w.inNote || quoted || base > 0 {
		if w.inNote || quoted {
			style = w.paraStyle
		}
		first = numPr + fmt.Sprintf(`<w:ind w:left="%d" w:right="%d" w:hanging="360"/>`, text, w.right) + loose
	}
	for _, item := range b.Items {
		rest := item
		if len(item) > 0 && item[0].Type == doc.BlockParagraph {
			w.para(style, first, w.inlines(item[0].Inlines, runProps{}))
			rest = item[1:]
		} else {
			w.para(style, first, "")
		}
		for i := range rest {
			c := &rest[i]
			switch c.Type {
			case doc.BlockList:
				w.list(c, depth+1, base)
			case doc.BlockParagraph:
				w.para(style, cont, w.inlines(c.Inlines, runProps{}))
			default:
				saved := w.indent
				w.indent = text
				w.block(c)
				w.indent = saved
			}
		}
	}
}

// listIndent is where a list level's text starts, in twips.
func listIndent(level int) int { return 720 * (level + 1) }

// figure writes the picture (or a grid's pictures), centered unless placed
// left or right, then its caption, aligned with it.
func (w *writer) figure(b *doc.Block) {
	captioned := len(b.Caption) > 0 || b.Label != ""
	place := w.ind("", 0) // indented in a list item or a quote, then aligned
	if b.Position != "" {
		place += `<w:jc w:val="` + b.Position + `"/>`
	}
	if len(b.Pictures) > 0 {
		w.pictureGrid(b)
		if captioned {
			w.para("Caption", place, w.captionRuns("Figure", b))
		} else {
			// A little space under the grid, keeping Word's count of
			// figures in step with the numbering.
			runs := ""
			if b.Number > 0 {
				runs = w.hiddenSeq("Figure")
			}
			w.para("", fmt.Sprintf(`<w:spacing w:before="0" w:after="0" w:line="%d" w:lineRule="exact"/><w:ind w:firstLine="0"/>`, twips(max(w.st.SpaceAfter, 6))), runs)
		}
		return
	}
	var runs string
	if b.Src == "" {
		runs = w.run("[missing image: "+b.Missing+"]", runProps{i: true})
	} else {
		want := 0.0
		if b.Width > 0 {
			want = b.Width / 100 * float64(w.availW()) / 20
		}
		runs = w.picture(b.Src, want, doc.PlainText(b.Caption))
	}
	ppr := place
	if captioned {
		ppr = "<w:keepNext/>" + place
	} else if b.Number > 0 {
		// Keep Word's count of figures in step with the numbering.
		runs += w.hiddenSeq("Figure")
	}
	w.para("Figure", ppr, runs)
	if captioned {
		w.para("Caption", place, w.captionRuns("Figure", b))
	}
}

// gridCellPad is Normal Table's cell margin on each side, in twips.
const gridCellPad = 108

// pictureGrid writes a grid's pictures as a borderless table, Columns to a
// row, each picture as wide as its cell; the rows keep with what follows.
func (w *writer) pictureGrid(b *doc.Block) {
	cols := max(b.Columns, 1)
	avail := w.availW()
	width := avail
	if b.Width > 0 {
		width = int(float64(avail) * b.Width / 100)
	}
	colW := width / cols
	jc := "center"
	if b.Position != "" {
		jc = b.Position
	}
	// Word centers a table between the margins; in a list item or a quote,
	// it's placed by its indent instead.
	ind := ""
	if w.indent > 0 || w.right > 0 {
		at := w.indent
		switch jc {
		case "center":
			at += (avail - colW*cols) / 2
		case "right":
			at += avail - colW*cols
		}
		jc = "left"
		ind = fmt.Sprintf(`<w:tblInd w:w="%d" w:type="dxa"/>`, at)
	}
	fmt.Fprintf(w.out, `<w:tbl><w:tblPr><w:tblW w:w="%d" w:type="dxa"/><w:jc w:val="%s"/>%s<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>`, colW*cols, jc, ind)
	for range cols {
		fmt.Fprintf(w.out, `<w:gridCol w:w="%d"/>`, colW)
	}
	w.out.WriteString(`</w:tblGrid>`)
	picW := float64(max(colW-2*gridCellPad, 20)) / 20
	for row := 0; row < len(b.Pictures); row += cols {
		w.out.WriteString(`<w:tr><w:trPr><w:cantSplit/></w:trPr>`)
		for c := range cols {
			fmt.Fprintf(w.out, `<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>`, colW)
			runs := ""
			if i := row + c; i < len(b.Pictures) {
				pic := &b.Pictures[i]
				if pic.Src == "" {
					runs = w.run("[missing image: "+pic.Missing+"]", runProps{i: true})
				} else {
					alt := doc.PlainText(pic.Alt)
					if alt == "" {
						alt = doc.PlainText(b.Caption)
					}
					runs = w.picture(pic.Src, picW, alt)
				}
			}
			w.para("Figure", `<w:keepNext/><w:jc w:val="center"/>`, runs)
			w.out.WriteString("</w:tc>")
		}
		w.out.WriteString("</w:tr>")
	}
	w.out.WriteString("</w:tbl>")
}

// captionRuns is "Figure N: caption" (or "Table N: …"), with "Figure N"
// bookmarked when the block has a label, for REF fields to point at.
func (w *writer) captionRuns(kind string, b *doc.Block) string {
	var sb strings.Builder
	if b.Number > 0 {
		name := w.bookmarks[b.Label]
		if name != "" && !w.placed[b.Label] {
			w.placed[b.Label] = true // a label used twice marks only the first
			w.bookmarkID++
			fmt.Fprintf(&sb, `<w:bookmarkStart w:id="%d" w:name="%s"/>`, w.bookmarkID, name)
		} else {
			name = ""
		}
		sb.WriteString(w.run(kind+" ", runProps{}))
		w.seq(&sb, kind, b.Number)
		if name != "" {
			fmt.Fprintf(&sb, `<w:bookmarkEnd w:id="%d"/>`, w.bookmarkID)
		}
		if len(b.Caption) > 0 {
			sb.WriteString(w.run(": ", runProps{}))
		}
	}
	sb.WriteString(w.inlines(b.Caption, runProps{}))
	return sb.String()
}

// seq writes a figure's, table's or equation's number n as a SEQ field, or
// in a footnote as plain text: the note's mark counts it in the body (see
// footnote), where Word's numbering of the rest can see it.
func (w *writer) seq(sb *strings.Builder, kind string, n int) {
	if w.inNote {
		sb.WriteString(w.run(strconv.Itoa(n), runProps{}))
		return
	}
	w.field(sb, `SEQ `+kind+` \* ARABIC`, strconv.Itoa(n), runProps{})
}

// hiddenSeq counts a figure or table that has no caption without showing it
// (in a footnote, its mark counts it).
func (w *writer) hiddenSeq(kind string) string {
	if w.inNote {
		return ""
	}
	var sb strings.Builder
	w.field(&sb, `SEQ `+kind+` \* ARABIC \h`, "", runProps{})
	return sb.String()
}

// table writes the caption above, then the table across the width there is
// (indented in a list item or a quote) with its header row repeated on each
// page.
func (w *writer) table(b *doc.Block) {
	cols := len(b.Align)
	if cols == 0 {
		return
	}
	captioned := len(b.Caption) > 0 || b.Label != ""
	if captioned {
		w.para("Caption", "<w:keepNext/>"+w.ind("", 0), w.captionRuns("Table", b))
	}
	colW := w.availW() / cols
	ind := ""
	if w.indent > 0 {
		ind = fmt.Sprintf(`<w:tblInd w:w="%d" w:type="dxa"/>`, w.indent)
	}
	fmt.Fprintf(w.out, `<w:tbl><w:tblPr><w:tblStyle w:val="PeanutTable"/><w:tblW w:w="%d" w:type="dxa"/>%s`+
		`<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>`, colW*cols, ind)
	for range cols {
		fmt.Fprintf(w.out, `<w:gridCol w:w="%d"/>`, colW)
	}
	w.out.WriteString(`</w:tblGrid>`)
	row := func(cells [][]doc.Inline, header bool) {
		w.out.WriteString("<w:tr>")
		if header {
			w.out.WriteString(`<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>`)
		}
		for c := range cols {
			var cell []doc.Inline
			if c < len(cells) {
				cell = cells[c]
			}
			fmt.Fprintf(w.out, `<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>`, colW)
			p := runProps{}
			if header {
				p.b = true
				if fill := color(w.st.TableHeaderFill); fill != "" {
					fmt.Fprintf(w.out, `<w:shd w:val="clear" w:color="auto" w:fill="%s"/>`, fill)
				}
			}
			w.out.WriteString(`</w:tcPr>`)
			jc := "left"
			switch b.Align[c] {
			case "center", "right":
				jc = b.Align[c]
			}
			w.para("TableText", `<w:jc w:val="`+jc+`"/>`, w.inlines(cell, p))
			w.out.WriteString("</w:tc>")
		}
		w.out.WriteString("</w:tr>")
	}
	row(b.Header, true)
	for _, r := range b.Rows {
		row(r, false)
	}
	w.out.WriteString("</w:tbl>")
	// A little space under the table (which also keeps two tables apart).
	runs := ""
	if !captioned && b.Number > 0 {
		runs = w.hiddenSeq("Table")
	}
	w.para("", fmt.Sprintf(`<w:spacing w:before="0" w:after="0" w:line="%d" w:lineRule="exact"/><w:ind w:firstLine="0"/>`, twips(max(w.st.SpaceAfter, 6))), runs)
}

// toc writes a "Contents" heading and a TOC field that Word fills in.
func (w *writer) toc() {
	w.hasTOC = true
	w.para("TOCHeading", "", w.run("Contents", runProps{}))
	var sb strings.Builder
	w.field(&sb, `TOC \o "1-3" \h \z \u`, "Right-click and choose Update Field to build the table of contents.", runProps{})
	w.para("", `<w:ind w:firstLine="0"/>`, sb.String())
}

// collectBookmarks names a bookmark for each labelled figure, table and
// equation, the first one only when a label is used twice (as references
// resolve), and for each heading outside footnotes, for `#anchor` links to
// reach them by their label or id (doc.HeadingIDs).
func (w *writer) collectBookmarks(blocks []doc.Block) {
	w.bookmarks = map[string]string{}
	w.placed = map[string]bool{}
	w.anchors = map[string]string{}
	w.headings = map[*doc.Block]string{}
	used := map[string]bool{}
	ids := doc.HeadingIDs(blocks)
	var walk func([]doc.Block)
	walk = func(bs []doc.Block) {
		for i := range bs {
			b := &bs[i]
			if id := ids[b]; id != "" {
				w.headings[b] = bookmarkName(id, used)
				w.anchors[id] = w.headings[b]
			}
			if (b.Type == doc.BlockFigure || b.Type == doc.BlockTable || b.Type == doc.BlockEquation) && b.Label != "" && b.Number > 0 {
				if _, ok := w.bookmarks[b.Label]; !ok {
					w.bookmarks[b.Label] = bookmarkName(b.Label, used)
					w.anchors[b.Label] = w.bookmarks[b.Label]
				}
			}
			walk(b.Children)
			for _, item := range b.Items {
				walk(item)
			}
		}
	}
	walk(blocks)
}

// bookmarkName makes a hidden Word bookmark name for label: it starts with
// an underscore, holds only letters, digits and underscores, is at most 40
// characters, and isn't in used (case-insensitively).
func bookmarkName(label string, used map[string]bool) string {
	var b strings.Builder
	b.WriteString("_Ref")
	for _, r := range label {
		if r == '_' || r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	base := b.String()
	if len(base) > 40 {
		base = base[:40]
	}
	name := base
	for i := 2; used[strings.ToLower(name)]; i++ {
		suffix := strconv.Itoa(i)
		name = base[:min(len(base), 40-len(suffix))] + suffix
	}
	used[strings.ToLower(name)] = true
	return name
}
