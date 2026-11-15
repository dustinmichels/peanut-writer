package main

import (
	"os"
	"path/filepath"
	"testing"
)

// Saving settings writes only those named: a hand edit made meanwhile and the
// file's other keys survive, and a default shown but not changed (the
// computer user's name as the author) isn't written.
func TestWriteSettingsChangesOnlyItsKeys(t *testing.T) {
	p := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(p, []byte(`{"headingCase": "title", "autoFormat": false, "x": 1}`), 0o644); err != nil {
		t.Fatal(err)
	}
	set, err := readSettings(p)
	if err != nil {
		t.Fatal(err)
	}
	name, on := "Computer User", true
	set.Author, set.SyncOnSave, set.AutoFormat = &name, &on, nil
	if err := os.WriteFile(p, []byte(`{"headingCase": "title", "autoFormat": false, "x": 1, "syncOnQuit": false}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeSettings(p, set, []string{"syncOnSave", "autoFormat"}); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	want := "{\n  \"headingCase\": \"title\",\n  \"syncOnQuit\": false,\n  \"syncOnSave\": true,\n  \"x\": 1\n}\n"
	if string(b) != want {
		t.Errorf("settings.json = %s, want %s", b, want)
	}
}

// docFile picks the file a save writes: a package's own Markdown file (even
// if renamed, skipping macOS's "._" files), never one a package links to
// from elsewhere, and a linked plain file's target rather than the link.
func TestDocFile(t *testing.T) {
	dir := t.TempDir()
	write := func(p string) string {
		p = filepath.Join(dir, p)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	link := func(target, p string) string {
		p = filepath.Join(dir, p)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(target, p); err != nil {
			t.Fatal(err)
		}
		return p
	}
	secret := write("secret.md")
	named := write("Named.peanut/Named.md")
	renamed := write("Renamed.peanut/Old.md")
	write("Renamed.peanut/._Old.md")
	link(secret, "Evil.peanut/Evil.md")
	link(secret, "Evil2.peanut/Old.md")
	write("Two.peanut/a.md")
	write("Two.peanut/b.md")
	plainLink := link(secret, "notes.md")
	real, err := filepath.EvalSymlinks(secret) // t.TempDir may sit behind a link (macOS /var)
	if err != nil {
		t.Fatal(err)
	}

	for _, c := range []struct {
		path, want string // want "" means an error
	}{
		{filepath.Join(dir, "Named.peanut") + "/", named},
		{filepath.Join(dir, "Renamed.peanut"), renamed},
		{filepath.Join(dir, "Evil.peanut"), ""},
		{filepath.Join(dir, "Evil2.peanut"), ""},
		{filepath.Join(dir, "Two.peanut"), ""},
		{plainLink, real},
	} {
		got, err := docFile(c.path)
		if c.want == "" {
			if err == nil {
				t.Errorf("docFile(%s) = %s, want an error", c.path, got)
			}
		} else if err != nil || got != c.want {
			t.Errorf("docFile(%s) = %q, %v, want %q", c.path, got, err, c.want)
		}
	}
}

// Saving fills in missing core properties without touching ones the writer
// gave (a blank one counts as missing), in the editor's order, and leaves the
// body as it was. Author and date are given so the machine's settings don't
// matter.
func TestFillProperties(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{
			"---\nauthor: Ann\ndate: May 1, 2020\n---\n\n# Hi\n",
			"---\ntitle: My Notes\nauthor: Ann\ndate: May 1, 2020\n---\n\n# Hi\n",
		},
		{
			"---\nsubtitle: Sub\nTitle: \"\"\nauthor: Ann\nkeywords: [a]\ndate: x\n...\nbody",
			"---\nsubtitle: Sub\ntitle: My Notes\nauthor: Ann\nkeywords: [a]\ndate: x\n...\nbody",
		},
		{
			"---\nTITLE: Kept\nAuthor: Ann\ndate: x\n---\nbody",
			"---\nTITLE: Kept\nAuthor: Ann\ndate: x\n---\nbody",
		},
	} {
		if got := fillProperties(c.in, "my notes"); got != c.want {
			t.Errorf("fillProperties(%q)\n got %q\nwant %q", c.in, got, c.want)
		}
	}
}
