package doc

import (
	"bytes"
	"fmt"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	gmparser "github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
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
), goldmark.WithParserOptions(slices.Concat(mathParsers, highlightParsers, []gmparser.Option{
	gmparser.WithASTTransformers(util.Prioritized(unusedNotes{}, 100)),
})...))

var unusedNotesKey = gmparser.NewContextKey()

// unusedNotes warns about footnotes nothing refers to, before the footnote
// extension drops them (it runs at priority 999): a second note with a
// label is one of them, as marks go to the first.
type unusedNotes struct{}

func (unusedNotes) Transform(root *ast.Document, _ text.Reader, pc gmparser.Context) {
	var unused []string
	used := map[string]bool{}
	_ = ast.Walk(root, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if fn, ok := n.(*extast.Footnote); ok && entering {
			if fn.Index < 0 {
				unused = append(unused, string(fn.Ref))
			} else {
				used[string(fn.Ref)] = true
			}
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})
	warnings := make([]string, len(unused))
	for i, l := range unused {
		if used[l] {
			warnings[i] = fmt.Sprintf("footnote label used twice: [^%s]", l)
		} else {
			warnings[i] = fmt.Sprintf("footnote nothing refers to: [^%s]", l)
		}
	}
	pc.Set(unusedNotesKey, warnings)
}

// lineBreaks turns Windows (`\r\n`) and old Mac (`\r`) line breaks into
// `\n`, as the editor reads them.
var lineBreaks = strings.NewReplacer("\r\n", "\n", "\r", "\n")

// Parse reads source, resolving image paths against baseDir (the document's
// folder).
func Parse(source, baseDir string) *Document {
	if strings.Contains(source, "\r") {
		source = lineBreaks.Replace(source)
	}
	meta, body := splitFrontMatter(source)
	src := []byte(body)
	pc := gmparser.NewContext()
	root := markdown.Parser().Parse(text.NewReader(src), gmparser.WithContext(pc))

	// Lines are counted in the whole source: the front matter comes first.
	lineBase := strings.Count(source, "\n") - strings.Count(body, "\n")
	p := &parser{src: src, baseDir: baseDir, lineBase: lineBase, notes: map[int]*extast.Footnote{}, reading: map[int]bool{}, dangling: map[string]bool{}}
	for i := 0; ; i++ {
		j := bytes.IndexByte(src[i:], '\n')
		if j < 0 {
			break
		}
		i += j
		p.newlines = append(p.newlines, i)
	}
	_ = ast.Walk(root, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if fn, ok := n.(*extast.Footnote); ok && entering {
			p.notes[fn.Index] = fn
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})
	if warnings, ok := pc.Get(unusedNotesKey).([]string); ok {
		p.warnings = append(p.warnings, warnings...)
	}

	d := &Document{Meta: meta, Dir: baseDir}
	d.Blocks = p.blocks(root)
	p.number(d.Blocks)
	p.resolve(d.Blocks)
	d.Warnings = p.warnings
	return d
}

type parser struct {
	src      []byte
	baseDir  string
	lineBase int                      // source lines before src (the front matter)
	newlines []int                    // offsets of src's line breaks
	notes    map[int]*extast.Footnote // footnote content by index
	reading  map[int]bool             // footnotes being read: one marked inside itself stops there
	inner    map[int]bool             // footnotes read within the note of the text's mark being read
	labels   map[string]Inline
	dangling map[string]bool // footnote markers with no note, warned about
	warnings []string
}

func (p *parser) warn(format string, args ...any) {
	p.warnings = append(p.warnings, fmt.Sprintf(format, args...))
}

// --- Front matter -------------------------------------------------------

// splitFrontMatter separates a leading `---` block of `key: value` lines from
// the body.
func splitFrontMatter(s string) (Meta, string) {
	var m Meta
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
		case "topic":
			m.Topic = value
		case "date":
			if strings.EqualFold(value, "today") {
				value = time.Now().Format("January 2, 2006")
			}
			m.Date = value
		case "header":
			m.Header = value
		case "abstract":
			m.Abstract = value
		case "template":
			m.Template = value
		case "citation-style":
			m.CitationStyle = value
		case "hide":
			m.Hide = nil
			for _, k := range strings.Split(value, ",") {
				if k = strings.ToLower(strings.TrimSpace(k)); k != "" {
					m.Hide = append(m.Hide, k)
				}
			}
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

// space is what strings.TrimSpace trims, as a regexp class (frontMatter.ts
// trims the same).
const space = `\t\n\v\f\r \x{85}\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}`

// needsQuotes matches a value that reads differently unquoted: in YAML, or
// here, where a value is trimmed and a line ends at a line break.
var needsQuotes = regexp.MustCompile("^[" + space + "\"'\\[{>|*&!%@`#-]|:[" + space + "]|[" + space + "]$|#|[\\x00-\\x1f\\x7f-\\x9f\\x{FEFF}\\x{FFFE}\\x{FFFF}]")

// FrontMatterValue writes v as a front matter value: in double quotes when
// it needs them, with only the escapes unquote reads (frontMatter.ts's
// writeFrontMatter writes alike).
func FrontMatterValue(v string) string {
	if !needsQuotes.MatchString(v) {
		return v
	}
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range v {
		switch {
		case r == '\\' || r == '"':
			b.WriteByte('\\')
			b.WriteRune(r)
		case r == '\t':
			b.WriteString(`\t`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r < 0x20 || r >= 0x7f && r <= 0x9f:
			fmt.Fprintf(&b, `\x%02X`, r)
		case r == 0xfeff || r == 0xfffe || r == 0xffff:
			fmt.Fprintf(&b, `\u%04X`, r)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// unquote reads a front matter value. One in double quotes takes YAML's
// escapes (frontMatter.ts reads them alike, and the writers use no others);
// one in single quotes, or with an escape that isn't one, is taken as
// written.
func unquote(v string) string {
	if len(v) < 2 || !(v[0] == '"' && v[len(v)-1] == '"' || v[0] == '\'' && v[len(v)-1] == '\'') {
		return v
	}
	if v[0] == '"' {
		if u, ok := unescape(v[1 : len(v)-1]); ok {
			return u
		}
	}
	return v[1 : len(v)-1]
}

// yamlEscapes are YAML's double-quoted escapes but `\x`, `\u` and `\U`.
var yamlEscapes = map[byte]string{
	'0': "\x00", 'a': "\a", 'b': "\b", 't': "\t", '\t': "\t", 'n': "\n", 'v': "\v", 'f': "\f", 'r': "\r",
	'e': "\x1b", ' ': " ", '"': `"`, '/': "/", '\\': `\`, 'N': "\u0085", '_': "\u00a0", 'L': "\u2028", 'P': "\u2029",
}

// unescape undoes the escapes in a double-quoted value; false if one isn't
// YAML's or a `"` is bare. `\uD83D\uDE00` (UTF-16, as JSON writes it) is
// one character; a lone surrogate isn't one.
func unescape(s string) (string, bool) {
	if !strings.ContainsAny(s, `\"`) {
		return s, true
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"':
			return "", false
		case '\\':
		default:
			b.WriteByte(s[i])
			continue
		}
		if i++; i == len(s) {
			return "", false
		}
		if e, ok := yamlEscapes[s[i]]; ok {
			b.WriteString(e)
			continue
		}
		r, n := hexEscape(s, i)
		if n == 0 {
			return "", false
		}
		i += n
		if utf16.IsSurrogate(r) {
			// A high one and a low one, `\u` too.
			if !strings.HasPrefix(s[i+1:], `\u`) {
				return "", false
			}
			lo, m := hexEscape(s, i+2)
			if r = utf16.DecodeRune(r, lo); m == 0 || r == utf8.RuneError {
				return "", false
			}
			i += 2 + m
		}
		b.WriteRune(r)
	}
	return b.String(), true
}

// hexEscape reads the `x`, `u` or `U` escape whose letter is s[i]: the
// character and the number of hex digits, or 0 if it isn't one.
func hexEscape(s string, i int) (rune, int) {
	if i >= len(s) {
		return 0, 0
	}
	n := 0
	switch s[i] {
	case 'x':
		n = 2
	case 'u':
		n = 4
	case 'U':
		n = 8
	}
	if n == 0 || i+1+n > len(s) {
		return 0, 0
	}
	h := s[i+1 : i+1+n]
	if strings.Trim(h, "0123456789abcdefABCDEF") != "" {
		return 0, 0
	}
	r, _ := strconv.ParseUint(h, 16, 32)
	if r > unicode.MaxRune {
		return 0, 0
	}
	return rune(r), n
}

// --- Blocks ---------------------------------------------------------------

func (p *parser) blocks(parent ast.Node) []Block {
	out := []Block{}
	for n := parent.FirstChild(); n != nil; n = n.NextSibling() {
		had := len(out)
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
		case *equationNode:
			out = append(out, p.equation(n))
		}
		// HTML blocks and the footnote list (read up front) aren't shown.
		if len(out) > had {
			out[len(out)-1].Line = p.line(n)
		}
	}
	return out
}

// raw is a paragraph's source text, lines joined with "\n".
func (p *parser) raw(n ast.Node) string {
	return strings.TrimSpace(p.lines(n))
}

// line is the 1-based source line block n starts on; 0 when unknown.
func (p *parser) line(n ast.Node) int {
	at := n.Pos()
	if at < 0 {
		if n.Lines().Len() == 0 {
			return 0
		}
		at = n.Lines().At(0).Start
	}
	before, _ := slices.BinarySearch(p.newlines, at)
	return p.lineBase + before + 1
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
	attrBlock       = regexp.MustCompile(`^\{([^{}]*)\}$`)
	trailingAttrs   = regexp.MustCompile(`\s*\{([^{}]*)\}\s*$`)
	tableCaptionRe  = regexp.MustCompile(`(?i)^(table:|:\s)`)
	figureCaptionRe = regexp.MustCompile(`(?i)^figure:`)
)

func isTableCaption(raw string) bool { return tableCaptionRe.MatchString(raw) }

func (p *parser) paragraph(n ast.Node) Block {
	switch raw := p.raw(n); raw {
	case "[TOC]", "[toc]":
		return Block{Type: BlockTOC}
	case "[References]", "[references]":
		return Block{Type: BlockBibliography}
	case `\pagebreak`, `\newpage`:
		return Block{Type: BlockPageBreak}
	}
	if fig, ok := p.figure(n); ok {
		return fig
	}
	if grid, ok := p.grid(n); ok {
		return grid
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
		case *extast.FootnoteBacklink:
			// Added to a footnote's last paragraph: a figure there is still one.
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
	b.Src, b.Missing = p.image(destination(img.Destination))
	figureLayout(&b, kv)
	return b, true
}

// grid reads a paragraph of two or more images ending in a `Figure:`
// caption (and an optional attribute block): pictures sharing one caption.
func (p *parser) grid(n ast.Node) (Block, bool) {
	var imgs []*ast.Image
	c := n.FirstChild()
	for ; c != nil; c = c.NextSibling() {
		if img, ok := c.(*ast.Image); ok {
			imgs = append(imgs, img)
		} else if t, ok := c.(*ast.Text); !ok || strings.TrimSpace(string(t.Segment.Value(p.src))) != "" {
			break
		}
	}
	if len(imgs) < 2 || c == nil {
		return Block{}, false
	}
	var caption []Inline
	for ; c != nil; c = c.NextSibling() {
		caption = p.inline(caption, c)
	}
	caption = splitRefs(mergeText(caption))
	if len(caption) == 0 || caption[0].Type != InlineText || !figureCaptionRe.MatchString(caption[0].Text) {
		return Block{}, false
	}
	b := Block{Type: BlockFigure}
	var kv map[string]string
	b.Caption, b.Label, kv = stripCaption(caption, figureCaptionRe)
	for _, img := range imgs {
		pic := Picture{Alt: p.inlines(img)}
		pic.Src, pic.Missing = p.image(destination(img.Destination))
		b.Pictures = append(b.Pictures, pic)
	}
	b.Columns = min(len(imgs), 3)
	if cols, err := strconv.Atoi(strings.TrimSpace(kv["columns"])); err == nil && cols > 0 {
		b.Columns = min(cols, len(imgs))
	}
	figureLayout(&b, kv)
	return b, true
}

// figureLayout reads a figure's width and position from its attributes.
func figureLayout(b *Block, kv map[string]string) {
	if w, ok := kv["width"]; ok {
		b.Width = parseWidth(w)
	}
	if a := strings.ToLower(kv["align"]); a == "left" || a == "right" {
		b.Position = a
	}
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
	if err != nil || !(f > 0) || math.IsInf(f, 1) { // NaN and Inf aren't widths
		return 0
	}
	return min(f, 100)
}

// image resolves an image reference: its absolute path, or "" and what's
// missing.
func (p *parser) image(dest string) (src, missing string) {
	switch {
	case dest == "":
		return "", "no image"
	case strings.Contains(dest, "://"):
		p.warn("online images aren't supported: %s", dest)
		return "", dest
	}
	if src = ImagePath(p.baseDir, dest); src == "" {
		if !filepath.IsLocal(filepath.FromSlash(dest)) {
			p.warn("image outside the document's folder: %s", dest)
		} else {
			p.warn("image not found: %s", dest)
		}
		return "", dest
	}
	return src, ""
}

// ImagePath finds the file an image reference names, relative to baseDir
// (the document's folder): its absolute path, or "" if there's none. Only
// files in baseDir count, also through symlinks, so a document from
// elsewhere can't show (or export) other pictures on the computer.
// Percent-encoded references (`my%20picture.png`) are tried decoded too.
func ImagePath(baseDir, ref string) string {
	if ref == "" || baseDir == "" || strings.Contains(ref, "://") {
		return ""
	}
	base, err := filepath.Abs(baseDir)
	if err != nil {
		return ""
	}
	realBase, err := filepath.EvalSymlinks(base)
	if err != nil {
		return ""
	}
	refs := []string{ref}
	if u, err := url.PathUnescape(ref); err == nil && u != ref {
		refs = append(refs, u)
	}
	for _, r := range refs {
		rel := filepath.FromSlash(r)
		if !filepath.IsLocal(rel) {
			continue
		}
		p := filepath.Join(base, rel) // absolute: typst runs elsewhere
		real, err := filepath.EvalSymlinks(p)
		if err != nil {
			continue
		}
		if in, err := filepath.Rel(realBase, real); err != nil || !filepath.IsLocal(in) {
			continue
		}
		if fi, err := os.Stat(real); err == nil && !fi.IsDir() {
			return p
		}
	}
	return ""
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
			xs := p.inlines(cell)
			cellMath(xs)
			cells = append(cells, xs)
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
		b.Caption, b.Label, _ = stripCaption(p.inlines(next), tableCaptionRe)
	}
	return b
}

// cellMath undoes the `\|` escapes in a table cell's math: a cell's pipes
// are escaped before its text is read (as goldmark does for code), but its
// math extension reads them as written.
func cellMath(xs []Inline) {
	for i := range xs {
		if xs[i].Type == InlineMath {
			xs[i].Text = strings.ReplaceAll(xs[i].Text, `\|`, "|")
		}
		cellMath(xs[i].Children)
	}
}

// stripCaption strips prefix (`Table:`, `Figure:`) from the front of a
// caption and an attribute block from its end, returning the caption, the
// block's id and its other attributes.
func stripCaption(in []Inline, prefix *regexp.Regexp) ([]Inline, string, map[string]string) {
	if len(in) > 0 && in[0].Type == InlineText {
		t := prefix.ReplaceAllString(in[0].Text, "")
		in[0].Text = strings.TrimLeft(t, " ")
		if in[0].Text == "" {
			in = in[1:]
		}
	}
	id := ""
	var kv map[string]string
	if n := len(in); n > 0 && in[n-1].Type == InlineText {
		if m := trailingAttrs.FindStringSubmatchIndex(in[n-1].Text); m != nil {
			id, kv = parseAttrs(in[n-1].Text[m[2]:m[3]])
			in[n-1].Text = in[n-1].Text[:m[0]]
			if in[n-1].Text == "" {
				in = in[:n-1]
			}
		}
	}
	return in, id, kv
}

// --- Inlines ----------------------------------------------------------------

func (p *parser) inlines(parent ast.Node) []Inline {
	out := []Inline{}
	for n := parent.FirstChild(); n != nil; n = n.NextSibling() {
		out = p.inline(out, n)
	}
	return splitRefs(splitCites(mergeText(out)))
}

func (p *parser) inline(out []Inline, n ast.Node) []Inline {
	switch n := n.(type) {
	case *ast.Text:
		v := n.Segment.Value(p.src)
		if !n.IsRaw() {
			// `\*` is a star and `&amp;` an ampersand, as in HTML output.
			v = util.ResolveEntityNames(util.ResolveNumericReferences(util.UnescapePunctuations(v)))
		}
		out = append(out, Inline{Type: InlineText, Text: string(v)})
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
	case *highlightNode:
		out = append(out, Inline{Type: InlineHighlight, Children: p.inlines(n)})
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
		out = append(out, Inline{Type: InlineLink, URL: destination(n.Destination), Children: p.inlines(n)})
	case *ast.AutoLink:
		url := string(n.URL(p.src))
		label := string(n.Label(p.src))
		if n.AutoLinkType == ast.AutoLinkEmail && !strings.HasPrefix(url, "mailto:") {
			url = "mailto:" + url
		}
		out = append(out, Inline{Type: InlineLink, URL: url, Children: []Inline{{Type: InlineText, Text: label}}})
	case *ast.Image:
		src, _ := p.image(destination(n.Destination))
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
	case *mathNode:
		out = append(out, p.math(n))
	case *extast.FootnoteLink:
		note, ok := p.notes[n.Index]
		if !ok {
			break
		}
		if p.reading[n.Index] {
			p.warn("footnote marked inside itself: [^%s]", note.Ref)
			break
		}
		// Within a note, each note is read once: notes marking another
		// note twice would otherwise copy it 2ⁿ times down a chain.
		if len(p.reading) == 0 {
			p.inner = map[int]bool{}
		} else if p.inner[n.Index] {
			p.warn("footnote marked twice within a note: [^%s]", note.Ref)
			break
		}
		p.inner[n.Index] = true
		p.reading[n.Index] = true
		out = append(out, Inline{Type: InlineFootnote, Blocks: p.blocks(note)})
		delete(p.reading, n.Index)
	case *extast.FootnoteBacklink:
	default:
		for c := n.FirstChild(); c != nil; c = c.NextSibling() {
			out = p.inline(out, c)
		}
	}
	return out
}

// destination is a link's or image's target with its backslash escapes and
// entities read (`a\_b.png`, `?a=1&amp;b=2`), as goldmark's HTML has it.
func destination(v []byte) string {
	return string(util.ResolveEntityNames(util.ResolveNumericReferences(util.UnescapePunctuations(v))))
}

// mergeText joins neighbouring text runs, which the Markdown parser splits
// at characters that might have started something else.
func mergeText(in []Inline) []Inline {
	out := in[:0]
	for i := 0; i < len(in); {
		j := i + 1
		if in[i].Type == InlineText {
			for j < len(in) && in[j].Type == InlineText {
				j++
			}
		}
		x := in[i]
		if j > i+1 {
			// One join, not a concatenation per run: a line of 500 000 `[`
			// is that many runs.
			var b strings.Builder
			for _, y := range in[i:j] {
				b.WriteString(y.Text)
			}
			x.Text = b.String()
		}
		out = append(out, x)
		i = j
	}
	return out
}

var refRe = regexp.MustCompile(`@((?:fig|tbl|eq):[A-Za-z0-9_\-]*[A-Za-z0-9_])`)

// splitRefs turns `@fig:a`, `@tbl:b` and `@eq:c` in text runs into
// references.
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

// number numbers figures, tables and labelled equations in document order
// (those in footnotes where the note's mark is) and records their labels.
func (p *parser) number(blocks []Block) {
	p.labels = map[string]Inline{}
	figs, tables, eqs := 0, 0, 0
	Walk(blocks, func(b *Block) {
		kind := ""
		switch b.Type {
		case BlockFigure:
			figs++
			b.Number, kind = figs, KindFigure
		case BlockTable:
			tables++
			b.Number, kind = tables, KindTable
		case BlockEquation:
			if b.Label != "" && b.Error == "" { // one that can't be read isn't drawn as an equation
				eqs++
				b.Number, kind = eqs, KindEquation
			}
		}
		if kind != "" && b.Label != "" {
			if _, dup := p.labels[b.Label]; dup {
				p.warn("label used twice: %s", b.Label)
			} else {
				p.labels[b.Label] = Inline{Kind: kind, Number: b.Number}
			}
		}
	}, func(*Inline) {})
}

// danglingRe is a footnote mark left as text: no note has its label.
var danglingRe = regexp.MustCompile(`\[\^([^\]\s]+)\]`)

// resolve fills in what each reference points to, and warns about
// footnote marks with no note.
func (p *parser) resolve(blocks []Block) {
	Walk(blocks, func(*Block) {}, func(x *Inline) {
		switch x.Type {
		case InlineRef:
			if t, ok := p.labels[x.Label]; ok {
				x.Kind, x.Number = t.Kind, t.Number
			} else {
				p.warn("reference to unknown label: @%s", x.Label)
			}
		case InlineText:
			for _, m := range danglingRe.FindAllStringSubmatch(x.Text, -1) {
				if !p.dangling[m[1]] {
					p.dangling[m[1]] = true
					p.warn("footnote with no note: [^%s]", m[1])
				}
			}
		}
	})
}
