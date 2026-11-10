package backup

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

func TestWriteKeepsNewestPerDocument(t *testing.T) {
	dir := t.TempDir()
	notes := filepath.Join(dir, "notes.md")
	draft := filepath.Join(dir, "notes-draft.md")
	start := time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)

	if err := Write(draft, "draft", []byte("word"), start); err != nil {
		t.Fatal(err)
	}
	for i := range Keep + 2 {
		if err := Write(notes, "v", []byte("word"), start.Add(time.Duration(i)*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}

	got := list(notes)
	if len(got) != Keep || got[0] != "2026-11-10T09-02-00" {
		t.Fatalf("notes backups = %v, want the newest %d from 09-02", got, Keep)
	}
	for _, ext := range []string{".md", ".docx"} {
		if _, err := os.Stat(file(notes, "2026-11-10T09-01-00", ext)); !os.IsNotExist(err) {
			t.Errorf("pruned %s still there: %v", ext, err)
		}
	}
	if d := list(draft); !slices.Equal(d, []string{"2026-11-10T09-00-00"}) {
		t.Errorf("notes-draft backups = %v; pruning notes mustn't touch them", d)
	}
}

func TestChanged(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a.md")
	if !Changed(p, "x") {
		t.Fatal("no backups yet: want changed")
	}
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	if err := Write(p, "old", nil, at); err != nil {
		t.Fatal(err)
	}
	if err := Write(p, "x", nil, at.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if Changed(p, "x") {
		t.Error("same as newest backup: want unchanged")
	}
	if !Changed(p, "old") {
		t.Error("differs from newest backup: want changed")
	}
}
