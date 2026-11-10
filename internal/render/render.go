// Package render compiles documents with Typst: SVG pages for the live
// preview, PDF for export, and PNG copies of images Word can't show.
package render

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"time"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

//go:embed peanut.typ
var renderer []byte

//go:embed style.typ
var styleTyp []byte

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
	dir, err := t.workspace(d, tpl)
	if err != nil {
		return nil, nil, err
	}
	defer os.RemoveAll(dir)
	stderr, err := t.compile(ctx, dir, "main.typ", "page-{0p}.svg", "--input", "peanut-preview=1")
	if err != nil {
		return nil, nil, err
	}
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
	return pages, diagnostics(stderr), nil
}

// PDF renders d with tpl to PDF.
func (t *Typst) PDF(ctx context.Context, d *doc.Document, tpl templates.Template) ([]byte, error) {
	dir, err := t.workspace(d, tpl)
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	if _, err := t.compile(ctx, dir, "main.typ", "output.pdf"); err != nil {
		return nil, err
	}
	return os.ReadFile(filepath.Join(dir, "output.pdf"))
}

// PNG draws the image at path widthPt points wide, at 2x, as PNG.
func (t *Typst) PNG(ctx context.Context, path string, widthPt float64) ([]byte, error) {
	dir, err := os.MkdirTemp("", "peanut-png-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	src := fmt.Sprintf("#set page(width: auto, height: auto, margin: 0pt, fill: none)\n#image(%s, width: %.2fpt)\n", typstString(path), widthPt)
	if err := os.WriteFile(filepath.Join(dir, "main.typ"), []byte(src), 0o600); err != nil {
		return nil, err
	}
	if _, err := t.compile(ctx, dir, "main.typ", "out.png", "--ppi", "192"); err != nil {
		return nil, err
	}
	return os.ReadFile(filepath.Join(dir, "out.png"))
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
// template's changes, read by style.typ) and doc.json to a new temporary
// folder.
func (t *Typst) workspace(d *doc.Document, tpl templates.Template) (string, error) {
	src, err := tpl.Source()
	if err != nil {
		return "", fmt.Errorf("template %s: %w", tpl.Name, err)
	}
	data, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	style, err := json.Marshal(tpl.Style)
	if err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp("", "peanut-render-*")
	if err != nil {
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
	return dir, nil
}

// compile runs typst in dir. The project root is the file system's root, so
// images anywhere can be read by absolute path.
func (t *Typst) compile(ctx context.Context, dir, input, output string, flags ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	root := string(filepath.Separator)
	if v := filepath.VolumeName(dir); v != "" {
		root = v + root
	}
	args := append([]string{"compile", "--diagnostic-format", "short", "--root", root}, flags...)
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
