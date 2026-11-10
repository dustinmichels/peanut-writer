package docx

import (
	"fmt"
	"strings"
)

// rpr is run properties for a style: font ("" to inherit), bold, italic,
// color ("" to inherit) and size in points (0 to inherit), in schema order.
func rpr(font string, bold, italic bool, col string, size float64) string {
	var b strings.Builder
	if font != "" {
		fmt.Fprintf(&b, `<w:rFonts w:ascii="%[1]s" w:hAnsi="%[1]s" w:cs="%[1]s"/>`, esc(font))
	}
	if bold {
		b.WriteString("<w:b/><w:bCs/>")
	}
	if italic {
		b.WriteString("<w:i/><w:iCs/>")
	}
	if c := color(col); c != "" {
		fmt.Fprintf(&b, `<w:color w:val="%s"/>`, c)
	}
	if size > 0 {
		fmt.Fprintf(&b, `<w:sz w:val="%[1]d"/><w:szCs w:val="%[1]d"/>`, half(size))
	}
	return b.String()
}

type styleDef struct {
	typ, id, name, basedOn, next string
	quick, hidden                bool // in the quick style gallery; hidden until used
	priority                     int
	ppr, rpr                     string
	extra                        string // tblPr, tcPr, tblStylePr…
}

func (s styleDef) xml(b *strings.Builder) {
	fmt.Fprintf(b, `<w:style w:type="%s" w:styleId="%s"><w:name w:val="%s"/>`, s.typ, s.id, s.name)
	if s.basedOn != "" {
		fmt.Fprintf(b, `<w:basedOn w:val="%s"/>`, s.basedOn)
	}
	if s.next != "" {
		fmt.Fprintf(b, `<w:next w:val="%s"/>`, s.next)
	}
	if s.priority > 0 {
		fmt.Fprintf(b, `<w:uiPriority w:val="%d"/>`, s.priority)
	}
	if s.hidden {
		b.WriteString(`<w:semiHidden/><w:unhideWhenUsed/>`)
	}
	if s.quick {
		b.WriteString(`<w:qFormat/>`)
	}
	if s.ppr != "" {
		b.WriteString(`<w:pPr>` + s.ppr + `</w:pPr>`)
	}
	if s.rpr != "" {
		b.WriteString(`<w:rPr>` + s.rpr + `</w:rPr>`)
	}
	b.WriteString(s.extra)
	b.WriteString(`</w:style>`)
}

// headingSize is the font size of a heading level (1–6).
func (w *writer) headingSize(level int) float64 {
	hs := w.st.HeadingSizes
	if len(hs) == 0 {
		hs = []float64{w.st.FontSize * 1.6, w.st.FontSize * 1.3, w.st.FontSize * 1.1}
	}
	if s := hs[min(level, len(hs))-1]; s > 0 {
		return s
	}
	return w.st.FontSize
}

func (w *writer) styles() string {
	st := w.st
	var b strings.Builder
	b.WriteString(xmlHeader + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`)
	fmt.Fprintf(&b, `<w:docDefaults><w:rPrDefault><w:rPr>%s<w:lang w:val="en-US"/></w:rPr></w:rPrDefault>`+
		`<w:pPrDefault><w:pPr><w:spacing w:after="%d" w:line="%d" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`,
		rpr(st.BodyFont, false, false, st.TextColor, st.FontSize), twips(st.SpaceAfter), int(240*st.LineSpacing+0.5))

	noIndent := `<w:ind w:firstLine="0"/>`
	titleJc := "left"
	switch st.TitleAlign {
	case "center", "right":
		titleJc = st.TitleAlign
	}
	jc := func(v string) string { return `<w:jc w:val="` + v + `"/>` }
	spacing := func(before, after float64) string {
		return fmt.Sprintf(`<w:spacing w:before="%d" w:after="%d"/>`, twips(before), twips(after))
	}
	captionAfter := max(st.SpaceAfter, 6)
	accent := colorOr(st.AccentColor, "auto")

	normal := ""
	if st.FirstLineIndent > 0 {
		normal += fmt.Sprintf(`<w:ind w:firstLine="%d"/>`, int(st.FirstLineIndent*1440+0.5))
	}
	if st.Justify {
		normal += jc("both")
	}
	b.WriteString(`<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>`)
	if normal != "" {
		b.WriteString(`<w:pPr>` + normal + `</w:pPr>`)
	}
	// The body font is repeated here: some readers (macOS's) skip docDefaults.
	b.WriteString(`<w:rPr>` + rpr(st.BodyFont, false, false, st.TextColor, st.FontSize) + `</w:rPr>`)
	b.WriteString(`</w:style>`)
	b.WriteString(`<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>`)
	b.WriteString(`<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>` +
		`<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`)
	b.WriteString(`<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>`)

	defs := []styleDef{
		{typ: "paragraph", id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quick: true, priority: 10,
			ppr: spacing(0, 6) + noIndent + jc(titleJc),
			rpr: rpr(st.HeadingFont, st.HeadingBold, false, st.TitleColor, st.TitleSize)},
		{typ: "paragraph", id: "Subtitle", name: "Subtitle", basedOn: "Normal", next: "Normal", quick: true, priority: 11,
			ppr: spacing(0, 6) + noIndent + jc(titleJc),
			rpr: rpr(st.HeadingFont, false, false, st.TitleColor, max(st.FontSize*1.3, st.TitleSize*0.55))},
		{typ: "paragraph", id: "Author", name: "Author", basedOn: "Normal", next: "Normal", quick: true,
			ppr: spacing(4, 2) + noIndent + jc(titleJc), rpr: rpr("", false, false, "", st.FontSize*1.15)},
		{typ: "paragraph", id: "Date", name: "Date", basedOn: "Normal", next: "Normal", quick: true,
			ppr: spacing(0, 2) + noIndent + jc(titleJc), rpr: rpr("", false, false, "", st.FontSize*1.05)},
		{typ: "paragraph", id: "AbstractTitle", name: "Abstract Title", basedOn: "Normal", next: "Abstract", quick: true,
			ppr: `<w:keepNext/>` + spacing(12, 4) + noIndent + jc("center"), rpr: rpr("", true, false, "", 0)},
		{typ: "paragraph", id: "Abstract", name: "Abstract", basedOn: "Normal", next: "Normal", quick: true,
			ppr: `<w:ind w:left="720" w:right="720" w:firstLine="0"/>`, rpr: rpr("", false, false, "", st.FontSize*0.95)},
	}
	for level := 1; level <= 6; level++ {
		size := w.headingSize(level)
		numPr := ""
		if st.NumberedHeadings && level <= 3 {
			numPr = fmt.Sprintf(`<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>`, level-1, numHeadings)
		}
		defs = append(defs, styleDef{typ: "paragraph", id: fmt.Sprintf("Heading%d", level), name: fmt.Sprintf("heading %d", level),
			basedOn: "Normal", next: "Normal", quick: true, priority: 9,
			ppr: `<w:keepNext/><w:keepLines/>` + numPr + spacing(size*0.9, max(size*0.3, 3)) +
				`<w:ind w:left="0" w:firstLine="0"/>` + jc("left") + fmt.Sprintf(`<w:outlineLvl w:val="%d"/>`, level-1),
			rpr: rpr(st.HeadingFont, st.HeadingBold, level >= 4 && !st.HeadingBold, st.HeadingColor, size)})
	}
	defs = append(defs,
		styleDef{typ: "paragraph", id: "Caption", name: "caption", basedOn: "Normal", next: "Normal", quick: true, priority: 35,
			ppr: spacing(4, captionAfter) + noIndent + jc("center"),
			rpr: rpr("", false, st.CaptionItalic, st.CaptionColor, st.CaptionSize)},
		styleDef{typ: "paragraph", id: "Figure", name: "Figure", basedOn: "Normal", next: "Caption", quick: true,
			ppr: spacing(6, 4) + noIndent + jc("center")},
		styleDef{typ: "paragraph", id: "Quote", name: "Quote", basedOn: "Normal", next: "Normal", quick: true, priority: 29,
			ppr: `<w:ind w:left="720" w:right="720" w:firstLine="0"/>`,
			rpr: rpr("", false, true, "", 0)},
		styleDef{typ: "paragraph", id: "SourceCode", name: "Source Code", basedOn: "Normal", quick: true,
			ppr: `<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>` +
				`<w:ind w:left="115" w:right="115" w:firstLine="0"/>` + jc("left"),
			rpr: rpr(st.MonoFont, false, false, "", st.FontSize*0.85)},
		styleDef{typ: "character", id: "VerbatimChar", name: "Verbatim Char", basedOn: "DefaultParagraphFont", quick: true,
			rpr: rpr(st.MonoFont, false, false, "", 0)},
		styleDef{typ: "paragraph", id: "ListParagraph", name: "List Paragraph", basedOn: "Normal", quick: true, priority: 34,
			ppr: `<w:ind w:left="720" w:firstLine="0"/><w:contextualSpacing/>`},
		styleDef{typ: "paragraph", id: "TableText", name: "Table Text", basedOn: "Normal", quick: true,
			ppr: `<w:spacing w:before="0" w:after="0"/>` + noIndent + jc("left")},
		styleDef{typ: "paragraph", id: "TOCHeading", name: "TOC Heading", basedOn: "Normal", next: "Normal", quick: true, priority: 39, hidden: true,
			ppr: `<w:keepNext/><w:keepLines/>` + spacing(w.headingSize(1)*0.9, 6) + noIndent + jc("left") + `<w:outlineLvl w:val="9"/>`,
			rpr: rpr(st.HeadingFont, st.HeadingBold, false, st.HeadingColor, w.headingSize(1))},
	)
	for level := 1; level <= 3; level++ {
		defs = append(defs, styleDef{typ: "paragraph", id: fmt.Sprintf("TOC%d", level), name: fmt.Sprintf("toc %d", level),
			basedOn: "Normal", next: "Normal", priority: 39, hidden: true,
			ppr: `<w:spacing w:after="100"/>` + fmt.Sprintf(`<w:ind w:left="%d" w:firstLine="0"/>`, 220*(level-1)) + jc("left")})
	}
	defs = append(defs,
		styleDef{typ: "paragraph", id: "FootnoteText", name: "footnote text", basedOn: "Normal", priority: 99, hidden: true,
			ppr: `<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>` + noIndent,
			rpr: rpr("", false, false, "", st.FontSize*0.85)},
		styleDef{typ: "character", id: "FootnoteReference", name: "footnote reference", basedOn: "DefaultParagraphFont", priority: 99, hidden: true,
			rpr: `<w:vertAlign w:val="superscript"/>`},
		styleDef{typ: "character", id: "Hyperlink", name: "Hyperlink", basedOn: "DefaultParagraphFont", priority: 99, hidden: true,
			rpr: `<w:color w:val="0563C1"/><w:u w:val="single"/>`},
		styleDef{typ: "paragraph", id: "Footer", name: "footer", basedOn: "Normal", priority: 99, hidden: true,
			ppr: `<w:spacing w:after="0"/>` + noIndent + jc("center"),
			rpr: rpr("", false, false, "", st.FontSize*0.9)},
	)
	headerFill := ""
	if fill := color(st.TableHeaderFill); fill != "" {
		headerFill = `<w:shd w:val="clear" w:color="auto" w:fill="` + fill + `"/>`
	}
	defs = append(defs, styleDef{typ: "table", id: "PeanutTable", name: "Peanut Table", basedOn: "TableNormal", quick: true, priority: 59,
		ppr: `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>` + noIndent,
		extra: `<w:tblPr><w:tblBorders>` +
			`<w:top w:val="single" w:sz="8" w:space="0" w:color="` + accent + `"/>` +
			`<w:bottom w:val="single" w:sz="8" w:space="0" w:color="` + accent + `"/>` +
			`<w:insideH w:val="single" w:sz="4" w:space="0" w:color="` + accent + `"/>` +
			`</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
			`<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/></w:rPr><w:tcPr><w:tcBorders>` +
			`<w:bottom w:val="single" w:sz="8" w:space="0" w:color="` + accent + `"/></w:tcBorders>` + headerFill + `</w:tcPr></w:tblStylePr>`})

	for _, d := range defs {
		d.xml(&b)
	}
	b.WriteString(`</w:styles>`)
	return b.String()
}

// numbering is numbering.xml: bullets, numbers (one instance per ordered
// list, so each starts at its own number) and heading numbers.
func (w *writer) numbering() string {
	var b strings.Builder
	b.WriteString(xmlHeader + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`)
	bullets := []string{"•", "◦", "▪"}
	b.WriteString(`<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>`)
	for l := range 9 {
		fmt.Fprintf(&b, `<w:lvl w:ilvl="%d"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="%s"/><w:lvlJc w:val="left"/>`+
			`<w:pPr><w:ind w:left="%d" w:hanging="360"/></w:pPr></w:lvl>`, l, bullets[l%len(bullets)], listIndent(l))
	}
	b.WriteString(`</w:abstractNum>`)
	if w.st.NumberedHeadings {
		b.WriteString(`<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>`)
		text := ""
		for l := range 3 {
			if l > 0 {
				text += "."
			}
			text += fmt.Sprintf("%%%d", l+1)
			fmt.Fprintf(&b, `<w:lvl w:ilvl="%d"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:pStyle w:val="Heading%d"/><w:suff w:val="tab"/>`+
				`<w:lvlText w:val="%s"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="0" w:firstLine="0"/></w:pPr></w:lvl>`, l, l+1, text)
		}
		b.WriteString(`</w:abstractNum>`)
	}
	// Each ordered list has its own definition starting at its first
	// number (readers other than Word ignore startOverride) as well as the
	// override Word goes by.
	for i, o := range w.ordered {
		fmt.Fprintf(&b, `<w:abstractNum w:abstractNumId="%d"><w:multiLevelType w:val="hybridMultilevel"/>`, w.orderedNum(i)-1)
		for l := range 9 {
			start := 1
			if l == o.level {
				start = o.start
			}
			fmt.Fprintf(&b, `<w:lvl w:ilvl="%d"><w:start w:val="%d"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%%%d."/><w:lvlJc w:val="left"/>`+
				`<w:pPr><w:ind w:left="%d" w:hanging="360"/></w:pPr></w:lvl>`, l, start, l+1, listIndent(l))
		}
		b.WriteString(`</w:abstractNum>`)
	}
	fmt.Fprintf(&b, `<w:num w:numId="%d"><w:abstractNumId w:val="0"/></w:num>`, numBullets)
	if w.st.NumberedHeadings {
		fmt.Fprintf(&b, `<w:num w:numId="%d"><w:abstractNumId w:val="1"/></w:num>`, numHeadings)
	}
	for i, o := range w.ordered {
		n := w.orderedNum(i)
		fmt.Fprintf(&b, `<w:num w:numId="%d"><w:abstractNumId w:val="%d"/><w:lvlOverride w:ilvl="%d"><w:startOverride w:val="%d"/></w:lvlOverride></w:num>`,
			n, n-1, o.level, o.start)
	}
	b.WriteString(`</w:numbering>`)
	return b.String()
}
