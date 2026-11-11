package mdfmt

import (
	"context"
	"strings"
	"testing"
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
		"see [it](https://x.io/A_(b)_the)":   "See [It](https://x.io/A_(b)_the)",
		"*what* is *the* point":              "*What* Is *the* Point",
		"the $\\sin x$ of a wave":            "The $\\sin x$ of a Wave",
		"the $a \\$ b$ of it":                "The $a \\$ b$ of It",
	} {
		if got := TitleCase(in); got != want {
			t.Errorf("TitleCase(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSentenceCase(t *testing.T) {
	for in, want := range map[string]string{
		"The Lord Of The Rings":              "The lord of the rings",
		"results: A Summary Of The Findings": "Results: A summary of the findings",
		"NASA And The iPhone In 3D":          "NASA and the iPhone in 3D",
		"what I'm Doing And Why I Care":      "What I'm doing and why I care",
		"Using `The_API` In Go":              "Using `The_API` in go",
		"See @fig:The-Chart For More":        "See @fig:The-Chart for more",
		"*What* Is *The* Point":              "*What* is *the* point",
	} {
		if got := SentenceCase(in); got != want {
			t.Errorf("SentenceCase(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCaseHeadings(t *testing.T) {
	in := "---\ntitle: the front matter\n---\n\n# the first part ##\n\nbody text of the part\n\n````md\n# a fenced heading\n```\n# still fenced\n````\n\n   ## the last part\n"
	want := "---\ntitle: the front matter\n---\n\n# The First Part ##\n\nbody text of the part\n\n````md\n# a fenced heading\n```\n# still fenced\n````\n\n   ## The Last Part\n"
	if got := CaseHeadings(in, TitleCase); got != want {
		t.Errorf("CaseHeadings:\n%s\nwant:\n%s", got, want)
	}
	// Never closed, so a rule, not front matter.
	if got := CaseHeadings("---\n\n# the first part\n", TitleCase); got != "---\n\n# The First Part\n" {
		t.Errorf("CaseHeadings after a rule: %q", got)
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

` + "```js\nconst a = {b:1}\n```" + `

[^1]: The note.
## Methods
`

// Formatting tidies the Markdown, stably, leaving code as written.
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
	if !strings.Contains(got, "const a = {b:1}\n") {
		t.Errorf("code was formatted:\n%s", got)
	}
	again, err := o.Format(context.Background(), got)
	if err != nil {
		t.Fatal(err)
	}
	if again != got {
		t.Errorf("formatting isn't stable:\n%s\nthen:\n%s", got, again)
	}
}

// Where oxfmt would read the Markdown differently, or close an equation
// being typed, the document is left as it is.
func TestFormatLeavesWhatItWouldChange(t *testing.T) {
	o, err := Find()
	if err != nil {
		t.Skip(err)
	}
	for _, src := range []string{
		"1. | a | b |\n   |---|---|\n   | 1 | 2 |\nA row of the table, without pipes\n",
		"- item\n$$ x $$ {#eq:a}\n",
		"> quote\n$$ x $$\n",
		"Text\n\n$$\nx\n",
	} {
		if got, err := o.Format(context.Background(), src); err == nil {
			t.Errorf("%q formatted as %q", src, got)
		}
	}
}
