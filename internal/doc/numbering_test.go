package doc

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var update = flag.Bool("update", false, "rewrite testdata/numbering/*.want from Parse")

// numbered lists what Parse numbers, one per line in document order:
// kind, number and label, and a figure's layout ("figure 2 fig:g
// pictures=3 columns=3 width=80 align=left").
func numbered(d *Document) string {
	var b strings.Builder
	walk(d.Blocks, func(x *Block) {
		if x.Number == 0 {
			return
		}
		f := []string{x.Type, fmt.Sprint(x.Number)}
		if x.Label != "" {
			f = append(f, x.Label)
		}
		if x.Type == BlockFigure {
			if len(x.Pictures) > 0 {
				f = append(f, fmt.Sprintf("pictures=%d columns=%d", len(x.Pictures), x.Columns))
			}
			if x.Width > 0 {
				f = append(f, fmt.Sprintf("width=%g", x.Width))
			}
			if x.Position != "" {
				f = append(f, "align="+x.Position)
			}
		}
		b.WriteString(strings.Join(f, " ") + "\n")
	}, func(*Inline) {})
	return b.String()
}

// The editor numbers figures, tables and equations as you type with its own
// reading of the Markdown (frontend/src/lib/markdown.ts, scan). Each
// testdata/numbering/NAME.md is read by both: NAME.want is what Parse
// numbers, and markdown.test.ts checks scan against the same file.
func TestNumberingSamples(t *testing.T) {
	samples, err := filepath.Glob(filepath.Join("testdata", "numbering", "*.md"))
	if err != nil || len(samples) == 0 {
		t.Fatalf("no samples: %v", err)
	}
	for _, path := range samples {
		t.Run(filepath.Base(path), func(t *testing.T) {
			src, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			got := numbered(Parse(string(src), filepath.Dir(path)))
			wantPath := strings.TrimSuffix(path, ".md") + ".want"
			if *update {
				if err := os.WriteFile(wantPath, []byte(got), 0o644); err != nil {
					t.Fatal(err)
				}
				return
			}
			want, err := os.ReadFile(wantPath)
			if err != nil {
				t.Fatalf("%v (run go test -update to write it)", err)
			}
			if got != string(want) {
				t.Errorf("got:\n%s\nwant:\n%s", got, want)
			}
		})
	}
}
