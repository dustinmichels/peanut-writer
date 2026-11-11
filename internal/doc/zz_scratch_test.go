package doc

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/yuin/goldmark/text"
)

func TestZZScratchDump(t *testing.T) {
	in := os.Getenv("ZZ_IN")
	if in == "" {
		t.Skip()
	}
	b, err := os.ReadFile(in)
	if err != nil {
		t.Fatal(err)
	}
	var docs []string
	if err := json.Unmarshal(b, &docs); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	out := make([]*Document, len(docs))
	for i, s := range docs {
		out[i] = Parse(s, dir)
	}
	o, _ := json.Marshal(out)
	if err := os.WriteFile(os.Getenv("ZZ_OUT"), o, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestZZScratchAST(t *testing.T) {
	src := os.Getenv("ZZ_SRC")
	if src == "" {
		t.Skip()
	}
	root := markdown.Parser().Parse(text.NewReader([]byte(src)))
	root.Dump([]byte(src), 0)
}
