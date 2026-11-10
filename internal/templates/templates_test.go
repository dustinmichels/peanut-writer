package templates

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// userHome points the user's templates folder at a temporary one.
func userHome(t *testing.T) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("AppData", filepath.Join(home, "AppData"))
}

func writeZip(t *testing.T, files map[string]string) string {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		f, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		f.Write([]byte(body))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(t.TempDir(), "shared.zip")
	if err := os.WriteFile(p, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestShareAndImport(t *testing.T) {
	userHome(t)
	dir, err := Customize("academic")
	if err != nil {
		t.Fatal(err)
	}
	id := filepath.Base(dir)
	if err := Rename(id, "  Thesis  ", "For my thesis"); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := Export(id, &buf); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(t.TempDir(), "Thesis.zip")
	os.WriteFile(p, buf.Bytes(), 0o644)

	got, err := Import(p)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(got) != id+"-2" {
		t.Errorf("imported as %s; want a new folder beside %s", filepath.Base(got), id)
	}
	imp, err := User(filepath.Base(got))
	if err != nil {
		t.Fatal(err)
	}
	if imp.Name != "Thesis" || imp.Description != "For my thesis" {
		t.Errorf("imported %q, %q", imp.Name, imp.Description)
	}
	want, _ := Get("academic").Source()
	if src, _ := imp.Source(); !bytes.Equal(src, want) {
		t.Error("imported template.typ differs from the shared one")
	}
	if imp.Docx.BodyFont != Get("academic").Docx.BodyFont {
		t.Error("imported Word styles differ from the shared ones")
	}

	if err := Delete(id); err != nil {
		t.Fatal(err)
	}
	if _, err := User(id); err == nil {
		t.Error("deleted template is still listed")
	}
}

func TestImportNamesAfterTheZipAndAvoidsBuiltins(t *testing.T) {
	userHome(t)
	p := writeZip(t, map[string]string{"template.typ": "#let template(meta, body) = body", "template.json": `{}`})
	classic := filepath.Join(filepath.Dir(p), "Classic.zip")
	if err := os.Rename(p, classic); err != nil {
		t.Fatal(err)
	}
	dir, err := Import(classic)
	if err != nil {
		t.Fatal(err)
	}
	// A folder named "classic" would be hidden behind the built-in one.
	if filepath.Base(dir) != "classic-2" {
		t.Errorf("imported as %s; want classic-2", filepath.Base(dir))
	}
	if _, err := User("classic-2"); err != nil {
		t.Error(err)
	}
}

func TestImportRejectsZipsWithoutATemplate(t *testing.T) {
	userHome(t)
	for name, files := range map[string]map[string]string{
		"no json":      {"t/template.typ": "x"},
		"split":        {"a/template.typ": "x", "b/template.json": "{}"},
		"too deep":     {"a/b/template.typ": "x", "a/b/template.json": "{}"},
		"bad json":     {"template.typ": "x", "template.json": "{"},
		"mac metadata": {"__MACOSX/template.typ": "x", "__MACOSX/template.json": "{}"},
	} {
		if _, err := Import(writeZip(t, files)); err == nil {
			t.Errorf("%s: imported", name)
		}
	}
	root, _ := UserDir()
	if entries, _ := os.ReadDir(root); len(entries) != 0 {
		t.Errorf("failed imports left %d folders", len(entries))
	}
}

func TestBuiltinsAreNotManaged(t *testing.T) {
	userHome(t)
	if err := Rename("classic", "Mine", ""); err == nil || !strings.Contains(err.Error(), "classic") {
		t.Errorf("renamed a built-in template: %v", err)
	}
	if err := Delete("classic"); err == nil {
		t.Error("deleted a built-in template")
	}
}
