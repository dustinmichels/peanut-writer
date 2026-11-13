package render

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"peanut-writer/internal/doc"
)

// Citations writes d's citations and reference list as its style has them,
// for Word and the web page, which can't run Typst's: each citation's
// Children and the reference list's (one paragraph per entry). Typst writes
// them, as it does for the PDF, so all agree: from a document of only the
// citations, a paragraph each, and the list, compiled to HTML. A source the
// references lack is its key in brackets, as the PDF has it.
func (t *Typst) Citations(ctx context.Context, d *doc.Document) error {
	var groups []*doc.Inline
	var list *doc.Block
	doc.Walk(d.Blocks, func(b *doc.Block) {
		if b.Type == doc.BlockBibliography && b.Text != "" && list == nil {
			list = b
		}
	}, func(x *doc.Inline) {
		if x.Type == doc.InlineCite {
			groups = append(groups, x)
		}
	})
	known := func(x *doc.Inline) bool {
		for _, c := range x.Cites {
			if !c.Missing && d.Bibliography != "" {
				return true
			}
		}
		return false
	}
	var src strings.Builder
	var formatted []*doc.Inline // the groups citing a known source, in src's order
	for _, x := range groups {
		if list == nil || !known(x) {
			continue
		}
		formatted = append(formatted, x)
		for _, c := range x.Cites {
			if c.Missing {
				continue
			}
			src.WriteString("#cite(label(" + typstString(c.Key) + ")")
			if c.Locator != "" {
				src.WriteString(", supplement: " + typstString(c.Locator))
			}
			src.WriteString(")")
		}
		src.WriteString("\n\n")
	}
	var paras [][]doc.Inline
	var entries [][]doc.Inline
	if len(formatted) > 0 && list != nil {
		fmt.Fprintf(&src, "#bibliography(\"refs.bib\", title: none, style: %s)\n", typstString(list.Text))
		html, err := t.citationsHTML(ctx, d.Bibliography, src.String())
		if err != nil {
			return err
		}
		paras, entries = readCitations(html)
		if len(paras) != len(formatted) {
			return fmt.Errorf("formatting citations: Typst wrote %d of %d", len(paras), len(formatted))
		}
	}
	for _, x := range groups {
		x.Children = nil
	}
	for i, x := range formatted {
		x.Children = paras[i]
	}
	for _, x := range groups {
		for _, c := range x.Cites {
			if c.Missing || d.Bibliography == "" {
				if len(x.Children) > 0 {
					x.Children = append(x.Children, doc.Inline{Type: doc.InlineText, Text: " "})
				}
				x.Children = append(x.Children, doc.Inline{Type: doc.InlineText, Text: "[" + c.Key + "?]"})
			}
		}
	}
	if list != nil {
		list.Children = nil
		for _, e := range entries {
			list.Children = append(list.Children, doc.Block{Type: doc.BlockParagraph, Inlines: e})
		}
	}
	return nil
}

// citationsHTML compiles src, with the BibLaTeX file bibPath as refs.bib,
// to HTML.
func (t *Typst) citationsHTML(ctx context.Context, bibPath, src string) ([]byte, error) {
	dir, err := os.MkdirTemp("", "peanut-cite-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	b, err := os.ReadFile(bibPath)
	if err != nil {
		return nil, err
	}
	for name, data := range map[string][]byte{"refs.bib": b, "cite.typ": []byte(src)} {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o600); err != nil {
			return nil, err
		}
	}
	if _, err := t.compile(ctx, dir, "cite.typ", "cite.html", "--features", "html", "--format", "html"); err != nil {
		return nil, fmt.Errorf("formatting citations: %w", err)
	}
	return os.ReadFile(filepath.Join(dir, "cite.html"))
}

// readCitations reads Typst's HTML of citations and a reference list: the
// text of each paragraph (a citation) and of each list item (an entry),
// italic and bold kept.
func readCitations(html []byte) (paras, entries [][]doc.Inline) {
	dec := xml.NewDecoder(bytes.NewReader(html))
	dec.Strict = false
	dec.AutoClose = xml.HTMLAutoClose
	dec.Entity = xml.HTMLEntity
	for {
		tok, err := dec.Token()
		if err != nil {
			return paras, entries
		}
		if el, ok := tok.(xml.StartElement); ok {
			switch el.Name.Local {
			case "p":
				paras = append(paras, runs(dec))
			case "li":
				entries = append(entries, runs(dec))
			}
		}
	}
}

// runs reads inlines up to the end of the element just started.
func runs(dec *xml.Decoder) []doc.Inline {
	out := []doc.Inline{}
	for {
		tok, err := dec.Token()
		if err != nil {
			return out
		}
		switch tk := tok.(type) {
		case xml.CharData:
			out = append(out, doc.Inline{Type: doc.InlineText, Text: string(tk)})
		case xml.StartElement:
			kids := runs(dec)
			switch tk.Name.Local {
			case "em", "i":
				out = append(out, doc.Inline{Type: doc.InlineEmph, Children: kids})
			case "strong", "b":
				out = append(out, doc.Inline{Type: doc.InlineStrong, Children: kids})
			default:
				out = append(out, kids...)
			}
		case xml.EndElement:
			return out
		}
	}
}
