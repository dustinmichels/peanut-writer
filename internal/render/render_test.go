package render

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

// everything uses every block and inline the renderer knows.
const everything = `---
title: Everything
subtitle: All of it
author: Ann
topic: Essay 1
date: today
header: Course 101
abstract: Short.
---
[TOC]

# One

Text with **bold**, *emph*, ~~strike~~, ==highlight==, ` + "`code`" + `, a [link](https://example.com),
a hard  
break, an inline ![x](images/p.svg) image, a note[^n] and an untyped one.[^e] See @fig:a, @tbl:b, @eq:e, @fig:noted and @fig:nope.

Math: $\frac{a}{b}$, $$\sum_{i=1}^n i$$ in a line, and $x}$ that can't be read.

$$ E = mc^2 $$ {#eq:e}

$$
\begin{aligned} a &= b \\ c &= d \end{aligned}
$$

![Caption *here*](images/p.svg){#fig:a width=30% align=right}

![Missing](images/gone.png)

![Left](images/p.svg)
![Right](images/p.svg)
![](images/gone.png)
Figure: A grid of *three* {#fig:grid columns=2 width=70% align=left}

| A | B |
|:--|--:|
| 1 | 2 |

Table: Numbers {#tbl:b}

1. First
2. Second
   - nested

> Quoted
> text.

` + "```go\nfunc main() {}\n```" + `

---

\pagebreak

## Two[^h]

[^n]: The *note*, with a figure.

    ![In a note](images/p.svg){#fig:noted}

[^h]: A heading's note.
[^e]:
`

func TestEveryTemplateRendersEverything(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	dir := t.TempDir()
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>`
	if err := os.MkdirAll(filepath.Join(dir, "images"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "images", "p.svg"), []byte(svg), 0o644); err != nil {
		t.Fatal(err)
	}
	d := doc.Parse(everything, dir)
	ctx := context.Background()
	for _, tpl := range templates.List() {
		if !tpl.Builtin {
			continue
		}
		pages, _, err := ty.Preview(ctx, d, tpl)
		if err != nil {
			t.Fatalf("%s preview: %v", tpl.ID, err)
		}
		if len(pages) < 2 || !strings.HasPrefix(pages[0], "<svg") {
			t.Errorf("%s: %d pages, want a page break to make two or more", tpl.ID, len(pages))
		}
		pdf, err := ty.PDF(ctx, d, tpl)
		if err != nil {
			t.Fatalf("%s pdf: %v", tpl.ID, err)
		}
		if !bytes.HasPrefix(pdf, []byte("%PDF")) {
			t.Errorf("%s: not a PDF", tpl.ID)
		}
	}

	png, err := ty.PNG(ctx, filepath.Join(dir, "images", "p.svg"), 40)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(png, []byte("\x89PNG")) {
		t.Error("PNG: not a PNG")
	}
	// Math mitex can't read gets no picture; the rest keep their places.
	ms := []doc.Math{{TeX: `\frac{a}{b}`}, {TeX: `\left( x`}, {TeX: `\frac{a}{b}`, Display: true}}
	pics, err := ty.Equations(ctx, ms, 11, "png")
	if err != nil {
		t.Fatal(err)
	}
	if len(pics) != 3 || pics[1] != nil || !bytes.HasPrefix(pics[0], []byte("\x89PNG")) || !bytes.HasPrefix(pics[2], []byte("\x89PNG")) {
		t.Fatalf("Equations: want PNG, nil, PNG; got %d pictures", len(pics))
	}
	if bytes.Equal(pics[0], pics[2]) {
		t.Error("Equations: inline and display math drawn the same")
	}
}

// Math mitex can't read shows as LaTeX, with a warning naming it, rather
// than stopping the preview or PDF; the rest of the math is still drawn,
// and a reference to the unreadable equation still has its number.
func TestUnreadableMathFallsBack(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	bad1, bad2 := `\text{a $ b}`, `\left( x`
	d := doc.Parse("See @eq:a and $x^2$ and $"+bad2+"$.\n\n$$ "+bad1+" $$ {#eq:a}\n\n$$ \\frac{1}{2} $$\n", "")
	pages, warnings, err := ty.Preview(context.Background(), d, templates.List()[0])
	if err != nil {
		t.Fatal(err)
	}
	var unreadable []string
	for _, w := range warnings {
		if strings.HasPrefix(w, "math can't be read") {
			unreadable = append(unreadable, w)
		}
	}
	if len(pages) == 0 || len(unreadable) != 2 || !strings.HasSuffix(unreadable[0], bad2) || !strings.HasSuffix(unreadable[1], bad1) {
		t.Fatalf("%d pages, warnings %q", len(pages), warnings)
	}
	if _, err := ty.PDF(context.Background(), d, templates.List()[0]); err != nil {
		t.Errorf("PDF: %v", err)
	}
}

// Half-typed Markdown (`#` or `$$` just typed, a link or code block begun)
// has empty headings, math, links and code in doc.json; the preview must
// still render.
func TestHalfTypedRenders(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	for _, src := range []string{"#", "## ", "- #", "> #", ">", "$$", "$$\n$$ {#eq:a}", "a $$$$ b", "[]()", "[a]()", "[](https://a.b)", "```\n```"} {
		d := doc.Parse(src, t.TempDir())
		if _, _, err := ty.Preview(context.Background(), d, templates.List()[0]); err != nil {
			t.Errorf("%q: %v", src, err)
		}
	}
}

// A page break where Typst can't break pages (in a quote, a list item or a
// note), ours or a template's before chapters, is left out instead of
// stopping the whole document. One at the top level still breaks.
func TestPageBreaksInContainers(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	src := "# One\n\n\\pagebreak\n\n> # Quoted\n>\n> \\pagebreak\n\n- # Listed\n\n  \\pagebreak\n\nText[^1]\n\n[^1]: Note.\n\n    \\pagebreak\n"
	d := doc.Parse(src, t.TempDir())
	for _, tpl := range templates.List() {
		pages, _, err := ty.Preview(context.Background(), d, tpl)
		if err != nil {
			t.Errorf("%s: %v", tpl.ID, err)
		} else if len(pages) < 2 {
			t.Errorf("%s: %d pages, want the top-level break", tpl.ID, len(pages))
		}
	}
}

// Quotes, lists, notes marking notes and styled text nested deeper than
// Typst can read or evaluate (about 20 levels) are flattened, keeping their
// text, rather than stopping the whole preview.
func TestDeepNestingRenders(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	var list, notes strings.Builder
	notes.WriteString("Text[^0]\n\n")
	for i := range 100 {
		list.WriteString(strings.Repeat("  ", i) + "- item\n")
		fmt.Fprintf(&notes, "[^%d]: Note %d[^%d]\n\n", i, i, i+1)
	}
	list.WriteString(strings.Repeat("  ", 100) + "- deep text\n")
	notes.WriteString("[^100]: deep text\n")
	for name, src := range map[string]string{
		"quotes":      strings.Repeat("> ", 100) + "deep text",
		"loose lists": strings.ReplaceAll(list.String(), "\n", "\n\n"),
		"tight lists": list.String(),
		"mixed":       strings.Repeat("> 1. ", 50) + "deep text",
		"notes":       notes.String(),
		"styled":      strings.Repeat("*a **b ", 30) + "deep text" + strings.Repeat("** b* a", 30),
	} {
		d := doc.Parse(src, "")
		if data, _, err := docJSON(d, t.TempDir(), unreadable{}); err != nil || !bytes.Contains(data, []byte(`deep text"`)) {
			t.Errorf("%s: deepest text lost (%v)", name, err)
		}
		if _, _, err := ty.Preview(context.Background(), d, templates.List()[0]); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

// A word too wide for the line breaks where it must instead of running off
// the page: one of 30 000 letters fills pages rather than one line.
func TestOverlongWordsBreak(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	d := doc.Parse("Before "+strings.Repeat("Supercalifragilistic", 1500)+" after.", "")
	pages, _, err := ty.Preview(context.Background(), d, templates.List()[0])
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) < 3 {
		t.Errorf("%d pages; want the word broken over several", len(pages))
	}
}

// An image Typst can't read (a HEIC photo, a damaged file) shows as a
// missing picture, with a warning naming it, rather than stopping the
// preview or PDF; the document's other images are still drawn.
func TestUnreadableImageFallsBack(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	dir := t.TempDir()
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"/>`
	for name, b := range map[string]string{"ok.svg": svg, "photo.heic": "ftypheic", "broken.png": "not a png", "broken.svg": "<svg"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(b), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	d := doc.Parse("Inline ![](broken.png) and ![](ok.svg).\n\n![A photo](photo.heic)\n\n![](ok.svg) ![](broken.svg)\n", dir)
	pages, warnings, err := ty.Preview(context.Background(), d, templates.List()[0])
	if err != nil {
		t.Fatal(err)
	}
	var unreadable []string
	for _, w := range warnings {
		if strings.HasPrefix(w, "image can't be read") {
			unreadable = append(unreadable, w)
		}
	}
	if len(pages) == 0 || len(unreadable) != 3 {
		t.Fatalf("%d pages, warnings %q", len(pages), warnings)
	}
	if _, err := ty.PDF(context.Background(), d, templates.List()[0]); err != nil {
		t.Errorf("PDF: %v", err)
	}
}

// Typst reads nothing outside its workspace (a template could otherwise
// put any file into the PDF), and a document's math runs no code: mitex's
// \hspace, \vspace and \raisebox once ran their argument as Typst.
func TestTypstCantReadOtherFiles(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	secret := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(secret, []byte("TOPSECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	dir := t.TempDir()
	src := "#read(" + typstString(secret) + ")\n"
	if err := os.WriteFile(filepath.Join(dir, "main.typ"), []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := ty.compile(ctx, dir, "main.typ", "out.pdf"); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("template read: err = %v", err)
	}

	// Code mitex keeps as written (a path's "_" or "-" it doesn't).
	for _, tex := range []string{
		`x \hspace{panic("ran")} y`,
		`x \vspace{1pt + 1pt} y`,
		`\raisebox{2pt * 2}{x}`,
	} {
		d := doc.Parse("$"+tex+"$", "")
		_, warnings, err := ty.Preview(ctx, d, templates.List()[0])
		if err != nil || !strings.Contains(strings.Join(warnings, "\n"), "not a length") {
			t.Errorf("%s: err = %v, warnings %q", tex, err, warnings)
		}
	}
	d := doc.Parse(`$a \hspace{-1.5em} b \raisebox{2pt}{c}$`, "")
	if _, _, err := ty.Preview(ctx, d, templates.List()[0]); err != nil {
		t.Errorf("lengths: %v", err)
	}
}
