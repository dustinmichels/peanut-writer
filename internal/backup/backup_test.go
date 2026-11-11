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

	if err := Write(draft, "draft", start); err != nil {
		t.Fatal(err)
	}
	for i := range Keep + 2 {
		if err := Write(notes, "v", start.Add(time.Duration(i)*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}

	got := list(notes)
	if len(got) != Keep || got[0] != "2026-11-10T09-02-00" {
		t.Fatalf("notes backups = %v, want the newest %d from 09-02", got, Keep)
	}
	if _, err := os.Stat(file(notes, "2026-11-10T09-01-00", ".md")); !os.IsNotExist(err) {
		t.Errorf("pruned backup still there: %v", err)
	}
	if _, err := os.Stat(stampDir(notes, "2026-11-10T09-01-00")); !os.IsNotExist(err) {
		t.Errorf("emptied stamp folder still there: %v", err)
	}
	if d := list(draft); !slices.Equal(d, []string{"2026-11-10T09-00-00"}) {
		t.Errorf("notes-draft backups = %v; pruning notes mustn't touch them", d)
	}
}
