// Package doc turns Peanut Writer's Markdown dialect into a document model
// that both outputs (Typst for PDF, and Word) are written from.
//
// The dialect is CommonMark + GFM tables and strikethrough + footnotes, with:
//
//   - YAML-style front matter (flat `key: value` lines): title, subtitle,
//     author, date, abstract, template.
//   - Figures: a paragraph holding only an image, optionally followed by an
//     attribute block: `![Caption](images/a.png){#fig:a width=60%}`.
//   - Table captions: a paragraph right after a table, starting `Table:`, with
//     an optional attribute block: `Table: Sales by year {#tbl:sales}`.
//   - Cross-references: `@fig:a`, `@tbl:sales`. Numbers follow document order.
//   - `[TOC]` (table of contents) and `\pagebreak` on a line of their own.
package doc

// Document is a parsed document.
type Document struct {
	Meta   Meta    `json:"meta"`
	Blocks []Block `json:"blocks"`
	// Warnings are problems the writer should hear about (an unknown
	// reference, a missing image); the document still renders.
	Warnings []string `json:"warnings,omitempty"`
}

// Meta is the front matter.
type Meta struct {
	Title    string `json:"title,omitempty"`
	Subtitle string `json:"subtitle,omitempty"`
	Author   string `json:"author,omitempty"`
	Date     string `json:"date,omitempty"`
	Abstract string `json:"abstract,omitempty"`
	Template string `json:"template,omitempty"`
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
)

// Block is a block-level element. Which fields are set depends on Type.
type Block struct {
	Type string `json:"type"`

	// paragraph, heading: the text. figure, table: the caption.
	Inlines []Inline `json:"inlines,omitempty"`
	Caption []Inline `json:"caption,omitempty"`

	// heading: 1–6.
	Level int `json:"level,omitempty"`

	// list.
	Ordered bool      `json:"ordered,omitempty"`
	Start   int       `json:"start,omitempty"` // first number of an ordered list
	Tight   bool      `json:"tight,omitempty"` // no blank lines between items
	Items   [][]Block `json:"items,omitempty"`

	// quote.
	Children []Block `json:"children,omitempty"`

	// code: the text, with its language ("" when not given).
	Lang string `json:"lang,omitempty"`
	Text string `json:"text,omitempty"`

	// figure: the image's absolute path, "" when it can't be shown (then
	// Missing names what was asked for). Width is a percentage of the text
	// width; 0 means the image's natural size, shrunk to fit.
	Src     string  `json:"src,omitempty"`
	Missing string  `json:"missing,omitempty"`
	Width   float64 `json:"width,omitempty"`

	// table: Align per column ("left", "center", "right" or ""), the header
	// row and the body rows; each cell is a run of inlines.
	Align  []string     `json:"align,omitempty"`
	Header [][]Inline   `json:"header,omitempty"`
	Rows   [][][]Inline `json:"rows,omitempty"`

	// figure, table: the label (`fig:a`, `tbl:b`; "" for none) and the
	// number, counted separately for figures and tables in document order.
	Label  string `json:"label,omitempty"`
	Number int    `json:"number,omitempty"`
}

// Inline types.
const (
	InlineText      = "text"
	InlineStrong    = "strong"
	InlineEmph      = "emph"
	InlineStrike    = "strike"
	InlineCode      = "code"
	InlineLink      = "link"
	InlineImage     = "image"
	InlineRef       = "ref"
	InlineFootnote  = "footnote"
	InlineLineBreak = "linebreak"
)

// Inline is an inline element. Which fields are set depends on Type.
type Inline struct {
	Type string `json:"type"`

	// text, code: the text.
	Text string `json:"text,omitempty"`

	// strong, emph, strike, link: the content.
	Children []Inline `json:"children,omitempty"`

	// link: the target. image: the absolute path ("" when missing).
	URL string `json:"url,omitempty"`
	Src string `json:"src,omitempty"`

	// ref: the label referred to, what it is ("figure" or "table") and its
	// number. Kind is "" when no figure or table has the label.
	Label  string `json:"label,omitempty"`
	Kind   string `json:"kind,omitempty"`
	Number int    `json:"number,omitempty"`

	// footnote: the note's content.
	Blocks []Block `json:"blocks,omitempty"`
}

// Kinds of numbered, referable things.
const (
	KindFigure = "figure"
	KindTable  = "table"
)
