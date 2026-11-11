package html

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

const sample = `---
title: Links <script>alert(1)</script>
---

[TOC]

# Intro

See @fig:a, @tbl:t, @eq:e and @fig:nowhere.[^1] A "quoted" <b>tag</b> & more.

[^1]: A note with its own @fig:a and a nested note.[^2]

[^2]: Nested.

# Intro

## Fn 1

> # In a quote

- # In a list

![A](a.png){#fig:a}

![Again](a.png){#fig:a}

| x |
|---|
| 1 |

Table: T {#tbl:t}

$$ E = mc^2 $$ {#eq:e}
`

// Every in-page link lands on exactly one element, and the document's text
// can't add markup.
func TestLinksResolveAndTextIsEscaped(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.png"), []byte("\x89PNG"), 0o644); err != nil {
		t.Fatal(err)
	}
	d := doc.Parse(sample, dir)
	st := templates.List()[0].Docx
	st.NumberedHeadings = true
	out := string(Write(d, st, Options{}))

	ids := map[string]int{}
	for _, m := range regexp.MustCompile(` id="([^"]*)"`).FindAllStringSubmatch(out, -1) {
		ids[m[1]]++
	}
	for id, n := range ids {
		if n > 1 {
			t.Errorf("id %q used %d times", id, n)
		}
	}
	hrefs := regexp.MustCompile(` href="#([^"]*)"`).FindAllStringSubmatch(out, -1)
	if len(hrefs) < 10 {
		t.Fatalf("only %d in-page links", len(hrefs))
	}
	for _, m := range hrefs {
		if ids[m[1]] != 1 {
			t.Errorf("link to #%s has no target", m[1])
		}
	}
	for _, bad := range []string{"<script>", "<b>"} {
		if strings.Contains(out, bad) {
			t.Errorf("output holds %s from the text", bad)
		}
	}
}
