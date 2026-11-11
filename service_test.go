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
