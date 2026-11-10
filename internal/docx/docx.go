// Package docx writes a document as a Word (.docx) file, styled from a
// template's DocxStyle with real Word styles (Normal, Heading 1, Caption, …)
// so the result can be restyled in Word. Figures and tables are numbered
// with SEQ fields and cross-referenced with REF fields to bookmarks, so the
// numbers stay right when the document is edited in Word.
package docx

import (
	"archive/zip"
	"bytes"
	"fmt"
	"math"
	"strings"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

// Options are what the writer needs from outside.
type Options struct {
	// Rasterize turns an image Word can't show natively (anything but PNG,
	// JPEG, GIF: e.g. SVG, WebP) into PNG bytes, drawn widthPt points wide.
	// nil, or an error → write a short italic placeholder
	// "[image: <file name>]" instead.
	Rasterize func(path string, widthPt float64) ([]byte, error)
}

// Write renders d as a .docx file in style st.
func Write(d *doc.Document, st templates.DocxStyle, opt Options) ([]byte, error) {
	w := newWriter(st, opt)
	w.collectBookmarks(d.Blocks)
	var body strings.Builder
	w.out = &body
	w.titleBlock(d.Meta)
	w.blocks(d.Blocks)
	if body.Len() == 0 {
		body.WriteString("<w:p/>")
	}
	return w.pack(d.Meta, body.String())
}

// Relationship types.
const (
	relBase      = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
	relStyles    = relBase + "styles"
	relNumbering = relBase + "numbering"
	relSettings  = relBase + "settings"
	relFootnotes = relBase + "footnotes"
	relFooter    = relBase + "footer"
	relImage     = relBase + "image"
	relHyperlink = relBase + "hyperlink"
)

// Numbering instances: bullets share one, numbered headings (when the
// style has them) another, then each ordered list gets its own. Ids are
// contiguous, and each instance's definition (abstractNum) is its id - 1:
// some readers find them by position.
const (
	numBullets  = 1
	numHeadings = 2
)

// orderedNum is the numbering id of the i'th ordered list.
func (w *writer) orderedNum(i int) int {
	if w.st.NumberedHeadings {
		return numHeadings + 1 + i
	}
	return numBullets + 1 + i
}

type writer struct {
	st  templates.DocxStyle
	opt Options

	pageW, pageH, margin, textW int // twips

	out  *strings.Builder // where paragraphs go
	part *part            // relationships of the part being written

	docRels, noteRels part

	media   []mediaFile
	pics    map[string]pic  // image cache, by path (and raster width)
	foreign map[string]bool // paths that aren't PNG, JPEG or GIF
	drawing int             // last drawing id

	bookmarks  map[string]string // figure/table label → bookmark name
	placed     map[string]bool   // labels whose bookmark is written
	bookmarkID int

	notes  []string // footnote parts, in order
	inNote bool
	prefix string // runs that start the next paragraph (a footnote's mark)

	paraStyle string        // style of body paragraphs here: "" (Normal), Quote, FootnoteText
	ordered   []orderedList // ordered list numbering instances
	hasTOC    bool
}

type part struct {
	rels []rel
	ids  map[string]string // type + target → id
	next int
}

type rel struct {
	id, typ, target string
	external        bool
}

// add returns the id of a relationship to target, adding it if new.
func (p *part) add(typ, target string, external bool) string {
	key := typ + " " + target
	if id, ok := p.ids[key]; ok {
		return id
	}
	if p.ids == nil {
		p.ids = map[string]string{}
	}
	p.next++
	id := fmt.Sprintf("rId%d", p.next)
	p.ids[key] = id
	p.rels = append(p.rels, rel{id, typ, target, external})
	return id
}

type mediaFile struct {
	name string // in word/media
	data []byte
}

type orderedList struct{ level, start int }

func newWriter(st templates.DocxStyle, opt Options) *writer {
	if st.FontSize <= 0 {
		st.FontSize = 11
	}
	if st.LineSpacing <= 0 {
		st.LineSpacing = 1
	}
	if st.Margin <= 0 {
		st.Margin = 1
	}
	if st.TitleSize <= 0 {
		st.TitleSize = st.FontSize * 2.5
	}
	if st.CaptionSize <= 0 {
		st.CaptionSize = st.FontSize * 0.9
	}
	if st.MonoFont == "" {
		st.MonoFont = "Menlo"
	}
	w := &writer{st: st, opt: opt, pics: map[string]pic{}, foreign: map[string]bool{}}
	w.pageW, w.pageH = 12240, 15840
	if strings.EqualFold(st.Paper, "a4") {
		w.pageW, w.pageH = 11906, 16838
	}
	w.margin = int(math.Round(st.Margin * 1440))
	w.textW = max(w.pageW-2*w.margin, 1440)
	// The document part's fixed relationships come first: styles,
	// numbering, settings, footnotes, footer.
	w.docRels.next = 5
	w.part = &w.docRels
	return w
}

// twips converts points to twentieths of a point.
func twips(pt float64) int { return int(math.Round(pt * 20)) }

// half converts points to half-points, the unit of font sizes.
func half(pt float64) int { return int(math.Round(pt * 2)) }

// emu converts points to English Metric Units, the unit of drawings.
func emu(pt float64) int64 { return int64(math.Round(pt * 12700)) }

func (w *writer) textWidthPt() float64 { return float64(w.textW) / 20 }

func (w *writer) textHeightPt() float64 { return float64(w.pageH-2*w.margin) / 20 }

// pack zips the parts.
func (w *writer) pack(m doc.Meta, body string) ([]byte, error) {
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	add := func(name string, data []byte) error {
		f, err := z.Create(name)
		if err == nil {
			_, err = f.Write(data)
		}
		return err
	}
	fixed := []rel{
		{"rId1", relStyles, "styles.xml", false},
		{"rId2", relNumbering, "numbering.xml", false},
		{"rId3", relSettings, "settings.xml", false},
		{"rId4", relFootnotes, "footnotes.xml", false},
	}
	if w.st.PageNumbers {
		fixed = append(fixed, rel{"rId5", relFooter, "footer1.xml", false})
	}
	parts := []struct{ name, body string }{
		{"[Content_Types].xml", w.contentTypes()},
		{"_rels/.rels", packageRels},
		{"docProps/core.xml", fmt.Sprintf(coreXML, esc(m.Title), esc(m.Author))},
		{"word/_rels/document.xml.rels", relsXML(append(fixed, w.docRels.rels...))},
		{"word/document.xml", w.document(body)},
		{"word/styles.xml", w.styles()},
		{"word/numbering.xml", w.numbering()},
		{"word/settings.xml", w.settings()},
		{"word/footnotes.xml", xmlHeader + `<w:footnotes ` + namespaces + `>` + footnoteSeparators + strings.Join(w.notes, "") + `</w:footnotes>`},
	}
	if len(w.noteRels.rels) > 0 {
		parts = append(parts, struct{ name, body string }{"word/_rels/footnotes.xml.rels", relsXML(w.noteRels.rels)})
	}
	if w.st.PageNumbers {
		parts = append(parts, struct{ name, body string }{"word/footer1.xml", w.footer()})
	}
	for _, p := range parts {
		if err := add(p.name, []byte(p.body)); err != nil {
			return nil, err
		}
	}
	for _, f := range w.media {
		if err := add("word/media/"+f.name, f.data); err != nil {
			return nil, err
		}
	}
	if err := z.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (w *writer) contentTypes() string {
	var b strings.Builder
	b.WriteString(xmlHeader + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
		`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
		`<Default Extension="xml" ContentType="application/xml"/>` +
		`<Default Extension="png" ContentType="image/png"/>` +
		`<Default Extension="jpeg" ContentType="image/jpeg"/>` +
		`<Default Extension="gif" ContentType="image/gif"/>` +
		`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
		`<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
		`<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
		`<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
		`<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>`)
	if w.st.PageNumbers {
		b.WriteString(`<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`)
	}
	b.WriteString(`<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`)
	return b.String()
}

func relsXML(rels []rel) string {
	var b strings.Builder
	b.WriteString(xmlHeader + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for _, r := range rels {
		mode := ""
		if r.external {
			mode = ` TargetMode="External"`
		}
		fmt.Fprintf(&b, `<Relationship Id="%s" Type="%s" Target="%s"%s/>`, r.id, r.typ, esc(r.target), mode)
	}
	b.WriteString(`</Relationships>`)
	return b.String()
}

func (w *writer) document(body string) string {
	footer := ""
	if w.st.PageNumbers {
		footer = `<w:footerReference w:type="default" r:id="rId5"/>`
	}
	edge := min(720, w.margin/2)
	return fmt.Sprintf(`%s<w:document %s><w:body>%s<w:sectPr>%s<w:pgSz w:w="%d" w:h="%d"/>`+
		`<w:pgMar w:top="%[7]d" w:right="%[7]d" w:bottom="%[7]d" w:left="%[7]d" w:header="%[8]d" w:footer="%[8]d" w:gutter="0"/>`+
		`<w:cols w:space="720"/></w:sectPr></w:body></w:document>`,
		xmlHeader, namespaces, body, footer, w.pageW, w.pageH, w.margin, edge)
}

func (w *writer) footer() string {
	var b strings.Builder
	b.WriteString(xmlHeader + `<w:ftr ` + namespaces + `><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>`)
	w.field(&b, "PAGE", "1", runProps{})
	b.WriteString(`</w:p></w:ftr>`)
	return b.String()
}

func (w *writer) settings() string {
	update := ""
	if w.hasTOC {
		update = `<w:updateFields w:val="true"/>`
	}
	return xmlHeader + `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
		`<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>` +
		update +
		`<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>` +
		`<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
		`</w:settings>`
}

const xmlHeader = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n"

const namespaces = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
	`xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
	`xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
	`xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
	`xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`

const packageRels = xmlHeader + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
	`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
	`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
	`</Relationships>`

const coreXML = xmlHeader + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
	`xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
	`xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>%s</dc:title><dc:creator>%s</dc:creator></cp:coreProperties>`

const footnoteSeparators = `<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>` +
	`<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`
