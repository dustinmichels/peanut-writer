package render

import (
	"bytes"
	"context"
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

Text with **bold**, *emph*, ~~strike~~, ` + "`code`" + `, a [link](https://example.com),
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

// An empty heading (`#` just typed) has no inlines in doc.json.
func TestEmptyHeadingRenders(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	for _, src := range []string{"#", "## ", "- #", "> #"} {
		d := doc.Parse(src, t.TempDir())
		if _, _, err := ty.Preview(context.Background(), d, templates.List()[0]); err != nil {
			t.Errorf("%q: %v", src, err)
		}
	}
}

// Empty math (`$$` just typed opens an equation) has no text in doc.json.
func TestEmptyMathRenders(t *testing.T) {
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	for _, src := range []string{"$$", "$$\n$$ {#eq:a}", "a $$$$ b"} {
		d := doc.Parse(src, t.TempDir())
		if _, _, err := ty.Preview(context.Background(), d, templates.List()[0]); err != nil {
			t.Errorf("%q: %v", src, err)
		}
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
