package versions

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func write(t *testing.T, p, s string) {
	t.Helper()
	if err := os.WriteFile(p, []byte(s), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestSaveRestoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	doc := filepath.Join(dir, "notes.md")
	tpl := filepath.Join(dir, "notes.template.json")
	set := filepath.Join(dir, "notes.settings.json")
	sidecars := []string{tpl, set}
	write(t, doc, "first")
	write(t, tpl, `{"base":"classic"}`)

	v, err := Save(doc, "Draft", sidecars, []byte("word"), []byte("pdf"))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"notes.md", "notes.template.json", "notes.docx", "notes.pdf"} {
		if _, err := os.Stat(filepath.Join(dir, Folder, "Draft", name)); err != nil {
			t.Errorf("version lacks %s: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, Folder, "Draft", "notes.settings.json")); !os.IsNotExist(err) {
		t.Errorf("version has a settings file the document lacked: %v", err)
	}
	if _, err := Save(doc, "Draft", sidecars, nil, nil); !errors.Is(err, ErrExists) {
		t.Errorf("saving over a version: err = %v, want ErrExists", err)
	}

	// The document moves on: new text, a settings file, no template.
	write(t, doc, "second")
	write(t, set, `{"autoFormat":true}`)
	os.Remove(tpl)

	got, err := Restore(doc, v.Name, sidecars)
	if err != nil || got != "first" {
		t.Fatalf("Restore = %q, %v; want the version's text", got, err)
	}
	if b, _ := os.ReadFile(doc); string(b) != "first" {
		t.Errorf("document holds %q after restoring", b)
	}
	if b, _ := os.ReadFile(tpl); string(b) != `{"base":"classic"}` {
		t.Errorf("template not restored: %q", b)
	}
	if _, err := os.Stat(set); !os.IsNotExist(err) {
		t.Errorf("settings the version lacked still there: %v", err)
	}
}

func TestListIsPerDocument(t *testing.T) {
	dir := t.TempDir()
	notes := filepath.Join(dir, "notes.md")
	draft := filepath.Join(dir, "notes-draft.md")
	write(t, notes, "n")
	write(t, draft, "d")
	if _, err := Save(notes, "A", nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := Save(draft, "B", nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	// A save cut short leaves a hidden folder, which isn't a version.
	os.MkdirAll(filepath.Join(dir, Folder, ".saving-1"), 0o755)
	write(t, filepath.Join(dir, Folder, ".saving-1", "notes.md"), "x")

	vs, err := List(notes)
	if err != nil || len(vs) != 1 || vs[0].Name != "A" {
		t.Fatalf("List(notes) = %v, %v; want only A", vs, err)
	}
}

func TestBadNames(t *testing.T) {
	doc := filepath.Join(t.TempDir(), "notes.md")
	write(t, doc, "n")
	for _, name := range []string{"", " ", ".hidden", "..", "a/b"} {
		if _, err := Save(doc, name, nil, nil, nil); err == nil {
			t.Errorf("Save(%q) succeeded", name)
		}
	}
}

// A document that can't be replaced (locked in Finder) leaves its template
// and settings as they were, not restored around the old text.
func TestRestoreFailureChangesNothing(t *testing.T) {
	dir := t.TempDir()
	doc := filepath.Join(dir, "notes.md")
	tpl := filepath.Join(dir, "notes.template.json")
	set := filepath.Join(dir, "notes.settings.json")
	sidecars := []string{tpl, set}
	write(t, doc, "first")
	write(t, tpl, "version's")
	if _, err := Save(doc, "Draft", sidecars, nil, nil); err != nil {
		t.Fatal(err)
	}
	write(t, doc, "second")
	write(t, tpl, "current")
	write(t, set, "current")
	if err := exec.Command("chflags", "uchg", doc).Run(); err != nil {
		t.Skip("can't lock a file:", err)
	}
	defer exec.Command("chflags", "nouchg", doc).Run()

	if _, err := Restore(doc, "Draft", sidecars); err == nil {
		t.Fatal("Restore replaced a locked document")
	}
	for _, p := range []string{doc, tpl, set} {
		if b, _ := os.ReadFile(p); string(b) != "current" && string(b) != "second" {
			t.Errorf("%s holds %q after a failed restore", filepath.Base(p), b)
		}
	}
}
