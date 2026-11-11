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
	src, _ := Get("academic").Source()
	dir, err := create("academic-copy", src, Get("academic"))
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

func TestImportWindowsZipAndLongNames(t *testing.T) {
	userHome(t)
	typ := "#let template(meta, body) = body"
	p := writeZip(t, map[string]string{`Thesis\template.typ`: typ, `Thesis\template.json`: `{}`})
	if dir, err := Import(p); err != nil || filepath.Base(dir) != "thesis" {
		t.Errorf("zip with backslashes: %q, %v", dir, err)
	}
	// Names starting ./ (as some zippers write them), and a stray
	// template.json beside the template's folder.
	p = writeZip(t, map[string]string{"./Paper/template.typ": typ, "./Paper/template.json": `{}`, "Old/template.json": `{}`})
	if dir, err := Import(p); err != nil || filepath.Base(dir) != "paper" {
		t.Errorf("zip with ./ and a stray file: %q, %v", dir, err)
	}
	// A folder name over 255 bytes can't be made.
	id, err := Save(Custom{Base: "classic"}, strings.Repeat("Long name ", 30), "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := User(id); err != nil || len(id) > 64 {
		t.Errorf("saved as %q: %v", id, err)
	}
}

func TestImportRejectsZipsWithoutATemplate(t *testing.T) {
	userHome(t)
	for name, files := range map[string]map[string]string{
		"no json":      {"t/template.typ": "x"},
		"split":        {"a/template.typ": "x", "b/template.json": "{}"},
		"too deep":     {"a/b/template.typ": "x", "a/b/template.json": "{}"},
		"bad json":     {"template.typ": "x", "template.json": "{"},
		"bad color":    {"template.typ": "x", "template.json": `{"style": {"textColor": "red"}}`},
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

func TestCustomTemplateChangesOnlyWhatItSets(t *testing.T) {
	userHome(t)
	p := filepath.Join(t.TempDir(), "Doc.template.json")
	if err := WriteCustom(p, &Custom{Base: "elegant", Style: Style{BodyFont: " Georgia\n Pro ", HeadingColor: "#aa0000"}}); err != nil {
		t.Fatal(err)
	}
	c, err := ReadCustom(p)
	if err != nil || c == nil {
		t.Fatal(c, err)
	}
	got, base := c.Template(), Get("elegant")
	if got.ID != CustomID || got.Base != "elegant" {
		t.Errorf("id %q, base %q", got.ID, got.Base)
	}
	if got.Docx.BodyFont != "Georgia Pro" || got.Docx.HeadingColor != "AA0000" {
		t.Errorf("changes not applied: %q, %q", got.Docx.BodyFont, got.Docx.HeadingColor)
	}
	if got.Docx.HeadingFont != base.Docx.HeadingFont || got.Docx.TitleColor != base.Docx.TitleColor {
		t.Error("unchanged styles differ from the base's")
	}
	want, _ := base.Source()
	if src, err := got.Source(); err != nil || !bytes.Equal(src, want) {
		t.Errorf("source isn't the base's: %v", err)
	}

	if gone, _ := (Custom{Base: "deleted"}).Template().Source(); !bytes.Equal(gone, mustSource(t, Default)) {
		t.Error("a missing base isn't the default template")
	}
	if err := WriteCustom(p, &Custom{Base: "classic", Style: Style{TextColor: "red"}}); err == nil {
		t.Error("wrote a color that isn't RRGGBB")
	}
	if c, err := ReadCustom(filepath.Join(t.TempDir(), "none.json")); c != nil || err != nil {
		t.Errorf("no file: %v, %v", c, err)
	}
}

func mustSource(t *testing.T, id string) []byte {
	t.Helper()
	b, err := Get(id).Source()
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestImportAvoidsTheCustomID(t *testing.T) {
	userHome(t)
	dir, err := Import(writeZip(t, map[string]string{"custom/template.typ": "x", "custom/template.json": "{}"}))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(dir) != "custom-2" {
		t.Errorf("imported as %s; want custom-2", filepath.Base(dir))
	}
}

func TestSavedCustomTemplateKeepsItsChanges(t *testing.T) {
	userHome(t)
	id, err := Save(Custom{Base: "elegant", Style: Style{BodyFont: "Georgia", HeadingColor: "AA0000"}}, " House Style ", "")
	if err != nil {
		t.Fatal(err)
	}
	saved := Get(id)
	if id != "house-style" || saved.Name != "House Style" || saved.Builtin {
		t.Fatalf("saved as %q (%q, builtin %v)", id, saved.Name, saved.Builtin)
	}
	if saved.Docx.BodyFont != "Georgia" || saved.TypstStyle().HeadingColor != "AA0000" {
		t.Errorf("changes lost: docx %q, typst %+v", saved.Docx.BodyFont, saved.TypstStyle())
	}
	if src, _ := saved.Source(); !bytes.Equal(src, mustSource(t, "elegant")) {
		t.Error("source isn't the base's")
	}

	// Customizing the saved template changes only what it sets over it.
	got := Custom{Base: id, Style: Style{HeadingColor: "0000AA"}}.Template()
	if s := got.TypstStyle(); s.BodyFont != "Georgia" || s.HeadingColor != "0000AA" {
		t.Errorf("custom over saved: %+v", s)
	}
	if got.Style != (Style{HeadingColor: "0000AA"}) {
		t.Errorf("custom's own changes include its base's: %+v", got.Style)
	}

	if err := Rename(id, "Renamed", ""); err != nil {
		t.Fatal(err)
	}
	if s := Get(id).TypstStyle(); s.BodyFont != "Georgia" {
		t.Error("renaming dropped the saved changes")
	}
	if _, err := Save(Custom{Base: "classic"}, "  ", ""); err == nil {
		t.Error("saved without a name")
	}
}
