package html

import (
	"bytes"
	"image"
	"image/png"
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

See @fig:a, @tbl:t, @eq:e, @fig:in and @fig:nowhere.[^1] A "quoted" <b>tag</b> & more.

[Read @fig:a first[^2]](https://example.com) or [don't](JavaScript:alert(1)) or [this](java&#xFFFF;script:alert(1)).

[^1]: A note with its own @fig:a and nested notes.[^2][^3]

[^2]: Nested.

    - item one

    ` + "```" + `
    code two
    ` + "```" + `

    > quoted three

[^3]: ![Inside](a.png){#fig:in}

# Intro

## Fn 1

> # In a quote

- # In a list

![A](a.png){#fig:a}

![Again](a.png){#fig:a}

![Named like a heading](a.png){#intro}

![Named like a note](a.png){#fn:1}

| x |
|---|
| 1 |

Table: T {#tbl:t}

$$ E = mc^2 $$ {#eq:e}
`

// Every in-page link lands on exactly one element, links don't nest, and
// the document's text can't add markup or script.
func TestLinksResolveAndTextIsEscaped(t *testing.T) {
	dir := t.TempDir()
	var pic bytes.Buffer
	if err := png.Encode(&pic, image.NewGray(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "a.png"), pic.Bytes(), 0o644); err != nil {
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
	for _, a := range strings.Split(out, "<a ")[1:] {
		if !strings.Contains(a, "</a>") {
			t.Errorf("link inside a link: <a %s", a[:min(len(a), 60)])
		}
	}
	if want := "(Nested. item one <code>code two</code> quoted three)"; !strings.Contains(out, want) {
		t.Errorf("a note within a note isn't %q in a line", want)
	}
	if want := `(<span id="fig:in"><img src="` + dataURL("image/png", pic.Bytes()) + `" alt="Inside" style="max-width:100%"> <span class="label">Figure 1</span>: Inside</span>)`; !strings.Contains(out, want) {
		t.Errorf("a figure in a note within a note isn't %q", want)
	}
	for _, bad := range []string{"<script>", "<b>", "javascript:"} {
		if strings.Contains(strings.ToLower(out), bad) {
			t.Errorf("output holds %s from the text", bad)
		}
	}
}

// A picture the PDF and Word file show as a placeholder is one on the web
// page too, not a broken-image icon; one Go can't check is kept.
func TestBrokenPicturesArePlaceholders(t *testing.T) {
	var pic bytes.Buffer
	if err := png.Encode(&pic, image.NewGray(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">`
	for name, c := range map[string]struct {
		data  string
		shown string // its MIME type; "" for a placeholder
	}{
		"empty.png":       {"", ""},
		"damaged.png":     {"\x89PNG\r\n\x1a\ngarbage", ""},
		"photo.jpg":       {pic.String(), "image/png"}, // as Word shows it
		"page.svg":        {"<!doctype html><html></html>", ""},
		"cut.svg":         {svg + "<g>", ""},
		"xlink.svg":       {svg + `<use xlink:href="#a"/></svg>`, ""},
		"nbsp.svg":        {svg + "<text>a&nbsp;b</text></svg>", ""},
		"empty.webp":      {"", ""},
		"drawing.svg":     {svg + "</svg>", "image/svg+xml"},
		"illustrator.svg": {"<?xml version=\"1.0\"?>\n<!DOCTYPE svg [\n<!ENTITY ns_svg \"http://www.w3.org/2000/svg\">\n]>\n<svg xmlns=\"&ns_svg;\"/>", "image/svg+xml"},
		"photo.webp":      {"RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"},
	} {
		if got := pictureType(name, []byte(c.data)); got != c.shown {
			t.Errorf("%s: %q, want %q", name, got, c.shown)
		}
	}
}
