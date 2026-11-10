package doc

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/text"
)

var markdown = goldmark.New(goldmark.WithExtensions(
	extension.Table,
	extension.Strikethrough,
	extension.Footnote,
	extension.NewTypographer(extension.WithTypographicSubstitutions(map[extension.TypographicPunctuation]string{
		extension.LeftSingleQuote:  "‘",
		extension.RightSingleQuote: "’",
		extension.LeftDoubleQuote:  "“",
		extension.RightDoubleQuote: "”",
		extension.EnDash:           "–",
		extension.EmDash:           "—",
		extension.Ellipsis:         "…",
		extension.LeftAngleQuote:   "«",
		extension.RightAngleQuote:  "»",
		extension.Apostrophe:       "’",
	})),
))

// Parse reads source, resolving image paths against baseDir (the document's
// folder).
func Parse(source, baseDir string) *Document {
	meta, body := splitFrontMatter(source)
	src := []byte(body)
	root := markdown.Parser().Parse(text.NewReader(src))

	p := &parser{src: src, baseDir: baseDir, notes: map[int]ast.Node{}}
	ast.Walk(root, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if fn, ok := n.(*extast.Footnote); ok && entering {
			p.notes[fn.Index] = fn
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})

	d := &Document{Meta: meta}
	d.Blocks = p.blocks(root)
	p.number(d.Blocks)
	p.resolve(d.Blocks)
	d.Warnings = p.warnings
	return d
}

type parser struct {
	src      []byte
	baseDir  string
	notes    map[int]ast.Node // footnote content by index
	labels   map[string]Inline
	warnings []string
}

func (p *parser) warn(format string, args ...any) {
	p.warnings = append(p.warnings, fmt.Sprintf(format, args...))
}

// --- Front matter -------------------------------------------------------

// splitFrontMatter separates a leading `---` block of `key: value` lines from
// the body.
func splitFrontMatter(source string) (Meta, string) {
	var m Meta
	s := strings.ReplaceAll(source, "\r\n", "\n")
	if !strings.HasPrefix(s, "---\n") {
		return m, s
	}
	rest := s[4:]
	end := -1
	for i := 0; i <= len(rest); {
		j := strings.IndexByte(rest[i:], '\n')
		line := rest[i:]
		if j >= 0 {
			line = rest[i : i+j]
		}
		if t := strings.TrimSpace(line); t == "---" || t == "..." {
			end = i
			break
		}
		if j < 0 {
			break
		}
		i += j + 1
	}
	if end < 0 {
		return m, s
	}
	for _, line := range strings.Split(rest[:end], "\n") {
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		value = unquote(strings.TrimSpace(value))
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "title":
			m.Title = value
		case "subtitle":
			m.Subtitle = value
		case "author":
			m.Author = value
		case "date":
			if strings.EqualFold(value, "today") {
				value = time.Now().Format("January 2, 2006")
			}
			m.Date = value
		case "abstract":
			m.Abstract = value
		case "template":
			m.Template = value
		}
	}
	body := rest[end:]
	if i := strings.IndexByte(body, '\n'); i >= 0 {
		body = body[i+1:]
	} else {
		body = ""
	}
	return m, body
}

func unquote(v string) string {
	if len(v) >= 2 && (v[0] == '"' && v[len(v)-1] == '"' || v[0] == '\'' && v[len(v)-1] == '\'') {
		if v[0] == '"' {
			if u, err := strconv.Unquote(v); err == nil {
				return u
			}
		}
		return v[1 : len(v)-1]
	}
	return v
}

// --- Blocks ---------------------------------------------------------------

func (p *parser) blocks(parent ast.Node) []Block {
	out := []Block{}
	for n := parent.FirstChild(); n != nil; n = n.NextSibling() {
		switch n := n.(type) {
		case *ast.Paragraph, *ast.TextBlock:
			// A table caption is taken by the table before it.
			if prev := n.PreviousSibling(); prev != nil && prev.Kind() == extast.KindTable && isTableCaption(p.raw(n)) {
				continue
			}
			out = append(out, p.paragraph(n))
		case *ast.Heading:
			out = append(out, Block{Type: BlockHeading, Level: n.Level, Inlines: p.inlines(n)})
		case *ast.List:
			b := Block{Type: BlockList, Ordered: n.IsOrdered(), Tight: n.IsTight}
			if n.IsOrdered() {
				b.Start = max(n.Start, 0)
			}
			for item := n.FirstChild(); item != nil; item = item.NextSibling() {
				b.Items = append(b.Items, p.blocks(item))
			}
			out = append(out, b)
		case *ast.Blockquote:
			out = append(out, Block{Type: BlockQuote, Children: p.blocks(n)})
		case *ast.FencedCodeBlock:
			out = append(out, Block{Type: BlockCode, Lang: string(n.Language(p.src)), Text: p.lines(n)})
		case *ast.CodeBlock:
			out = append(out, Block{Type: BlockCode, Text: p.lines(n)})
		case *ast.ThematicBreak:
			out = append(out, Block{Type: BlockRule})
		case *extast.Table:
			out = append(out, p.table(n))
		}
		// HTML blocks and the footnote list (read up front) aren't shown.
	}
	return out
}

// raw is a paragraph's source text, lines joined with "\n".
func (p *parser) raw(n ast.Node) string {
	return strings.TrimSpace(p.lines(n))
}

func (p *parser) lines(n ast.Node) string {
	var b strings.Builder
	lines := n.Lines()
	for i := range lines.Len() {
		seg := lines.At(i)
		b.Write(seg.Value(p.src))
	}
	return strings.TrimSuffix(b.String(), "\n")
}

var (
	attrBlock      = regexp.MustCompile(`^\{([^{}]*)\}$`)
	trailingAttrs  = regexp.MustCompile(`\s*\{([^{}]*)\}\s*$`)
	tableCaptionRe = regexp.MustCompile(`(?i)^(table:|:\s)`)
)

func isTableCaption(raw string) bool { return tableCaptionRe.MatchString(raw) }

func (p *parser) paragraph(n ast.Node) Block {
	switch raw := p.raw(n); raw {
	case "[TOC]", "[toc]":
		return Block{Type: BlockTOC}
	case `\pagebreak`, `\newpage`:
		return Block{Type: BlockPageBreak}
	}
	if fig, ok := p.figure(n); ok {
		return fig
	}
	return Block{Type: BlockParagraph, Inlines: p.inlines(n)}
}

// figure reads a paragraph holding only an image and an optional attribute
// block.
func (p *parser) figure(n ast.Node) (Block, bool) {
	img, ok := n.FirstChild().(*ast.Image)
	if !ok {
		return Block{}, false
	}
	var rest strings.Builder
	for c := img.NextSibling(); c != nil; c = c.NextSibling() {
		switch c := c.(type) {
		case *ast.Text:
			rest.Write(c.Segment.Value(p.src))
		case *ast.String:
			rest.Write(c.Value)
		default:
			return Block{}, false
		}
	}
	attrs := strings.TrimSpace(rest.String())
	var id string
	var kv map[string]string
	if attrs != "" {
		m := attrBlock.FindStringSubmatch(attrs)
		if m == nil {
			return Block{}, false
		}
		id, kv = parseAttrs(m[1])
	}
	b := Block{Type: BlockFigure, Caption: p.inlines(img), Label: id}
	b.Src, b.Missing = p.image(string(img.Destination))
	if w, ok := kv["width"]; ok {
		b.Width = parseWidth(w)
	}
	return b, true
}

// parseAttrs reads `#id key=value key="quoted value" .class`.
func parseAttrs(s string) (id string, kv map[string]string) {
	kv = map[string]string{}
	for _, f := range attrFields(s) {
		switch {
		case strings.HasPrefix(f, "#"):
			id = f[1:]
		case strings.Contains(f, "="):
			k, v, _ := strings.Cut(f, "=")
			kv[strings.ToLower(k)] = strings.Trim(v, `"'“”‘’`)
		}
	}
	return id, kv
}

// attrFields splits on spaces outside quotes.
func attrFields(s string) []string {
	var out []string
	var cur strings.Builder
	quote := rune(0)
	for _, r := range s {
		switch {
		case quote != 0:
			if r == quote || (quote == '“' && r == '”') {
				quote = 0
			}
			cur.WriteRune(r)
		case r == '"' || r == '\'' || r == '“':
			quote = r
			cur.WriteRune(r)
		case r == ' ' || r == '\t':
			if cur.Len() > 0 {
				out = append(out, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteRune(r)
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

func parseWidth(v string) float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(v), "%")), 64)
	if err != nil || f <= 0 {
		return 0
	}
	return min(f, 100)
}

// image resolves an image reference against the document's folder: its
// absolute path, or "" and what's missing.
func (p *parser) image(dest string) (src, missing string) {
	if dest == "" {
		return "", "no image"
	}
	if strings.Contains(dest, "://") {
		p.warn("online images aren't supported: %s", dest)
		return "", dest
	}
	path := dest
	if !filepath.IsAbs(path) {
		if p.baseDir == "" {
			p.warn("image not found: %s", dest)
			return "", dest
		}
		path = filepath.Join(p.baseDir, filepath.FromSlash(dest))
		if abs, err := filepath.Abs(path); err == nil {
			path = abs // typst runs elsewhere
		}
	}
	if fi, err := os.Stat(path); err != nil || fi.IsDir() {
		p.warn("image not found: %s", dest)
		return "", dest
	}
	return path, ""
}

func (p *parser) table(t *extast.Table) Block {
	b := Block{Type: BlockTable}
	for _, a := range t.Alignments {
		switch a {
		case extast.AlignLeft:
			b.Align = append(b.Align, "left")
		case extast.AlignCenter:
			b.Align = append(b.Align, "center")
		case extast.AlignRight:
			b.Align = append(b.Align, "right")
		default:
			b.Align = append(b.Align, "")
		}
	}
	for row := t.FirstChild(); row != nil; row = row.NextSibling() {
		var cells [][]Inline
		for cell := row.FirstChild(); cell != nil; cell = cell.NextSibling() {
			cells = append(cells, p.inlines(cell))
		}
		// Rows are padded or cut to the header's width.
		for len(cells) < len(b.Align) {
			cells = append(cells, []Inline{})
		}
		cells = cells[:len(b.Align)]
		if row.Kind() == extast.KindTableHeader {
			b.Header = cells
		} else {
			b.Rows = append(b.Rows, cells)
		}
	}
	if next := t.NextSibling(); next != nil && (next.Kind() == ast.KindParagraph || next.Kind() == ast.KindTextBlock) && isTableCaption(p.raw(next)) {
		b.Caption, b.Label = tableCaption(p.inlines(next))
	}
	return b
}

// tableCaption strips `Table:` from the front of a caption paragraph and an
// attribute block from its end.
func tableCaption(in []Inline) ([]Inline, string) {
	if len(in) > 0 && in[0].Type == InlineText {
		t := tableCaptionRe.ReplaceAllString(in[0].Text, "")
		in[0].Text = strings.TrimLeft(t, " ")
		if in[0].Text == "" {
			in = in[1:]
		}
	}
	id := ""
	if n := len(in); n > 0 && in[n-1].Type == InlineText {
		if m := trailingAttrs.FindStringSubmatchIndex(in[n-1].Text); m != nil {
			id, _ = parseAttrs(in[n-1].Text[m[2]:m[3]])
			in[n-1].Text = in[n-1].Text[:m[0]]
			if in[n-1].Text == "" {
				in = in[:n-1]
			}
		}
	}
	return in, id
}

// --- Inlines ----------------------------------------------------------------

func (p *parser) inlines(parent ast.Node) []Inline {
	out := []Inline{}
	for n := parent.FirstChild(); n != nil; n = n.NextSibling() {
		out = p.inline(out, n)
	}
	return splitRefs(mergeText(out))
}

func (p *parser) inline(out []Inline, n ast.Node) []Inline {
	switch n := n.(type) {
	case *ast.Text:
		out = append(out, Inline{Type: InlineText, Text: string(n.Segment.Value(p.src))})
		if n.HardLineBreak() {
			out = append(out, Inline{Type: InlineLineBreak})
		} else if n.SoftLineBreak() {
			out = append(out, Inline{Type: InlineText, Text: " "})
		}
	case *ast.String:
		out = append(out, Inline{Type: InlineText, Text: string(n.Value)})
	case *ast.Emphasis:
		t := InlineEmph
		if n.Level >= 2 {
			t = InlineStrong
		}
		out = append(out, Inline{Type: t, Children: p.inlines(n)})
	case *extast.Strikethrough:
		out = append(out, Inline{Type: InlineStrike, Children: p.inlines(n)})
	case *ast.CodeSpan:
		var b strings.Builder
		for c := n.FirstChild(); c != nil; c = c.NextSibling() {
			if t, ok := c.(*ast.Text); ok {
				b.Write(t.Segment.Value(p.src))
			} else if s, ok := c.(*ast.String); ok {
				b.Write(s.Value)
			}
		}
		out = append(out, Inline{Type: InlineCode, Text: b.String()})
	case *ast.Link:
		out = append(out, Inline{Type: InlineLink, URL: string(n.Destination), Children: p.inlines(n)})
	case *ast.AutoLink:
		url := string(n.URL(p.src))
		label := string(n.Label(p.src))
		if n.AutoLinkType == ast.AutoLinkEmail && !strings.HasPrefix(url, "mailto:") {
			url = "mailto:" + url
		}
		out = append(out, Inline{Type: InlineLink, URL: url, Children: []Inline{{Type: InlineText, Text: label}}})
	case *ast.Image:
		src, _ := p.image(string(n.Destination))
		out = append(out, Inline{Type: InlineImage, Src: src})
	case *ast.RawHTML:
		var b strings.Builder
		for i := range n.Segments.Len() {
			seg := n.Segments.At(i)
			b.Write(seg.Value(p.src))
		}
		if tag := strings.ToLower(strings.ReplaceAll(b.String(), " ", "")); tag == "<br>" || tag == "<br/>" {
			out = append(out, Inline{Type: InlineLineBreak})
		}
	case *extast.FootnoteLink:
		if note, ok := p.notes[n.Index]; ok {
			out = append(out, Inline{Type: InlineFootnote, Blocks: p.blocks(note)})
		}
	case *extast.FootnoteBacklink:
	default:
		for c := n.FirstChild(); c != nil; c = c.NextSibling() {
			out = p.inline(out, c)
		}
	}
	return out
}

// mergeText joins neighbouring text runs, which the Markdown parser splits
// at characters that might have started something else.
func mergeText(in []Inline) []Inline {
	out := in[:0]
	for _, x := range in {
		if n := len(out); n > 0 && x.Type == InlineText && out[n-1].Type == InlineText {
			out[n-1].Text += x.Text
			continue
		}
		out = append(out, x)
	}
	return out
}

var refRe = regexp.MustCompile(`@((?:fig|tbl):[A-Za-z0-9_\-]*[A-Za-z0-9_])`)

// splitRefs turns `@fig:a` and `@tbl:b` in text runs into references.
func splitRefs(in []Inline) []Inline {
	var out []Inline
	for _, x := range in {
		if x.Type != InlineText || !strings.Contains(x.Text, "@") {
			out = append(out, x)
			continue
		}
		t := x.Text
		last := 0
		for _, m := range refRe.FindAllStringSubmatchIndex(t, -1) {
			// Not inside a word (an email address).
			if m[0] > 0 && isWordByte(t[m[0]-1]) {
				continue
			}
			if m[0] > last {
				out = append(out, Inline{Type: InlineText, Text: t[last:m[0]]})
			}
			out = append(out, Inline{Type: InlineRef, Label: t[m[2]:m[3]]})
			last = m[1]
		}
		if last < len(t) {
			out = append(out, Inline{Type: InlineText, Text: t[last:]})
		}
	}
	if out == nil {
		out = []Inline{}
	}
	return out
}

func isWordByte(c byte) bool {
	return c == '_' || c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
}

// --- Numbering and references ---------------------------------------------

// number numbers figures and tables in document order and records their
// labels.
func (p *parser) number(blocks []Block) {
	p.labels = map[string]Inline{}
	figs, tables := 0, 0
	var walk func([]Block)
	walk = func(bs []Block) {
		for i := range bs {
			b := &bs[i]
			kind := ""
			switch b.Type {
			case BlockFigure:
				figs++
				b.Number, kind = figs, KindFigure
			case BlockTable:
				tables++
				b.Number, kind = tables, KindTable
			}
			if kind != "" && b.Label != "" {
				if _, dup := p.labels[b.Label]; dup {
					p.warn("label used twice: %s", b.Label)
				} else {
					p.labels[b.Label] = Inline{Kind: kind, Number: b.Number}
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

// resolve fills in what each reference points to.
func (p *parser) resolve(blocks []Block) {
	var inl func([]Inline)
	var blk func([]Block)
	inl = func(xs []Inline) {
		for i := range xs {
			x := &xs[i]
			if x.Type == InlineRef {
				if t, ok := p.labels[x.Label]; ok {
					x.Kind, x.Number = t.Kind, t.Number
				} else {
					p.warn("reference to unknown label: @%s", x.Label)
				}
			}
			inl(x.Children)
			blk(x.Blocks)
		}
	}
	blk = func(bs []Block) {
		for i := range bs {
			b := &bs[i]
			inl(b.Inlines)
			inl(b.Caption)
			for _, row := range append([][][]Inline{b.Header}, b.Rows...) {
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
	blk(blocks)
}
