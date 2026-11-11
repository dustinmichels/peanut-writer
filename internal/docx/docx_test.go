package docx

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"image"
	imgcolor "image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

const (
	nsW   = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
	nsRel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)

// sample covers every block and inline type.
var sample = `---
title: A Test Document
subtitle: Covering everything
author: Ada Lovelace
date: 10 November 2026
abstract: A short abstract & summary.
---

[TOC]

# Introduction

As @fig:plot and @tbl:sales show (and @fig:vector, unlike @fig:nowhere), text can be **bold *and italic* or ~~struck~~**, ` + "`code`" + `,
a [link](https://example.com/a?b=1&c=2), mail <ada@example.com>, a line  
break, an inline ![](dot.png) image, an unsized ![](blank.svg) one, ![](gone.png) a missing one, and a note.[^note]

[^note]: The note, with [a link](https://example.org) and an image ![](dot.png).

    Its second paragraph.

A second note holds blocks.[^blocks]

[^blocks]: - a list
    - in a note

    > A quote in a note.

## Lists

- one
- two
  - nested
    1. deep

3. three
4. four

1. loose

   with a second paragraph

2. items

> A quote with *emphasis*.
>
> - and a list

~~~go
func main() {
	fmt.Println("tab	inside")
}
~~~

![A plot of things](dot.png){#fig:plot width=50%}

![A vector drawing](drawing.svg){#fig:vector}

![Not there](nope.png){#fig:gone}

![](dot.png)

![Dots](dot.png) ![](drawing.svg)
![](nope.png)
Figure: A grid of pictures {#fig:grid columns=2 width=80% align=right}

![](dot.png)
![](dot.png)
Figure:

| Year | Sales | Note |
|:-----|------:|:----:|
| 2024 | 10 | up |
| 2025 | 20 | *more* |

Table: Sales by year {#tbl:sales}

| A | B |
|---|---|
| 1 | 2 |

Math: $\frac{a}{b}$ in a line, $$\int f$$ displayed in one, and @eq:energy.

$$ E = mc^2 $$ {#eq:energy}

$$
a + b
$$

---

\pagebreak

### Third level

#### Fourth level

##### Fifth level

###### Sixth level

Unicode passes: 日本語, “quotes”, é, emoji 🥜, and a control` + "\x01" + `char.
`

func writeFixtures(t *testing.T, dir string) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 40, 20))
	for x := range 40 {
		for y := range 20 {
			img.Set(x, y, imgcolor.RGBA{uint8(x * 6), 120, uint8(y * 12), 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "dot.png"), buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><circle cx="50" cy="50" r="40"/></svg>`
	if err := os.WriteFile(filepath.Join(dir, "drawing.svg"), []byte(svg), 0o644); err != nil {
		t.Fatal(err)
	}
	// No size, so an inline one is drawn at a guessed width, then again.
	if err := os.WriteFile(filepath.Join(dir, "blank.svg"), []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`), 0o644); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestWrite(t *testing.T) {
	dir := t.TempDir()
	pngBytes := writeFixtures(t, dir)
	d := doc.Parse(sample, dir)
	wantNotes := countFootnotes(d.Blocks)
	if wantNotes == 0 {
		t.Fatal("sample has no footnotes")
	}

	rasterized, drawn := 0, 0
	stub := Options{Rasterize: func(path string, widthPt float64) ([]byte, error) {
		if filepath.Ext(path) != ".svg" {
			return nil, errors.New("not an svg")
		}
		rasterized++
		return pngBytes, nil
	}, Equations: func(ms []doc.Math, sizePt float64) [][]byte {
		drawn += len(ms)
		pics := make([][]byte, len(ms))
		for i := range pics {
			pics[i] = pngBytes
		}
		return pics
	}}
	tpls := templates.List()
	if len(tpls) == 0 {
		t.Fatal("no templates")
	}
	for _, tpl := range tpls {
		for _, opt := range []Options{stub, {}} {
			out, err := Write(d, tpl.Docx, opt)
			if err != nil {
				t.Fatalf("%s: %v", tpl.ID, err)
			}
			checkPackage(t, tpl.ID, out, wantNotes)
		}
	}
	if rasterized == 0 {
		t.Error("Rasterize was never called for the SVG")
	}
	if drawn == 0 {
		t.Error("Equations was never called")
	}
}

func countFootnotes(blocks []doc.Block) int {
	n := 0
	var inl func([]doc.Inline)
	var blk func([]doc.Block)
	inl = func(xs []doc.Inline) {
		for _, x := range xs {
			if x.Type == doc.InlineFootnote {
				n++
			}
			inl(x.Children)
		}
	}
	blk = func(bs []doc.Block) {
		for _, b := range bs {
			inl(b.Inlines)
			inl(b.Caption)
			for _, row := range append([][][]doc.Inline{b.Header}, b.Rows...) {
				for _, cell := range row {
					inl(cell)
				}
			}
			blk(b.Children)
			for _, item := range b.Items {
				blk(item)
			}
		}
	}
	blk(blocks)
	return n
}

// part is what the checks need from one XML part.
type partInfo struct {
	relIDs    []string // r:id and r:embed values
	bookmarks map[string]bool
	refs      []string // REF field targets
	noteRefs  int      // w:footnoteReference
	notes     int      // w:footnote with an id > 0
}

func checkPackage(t *testing.T, id string, data []byte, wantNotes int) {
	t.Helper()
	z, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("%s: zip: %v", id, err)
	}
	files := map[string][]byte{}
	for _, f := range z.File {
		r, err := f.Open()
		if err != nil {
			t.Fatalf("%s: %s: %v", id, f.Name, err)
		}
		b, err := io.ReadAll(r)
		r.Close()
		if err != nil {
			t.Fatalf("%s: %s: %v", id, f.Name, err)
		}
		files[f.Name] = b
	}
	for _, name := range []string{"[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "word/document.xml",
		"word/styles.xml", "word/numbering.xml", "word/settings.xml", "word/footnotes.xml", "word/_rels/document.xml.rels"} {
		if _, ok := files[name]; !ok {
			t.Errorf("%s: missing part %s", id, name)
		}
	}
	infos := map[string]partInfo{}
	for name, b := range files {
		if strings.HasSuffix(name, ".xml") || strings.HasSuffix(name, ".rels") {
			info, err := scan(b)
			if err != nil {
				t.Errorf("%s: %s is not well-formed: %v", id, name, err)
			}
			infos[name] = info
		}
	}

	// Every REF points at a bookmark.
	body := infos["word/document.xml"]
	for _, ref := range body.refs {
		if !body.bookmarks[ref] {
			t.Errorf("%s: REF %s has no bookmark", id, ref)
		}
	}
	if len(body.refs) == 0 {
		t.Errorf("%s: no REF fields", id)
	}

	// Relationship ids exist, internal targets are in the package, and
	// every media file is a target.
	targets := map[string]bool{}
	for _, part := range []string{"word/document.xml", "word/footnotes.xml", "word/footer1.xml"} {
		if _, ok := files[part]; !ok {
			continue
		}
		relsName := filepath.Dir(part) + "/_rels/" + filepath.Base(part) + ".rels"
		rels := map[string]string{}
		if b, ok := files[relsName]; ok {
			var r struct {
				Rels []struct {
					ID     string `xml:"Id,attr"`
					Target string `xml:"Target,attr"`
					Mode   string `xml:"TargetMode,attr"`
				} `xml:"Relationship"`
			}
			if err := xml.Unmarshal(b, &r); err != nil {
				t.Fatalf("%s: %s: %v", id, relsName, err)
			}
			for _, rel := range r.Rels {
				rels[rel.ID] = rel.Target
				if rel.Mode != "External" {
					targets["word/"+rel.Target] = true
					if _, ok := files["word/"+rel.Target]; !ok {
						t.Errorf("%s: %s points at missing %s", id, relsName, rel.Target)
					}
				}
			}
		}
		for _, rid := range infos[part].relIDs {
			if _, ok := rels[rid]; !ok {
				t.Errorf("%s: %s uses %s, not in %s", id, part, rid, relsName)
			}
		}
	}
	for name := range files {
		if strings.HasPrefix(name, "word/media/") && !targets[name] {
			t.Errorf("%s: %s is not used", id, name)
		}
	}

	notes := infos["word/footnotes.xml"]
	if body.noteRefs != wantNotes || notes.notes != wantNotes {
		t.Errorf("%s: %d footnote references and %d footnotes, want %d", id, body.noteRefs, notes.notes, wantNotes)
	}
}

// scan decodes an XML part to EOF, collecting what the checks need.
func scan(b []byte) (partInfo, error) {
	info := partInfo{bookmarks: map[string]bool{}}
	dec := xml.NewDecoder(bytes.NewReader(b))
	inInstr := false
	var instr strings.Builder
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return info, nil
		}
		if err != nil {
			return info, err
		}
		switch tok := tok.(type) {
		case xml.StartElement:
			for _, a := range tok.Attr {
				if a.Name.Space == nsRel && (a.Name.Local == "id" || a.Name.Local == "embed") {
					info.relIDs = append(info.relIDs, a.Value)
				}
			}
			if tok.Name.Space != nsW {
				continue
			}
			switch tok.Name.Local {
			case "bookmarkStart":
				info.bookmarks[attr(tok, "name")] = true
			case "instrText":
				inInstr = true
				instr.Reset()
			case "footnoteReference":
				info.noteRefs++
			case "footnote":
				if attr(tok, "type") == "" && attr(tok, "id") != "" && !strings.HasPrefix(attr(tok, "id"), "-") && attr(tok, "id") != "0" {
					info.notes++
				}
			}
		case xml.CharData:
			if inInstr {
				instr.Write(tok)
			}
		case xml.EndElement:
			if inInstr && tok.Name.Local == "instrText" {
				inInstr = false
				if f := strings.Fields(instr.String()); len(f) >= 2 && f[0] == "REF" {
					info.refs = append(info.refs, f[1])
				}
			}
		}
	}
}

func attr(se xml.StartElement, local string) string {
	for _, a := range se.Attr {
		if a.Name.Local == local {
			return a.Value
		}
	}
	return ""
}

func TestBookmarkName(t *testing.T) {
	used := map[string]bool{}
	long := strings.Repeat("x", 60)
	for _, label := range []string{"fig:a", "fig-a", "tbl:é", long, long} {
		name := bookmarkName(label, used)
		if len(name) > 40 || name[0] != '_' {
			t.Errorf("%q → %q", label, name)
		}
		for _, r := range name {
			if !(r == '_' || r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z') {
				t.Errorf("%q → %q has %q", label, name, r)
			}
		}
	}
	if len(used) != 5 {
		t.Errorf("names not unique: %v", used)
	}
}

// A note's figures and tables are counted in Word's numbering where its mark
// is, not in the note (a separate story), and a note starting with a table
// has its mark before the table, not in the first cell.
func TestNumberedItemsInFootnotes(t *testing.T) {
	dir := t.TempDir()
	writeFixtures(t, dir)
	src := "Text.[^n] Then:\n\n![B](dot.png){#fig:b}\n\n" +
		"[^n]: | A | B |\n    |---|---|\n    | 1 | 2 |\n\n    ![N](dot.png){#fig:n}\n"
	out, err := Write(doc.Parse(src, dir), templates.List()[0].Docx, Options{})
	if err != nil {
		t.Fatal(err)
	}
	z, err := zip.NewReader(bytes.NewReader(out), int64(len(out)))
	if err != nil {
		t.Fatal(err)
	}
	part := func(name string) string {
		f, err := z.Open(name)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		b, _ := io.ReadAll(f)
		return string(b)
	}
	body, notes := part("word/document.xml"), part("word/footnotes.xml")
	if n := strings.Count(body, "SEQ Figure"); n != 2 {
		t.Errorf("document has %d SEQ Figure fields, want 2 (the note's, hidden, and B's)", n)
	}
	if n := strings.Count(body, "SEQ Table"); n != 1 {
		t.Errorf("document has %d SEQ Table fields, want 1 (the note's, hidden)", n)
	}
	if strings.Contains(notes, "SEQ ") {
		t.Error("footnotes have SEQ fields")
	}
	if mark, tbl := strings.Index(notes, "<w:footnoteRef/>"), strings.Index(notes, "<w:tbl>"); mark < 0 || tbl < 0 || mark > tbl {
		t.Errorf("note mark at %d, table at %d: the mark should come first", mark, tbl)
	}
}
