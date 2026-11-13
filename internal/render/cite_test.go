package render

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

const citeBib = `@article{smith2020, title={Peanuts}, author={Smith, Jo and Doe, Al}, date={2020}, journaltitle={Nut Journal}}
@book{lee2019, title={Shells}, author={Lee, Ann}, date={2019}, publisher={Acme}}
@book{unused, title={Never Cited}, author={Nobody, N}, date={2001}}
`

// Word and the web page show citations as Typst writes them for the PDF:
// grouped, with locators, in the style front matter names, unknown sources
// as their key; the PDF compiles with the same document.
func TestCitations(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	dir := t.TempDir()
	bibFile := filepath.Join(dir, "Doc.bib")
	if err := os.WriteFile(bibFile, []byte(citeBib), 0o644); err != nil {
		t.Fatal(err)
	}
	tpl := templates.List()[0]
	for _, tc := range []struct {
		style string
		cites []string
		list  []string
	}{
		{"", []string{"(Smith & Doe, 2020, p. 4)", "(Lee, 2019; Smith & Doe, 2020)", "[nope?]"}, []string{
			"Lee, A. (2019). Shells. Acme.",
			"Smith, J., & Doe, A. (2020). Peanuts. Nut Journal.",
		}},
		{"ieee", []string{"[1, p. 4]", "[1], [2]", "[nope?]"}, []string{
			"[1] J. Smith and A. Doe, “Peanuts,” Nut Journal, 2020.",
			"[2] A. Lee, Shells. Acme, 2019.",
		}},
	} {
		src := "---\ncitation-style: " + tc.style + "\n---\n\nAs shown [@smith2020, p. 4]. Both [@lee2019; @smith2020]. Lost [@nope].\n"
		d := doc.Parse(src, dir)
		d.UseBibliography(bibFile)
		if _, err := ty.PDF(context.Background(), d, tpl); err != nil {
			t.Fatalf("%q: PDF: %v", tc.style, err)
		}
		if err := ty.Citations(context.Background(), d); err != nil {
			t.Fatalf("%q: %v", tc.style, err)
		}
		var cites, list []string
		doc.Walk(d.Blocks, func(b *doc.Block) {
			if b.Type == doc.BlockBibliography {
				for _, e := range b.Children {
					list = append(list, doc.PlainText(e.Inlines))
				}
			}
		}, func(x *doc.Inline) {
			if x.Type == doc.InlineCite {
				cites = append(cites, doc.PlainText(x.Children))
			}
		})
		if !slices.Equal(cites, tc.cites) || !slices.Equal(list, tc.list) {
			t.Errorf("%q:\ncites %q\nwant  %q\nlist %q\nwant %q", tc.style, cites, tc.cites, list, tc.list)
		}
	}
}
