// Package doc turns Peanut Writer's Markdown dialect into a document model
// that both outputs (Typst for PDF, and Word) are written from.
//
// The dialect is CommonMark + GFM tables and strikethrough + footnotes, with:
//
//   - YAML-style front matter (flat `key: value` lines): title, subtitle,
//     author, topic, date, header, abstract, template, and hide: the fields
//     kept out of the output, comma-separated (`hide: subtitle, date`).
//   - Figures: a paragraph holding only an image, optionally followed by an
//     attribute block: `![Caption](images/a.png){#fig:a width=60% align=left}`.
//   - Picture grids: a paragraph of two or more images (one per line, or
//     several to a line) whose last line is a shared caption starting
//     `Figure:`, with an optional attribute block:
//     `Figure: Two peanuts {#fig:p columns=2 width=80%}`. Each image's own
//     text is its description (alt text).
//   - Table captions: a paragraph right after a table, starting `Table:`, with
//     an optional attribute block: `Table: Sales by year {#tbl:sales}`.
//   - Cross-references: `@fig:a`, `@tbl:sales`, `@eq:e`. Numbers follow
//     document order.
//   - Citations: `[@smith2020]`, `[@smith2020, p. 4]`, `[@a; @b]`, of
//     sources in the document's BibLaTeX file (see UseBibliography), in the
//     style front matter names (`citation-style: ieee`). The reference list
//     goes where a `[References]` line stands, or at the end.
//   - LaTeX math: `$x^2$` in text (`$$…$$` for display math in text), and
//     equations: a block from a line starting `$$` to one ending `$$`,
//     optionally followed by `{#eq:name}`, which numbers it.
//   - `[TOC]` (table of contents) and `\pagebreak` on a line of their own.
package doc

import (
	"strconv"
	"strings"
	"unicode"
)

// Document is a parsed document.
type Document struct {
	Meta   Meta    `json:"meta"`
	Blocks []Block `json:"blocks"`
	// Warnings are problems the writer should hear about (an unknown
	// reference, a missing image); the document still renders.
	Warnings []string `json:"warnings,omitempty"`
	// Dir is the folder relative paths (pictures, links to files) are
	// relative to: the document's own; "" when it has none.
	Dir string `json:"-"`
	// Bibliography is the BibLaTeX file the citations are of, "" when no
	// citation is of a source it has (see UseBibliography).
	Bibliography string `json:"-"`
}

// Meta is the front matter.
type Meta struct {
	Title    string `json:"title,omitempty"`
	Subtitle string `json:"subtitle,omitempty"`
	Author   string `json:"author,omitempty"`
	// Topic is what the document is about (a course, a project, an
	// assignment); templates show it beside the author and date.
	Topic string `json:"topic,omitempty"`
	Date  string `json:"date,omitempty"`
	// Header is the running text of each page: a class, team, project or
	// company. Templates show it in the page header or footer.
	Header   string `json:"header,omitempty"`
	Abstract string `json:"abstract,omitempty"`
	Template string `json:"template,omitempty"`
	// CitationStyle is the style citations are written in, as front matter
	// names it (`citation-style`); see UseBibliography.
	CitationStyle string `json:"-"`
	// Hide names the fields above (lowercase) kept out of the output; see
	// Shown.
	Hide []string `json:"-"`
}

// Shown is m as the output shows it: the fields named in Hide blank.
func (m Meta) Shown() Meta {
	for _, k := range m.Hide {
		switch k {
		case "title":
			m.Title = ""
		case "subtitle":
			m.Subtitle = ""
		case "author":
			m.Author = ""
		case "topic":
			m.Topic = ""
		case "date":
			m.Date = ""
		case "header":
			m.Header = ""
		case "abstract":
			m.Abstract = ""
		}
	}
	m.Hide = nil
	return m
}

// Block types.
const (
	BlockParagraph = "paragraph"
	BlockHeading   = "heading"
	BlockList      = "list"
	BlockQuote     = "quote"
	BlockCode      = "codeblock" // distinct from InlineCode: the renderer switches on Type alone
	BlockFigure    = "figure"
	BlockTable     = "table"
	BlockRule      = "rule"
	BlockPageBreak = "pagebreak"
	BlockTOC       = "toc"
	BlockEquation  = "equation"
	// The reference list: Text is the citation style, "" when nothing cited
	// is known (then it shows nothing).
	BlockBibliography = "bibliography"
)

// Block is a block-level element. Which fields are set depends on Type.
type Block struct {
	Type string `json:"type"`

	// paragraph, heading: the text. figure, table: the caption.
	Inlines []Inline `json:"inlines,omitempty"`
	Caption []Inline `json:"caption,omitempty"`

	// heading: 1–6.
	Level int `json:"level,omitempty"`
	// The 1-based source line the block starts on (0 when unknown). The
	// preview marks blocks with it to map pages back to the source.
	Line int `json:"line,omitempty"`

	// list.
	Ordered bool      `json:"ordered,omitempty"`
	Start   int       `json:"start,omitempty"` // first number of an ordered list
	Tight   bool      `json:"tight,omitempty"` // no blank lines between items
	Items   [][]Block `json:"items,omitempty"`

	// quote: its blocks. bibliography: its entries, one paragraph each, as
	// the style writes them (see render.Citations).
	Children []Block `json:"children,omitempty"`

	// code: the text, with its language ("" when not given). equation: the
	// LaTeX source.
	Lang string `json:"lang,omitempty"`
	Text string `json:"text,omitempty"`

	// equation: why the LaTeX can't be read ("" when it can); it's then
	// shown as source.
	Error string `json:"error,omitempty"`

	// figure: the image's absolute path, "" when it can't be shown (then
	// Missing names what was asked for). Width is a percentage of the text
	// width; 0 means the image's natural size, shrunk to fit (a grid: the
	// full text width). Position is "left" or "right"; "" means centered.
	Src      string  `json:"src,omitempty"`
	Missing  string  `json:"missing,omitempty"`
	Width    float64 `json:"width,omitempty"`
	Position string  `json:"position,omitempty"`

	// figure with two or more pictures (a grid sharing the caption): the
	// pictures in reading order, Columns to a row; Src and Missing are
	// unused.
	Pictures []Picture `json:"pictures,omitempty"`
	Columns  int       `json:"columns,omitempty"`

	// table: Align per column ("left", "center", "right" or ""), the header
	// row and the body rows; each cell is a run of inlines.
	Align  []string     `json:"align,omitempty"`
	Header [][]Inline   `json:"header,omitempty"`
	Rows   [][][]Inline `json:"rows,omitempty"`

	// figure, table, equation: the label (`fig:a`, `tbl:b`, `eq:c`; "" for
	// none) and the number, counted separately for figures, tables and
	// equations in document order. Only labelled equations are numbered.
	Label  string `json:"label,omitempty"`
	Number int    `json:"number,omitempty"`
}

// Picture is one picture in a grid.
type Picture struct {
	// The absolute path, "" when it can't be shown (then Missing names what
	// was asked for).
	Src     string `json:"src,omitempty"`
	Missing string `json:"missing,omitempty"`
	// The image's own text, a description for screen readers.
	Alt []Inline `json:"alt,omitempty"`
}

// Inline types.
const (
	InlineText      = "text"
	InlineStrong    = "strong"
	InlineEmph      = "emph"
	InlineStrike    = "strike"
	InlineHighlight = "highlight"
	InlineCode      = "code"
	InlineLink      = "link"
	InlineImage     = "image"
	InlineRef       = "ref"
	InlineFootnote  = "footnote"
	InlineLineBreak = "linebreak"
	InlineMath      = "math"
	InlineCite      = "cite"
)

// Inline is an inline element. Which fields are set depends on Type.
type Inline struct {
	Type string `json:"type"`

	// text, code: the text. math: the LaTeX source.
	Text string `json:"text,omitempty"`

	// math: display math (`$$…$$`) rather than math in the line; and why
	// the LaTeX can't be read ("" when it can).
	Display bool   `json:"display,omitempty"`
	Error   string `json:"error,omitempty"`

	// strong, emph, strike, highlight, link, cite: the content.
	Children []Inline `json:"children,omitempty"`

	// link: the target. image: the absolute path ("" when missing).
	URL string `json:"url,omitempty"`
	Src string `json:"src,omitempty"`

	// ref: the label referred to, what it is ("figure", "table" or
	// "equation") and its number. Kind is "" when nothing numbered has the
	// label.
	Label  string `json:"label,omitempty"`
	Kind   string `json:"kind,omitempty"`
	Number int    `json:"number,omitempty"`

	// footnote: the note's content.
	Blocks []Block `json:"blocks,omitempty"`

	// cite: the sources cited together, in order. Word and the web page
	// show Children, the citation as the style writes it (see
	// render.Citations).
	Cites []Cite `json:"cites,omitempty"`
}

// Cite is one source of a citation.
type Cite struct {
	Key     string `json:"key"`
	Locator string `json:"locator,omitempty"` // "p. 4"
	// Missing: the document's BibLaTeX file has no entry with the key.
	Missing bool `json:"missing,omitempty"`
}

// Kinds of numbered, referable things.
const (
	KindFigure   = "figure"
	KindTable    = "table"
	KindEquation = "equation"
)

// Heading is an entry in the document's outline.
type Heading struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
	Line  int    `json:"line"` // 1-based source line
}

// Outline lists the headings with text in document order, including those
// in lists and quotes.
func (d *Document) Outline() []Heading {
	out := []Heading{}
	var walk func([]Block)
	walk = func(bs []Block) {
		for _, b := range bs {
			switch b.Type {
			case BlockHeading:
				if t := strings.TrimSpace(PlainText(b.Inlines)); t != "" && b.Line > 0 {
					out = append(out, Heading{Level: b.Level, Text: t, Line: b.Line})
				}
			case BlockList:
				for _, item := range b.Items {
					walk(item)
				}
			case BlockQuote:
				walk(b.Children)
			}
		}
	}
	walk(d.Blocks)
	return out
}

// HeadingIDs gives each heading outside footnotes (in lists and quotes too)
// the id `#id` links reach it by: its text in lowercase letters, digits and
// hyphens, with -2, -3… added when it's taken. An id never has a colon, so it
// can't clash with labels (fig:a) or footnotes (fn:1).
func HeadingIDs(bs []Block) map[*Block]string {
	ids := map[*Block]string{}
	used := map[string]bool{}
	var walk func([]Block)
	walk = func(bs []Block) {
		for i := range bs {
			b := &bs[i]
			switch b.Type {
			case BlockHeading:
				ids[b] = uniqueSlug(strings.TrimSpace(PlainText(b.Inlines)), used)
			case BlockList:
				for j := range b.Items {
					walk(b.Items[j])
				}
			case BlockQuote:
				walk(b.Children)
			}
		}
	}
	walk(bs)
	return ids
}

func uniqueSlug(text string, used map[string]bool) string {
	var sb strings.Builder
	dash := false
	for _, r := range strings.ToLower(text) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			if dash && sb.Len() > 0 {
				sb.WriteByte('-')
			}
			sb.WriteRune(r)
			dash = false
		} else {
			dash = true
		}
	}
	base := sb.String()
	if base == "" {
		base = "section"
	}
	id := base
	for n := 2; used[id]; n++ {
		id = base + "-" + strconv.Itoa(n)
	}
	used[id] = true
	return id
}

// Walk calls block for every block in bs and inline for every inline, in
// document order, at any depth: in lists, quotes, tables, captions, picture
// descriptions, links and footnotes. Each gets a pointer it may change
// through.
func Walk(bs []Block, block func(*Block), inline func(*Inline)) {
	var inl func([]Inline)
	var blk func([]Block)
	inl = func(xs []Inline) {
		for i := range xs {
			inline(&xs[i])
			inl(xs[i].Children)
			blk(xs[i].Blocks)
		}
	}
	blk = func(bs []Block) {
		for i := range bs {
			b := &bs[i]
			block(b)
			for j := range b.Pictures {
				inl(b.Pictures[j].Alt)
			}
			inl(b.Inlines)
			inl(b.Caption)
			for _, cell := range b.Header {
				inl(cell)
			}
			for _, row := range b.Rows {
				for _, cell := range row {
					inl(cell)
				}
			}
			blk(b.Children)
			for _, item := range b.Items {
				blk(item)
			}
		}
	}
	blk(bs)
}

// PlainText is inlines' text, without formatting.
func PlainText(xs []Inline) string {
	var b strings.Builder
	var walk func([]Inline)
	walk = func(xs []Inline) {
		for _, x := range xs {
			switch x.Type {
			case InlineText, InlineCode, InlineMath:
				b.WriteString(x.Text)
			case InlineLineBreak:
				b.WriteString(" ")
			}
			walk(x.Children)
		}
	}
	walk(xs)
	return b.String()
}
