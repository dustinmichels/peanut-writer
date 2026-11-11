package doc

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
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

![First *one*](images/a.png){#fig:a width=60% align=Right}

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
	if fig.Type != BlockFigure || fig.Label != "fig:a" || fig.Number != 1 || fig.Width != 60 || fig.Position != "right" {
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
	if missing.Number != 2 || missing.Src != "" || missing.Missing != "images/missing.png" || missing.Position != "" {
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

// A figure in a footnote is numbered where the note's mark is, as Typst
// counts it; marks with no note and notes with no mark are warned about.
func TestFootnoteFiguresAndOrphans(t *testing.T) {
	src := "![A](a.png){#fig:a}\n\nText[^1] and[^x], see @fig:n.\n\n![B](b.png){#fig:b}\n\n" +
		"[^1]: The note.\n\n    ![N](n.png){#fig:n}\n\n[^2]: Unused.\n"
	d := Parse(src, "")
	note := d.Blocks[1].Inlines[1]
	if note.Type != InlineFootnote || len(note.Blocks) != 2 || note.Blocks[1].Type != BlockFigure {
		t.Fatalf("note = %+v", note)
	}
	if fig := note.Blocks[1]; fig.Number != 2 || fig.Label != "fig:n" {
		t.Errorf("figure in note = %+v", fig)
	}
	if b := d.Blocks[2]; b.Number != 3 {
		t.Errorf("figure after the note is %d, want 3", b.Number)
	}
	if ref := d.Blocks[1].Inlines[3]; ref.Type != InlineRef || ref.Number != 2 {
		t.Errorf("ref = %+v", ref)
	}
	var notes []string
	for _, w := range d.Warnings {
		if strings.Contains(w, "footnote") {
			notes = append(notes, w)
		}
	}
	want := []string{"footnote nothing refers to: [^2]", "footnote with no note: [^x]"}
	if strings.Join(notes, "|") != strings.Join(want, "|") {
		t.Errorf("footnote warnings = %q, want %q", notes, want)
	}
}

// A note marked inside itself, directly or through another note, stops
// there instead of nesting forever (a stack overflow kills the app).
func TestFootnoteMarkedInsideItself(t *testing.T) {
	d := Parse("Text[^a].\n\n[^a]: See [^b].\n\n[^b]: Back to [^a].\n", "")
	a := d.Blocks[0].Inlines[1]
	if a.Type != InlineFootnote || len(a.Blocks) != 1 {
		t.Fatalf("note a = %+v", a)
	}
	b := a.Blocks[0].Inlines[1]
	if b.Type != InlineFootnote || PlainText(b.Blocks[0].Inlines) != "Back to ." {
		t.Errorf("note b = %+v", b)
	}
	if want := []string{"footnote marked inside itself: [^a]"}; !slices.Equal(d.Warnings, want) {
		t.Errorf("warnings = %q, want %q", d.Warnings, want)
	}

	// Notes marking the next one twice, 40 deep: each is read once within
	// a note, not 2⁴⁰ times.
	var src strings.Builder
	src.WriteString("Text[^1].\n\n")
	for i := 1; i <= 40; i++ {
		fmt.Fprintf(&src, "[^%d]: Note [^%d] and [^%[2]d].\n\n", i, i+1)
	}
	if b, err := json.Marshal(Parse(src.String(), "")); err != nil || len(b) > 1e5 {
		t.Errorf("chain of notes: %d bytes, %v", len(b), err)
	}
}

// Link and picture targets are read with their escapes and entities undone,
// as goldmark's own HTML has them.
func TestDestinationsUnescaped(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a_b.png"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	d := Parse("[q](http://a.com/?a=1&amp;b=2) ![i](a\\_b.png)\n\n![F](a\\_b.png)\n", dir)
	xs := d.Blocks[0].Inlines
	if xs[0].URL != "http://a.com/?a=1&b=2" || xs[2].Src == "" || d.Blocks[1].Src == "" {
		t.Errorf("link %q, image %q, figure %q", xs[0].URL, xs[2].Src, d.Blocks[1].Src)
	}
}

// A pipe in a table cell is written `\|`, in code and math too: there it
// reads as a pipe (`$\|x\|$` is |x|, not the norm ‖x‖).
func TestTableCellPipes(t *testing.T) {
	d := Parse("| a |\n|---|\n| `x\\|y` and **$\\|z\\|$** |\n", "")
	cell := d.Blocks[0].Rows[0][0]
	if cell[0].Text != "x|y" || cell[2].Children[0].Text != "|z|" {
		t.Errorf("cell %+v", cell)
	}
}

// Windows and old Mac line breaks read as the editor reads them, lines
// counted the same.
func TestLineBreaks(t *testing.T) {
	d := Parse("---\r\ntitle: X\r---\r# H\r\n\rone\rtwo\n", "")
	if d.Meta.Title != "X" || len(d.Blocks) != 2 || d.Blocks[0].Line != 4 || d.Blocks[1].Line != 6 ||
		PlainText(d.Blocks[1].Inlines) != "one two" {
		t.Errorf("meta %+v, blocks %+v", d.Meta, d.Blocks)
	}
}

// mathIn is a paragraph's text with its math as "[tex]" ("$$tex$$" for
// display math).
func mathIn(xs []Inline) string {
	var b strings.Builder
	for _, x := range xs {
		switch {
		case x.Type == InlineMath && x.Display:
			b.WriteString("$$" + x.Text + "$$")
		case x.Type == InlineMath:
			b.WriteString("[" + x.Text + "]")
		default:
			b.WriteString(x.Text)
		}
	}
	return b.String()
}

func TestDollarsInText(t *testing.T) {
	for src, want := range map[string]string{
		"costs $5 or $10":             "costs $5 or $10",
		"from $5–$10, $1,000 and $2":  "from $5–$10, $1,000 and $2",
		"a $x^2$ b":                   "a [x^2] b",
		"a $ x$ b":                    "a $ x$ b",
		"a $x $ b":                    "a $x $ b",
		"$x$5":                        "$x$5",
		`\$x$ and \$5`:                "$x$ and $5",
		`$a \$ b$`:                    `[a \$ b]`,
		"$a*b*c$ and $x_1 * y_2$":     "[a*b*c] and [x_1 * y_2]",
		"`$x$` stays code":            "$x$ stays code",
		"over $a +\nb$ lines":         "over [a +\nb] lines",
		"shown $$\\int f$$ in a line": "shown $$\\int f$$ in a line",
	} {
		d := Parse(src, "")
		if got := mathIn(d.Blocks[0].Inlines); got != want {
			t.Errorf("%q: %q, want %q", src, got, want)
		}
	}
}

func TestEquations(t *testing.T) {
	src := "As @eq:sum and @eq:one show:\n$$\n\\sum_i x_i\n= 1\n$$ {#eq:sum}\n\n$$ E = mc^2 $$\n\n$$ x} $$ {#eq:bad}\n\n- $$ y $$ {#eq:one}\n\n```\n$$ z $$\n```\n"
	d := Parse(src, "")
	if len(d.Blocks) != 6 {
		t.Fatalf("blocks = %+v", d.Blocks)
	}
	sum, plain, bad, one := d.Blocks[1], d.Blocks[2], d.Blocks[3], d.Blocks[4].Items[0][0]
	if sum.Type != BlockEquation || sum.Text != "\\sum_i x_i\n= 1" || sum.Label != "eq:sum" || sum.Number != 1 {
		t.Errorf("an equation can interrupt a paragraph and span lines: %+v", sum)
	}
	if plain.Type != BlockEquation || plain.Text != "E = mc^2" || plain.Number != 0 {
		t.Errorf("an unlabelled equation isn't numbered: %+v", plain)
	}
	if bad.Error == "" || bad.Number != 0 {
		t.Errorf("an unreadable equation isn't numbered: %+v", bad)
	}
	if one.Type != BlockEquation || one.Number != 2 {
		t.Errorf("equations in lists are numbered: %+v", one)
	}
	if d.Blocks[5].Type != BlockCode {
		t.Errorf("`$$` in a code block: %+v", d.Blocks[5])
	}
	refs := d.Blocks[0].Inlines
	if refs[1].Kind != KindEquation || refs[1].Number != 1 || refs[3].Kind != KindEquation || refs[3].Number != 2 {
		t.Errorf("refs = %+v", refs)
	}
	if len(d.Warnings) != 1 {
		t.Errorf("warnings = %v", d.Warnings)
	}
}

// Only pictures in the document's folder are used: not ones elsewhere named
// by an absolute or ../ path, nor ones a symlink inside it points out to.
func TestImagesStayInTheDocumentFolder(t *testing.T) {
	outside := t.TempDir()
	secret := filepath.Join(outside, "secret.png")
	if err := os.WriteFile(secret, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(outside, "Doc.peanut")
	if err := os.MkdirAll(filepath.Join(dir, "images"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "images", "in.png"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, filepath.Join(dir, "images", "link.png")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "out")); err != nil {
		t.Fatal(err)
	}
	for _, ref := range []string{secret, filepath.ToSlash(secret), "../secret.png", "images/../../secret.png", "images/link.png", "out/secret.png"} {
		if got := ImagePath(dir, ref); got != "" {
			t.Errorf("ImagePath(%q) = %q, want none", ref, got)
		}
	}
	if got := ImagePath(dir, "./images/in.png"); got != filepath.Join(dir, "images", "in.png") {
		t.Errorf("in the folder: %q", got)
	}
	d := Parse("![A](../secret.png)", dir)
	if d.Blocks[0].Src != "" || len(d.Warnings) != 1 || !strings.Contains(d.Warnings[0], "outside the document's folder") {
		t.Errorf("src = %q, warnings = %v", d.Blocks[0].Src, d.Warnings)
	}
}

func TestPictureGrid(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.png"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	src := "![One](a.png) ![Two](a.png)\n![](gone.png)\nFigure: Three *peanuts* {#fig:g columns=5 width=80% align=left}\n\n" +
		"![](a.png)\n![](a.png)\nFigure:\n\n" +
		"![](a.png)\n![](a.png)\n\n" +
		"![](a.png)\nFigure: one picture is a paragraph\n\n" +
		"See @fig:g.\n"
	d := Parse(src, dir)
	if len(d.Blocks) != 5 {
		t.Fatalf("got %d blocks: %+v", len(d.Blocks), d.Blocks)
	}
	g := d.Blocks[0]
	if g.Type != BlockFigure || g.Number != 1 || g.Label != "fig:g" || g.Width != 80 || g.Position != "left" || len(g.Pictures) != 3 {
		t.Fatalf("grid = %+v", g)
	}
	if g.Columns != 3 {
		t.Errorf("columns = %d, want 3 (no more than there are pictures)", g.Columns)
	}
	if len(g.Caption) != 2 || g.Caption[0].Text != "Three " || g.Caption[1].Type != InlineEmph {
		t.Errorf("caption = %+v", g.Caption)
	}
	if g.Pictures[0].Src != filepath.Join(dir, "a.png") || g.Pictures[0].Alt[0].Text != "One" {
		t.Errorf("first picture = %+v", g.Pictures[0])
	}
	if g.Pictures[2].Src != "" || g.Pictures[2].Missing != "gone.png" {
		t.Errorf("missing picture = %+v", g.Pictures[2])
	}
	bare := d.Blocks[1]
	if bare.Type != BlockFigure || bare.Number != 2 || len(bare.Caption) != 0 || bare.Columns != 2 || bare.Width != 0 {
		t.Errorf("uncaptioned grid = %+v", bare)
	}
	if d.Blocks[2].Type != BlockParagraph || d.Blocks[3].Type != BlockParagraph {
		t.Errorf("pictures without a Figure: line, or only one, aren't a grid: %+v", d.Blocks[2:4])
	}
	if ref := d.Blocks[4].Inlines[1]; ref.Kind != KindFigure || ref.Number != 1 {
		t.Errorf("ref = %+v", ref)
	}
}
