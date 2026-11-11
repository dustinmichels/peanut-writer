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
	if len(got) != Keep || got[0].name != "2026-11-10T09-02-00+0000" {
		t.Fatalf("notes backups = %v, want the newest %d from 09-02", got, Keep)
	}
	if _, err := os.Stat(filepath.Join(stampDir(notes, "2026-11-10T09-01-00+0000"), "notes.md")); !os.IsNotExist(err) {
		t.Errorf("pruned backup still there: %v", err)
	}
	if _, err := os.Stat(stampDir(notes, "2026-11-10T09-01-00+0000")); !os.IsNotExist(err) {
		t.Errorf("emptied stamp folder still there: %v", err)
	}
	if d := list(draft); len(d) != 1 || d[0].name != "2026-11-10T09-00-00+0000" {
		t.Errorf("notes-draft backups = %v; pruning notes mustn't touch them", d)
	}
}

// When clocks go back, the repeated hour's later backups have earlier local
// times; they still list after the ones before them, and folders named in
// local time alone (before the UTC offset was added) still list.
func TestListOrdersByInstant(t *testing.T) {
	ny, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip(err)
	}
	notes := filepath.Join(t.TempDir(), "notes.md")
	legacy := time.Date(2026, 10, 31, 12, 0, 0, 0, time.Local)
	if err := os.MkdirAll(stampDir(notes, legacy.Format(oldStampLayout)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stampDir(notes, legacy.Format(oldStampLayout)), "notes.md"), []byte("legacy"), 0o644); err != nil {
		t.Fatal(err)
	}
	edt := time.Date(2026, 11, 1, 5, 30, 0, 0, time.UTC).In(ny) // 1:30 EDT
	est := time.Date(2026, 11, 1, 6, 10, 0, 0, time.UTC).In(ny) // 1:10 EST, 40 minutes on
	if err := Write(notes, "first", edt); err != nil {
		t.Fatal(err)
	}
	if err := Write(notes, "second", est); err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, b := range List(notes) {
		c, err := os.ReadFile(b.Path)
		if err != nil {
			t.Fatal(err)
		}
		got = append(got, string(c))
	}
	if !slices.Equal(got, []string{"second", "first", "legacy"}) {
		t.Errorf("backups = %q, want newest first", got)
	}
	if Changed(notes, "second") {
		t.Error("Changed compared against an older backup than the newest")
	}
}

func TestWriteKeepsBackupsOfTheSameSecond(t *testing.T) {
	notes := filepath.Join(t.TempDir(), "notes.md")
	at := time.Date(2026, 11, 10, 9, 0, 0, 0, time.Local)
	for i, content := range []string{"first", "second"} {
		if err := Write(notes, content, at.Add(time.Duration(i)*100*time.Millisecond)); err != nil {
			t.Fatal(err)
		}
	}
	var got []string
	for _, b := range List(notes) {
		c, err := os.ReadFile(b.Path)
		if err != nil {
			t.Fatal(err)
		}
		got = append(got, string(c))
	}
	if !slices.Equal(got, []string{"second", "first"}) {
		t.Errorf("backups = %q, want both, newest first", got)
	}
}

// Backups dated after now (the clock has gone back since) don't push a new
// backup out: restoring one relies on it holding the text it replaced. It
// shows when it was made, not a date after theirs.
func TestWriteKeepsBackupAfterClockGoesBack(t *testing.T) {
	notes := filepath.Join(t.TempDir(), "notes.md")
	now := time.Date(2026, 11, 10, 9, 0, 0, 0, time.Local)
	for i := range Keep {
		if err := Write(notes, "from the future", now.AddDate(100, 0, i)); err != nil {
			t.Fatal(err)
		}
	}
	if err := Write(notes, "now", now); err != nil {
		t.Fatal(err)
	}
	bs := List(notes)
	if len(bs) != Keep || Changed(notes, "now") {
		t.Errorf("the newest of %d backups isn't the one just made", len(bs))
	}
	if saved := time.UnixMilli(bs[0].Saved); saved.After(time.Now()) {
		t.Errorf("the backup just made shows as made %v", saved)
	}
}

// "notes.md" and "notes.txt" in one folder each list their own backups.
// Copies from before they were named after their document (all "notes.md")
// belong to "notes.txt" only while there's no "notes.md".
func TestListKeepsDocumentsOfOneNameApart(t *testing.T) {
	dir := t.TempDir()
	md, txt := filepath.Join(dir, "notes.md"), filepath.Join(dir, "notes.txt")
	at := time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)
	old := stampDir(txt, at.Format(stampLayout))
	if err := os.MkdirAll(old, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(old, "notes.md"), []byte("old txt"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(txt, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Write(txt, "txt", at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	texts := func(p string) []string {
		var got []string
		for _, b := range List(p) {
			c, err := os.ReadFile(b.Path)
			if err != nil {
				t.Fatal(err)
			}
			got = append(got, string(c))
		}
		return got
	}
	if got := texts(txt); !slices.Equal(got, []string{"txt", "old txt"}) {
		t.Errorf("notes.txt backups = %q, want its own and the old one", got)
	}
	if err := os.WriteFile(md, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Write(md, "md", at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if got := texts(txt); !slices.Equal(got, []string{"txt"}) {
		t.Errorf("notes.txt backups = %q, want only its own", got)
	}
	if got := texts(md); !slices.Equal(got, []string{"md", "old txt"}) {
		t.Errorf("notes.md backups = %q, want its own and the old one", got)
	}
}
