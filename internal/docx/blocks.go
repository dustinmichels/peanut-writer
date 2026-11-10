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

// titleBlock writes the front matter's title, subtitle, author, date and
// abstract, each only when given.
func (w *writer) titleBlock(m doc.Meta) {
	type line struct{ style, text string }
	var lines []line
	for _, l := range []line{{"Title", m.Title}, {"Subtitle", m.Subtitle}, {"Author", m.Author}, {"Date", m.Date}} {
		if strings.TrimSpace(l.text) != "" {
			lines = append(lines, l)
		}
	}
	if strings.TrimSpace(m.Abstract) != "" {
		lines = append(lines, line{"AbstractTitle", "Abstract"})
		for _, p := range strings.Split(m.Abstract, "\n") {
			if p = strings.TrimSpace(p); p != "" {
				lines = append(lines, line{"Abstract", p})
			}
		}
	}
	for i, l := range lines {
		ppr := ""
		if i == len(lines)-1 {
			// A gap between the title block and the text.
			ppr = fmt.Sprintf(`<w:spacing w:after="%d"/>`, twips(max(w.st.SpaceAfter*2, 18)))
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
		w.para(w.paraStyle, "", w.inlines(b.Inlines, runProps{}))
	case doc.BlockHeading:
		if w.inNote {
			// A heading in a footnote stays out of the outline and the TOC.
			w.para(w.paraStyle, "", w.inlines(b.Inlines, runProps{b: true}))
			return
		}
		w.para(fmt.Sprintf("Heading%d", min(max(b.Level, 1), 6)), "", w.inlines(b.Inlines, runProps{}))
	case doc.BlockList:
		w.list(b, 0)
	case doc.BlockQuote:
		saved := w.paraStyle
		w.paraStyle = "Quote"
		w.blocks(b.Children)
		w.paraStyle = saved
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
			w.para("SourceCode", ppr, w.run(line, runProps{}))
		}
	case doc.BlockFigure:
		w.figure(b)
	case doc.BlockTable:
		w.table(b)
	case doc.BlockRule:
		w.para("", fmt.Sprintf(`<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="%s"/></w:pBdr><w:ind w:firstLine="0"/>`, colorOr(w.st.AccentColor, "auto")), "")
	case doc.BlockPageBreak:
		w.para("", "", `<w:r><w:br w:type="page"/></w:r>`)
	case doc.BlockTOC:
		w.toc()
	}
}

// list writes a list's items at level depth; nested lists go one deeper.
// Each ordered list has its own numbering instance, so it starts at Start.
func (w *writer) list(b *doc.Block, depth int) {
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
	numPr := fmt.Sprintf(`<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>`, depth, num)
	cont := fmt.Sprintf(`<w:ind w:left="%d" w:firstLine="0"/>`, listIndent(depth)) + loose
	for _, item := range b.Items {
		rest := item
		if len(item) > 0 && item[0].Type == doc.BlockParagraph {
			w.para("ListParagraph", numPr+loose, w.inlines(item[0].Inlines, runProps{}))
			rest = item[1:]
		} else {
			w.para("ListParagraph", numPr+loose, "")
		}
		for i := range rest {
			c := &rest[i]
			switch c.Type {
			case doc.BlockList:
				w.list(c, depth+1)
			case doc.BlockParagraph:
				w.para("ListParagraph", cont, w.inlines(c.Inlines, runProps{}))
			default:
				w.block(c)
			}
		}
	}
}

// listIndent is where a list level's text starts, in twips.
func listIndent(level int) int { return 720 * (level + 1) }

// figure writes the picture, centered, then its caption.
func (w *writer) figure(b *doc.Block) {
	var runs string
	if b.Src == "" {
		runs = w.run("[missing image: "+b.Missing+"]", runProps{i: true})
	} else {
		want := 0.0
		if b.Width > 0 {
			want = b.Width / 100 * w.textWidthPt()
		}
		runs = w.picture(b.Src, want, plainText(b.Caption))
	}
	captioned := len(b.Caption) > 0 || b.Label != ""
	ppr := ""
	if captioned {
		ppr = "<w:keepNext/>"
	} else if b.Number > 0 {
		// Keep Word's count of figures in step with the numbering.
		runs += w.hiddenSeq("Figure")
	}
	w.para("Figure", ppr, runs)
	if captioned {
		w.para("Caption", "", w.captionRuns("Figure", b))
	}
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
		w.field(&sb, `SEQ `+kind+` \* ARABIC`, strconv.Itoa(b.Number), runProps{})
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

// hiddenSeq counts a figure or table that has no caption without showing it.
func (w *writer) hiddenSeq(kind string) string {
	var sb strings.Builder
	w.field(&sb, `SEQ `+kind+` \* ARABIC \h`, "", runProps{})
	return sb.String()
}

// table writes the caption above, then the table across the text width
// with its header row repeated on each page.
func (w *writer) table(b *doc.Block) {
	cols := len(b.Align)
	if cols == 0 {
		return
	}
	captioned := len(b.Caption) > 0 || b.Label != ""
	if captioned {
		w.para("Caption", "<w:keepNext/>", w.captionRuns("Table", b))
	}
	colW := w.textW / cols
	fmt.Fprintf(w.out, `<w:tbl><w:tblPr><w:tblStyle w:val="PeanutTable"/><w:tblW w:w="%d" w:type="dxa"/>`+
		`<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>`, colW*cols)
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

// collectBookmarks names a bookmark for each labelled figure and table, the
// first one only when a label is used twice (as references resolve).
func (w *writer) collectBookmarks(blocks []doc.Block) {
	w.bookmarks = map[string]string{}
	w.placed = map[string]bool{}
	used := map[string]bool{}
	var walk func([]doc.Block)
	walk = func(bs []doc.Block) {
		for i := range bs {
			b := &bs[i]
			if (b.Type == doc.BlockFigure || b.Type == doc.BlockTable) && b.Label != "" && b.Number > 0 {
				if _, ok := w.bookmarks[b.Label]; !ok {
					w.bookmarks[b.Label] = bookmarkName(b.Label, used)
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
