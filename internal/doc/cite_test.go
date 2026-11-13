package doc

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// What reads as a citation, and what stays text or a cross-reference.
func TestCiteSyntax(t *testing.T) {
	for src, want := range map[string][][]Cite{
		"[@a]":                      {{{Key: "a"}}},
		"x [@a, p. 4] y [@b]":       {{{Key: "a", Locator: "p. 4"}}, {{Key: "b"}}},
		"[@a; @b:c, pp. 1--2]":      {{{Key: "a"}, {Key: "b:c", Locator: "pp. 1–2"}}},
		"[@fig:a] and [@a; @fig:b]": nil, // cross-references in brackets
		"mail me@x.org [today]":     nil,
		"[see @a] and [@a see]":     {{{Key: "a", Locator: "see"}}}, // a prefix isn't read; text after a key is its locator
		"`[@a]` in code, \\[@a\\]":  {{{Key: "a"}}},                 // escaped brackets are brackets
		"[@a](https://example.com)": nil,                            // a link
	} {
		var got [][]Cite
		Walk(Parse(src, "").Blocks, func(*Block) {}, func(x *Inline) {
			if x.Type == InlineCite {
				got = append(got, x.Cites)
			}
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%q: %v, want %v", src, got, want)
		}
	}
}

// The reference list goes at the first [References], or at the end under a
// heading; only when something cited is in the BibLaTeX file.
func TestUseBibliography(t *testing.T) {
	bib := filepath.Join(t.TempDir(), "Doc.bib")
	if err := os.WriteFile(bib, []byte("@book{a, title={A}}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	types := func(d *Document) (out []string) {
		for _, b := range d.Blocks {
			out = append(out, b.Type+":"+b.Text)
		}
		return out
	}
	for _, tc := range []struct {
		src  string
		want []string
		warn int
	}{
		{"[@a]", []string{"paragraph:", "heading:", "bibliography:apa"}, 0},
		{"---\ncitation-style: IEEE\n---\n[@a]\n\n[References]\n\nAfter", []string{"paragraph:", "bibliography:ieee", "paragraph:"}, 0},
		{"---\ncitation-style: chicago-notes\n---\n[@a]", []string{"paragraph:", "heading:", "bibliography:apa"}, 1},
		{"[@b]\n\n[References]", []string{"paragraph:", "bibliography:"}, 1},
		{"No citations.", []string{"paragraph:"}, 0},
	} {
		d := Parse(tc.src, "")
		d.UseBibliography(bib)
		if got := types(d); !reflect.DeepEqual(got, tc.want) || len(d.Warnings) != tc.warn {
			t.Errorf("%q: %v %q, want %v and %d warnings", tc.src, got, d.Warnings, tc.want, tc.warn)
		}
	}
}
