package render

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
	mrand "math/rand"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/templates"
)

const scratchOut = "/tmp/rm9"

func scratchRender(t *testing.T, name, src string, tpl templates.Template, pdf bool) (string, []string, time.Duration) {
	t.Helper()
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	os.MkdirAll(scratchOut, 0o755)
	d := doc.Parse(src, scratchOut)
	start := time.Now()
	if !pdf {
		pages, warns, err := ty.Preview(context.Background(), d, tpl)
		el := time.Since(start)
		if err != nil {
			t.Errorf("%s/%s preview: %v", name, tpl.ID, err)
			return "", nil, el
		}
		for i, p := range pages {
			os.WriteFile(filepath.Join(scratchOut, fmt.Sprintf("%s-%s-%03d.svg", name, tpl.ID, i)), []byte(p), 0o644)
		}
		return fmt.Sprint(len(pages)), warns, el
	}
	b, err := ty.PDF(context.Background(), d, tpl)
	el := time.Since(start)
	if err != nil {
		t.Errorf("%s/%s pdf: %v", name, tpl.ID, err)
		return "", nil, el
	}
	p := filepath.Join(scratchOut, name+"-"+tpl.ID+".pdf")
	os.WriteFile(p, b, 0o644)
	out, _ := exec.Command("pdftotext", "-layout", p, "-").Output()
	return string(out), nil, el
}

func builtins() []templates.Template {
	var out []templates.Template
	for _, tpl := range templates.List() {
		if tpl.Builtin {
			out = append(out, tpl)
		}
	}
	return out
}

func TestScratchFile(t *testing.T) {
	f := os.Getenv("SCRATCH_MD")
	if f == "" {
		t.Skip()
	}
	b, err := os.ReadFile(f)
	if err != nil {
		t.Fatal(err)
	}
	name := strings.TrimSuffix(filepath.Base(f), ".md")
	pdf := os.Getenv("SCRATCH_PDF") != ""
	only := os.Getenv("SCRATCH_TPL")
	for _, tpl := range builtins() {
		if only != "" && !strings.Contains(","+only+",", ","+tpl.ID+",") {
			continue
		}
		if s := os.Getenv("SCRATCH_SIZE"); s != "" {
			var v float64
			fmt.Sscan(s, &v)
			tpl.Style.FontSize = v
		}
		txt, warns, el := scratchRender(t, name, string(b), tpl, pdf)
		if pdf {
			os.WriteFile(filepath.Join(scratchOut, name+"-"+tpl.ID+".txt"), []byte(txt), 0o644)
			t.Logf("%s: %v", tpl.ID, el)
		} else {
			t.Logf("%s: %s pages %v warns=%q", tpl.ID, txt, el, warns)
		}
	}
}

func TestScratchBaseline(t *testing.T) {
	out := os.Getenv("SCRATCH_BASE")
	if out == "" {
		t.Skip()
	}
	ty, err := Find()
	if err != nil {
		t.Skip(err)
	}
	files := strings.Fields(os.Getenv("SCRATCH_FILES"))
	pdf := os.Getenv("SCRATCH_PDF") != ""
	var total time.Duration
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		d := doc.Parse(string(b), filepath.Dir(f))
		name := strings.TrimSuffix(filepath.Base(f), ".md")
		for _, tpl := range builtins() {
			if s := os.Getenv("SCRATCH_SIZE"); s != "" {
				var v float64
				fmt.Sscan(s, &v)
				tpl.Style.FontSize = v
			}
			dir := filepath.Join(out, name, tpl.ID)
			os.MkdirAll(dir, 0o755)
			start := time.Now()
			if pdf {
				b, err := ty.PDF(context.Background(), d, tpl)
				total += time.Since(start)
				if err != nil {
					t.Errorf("%s/%s: %v", name, tpl.ID, err)
					continue
				}
				os.WriteFile(filepath.Join(dir, "out.pdf"), b, 0o644)
				continue
			}
			pages, _, err := ty.Preview(context.Background(), d, tpl)
			total += time.Since(start)
			if err != nil {
				t.Errorf("%s/%s: %v", name, tpl.ID, err)
				continue
			}
			for i, p := range pages {
				os.WriteFile(filepath.Join(dir, fmt.Sprintf("%03d.svg", i)), []byte(p), 0o644)
			}
		}
	}
	t.Logf("total %v", total)
}

func TestScratchPerf(t *testing.T) {
	f := os.Getenv("SCRATCH_PERF")
	if f == "" {
		t.Skip()
	}
	ty, _ := Find()
	b, _ := os.ReadFile(f)
	d := doc.Parse(string(b), filepath.Dir(f))
	tpl := builtins()[0]
	for _, x := range builtins() {
		if x.ID == cmpOr(os.Getenv("SCRATCH_TPL"), "classic") {
			tpl = x
		}
	}
	var ds []time.Duration
	var n int
	for range 5 {
		start := time.Now()
		pages, _, err := ty.Preview(context.Background(), d, tpl)
		if err != nil {
			t.Fatal(err)
		}
		n = len(pages)
		ds = append(ds, time.Since(start))
	}
	t.Logf("%s %s pages=%d %v", filepath.Base(f), tpl.ID, n, ds)
}

func cmpOr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func TestScratchMathFuzz(t *testing.T) {
	if os.Getenv("SCRATCH_FUZZ") == "" {
		t.Skip()
	}
	ty, _ := Find()
	read := func(p string) []string {
		b, _ := os.ReadFile(p)
		return strings.Fields(string(b))
	}
	var cases []string
	for _, c := range read("/tmp/rm9in/cmds.txt") {
		for _, v := range []string{``, `{x}`, `{x}{y}`, `[x]{y}`, `{}`, `{}{}`, ` x`, `{-1cm}`, `{1cm}{2cm}`, `{\#}`, `{"a"}`, `{a}{b}{c}`, `{red}{x}`, `[]{}`, `_x^y`} {
			cases = append(cases, `\`+c+v)
		}
	}
	for _, e := range read("/tmp/rm9in/envs.txt") {
		for _, v := range []string{`a & b \\ c & d`, `{cc} a & b \\ c & d`, ``, `{} a`, `{|c|} a \\ \hline b`, `a & & & & b`, `\\ \\`} {
			cases = append(cases, `\begin{`+e+`}`+v+`\end{`+e+`}`)
		}
	}
	tpl := builtins()[0]
	ctx := context.Background()
	mk := func(cs []string) *doc.Document {
		var b strings.Builder
		for _, c := range cs {
			fmt.Fprintf(&b, "Inline $%s$ x.\n\n$$ %s $$\n\n", c, c)
		}
		return doc.Parse(b.String(), "")
	}
	var bad []string
	var try func(cs []string)
	try = func(cs []string) {
		_, _, err := ty.Preview(ctx, mk(cs), tpl)
		if err == nil {
			return
		}
		if len(cs) == 1 {
			bad = append(bad, cs[0]+"  => "+strings.ReplaceAll(err.Error(), "\n", " | "))
			return
		}
		try(cs[:len(cs)/2])
		try(cs[len(cs)/2:])
	}
	t.Logf("%d cases", len(cases))
	for i := 0; i < len(cases); i += 400 {
		try(cases[i:min(i+400, len(cases))])
	}
	for _, b := range bad {
		t.Log(b)
	}
	t.Logf("%d whole-render failures", len(bad))
}

func TestScratchDepthFuzz(t *testing.T) {
	if os.Getenv("SCRATCH_DEPTH") == "" {
		t.Skip()
	}
	ty, _ := Find()
	rng := newRand()
	// build makes nested markdown from a chain of kinds, innermost text last.
	build := func(chain []string) string {
		var notes []string
		var rec func(i int, indent string) string
		rec = func(i int, indent string) string {
			if i == len(chain) {
				return "deep text $x^2$ `c`"
			}
			inner := rec(i+1, "")
			switch chain[i] {
			case "quote":
				lines := strings.Split(inner, "\n")
				for j := range lines {
					lines[j] = "> " + lines[j]
				}
				return strings.Join(lines, "\n")
			case "list", "olist":
				m := "- "
				if chain[i] == "olist" {
					m = "1. "
				}
				lines := strings.Split(inner, "\n")
				for j := range lines {
					if j == 0 {
						lines[j] = m + lines[j]
					} else {
						lines[j] = strings.Repeat(" ", len(m)) + lines[j]
					}
				}
				return "item\n\n" + strings.Join(lines, "\n")
			case "note":
				n := fmt.Sprintf("n%d", len(notes))
				notes = append(notes, "")
				k := len(notes) - 1
				notes[k] = "[^" + n + "]: " + strings.ReplaceAll(inner, "\n", "\n    ")
				return "noted[^" + n + "]"
			case "strong":
				if strings.Contains(inner, "\n") {
					return inner
				}
				return "**a " + inner + " b**"
			case "emph":
				if strings.Contains(inner, "\n") {
					return inner
				}
				return "*a " + inner + " b*"
			case "link":
				if strings.Contains(inner, "\n") {
					return inner
				}
				return "[a " + inner + "](https://x.org)"
			}
			return inner
		}
		body := rec(0, "")
		return body + "\n\n" + strings.Join(notes, "\n\n") + "\n"
	}
	kinds := []string{"quote", "list", "olist", "note", "strong", "emph", "link"}
	tpls := builtins()
	fails := 0
	for n := 0; n < 120; n++ {
		depth := 8 + rng.Intn(30)
		chain := make([]string, depth)
		for i := range chain {
			chain[i] = kinds[rng.Intn(len(kinds))]
		}
		src := build(chain)
		d := doc.Parse(src, "")
		data, _, err := docJSON(d, t.TempDir(), unreadable{})
		if err != nil || !strings.Contains(string(data), "deep text") {
			t.Errorf("lost text %v %v", chain, err)
		}
		tpl := tpls[n%len(tpls)]
		if _, _, err := ty.Preview(context.Background(), d, tpl); err != nil {
			fails++
			t.Errorf("%s %v: %.200s", tpl.ID, chain, err)
		}
	}
	t.Logf("fails %d", fails)
}

func newRand() *mrand.Rand { return mrand.New(mrand.NewSource(7)) }

func TestScratchCapCost(t *testing.T) {
	if os.Getenv("SCRATCH_CAP") == "" {
		t.Skip()
	}
	b, _ := os.ReadFile("../../refine.md")
	src := strings.Repeat(string(b)+"\n\n", 40)
	d := doc.Parse(src, "")
	start := time.Now()
	for range 10 {
		docJSON(d, t.TempDir(), unreadable{})
	}
	all := time.Since(start) / 10
	start = time.Now()
	for range 10 {
		capDepth(d.Blocks, 0)
	}
	t.Logf("%d KB: docJSON %v, capDepth %v", len(src)/1024, all, time.Since(start)/10)
}
