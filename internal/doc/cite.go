package doc

import (
	"fmt"
	"os"
	"regexp"
	"slices"
	"strings"

	"peanut-writer/internal/bib"
)

// Styles are the citation styles front matter can name (`citation-style`),
// as Typst names them; the first is the default. Only author-date and
// numeric styles: a note style's citations are footnotes.
var Styles = []string{"apa", "chicago-author-date", "harvard-cite-them-right", "ieee", "mla", "nature", "vancouver"}

// citeKey is a citation key as Pandoc reads one: letters, digits and _,
// with single punctuation marks between them.
const citeKey = `[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/][\p{L}\p{N}_])*`

var (
	citeRe     = regexp.MustCompile(`\[(@` + citeKey + `[^\[\]@;]*(?:;\s*@` + citeKey + `[^\[\]@;]*)*)\]`)
	citeItemRe = regexp.MustCompile(`^@(` + citeKey + `)\s*(.*)$`)
	// A key like a cross-reference's label: `[@fig:a]` is a reference in
	// brackets.
	refKeyRe = regexp.MustCompile(`^(?:fig|tbl|eq):`)
)

var wholeKeyRe = regexp.MustCompile(`^` + citeKey + `$`)

// IsCiteKey says whether `[@s]` cites s.
func IsCiteKey(s string) bool { return wholeKeyRe.MatchString(s) && !refKeyRe.MatchString(s) }

// splitCites turns `[@a]`, `[@a, p. 4]` and `[@a; @b]` in text runs into
// citations.
func splitCites(in []Inline) []Inline {
	var out []Inline
	for _, x := range in {
		if x.Type != InlineText || !strings.Contains(x.Text, "[@") {
			out = append(out, x)
			continue
		}
		t := x.Text
		last := 0
		for _, m := range citeRe.FindAllStringSubmatchIndex(t, -1) {
			cites := parseCites(t[m[2]:m[3]])
			if cites == nil {
				continue
			}
			if m[0] > last {
				out = append(out, Inline{Type: InlineText, Text: t[last:m[0]]})
			}
			out = append(out, Inline{Type: InlineCite, Cites: cites})
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

// parseCites reads `@a, p. 4; @b`; nil if one of them is a cross-reference.
func parseCites(s string) []Cite {
	var out []Cite
	for _, item := range strings.Split(s, ";") {
		m := citeItemRe.FindStringSubmatch(strings.TrimSpace(item))
		if m == nil || refKeyRe.MatchString(m[1]) {
			return nil
		}
		loc := strings.TrimSpace(strings.TrimPrefix(m[2], ","))
		out = append(out, Cite{Key: m[1], Locator: loc})
	}
	return out
}

// CiteSource is citation x as written: `[@a, p. 4; @b]`. Word and the web
// page show it when Typst hasn't written the citation (see render.Citations).
func CiteSource(x Inline) string {
	parts := make([]string, len(x.Cites))
	for i, c := range x.Cites {
		parts[i] = "@" + c.Key
		if c.Locator != "" {
			parts[i] += ", " + c.Locator
		}
	}
	return "[" + strings.Join(parts, "; ") + "]"
}

// UseBibliography resolves the citations against the BibLaTeX file at path
// (the document's `Name.bib`; it may not exist): those of a key it lacks are
// marked Missing, with a warning. When any citation is of a source it has,
// it becomes d's Bibliography, and the reference list is shown, in the
// front matter's style: at the first `[References]`, or at the end under a
// References heading.
func (d *Document) UseBibliography(path string) {
	var cites []*Cite
	var lists []*Block
	Walk(d.Blocks, func(b *Block) {
		if b.Type == BlockBibliography {
			lists = append(lists, b)
		}
	}, func(x *Inline) {
		for i := range x.Cites {
			cites = append(cites, &x.Cites[i])
		}
	})
	if len(lists) > 1 {
		d.Warnings = append(d.Warnings, "[References] is there twice: the list is shown at the first")
	}
	if len(cites) == 0 {
		return
	}
	var keys map[string]bool
	if src, err := os.ReadFile(path); err == nil {
		keys = bib.Keys(src)
	}
	known := false
	warned := map[string]bool{}
	for _, c := range cites {
		if keys[c.Key] {
			known = true
			continue
		}
		c.Missing = true
		if !warned[c.Key] {
			warned[c.Key] = true
			d.Warnings = append(d.Warnings, fmt.Sprintf("citation of a source not in the document's references: @%s", c.Key))
		}
	}
	if !known {
		return
	}
	d.Bibliography = path
	style := strings.ToLower(strings.TrimSpace(d.Meta.CitationStyle))
	if style == "" {
		style = Styles[0]
	} else if !slices.Contains(Styles, style) {
		d.Warnings = append(d.Warnings, fmt.Sprintf("unknown citation style %q: using %s (one of %s)", d.Meta.CitationStyle, Styles[0], strings.Join(Styles, ", ")))
		style = Styles[0]
	}
	if len(lists) > 0 {
		lists[0].Text = style
		return
	}
	d.Blocks = append(d.Blocks,
		Block{Type: BlockHeading, Level: 1, Inlines: []Inline{{Type: InlineText, Text: "References"}}},
		Block{Type: BlockBibliography, Text: style})
}
