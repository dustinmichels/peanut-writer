// Package render compiles documents with Typst: SVG pages for the live
// preview, PDF for export, and PNG copies of images and equations Word
// can't show.
package render

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

//go:embed peanut.typ
var renderer []byte

//go:embed style.typ
var styleTyp []byte

// mitex is the mitex Typst package, which reads LaTeX math, bundled so
// nothing needs downloading.
//
//go:embed mitex
var mitex embed.FS

const timeout = 60 * time.Second

// main.typ: the template's show rule over the rendered body, with overlong
// words (in the body or the template's title and header) broken.
const mainTyp = `#import "peanut.typ": overlong, render
#import "template.typ": template
#let doc = json("doc.json")
#show: overlong
#show: template.with(doc.meta)
#render(doc)
`

// CompileError is a Typst error, with its diagnostics.
type CompileError struct{ Output string }

func (e *CompileError) Error() string { return e.Output }

// Typst runs the typst binary.
type Typst struct {
	Bin string

	mu      sync.Mutex
	badMath map[string]string // LaTeX mitex can't read, and why: drawn as its source from the first run
}

// knownBad is the math of ms already found unreadable.
func (t *Typst) knownBad(ms []doc.Math) []problem {
	t.mu.Lock()
	defer t.mu.Unlock()
	var bad []problem
	seen := map[string]bool{}
	for _, m := range ms {
		if why, ok := t.badMath[m.TeX]; ok && !seen[m.TeX] {
			seen[m.TeX] = true
			bad = append(bad, problem{m.TeX, why})
		}
	}
	return bad
}

// findBadMath finds the math of ms mitex can't read, in the workspace dir,
// checking only what isn't known already, and remembers it.
func (t *Typst) findBadMath(ctx context.Context, dir string, ms []doc.Math) []problem {
	bad := t.knownBad(ms)
	known := map[string]bool{}
	for _, p := range bad {
		known[p.what] = true
	}
	rest := slices.DeleteFunc(slices.Clone(ms), func(m doc.Math) bool { return known[m.TeX] })
	found, _ := t.unreadableMath(ctx, dir, rest)
	t.mu.Lock()
	if t.badMath == nil || len(t.badMath) > 1000 {
		t.badMath = map[string]string{}
	}
	for _, p := range found {
		t.badMath[p.what] = p.why
	}
	t.mu.Unlock()
	return append(bad, found...)
}

// Find looks for typst beside the app's executable (where the packaged app
// keeps it), then on PATH, then where Homebrew and mise install it: apps
// opened from Finder don't get the shell's PATH.
func Find() (*Typst, error) {
	name := "typst"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	if exe, err := os.Executable(); err == nil {
		if p := filepath.Join(filepath.Dir(exe), name); isFile(p) {
			return &Typst{Bin: p}, nil
		}
	}
	// Not a mise shim: it picks a version by the working folder, which the
	// app's isn't. The real binary is found below.
	if p, err := exec.LookPath(name); err == nil && !strings.Contains(filepath.ToSlash(p), "/mise/shims/") {
		return &Typst{Bin: p}, nil
	}
	candidates := []string{"/opt/homebrew/bin/typst", "/usr/local/bin/typst"}
	if home, err := os.UserHomeDir(); err == nil {
		mise, _ := filepath.Glob(filepath.Join(home, ".local/share/mise/installs/typst/*/*/typst"))
		slices.Reverse(mise) // newest version first, roughly
		candidates = append(candidates, mise...)
		candidates = append(candidates, filepath.Join(home, ".cargo/bin/typst"))
	}
	for _, p := range candidates {
		if isFile(p) {
			return &Typst{Bin: p}, nil
		}
	}
	return nil, errors.New("typst wasn't found: install it with `brew install typst` (or `mise install`)")
}

func isFile(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && !fi.IsDir()
}

// Preview renders d with tpl to one SVG per page.
func (t *Typst) Preview(ctx context.Context, d *doc.Document, tpl templates.Template) (pages []string, warnings []string, err error) {
	dir, warnings, err := t.render(ctx, d, tpl, "page-{0p}.svg", "--input", "peanut-preview=1")
	if err != nil {
		return nil, nil, err
	}
	defer os.RemoveAll(dir)
	paths, err := filepath.Glob(filepath.Join(dir, "page-*.svg")) // sorted: {0p} zero-pads
	if err != nil {
		return nil, nil, err
	}
	for _, p := range paths {
		b, err := os.ReadFile(p)
		if err != nil {
			return nil, nil, err
		}
		pages = append(pages, string(b))
	}
	return pages, warnings, nil
}

// PDF renders d with tpl to PDF.
func (t *Typst) PDF(ctx context.Context, d *doc.Document, tpl templates.Template) ([]byte, error) {
	dir, _, err := t.render(ctx, d, tpl, "output.pdf")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	return os.ReadFile(filepath.Join(dir, "output.pdf"))
}

// render compiles d with tpl to output in a new workspace, returned for the
// caller to read output from and remove, with Typst's warnings. Math mitex
// can't read and images Typst can't (a HEIC photo, a damaged file) don't
// stop it: if compiling fails, each is found (see findBadMath and
// unreadableImages), shown as its LaTeX source or a missing picture with a
// warning, and it's compiled again. Math already found unreadable is shown
// as its source from the start. Images, the slower check (each is decoded),
// are checked only when the math found isn't the whole problem.
func (t *Typst) render(ctx context.Context, d *doc.Document, tpl templates.Template, output string, flags ...string) (string, []string, error) {
	ms := doc.ReadableMath(d.Blocks)
	bad := unreadable{math: t.knownBad(ms)}
	dir, images, err := t.workspace(d, tpl, bad)
	if err != nil {
		return "", nil, err
	}
	stderr, err := t.compile(ctx, dir, "main.typ", output, flags...)
	retry := func() error {
		os.RemoveAll(dir)
		var werr error
		if dir, images, werr = t.workspace(d, tpl, bad); werr != nil {
			return werr
		}
		stderr, err = t.compile(ctx, dir, "main.typ", output, flags...)
		return nil
	}
	ce := (*CompileError)(nil)
	if errors.As(err, &ce) {
		if found := t.findBadMath(ctx, dir, ms); len(found) > len(bad.math) {
			bad.math = found
			if werr := retry(); werr != nil {
				return "", nil, werr
			}
		}
	}
	if errors.As(err, &ce) {
		if bad.images, _ = t.unreadableImages(ctx, dir, images); len(bad.images) > 0 {
			if werr := retry(); werr != nil {
				return "", nil, werr
			}
		}
	}
	if err != nil {
		os.RemoveAll(dir)
		return "", nil, err
	}
	warnings := diagnostics(stderr)
	for _, m := range bad.math {
		warnings = append(warnings, fmt.Sprintf("math can't be read (%s): %s", m.why, m.what))
	}
	for _, m := range bad.images {
		warnings = append(warnings, fmt.Sprintf("image can't be read (%s): %s", m.why, filepath.Base(m.what)))
	}
	return dir, warnings, nil
}

// problem is what Typst can't read (LaTeX math, an image's path), and why.
type problem struct{ what, why string }

// unreadable is a document's math and images Typst can't read.
type unreadable struct{ math, images []problem }

// checkedAt finds the line of check.typ a Typst error is at, or whose
// trace passes through it.
var checkedAt = regexp.MustCompile(`(?:^|\s)check\.typ:(\d+):`)

// failing runs each of the Typst lines in the workspace dir, after head, and
// finds those that fail, by index, with Typst's reason. An error is the
// line's it's at (or passes through), or the line's reading the workspace
// file it's in (files[i], line i's; nil when none do). Typst stops at the
// first line that fails, so the check runs again on those after it. An
// error that isn't one line's ends the search.
func (t *Typst) failing(ctx context.Context, dir, head string, lines, files []string) (map[int]string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	first := strings.Count(head, "\n") + 1 // check.typ's line of lines[0]
	bad := map[int]string{}
	for from := 0; from < len(lines); {
		// Lines already checked are left blank, so each keeps its place.
		src := head + strings.Repeat("\n", from) + strings.Join(lines[from:], "\n") + "\n"
		if err := os.WriteFile(filepath.Join(dir, "check.typ"), []byte(src), 0o600); err != nil {
			return bad, err
		}
		cmd := exec.CommandContext(ctx, t.Bin, "compile", "--root", ".", "check.typ", "check.pdf")
		cmd.Dir = dir
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if cmd.Run() == nil {
			return bad, nil
		}
		if ctx.Err() != nil {
			return bad, ctx.Err()
		}
		out := ansi.ReplaceAllString(stderr.String(), "")
		i := -1
		if m := checkedAt.FindStringSubmatch(out); m != nil {
			n, _ := strconv.Atoi(m[1])
			i = n - first
		} else {
			for j := from; j < len(files) && i < 0; j++ {
				if strings.Contains(out, " "+strings.TrimPrefix(files[j], "/")+":") {
					i = j
				}
			}
		}
		if i < from || i >= len(lines) {
			return bad, nil
		}
		why := out
		if j := strings.Index(out, "error: "); j >= 0 {
			why = out[j+len("error: "):]
		}
		why, _, _ = strings.Cut(why, "\n")
		bad[i] = strings.TrimSpace(why)
		from = i + 1
	}
	return bad, nil
}

// unreadableMath finds the math in ms that mitex can't read (or whose
// reading Typst then can't run), in the workspace dir.
func (t *Typst) unreadableMath(ctx context.Context, dir string, ms []doc.Math) ([]problem, error) {
	var texs, lines []string
	seen := map[string]bool{}
	for _, m := range ms {
		if !seen[m.TeX] {
			seen[m.TeX] = true
			texs = append(texs, m.TeX)
			lines = append(lines, "#let _ = mimath("+typstString(m.TeX)+")")
		}
	}
	failed, err := t.failing(ctx, dir, "#import \"mitex/lib.typ\": mimath\n", lines, nil)
	var bad []problem
	for i, tex := range texs {
		if why, ok := failed[i]; ok {
			bad = append(bad, problem{tex, why})
		}
	}
	return bad, err
}

// unreadableImages finds the images Typst can't read (an unknown format, a
// damaged file) of those placed in the workspace dir (paths to their names
// there, see docJSON).
func (t *Typst) unreadableImages(ctx context.Context, dir string, placed map[string]string) ([]problem, error) {
	paths := slices.Sorted(maps.Keys(placed))
	lines, files := make([]string, len(paths)), make([]string, len(paths))
	for i, p := range paths {
		files[i] = placed[p]
		lines[i] = "#image(" + typstString(files[i]) + ")"
	}
	failed, err := t.failing(ctx, dir, "", lines, files)
	var bad []problem
	for i, p := range paths {
		if why, ok := failed[i]; ok {
			bad = append(bad, problem{p, why})
		}
	}
	return bad, err
}

// PNG draws the image at path widthPt points wide, at 2x, as PNG.
func (t *Typst) PNG(ctx context.Context, path string, widthPt float64) ([]byte, error) {
	dir, err := os.MkdirTemp("", "peanut-png-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	img := "img" + strings.ToLower(filepath.Ext(path))
	if err := linkInto(path, filepath.Join(dir, img)); err != nil {
		return nil, err
	}
	src := fmt.Sprintf("#set page(width: auto, height: auto, margin: 0pt, fill: none)\n#image(%s, width: %.2fpt)\n", typstString("/"+img), widthPt)
	if err := os.WriteFile(filepath.Join(dir, "main.typ"), []byte(src), 0o600); err != nil {
		return nil, err
	}
	if _, err := t.compile(ctx, dir, "main.typ", "out.png", "--ppi", "192"); err != nil {
		return nil, err
	}
	return os.ReadFile(filepath.Join(dir, "out.png"))
}

// equationsTyp draws each formula of eqs, an array of (tex, display), on a
// page of its own. Math in a line gets as much room below its baseline as
// above, so its baseline is the picture's middle.
const equationsTyp = `#import "mitex/lib.typ": mimath
#set page(width: auto, height: auto, margin: 0pt, fill: none)
#set text(size: %.2fpt, top-edge: "bounds", bottom-edge: "bounds")
#let draw(tex, display) = {
  let eq = box(mimath(tex, block: display))
  if display { box(inset: 1pt, eq) } else {
    context {
      let above = measure({ set text(bottom-edge: "baseline"); eq }).height
      let below = measure(eq).height - above
      let h = calc.max(above, below) + 1pt
      box(inset: (top: h - above, bottom: h - below, x: 1pt), eq)
    }
  }
}
#let eqs = (%s)
#for (i, (tex, display)) in eqs.enumerate() {
  if i > 0 { pagebreak() }
  draw(tex, display)
}
`

// Equations draws each formula of ms with sizePt text, as format "png" (at
// 2x) or "svg", in one Typst run: the pictures are in ms's order, nil for
// math mitex can't read (found, when compiling fails, by unreadableMath,
// and the rest compiled again). Math in a line has its baseline at its
// picture's middle.
func (t *Typst) Equations(ctx context.Context, ms []doc.Math, sizePt float64, format string) ([][]byte, error) {
	if len(ms) == 0 {
		return nil, nil
	}
	dir, err := os.MkdirTemp("", "peanut-math-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	if err := writeMitex(dir); err != nil {
		return nil, err
	}
	var flags []string
	if format == "png" {
		flags = []string{"--ppi", "192"}
	}
	// draw draws ms[i] for each i of idx into pics[i].
	pics := make([][]byte, len(ms))
	draw := func(idx []int) error {
		var eqs strings.Builder
		for _, i := range idx {
			fmt.Fprintf(&eqs, "(%s, %t), ", typstString(ms[i].TeX), ms[i].Display)
		}
		src := fmt.Sprintf(equationsTyp, sizePt, eqs.String())
		if err := os.WriteFile(filepath.Join(dir, "main.typ"), []byte(src), 0o600); err != nil {
			return err
		}
		if _, err := t.compile(ctx, dir, "main.typ", "out-{p}."+format, flags...); err != nil {
			return err
		}
		for page, i := range idx {
			var err error
			if pics[i], err = os.ReadFile(filepath.Join(dir, fmt.Sprintf("out-%d.%s", page+1, format))); err != nil {
				return err
			}
		}
		return nil
	}
	// readable is the index of each math of ms not in bad.
	readable := func(bad []problem) []int {
		skip := map[string]bool{}
		for _, m := range bad {
			skip[m.what] = true
		}
		var idx []int
		for i, m := range ms {
			if !skip[m.TeX] {
				idx = append(idx, i)
			}
		}
		return idx
	}
	known := t.knownBad(ms)
	if idx := readable(known); len(idx) > 0 {
		err = draw(idx)
	}
	if ce := (*CompileError)(nil); errors.As(err, &ce) {
		bad := t.findBadMath(ctx, dir, ms)
		if len(bad) == len(known) {
			return nil, err
		}
		err = nil
		if idx := readable(bad); len(idx) > 0 {
			err = draw(idx)
		}
	}
	if err != nil {
		return nil, err
	}
	return pics, nil
}

// Fonts lists the font families Typst can use, by name.
func (t *Typst) Fonts(ctx context.Context) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, t.Bin, "fonts").Output()
	if err != nil {
		return nil, fmt.Errorf("listing fonts: %w", err)
	}
	var fonts []string
	for _, l := range strings.Split(string(out), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			fonts = append(fonts, l)
		}
	}
	return fonts, nil
}

// workspace writes main.typ, the renderer, the template, its style (a custom
// template's changes, read by style.typ), doc.json, mitex and the document's
// images (in img/, which doc.json refers to them in) to a new temporary
// folder, and returns it with the images' paths' names there. What's in bad
// is shown as math's source and missing pictures.
func (t *Typst) workspace(d *doc.Document, tpl templates.Template, bad unreadable) (string, map[string]string, error) {
	src, err := tpl.Source()
	if err != nil {
		return "", nil, fmt.Errorf("template %s: %w", tpl.Name, err)
	}
	style, err := json.Marshal(tpl.TypstStyle())
	if err != nil {
		return "", nil, err
	}
	dir, err := os.MkdirTemp("", "peanut-render-*")
	if err != nil {
		return "", nil, err
	}
	data, images, err := docJSON(d, dir, bad)
	if err != nil {
		os.RemoveAll(dir)
		return "", nil, err
	}
	files := map[string][]byte{
		"main.typ": []byte(mainTyp), "peanut.typ": renderer, "template.typ": src,
		"style.typ": styleTyp, "style.json": style, "doc.json": data,
	}
	if d.Bibliography != "" {
		if files["refs.bib"], err = os.ReadFile(d.Bibliography); err != nil {
			os.RemoveAll(dir)
			return "", nil, err
		}
	}
	for name, b := range files {
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o600); err != nil {
			os.RemoveAll(dir)
			return "", nil, err
		}
	}
	if err := writeMitex(dir); err != nil {
		os.RemoveAll(dir)
		return "", nil, err
	}
	return dir, images, nil
}

// docJSON is d as doc.json in the workspace dir: only the properties the
// document shows, the math in bad marked so, and its images put in dir/img
// (but those in bad, shown missing) and referred to there, as Typst reads
// nothing outside the workspace. The images' paths' names there are
// returned too.
func docJSON(d *doc.Document, dir string, bad unreadable) ([]byte, map[string]string, error) {
	// A deep copy, so d keeps its own paths (Word reads them).
	b, err := json.Marshal(d)
	if err != nil {
		return nil, nil, err
	}
	var shown doc.Document
	if err := json.Unmarshal(b, &shown); err != nil {
		return nil, nil, err
	}
	shown.Meta = d.Meta.Shown()
	shown.Blocks = capDepth(shown.Blocks, 0)
	skip := map[string]bool{}
	for _, m := range bad.images {
		skip[m.what] = true
	}
	placed := map[string]string{}
	var failed error
	// place puts the image at *src in the workspace; one in bad is missing
	// instead, named in *missing (nil for an inline image, which has no
	// placeholder).
	place := func(src, missing *string) {
		if *src == "" || failed != nil {
			return
		}
		if skip[*src] {
			if missing != nil {
				*missing = filepath.Base(*src)
			}
			*src = ""
			return
		}
		name, ok := placed[*src]
		if !ok {
			if err := os.MkdirAll(filepath.Join(dir, "img"), 0o700); err != nil {
				failed = err
				return
			}
			name = fmt.Sprintf("/img/%d%s", len(placed), strings.ToLower(filepath.Ext(*src)))
			if err := linkInto(*src, filepath.Join(dir, filepath.FromSlash(name))); err != nil {
				failed = err
				return
			}
			placed[*src] = name
		}
		*src = name
	}
	why := map[string]string{}
	for _, m := range bad.math {
		why[m.what] = m.why
	}
	labels := map[string]bool{}
	doc.Walk(shown.Blocks, func(b *doc.Block) {
		place(&b.Src, &b.Missing)
		for j := range b.Pictures {
			place(&b.Pictures[j].Src, &b.Pictures[j].Missing)
		}
		if b.Type == doc.BlockEquation && b.Error == "" {
			b.Error = why[b.Text]
		}
		// A label used twice (or in a note marked twice) would stop Typst:
		// only the first block keeps it, as references resolve.
		if b.Label != "" && b.Number > 0 {
			if labels[b.Label] {
				b.Label = ""
			} else {
				labels[b.Label] = true
			}
		}
	}, func(x *doc.Inline) {
		place(&x.Src, nil)
		if x.Type == doc.InlineMath && x.Error == "" {
			x.Error = why[x.Text]
		}
		// Without references (see doc.UseBibliography), a citation would
		// stop Typst.
		if d.Bibliography == "" {
			for i := range x.Cites {
				x.Cites[i].Missing = true
			}
		}
	})
	// A note made text (see maxDepth) loses its figures, and their labels:
	// a reference to one is shown unresolved, as Typst would stop at it.
	doc.Walk(shown.Blocks, func(*doc.Block) {}, func(x *doc.Inline) {
		if x.Type == doc.InlineRef && !labels[x.Label] {
			x.Kind = ""
		}
	})
	if failed != nil {
		return nil, nil, failed
	}
	data, err := json.Marshal(&shown)
	return data, placed, err
}

// maxDepth caps how deeply quotes, lists, notes and styled or linked text
// nest in doc.json: Typst gives up on a deeper document (its function calls
// nest only so far, about 20 of ours, and its JSON reader stops at 128
// arrays and objects). What's deeper is flattened into the level at the cap,
// keeping its text: a quote or list into its blocks, styled text into its
// text, and a note within a note into its text in brackets, as such a note
// is drawn anyway.
const maxDepth = 12

// capDepth is bs, at depth, flattened below maxDepth (see there).
func capDepth(bs []doc.Block, depth int) []doc.Block {
	out := make([]doc.Block, 0, len(bs))
	for _, b := range bs {
		switch b.Type {
		case doc.BlockQuote:
			if depth >= maxDepth {
				out = append(out, capDepth(b.Children, depth)...)
				continue
			}
			b.Children = capDepth(b.Children, depth+1)
		case doc.BlockList:
			if depth >= maxDepth {
				for _, item := range b.Items {
					out = append(out, capDepth(item, depth)...)
				}
				continue
			}
			for i, item := range b.Items {
				// A tight item's blocks run together: one with a list or
				// quote flattened into it needs paragraph breaks.
				if depth+1 >= maxDepth && slices.ContainsFunc(item, func(x doc.Block) bool {
					return x.Type == doc.BlockQuote || x.Type == doc.BlockList
				}) {
					b.Tight = false
				}
				b.Items[i] = capDepth(item, depth+1)
			}
		}
		b.Inlines = capInlines(b.Inlines, depth)
		b.Caption = capInlines(b.Caption, depth)
		for i, cell := range b.Header {
			b.Header[i] = capInlines(cell, depth)
		}
		for _, row := range b.Rows {
			for i, cell := range row {
				row[i] = capInlines(cell, depth)
			}
		}
		for i := range b.Pictures {
			b.Pictures[i].Alt = capInlines(b.Pictures[i].Alt, depth)
		}
		out = append(out, b)
	}
	return out
}

// capInlines is xs, at depth, flattened below maxDepth. A note at the cap is
// kept (its blocks flattened), so only a note within it is made text.
func capInlines(xs []doc.Inline, depth int) []doc.Inline {
	if len(xs) == 0 {
		return xs
	}
	out := make([]doc.Inline, 0, len(xs))
	for _, x := range xs {
		switch {
		case x.Type == doc.InlineFootnote && depth > maxDepth:
			out = append(out, doc.Inline{Type: doc.InlineText, Text: " ("})
			out = append(out, capInlines(runOf(x.Blocks), depth)...)
			out = append(out, doc.Inline{Type: doc.InlineText, Text: ")"})
			continue
		case x.Type == doc.InlineFootnote:
			x.Blocks = capDepth(x.Blocks, depth+1)
		case len(x.Children) > 0 && depth >= maxDepth:
			out = append(out, capInlines(x.Children, depth)...)
			continue
		case len(x.Children) > 0:
			x.Children = capInlines(x.Children, depth+1)
		}
		out = append(out, x)
	}
	return out
}

// runOf is the text of bs as one run, blocks apart by a space: a code block
// as code, an equation as math, a figure or table as its caption and cells.
func runOf(bs []doc.Block) []doc.Inline {
	var out []doc.Inline
	add := func(xs ...doc.Inline) {
		if len(xs) == 0 {
			return
		}
		if len(out) > 0 {
			out = append(out, doc.Inline{Type: doc.InlineText, Text: " "})
		}
		out = append(out, xs...)
	}
	for _, b := range bs {
		switch b.Type {
		case doc.BlockQuote:
			add(runOf(b.Children)...)
		case doc.BlockList:
			for _, item := range b.Items {
				add(runOf(item)...)
			}
		case doc.BlockCode:
			add(doc.Inline{Type: doc.InlineCode, Text: b.Text})
		case doc.BlockEquation:
			add(doc.Inline{Type: doc.InlineMath, Text: b.Text, Error: b.Error})
		default:
			add(b.Inlines...)
			add(b.Caption...)
			for _, cell := range b.Header {
				add(cell...)
			}
			for _, row := range b.Rows {
				for _, cell := range row {
					add(cell...)
				}
			}
		}
	}
	return out
}

// linkInto puts the file src at dst: a hard link, or a copy where one can't
// be made (another volume).
func linkInto(src, dst string) error {
	if os.Link(src, dst) == nil {
		return nil
	}
	b, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, b, 0o600)
}

// writeMitex writes the bundled mitex package to dir/mitex.
func writeMitex(dir string) error {
	return fs.WalkDir(mitex, "mitex", func(p string, e fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		dst := filepath.Join(dir, filepath.FromSlash(p))
		if e.IsDir() {
			return os.MkdirAll(dst, 0o700)
		}
		b, err := mitex.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(dst, b, 0o600)
	})
}

// compile runs typst in dir, which is also its project root: Typst can read
// only what the workspace holds (doc.json, the images put there, mitex), so
// neither a template nor a document's math can read other files.
func (t *Typst) compile(ctx context.Context, dir, input, output string, flags ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	args := append([]string{"compile", "--diagnostic-format", "short", "--root", "."}, flags...)
	cmd := exec.CommandContext(ctx, t.Bin, append(args, input, output)...)
	cmd.Dir = dir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		msg := strings.Join(diagnostics(stderr.String()), "\n")
		if msg == "" {
			msg = err.Error()
		}
		return "", &CompileError{Output: msg}
	}
	return stderr.String(), nil
}

var ansi = regexp.MustCompile("\x1b\\[[0-9;]*[A-Za-z]")

// diagnostics are typst's non-empty stderr lines, without notes about fonts
// a template lists as fallbacks.
func diagnostics(stderr string) []string {
	var lines []string
	for _, l := range strings.Split(stderr, "\n") {
		l = strings.TrimSpace(ansi.ReplaceAllString(l, ""))
		if l == "" || strings.Contains(l, "unknown font family") || strings.HasPrefix(l, "hint:") {
			continue
		}
		lines = append(lines, l)
	}
	return lines
}

// typstQuote escapes s for a Typst string literal, writing each character
// Typst counts as a line break as an escape: a quoted string stays on its
// line (failing finds what fails by its line).
var typstQuote = strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`,
	"\v", `\u{b}`, "\f", `\u{c}`, "\u0085", `\u{85}`, "\u2028", `\u{2028}`, "\u2029", `\u{2029}`)

// typstString quotes s as a Typst string literal.
func typstString(s string) string { return `"` + typstQuote.Replace(s) + `"` }
