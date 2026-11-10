package doc

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFiguresTablesAndReferences(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "images"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "images", "a.png"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	src := `---
title: "My Paper"
author: Ann
---
See @tbl:sales and @fig:b, then @fig:a. Mail me@fig:a.com.

![First *one*](images/a.png){#fig:a width=60%}

| Year | Sales |
|:-----|------:|
| 2024 | 10 |

Table: Sales by_year {#tbl:sales}

![Second](images/missing.png){#fig:b}

![Inline](images/a.png) in text.
`
	d := Parse(src, dir)
	if d.Meta.Title != "My Paper" || d.Meta.Author != "Ann" {
		t.Fatalf("meta = %+v", d.Meta)
	}
	if len(d.Blocks) != 5 {
		t.Fatalf("got %d blocks: %+v", len(d.Blocks), d.Blocks)
	}

	fig := d.Blocks[1]
	if fig.Type != BlockFigure || fig.Label != "fig:a" || fig.Number != 1 || fig.Width != 60 {
		t.Errorf("figure = %+v", fig)
	}
	if fig.Src != filepath.Join(dir, "images", "a.png") {
		t.Errorf("src = %q", fig.Src)
	}
	if len(fig.Caption) != 2 || fig.Caption[1].Type != InlineEmph {
		t.Errorf("caption = %+v", fig.Caption)
	}

	tbl := d.Blocks[2]
	if tbl.Type != BlockTable || tbl.Label != "tbl:sales" || tbl.Number != 1 {
		t.Errorf("table = %+v", tbl)
	}
	if got := tbl.Caption[0].Text; got != "Sales by_year" {
		t.Errorf("table caption = %q", got)
	}
	if tbl.Align[0] != "left" || tbl.Align[1] != "right" || len(tbl.Rows) != 1 {
		t.Errorf("table shape = %+v", tbl)
	}

	missing := d.Blocks[3]
	if missing.Number != 2 || missing.Src != "" || missing.Missing != "images/missing.png" {
		t.Errorf("missing figure = %+v", missing)
	}
	if d.Blocks[4].Type != BlockParagraph {
		t.Errorf("an image with text around it is not a figure: %+v", d.Blocks[4])
	}

	var refs []Inline
	for _, x := range d.Blocks[0].Inlines {
		if x.Type == InlineRef {
			refs = append(refs, x)
		}
	}
	want := []Inline{
		{Type: InlineRef, Label: "tbl:sales", Kind: KindTable, Number: 1},
		{Type: InlineRef, Label: "fig:b", Kind: KindFigure, Number: 2},
		{Type: InlineRef, Label: "fig:a", Kind: KindFigure, Number: 1},
	}
	if len(refs) != len(want) {
		t.Fatalf("refs = %+v (an email address is not a reference)", refs)
	}
	for i := range want {
		if refs[i].Label != want[i].Label || refs[i].Kind != want[i].Kind || refs[i].Number != want[i].Number {
			t.Errorf("ref %d = %+v, want %+v", i, refs[i], want[i])
		}
	}
}

func TestUnknownReferenceWarns(t *testing.T) {
	d := Parse("See @fig:nope.", "")
	ref := d.Blocks[0].Inlines[1]
	if ref.Type != InlineRef || ref.Kind != "" {
		t.Fatalf("ref = %+v", ref)
	}
	if len(d.Warnings) != 1 {
		t.Errorf("warnings = %v", d.Warnings)
	}
}

func TestSpecialParagraphsAndFootnotes(t *testing.T) {
	d := Parse("[TOC]\n\nText.[^1]\n\n\\pagebreak\n\n[^1]: A *note*.\n", "")
	types := []string{}
	for _, b := range d.Blocks {
		types = append(types, b.Type)
	}
	if len(types) != 3 || types[0] != BlockTOC || types[1] != BlockParagraph || types[2] != BlockPageBreak {
		t.Fatalf("blocks = %v", types)
	}
	note := d.Blocks[1].Inlines[1]
	if note.Type != InlineFootnote || len(note.Blocks) != 1 || note.Blocks[0].Inlines[1].Type != InlineEmph {
		t.Errorf("footnote = %+v", note)
	}
}

func TestFrontMatterNeedsClosingFence(t *testing.T) {
	d := Parse("---\ntitle: x\n\nNo end.", "")
	if d.Meta.Title != "" {
		t.Errorf("unterminated front matter read as meta: %+v", d.Meta)
	}
}
