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
break, an inline ![x](images/p.svg) image and a note.[^n] See @fig:a, @tbl:b and @fig:nope.

![Caption *here*](images/p.svg){#fig:a width=30%}

![Missing](images/gone.png)

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

## Two

[^n]: The *note*.
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
