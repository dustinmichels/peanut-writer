package mdfmt

import (
	"context"
	"encoding/json"
	"regexp"
	"testing"

	"peanut-writer/internal/doc"
)

func TestTitleCase(t *testing.T) {
	for in, want := range map[string]string{
		"the lord of the rings":              "The Lord of the Rings",
		"The Lord Of The Rings":              "The Lord of the Rings",
		"what we are up to":                  "What We Are Up To",
		"results: a summary of the findings": "Results: A Summary of the Findings",
		"NASA and the iPhone in 3D":          "NASA and the iPhone in 3D",
		"don't panic":                        "Don't Panic",
		"über alles":                         "Über Alles",
		"using `the_api` in go":              "Using `the_api` in Go",
		"see @fig:the-chart for more":        "See @fig:the-chart for More",
		"intro {#sec:the-intro}":             "Intro {#sec:the-intro}",
		"a [link to it](https://x.io/a/the)": "A [Link to It](https://x.io/a/the)",
		"*what* is *the* point":              "*What* Is *the* Point",
		"the $\\sin x$ of a wave":            "The $\\sin x$ of a Wave",
		"the $a \\$ b$ of it":                "The $a \\$ b$ of It",
	} {
		if got := TitleCase(in); got != want {
			t.Errorf("TitleCase(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTitleCaseHeadings(t *testing.T) {
	in := "---\ntitle: the front matter\n---\n\n# the first part ##\n\nbody text of the part\n\n````md\n# a fenced heading\n```\n# still fenced\n````\n\n   ## the last part\n"
	want := "---\ntitle: the front matter\n---\n\n# The First Part ##\n\nbody text of the part\n\n````md\n# a fenced heading\n```\n# still fenced\n````\n\n   ## The Last Part\n"
	if got := TitleCaseHeadings(in); got != want {
		t.Errorf("TitleCaseHeadings:\n%s\nwant:\n%s", got, want)
	}
}

// messy uses the document format's extensions, untidily.
const messy = `---
title:   My Report
template: report
---
#   Sales   


As @fig:chart shows, sales went up (@tbl:sales).   
* one
* two

![Sales over time](images/chart.png){#fig:chart width=70% align=left}

![](images/before.png)
![](images/after.png)
Figure: Before and after {#fig:pair columns=2 width=90%}

|Year|Sales|
|-|-:|
|2025|100|

Table: Sales by year {#tbl:sales}

Text *with* a note.[^1] and a hard  
break.

Math $x_{i} * y_{j}^2$ costs $5 or $10, as @eq:one says.

$$
a_{1} * b_{2}
$$ {#eq:one}

> $$
> a
> $$ {#eq:quoted}

- $$
  b
  $$ {#eq:listed}

[TOC]

\pagebreak

[^1]: The note.
## Methods
`

var lineField = regexp.MustCompile(`"line":\d+,?`)

// model is the document as the renderer sees it, without source lines.
func model(t *testing.T, src string) string {
	b, err := json.Marshal(doc.Parse(src, ""))
	if err != nil {
		t.Fatal(err)
	}
	return lineField.ReplaceAllString(string(b), "")
}

// Formatting tidies the Markdown without changing the document it describes.
func TestFormatKeepsDocument(t *testing.T) {
	o, err := Find()
	if err != nil {
		t.Skip(err)
	}
	got, err := o.Format(context.Background(), messy)
	if err != nil {
		t.Fatal(err)
	}
	if got == messy {
		t.Fatal("nothing was formatted")
	}
	if a, b := model(t, messy), model(t, got); a != b {
		t.Errorf("formatting changed the document:\n%s\nformatted:\n%s", messy, got)
	}
	again, err := o.Format(context.Background(), got)
	if err != nil {
		t.Fatal(err)
	}
	if again != got {
		t.Errorf("formatting isn't stable:\n%s\nthen:\n%s", got, again)
	}
}
