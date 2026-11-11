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
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strconv"
	"strings"
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

// main.typ: the template's show rule over the rendered body.
const mainTyp = `#import "peanut.typ": render
#import "template.typ": template
#let doc = json("doc.json")
#show: template.with(doc.meta)
#render(doc)
`

// CompileError is a Typst error, with its diagnostics.
type CompileError struct{ Output string }

func (e *CompileError) Error() string { return e.Output }

// Typst runs the typst binary.
type Typst struct{ Bin string }

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
			return &Typst{p}, nil
		}
	}
	// Not a mise shim: it picks a version by the working folder, which the
	// app's isn't. The real binary is found below.
	if p, err := exec.LookPath(name); err == nil && !strings.Contains(filepath.ToSlash(p), "/mise/shims/") {
		return &Typst{p}, nil
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
			return &Typst{p}, nil
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
// can't read doesn't stop it: if compiling fails, each such formula is
// found (see unreadableMath), shown as its LaTeX source with a warning, and
// it's compiled again.
func (t *Typst) render(ctx context.Context, d *doc.Document, tpl templates.Template, output string, flags ...string) (string, []string, error) {
	dir, err := t.workspace(d, tpl, nil)
	if err != nil {
		return "", nil, err
	}
	stderr, err := t.compile(ctx, dir, "main.typ", output, flags...)
	var unreadable []mathError
	if ce := (*CompileError)(nil); errors.As(err, &ce) {
		if unreadable, _ = t.unreadableMath(ctx, dir, doc.ReadableMath(d.Blocks)); len(unreadable) > 0 {
			os.RemoveAll(dir)
			if dir, err = t.workspace(d, tpl, unreadable); err != nil {
				return "", nil, err
			}
			stderr, err = t.compile(ctx, dir, "main.typ", output, flags...)
		}
	}
	if err != nil {
		os.RemoveAll(dir)
		return "", nil, err
	}
	warnings := diagnostics(stderr)
	for _, m := range unreadable {
		warnings = append(warnings, fmt.Sprintf("math can't be read (%s): %s", m.why, m.tex))
	}
	return dir, warnings, nil
}

// mathError is LaTeX mitex can't read, and mitex's reason.
type mathError struct{ tex, why string }

// checkedAt finds the line of check.typ a Typst error's trace passes
// through.
var checkedAt = regexp.MustCompile(`at check\.typ:(\d+):`)

// unreadableMath finds the math in ms that mitex can't read (or whose
// reading Typst then can't run), in the workspace dir. Each formula is read
// on its own line of a check file; Typst stops at the first one that fails,
// so the check runs again on those after it. An error that isn't one
// formula's ends the search.
func (t *Typst) unreadableMath(ctx context.Context, dir string, ms []doc.Math) ([]mathError, error) {
	var texs []string
	seen := map[string]bool{}
	for _, m := range ms {
		if !seen[m.TeX] {
			seen[m.TeX] = true
			texs = append(texs, m.TeX)
		}
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var bad []mathError
	for len(texs) > 0 {
		var src strings.Builder
		src.WriteString("#import \"mitex/lib.typ\": mimath\n")
		for _, tex := range texs {
			fmt.Fprintf(&src, "#let _ = mimath(%s)\n", typstString(tex)) // line i+2
		}
		if err := os.WriteFile(filepath.Join(dir, "check.typ"), []byte(src.String()), 0o600); err != nil {
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
		m := checkedAt.FindStringSubmatch(out)
		if m == nil {
			return bad, nil
		}
		i, _ := strconv.Atoi(m[1])
		if i -= 2; i < 0 || i >= len(texs) {
			return bad, nil
		}
		why, _, _ := strings.Cut(out, "\n")
		why = why[strings.LastIndex(why, "error: ")+len("error: "):]
		bad = append(bad, mathError{texs[i], strings.TrimSpace(why)})
		texs = texs[i+1:]
	}
	return bad, nil
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
	all := make([]int, len(ms))
	for i := range all {
		all[i] = i
	}
	err = draw(all)
	if ce := (*CompileError)(nil); errors.As(err, &ce) {
		unreadable, _ := t.unreadableMath(ctx, dir, ms)
		if len(unreadable) == 0 {
			return nil, err
		}
		bad := map[string]bool{}
		for _, m := range unreadable {
			bad[m.tex] = true
		}
		var rest []int
		for i, m := range ms {
			if !bad[m.TeX] {
				rest = append(rest, i)
			}
		}
		err = nil
		if len(rest) > 0 {
			err = draw(rest)
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
// folder. The math in unreadable is shown as its source.
func (t *Typst) workspace(d *doc.Document, tpl templates.Template, unreadable []mathError) (string, error) {
	src, err := tpl.Source()
	if err != nil {
		return "", fmt.Errorf("template %s: %w", tpl.Name, err)
	}
	style, err := json.Marshal(tpl.TypstStyle())
	if err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp("", "peanut-render-*")
	if err != nil {
		return "", err
	}
	data, err := docJSON(d, dir, unreadable)
	if err != nil {
		os.RemoveAll(dir)
		return "", err
	}
	files := map[string][]byte{
		"main.typ": []byte(mainTyp), "peanut.typ": renderer, "template.typ": src,
		"style.typ": styleTyp, "style.json": style, "doc.json": data,
	}
	for name, b := range files {
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o600); err != nil {
			os.RemoveAll(dir)
			return "", err
		}
	}
	if err := writeMitex(dir); err != nil {
		os.RemoveAll(dir)
		return "", err
	}
	return dir, nil
}

// docJSON is d as doc.json in the workspace dir: only the properties the
// document shows, the math in unreadable marked so, and its images put in
// dir/img and referred to there, as Typst reads nothing outside the
// workspace.
func docJSON(d *doc.Document, dir string, unreadable []mathError) ([]byte, error) {
	// A deep copy, so d keeps its own paths (Word reads them).
	b, err := json.Marshal(d)
	if err != nil {
		return nil, err
	}
	var shown doc.Document
	if err := json.Unmarshal(b, &shown); err != nil {
		return nil, err
	}
	shown.Meta = d.Meta.Shown()
	placed := map[string]string{}
	var failed error
	place := func(src *string) {
		if *src == "" || failed != nil {
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
	for _, m := range unreadable {
		why[m.tex] = m.why
	}
	doc.Walk(shown.Blocks, func(b *doc.Block) {
		place(&b.Src)
		for j := range b.Pictures {
			place(&b.Pictures[j].Src)
		}
		if b.Type == doc.BlockEquation && b.Error == "" {
			b.Error = why[b.Text]
		}
	}, func(x *doc.Inline) {
		place(&x.Src)
		if x.Type == doc.InlineMath && x.Error == "" {
			x.Error = why[x.Text]
		}
	})
	if failed != nil {
		return nil, failed
	}
	return json.Marshal(&shown)
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

// typstString quotes s as a Typst string literal.
func typstString(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`).Replace(s) + `"`
}
