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
date: today
abstract: Short.
---
[TOC]

# One

Text with **bold**, *emph*, ~~strike~~, ` + "`code`" + `, a [link](https://example.com),
a hard  
break, an inline ![x](images/p.svg) image, a note[^n] and an untyped one.[^e] See @fig:a, @tbl:b and @fig:nope.

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

[^n]: The *note*.
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
