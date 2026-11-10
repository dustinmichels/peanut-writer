// Package templates holds the output templates: how a document looks as PDF
// (a Typst file) and as Word (a style description). Built-in templates are
// embedded; more can be added as folders in the user's templates folder.
//
// A template folder holds:
//
//   - template.typ: exports `template(meta, body)`, a Typst show rule that
//     sets up the page, fonts and headings and writes the title block.
//   - template.json: name, description, and the Word styles (DocxStyle).
package templates

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

//go:embed all:builtin
var builtin embed.FS

// Default is the template used when a document names none, or one that
// doesn't exist.
const Default = "classic"

// Order of the built-in templates in the gallery.
var builtinOrder = []string{"classic", "academic", "report", "minimal", "manuscript", "elegant", "peanut"}

// Template is one output template.
type Template struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Builtin     bool      `json:"builtin"`
	Docx        DocxStyle `json:"docx"`

	dir string // the user template's folder; "" for a built-in one
}

// DocxStyle is how a template looks in Word. Colors are RRGGBB.
type DocxStyle struct {
	Paper            string    `json:"paper"`            // "letter" or "a4"
	Margin           float64   `json:"margin"`           // inches, every side
	BodyFont         string    `json:"bodyFont"`         //
	HeadingFont      string    `json:"headingFont"`      // headings and the title
	MonoFont         string    `json:"monoFont"`         // code
	FontSize         float64   `json:"fontSize"`         // body text, points
	LineSpacing      float64   `json:"lineSpacing"`      // multiple of single spacing
	SpaceAfter       float64   `json:"spaceAfter"`       // points after each paragraph
	FirstLineIndent  float64   `json:"firstLineIndent"`  // inches; 0 for none
	Justify          bool      `json:"justify"`          //
	TextColor        string    `json:"textColor"`        //
	HeadingColor     string    `json:"headingColor"`     //
	HeadingSizes     []float64 `json:"headingSizes"`     // points for levels 1–3; deeper levels use the last
	HeadingBold      bool      `json:"headingBold"`      //
	NumberedHeadings bool      `json:"numberedHeadings"` // 1, 1.1, 1.1.1
	TitleSize        float64   `json:"titleSize"`        // points
	TitleColor       string    `json:"titleColor"`       //
	TitleAlign       string    `json:"titleAlign"`       // "left" or "center"
	CaptionSize      float64   `json:"captionSize"`      // points
	CaptionColor     string    `json:"captionColor"`     //
	CaptionItalic    bool      `json:"captionItalic"`    //
	AccentColor      string    `json:"accentColor"`      // rules and table borders
	TableHeaderFill  string    `json:"tableHeaderFill"`  // "" for none
	PageNumbers      bool      `json:"pageNumbers"`      // centered in the footer
}

// UserDir is where user templates live:
// ~/Library/Application Support/Peanut Writer/templates on macOS.
func UserDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Peanut Writer", "templates"), nil
}

// List returns the built-in templates, then the user's, by name.
func List() []Template {
	var out []Template
	for _, id := range builtinOrder {
		if t, err := loadBuiltin(id); err == nil {
			out = append(out, t)
		}
	}
	dir, err := UserDir()
	if err != nil {
		return out
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return out
	}
	var user []Template
	for _, e := range entries {
		if !e.IsDir() || slices.Contains(builtinOrder, e.Name()) {
			continue
		}
		if t, err := loadUser(filepath.Join(dir, e.Name())); err == nil {
			user = append(user, t)
		}
	}
	slices.SortFunc(user, func(a, b Template) int { return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)) })
	return append(out, user...)
}

// Get finds a template by id, falling back to Default.
func Get(id string) Template {
	if id != "" {
		for _, t := range List() {
			if t.ID == id {
				return t
			}
		}
	}
	t, err := loadBuiltin(Default)
	if err != nil {
		panic(err) // embedded; can't happen
	}
	return t
}

// Source is the template's Typst file.
func (t Template) Source() ([]byte, error) {
	if t.Builtin {
		return builtin.ReadFile("builtin/" + t.ID + "/template.typ")
	}
	return os.ReadFile(filepath.Join(t.dir, "template.typ"))
}

func loadBuiltin(id string) (Template, error) {
	b, err := builtin.ReadFile("builtin/" + id + "/template.json")
	if err != nil {
		return Template{}, err
	}
	t, err := decode(b)
	t.ID, t.Builtin = id, true
	return t, err
}

func loadUser(dir string) (Template, error) {
	if _, err := os.Stat(filepath.Join(dir, "template.typ")); err != nil {
		return Template{}, err
	}
	b, err := os.ReadFile(filepath.Join(dir, "template.json"))
	if err != nil {
		return Template{}, err
	}
	t, err := decode(b)
	t.ID, t.dir = filepath.Base(dir), dir
	if t.Name == "" {
		t.Name = t.ID
	}
	return t, err
}

// decode reads template.json; Word styles left out take the classic look.
func decode(b []byte) (Template, error) {
	t := Template{Docx: DocxStyle{
		Paper: "letter", Margin: 1, BodyFont: "Aptos", HeadingFont: "Aptos Display", MonoFont: "Menlo",
		FontSize: 11, LineSpacing: 1.15, SpaceAfter: 8, TextColor: "000000", HeadingColor: "0F4761",
		HeadingSizes: []float64{20, 16, 14}, TitleSize: 28, TitleColor: "000000", TitleAlign: "left",
		CaptionSize: 9, CaptionColor: "0E2841", CaptionItalic: true, AccentColor: "0F4761",
	}}
	if err := json.Unmarshal(b, &t); err != nil {
		return t, fmt.Errorf("template.json: %w", err)
	}
	return t, nil
}

var safeID = regexp.MustCompile(`[^a-z0-9-]+`)

// Customize copies a template into the user's templates folder as a new
// template named "<name> (custom)", and returns its folder.
func Customize(id string) (string, error) {
	t := Get(id)
	root, err := UserDir()
	if err != nil {
		return "", err
	}
	base := strings.Trim(safeID.ReplaceAllString(strings.ToLower(t.ID), "-"), "-") + "-custom"
	newID := base
	for i := 2; ; i++ {
		if _, err := os.Stat(filepath.Join(root, newID)); errors.Is(err, fs.ErrNotExist) {
			break
		}
		newID = fmt.Sprintf("%s-%d", base, i)
	}
	dir := filepath.Join(root, newID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	src, err := t.Source()
	if err != nil {
		return "", err
	}
	t.Name += " (custom)"
	t.Description = "A copy of " + strings.TrimSuffix(t.Name, " (custom)") + ". Edit template.typ (PDF) and template.json (Word)."
	meta, err := json.MarshalIndent(struct {
		Name        string    `json:"name"`
		Description string    `json:"description"`
		Docx        DocxStyle `json:"docx"`
	}{t.Name, t.Description, t.Docx}, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dir, "template.typ"), src, 0o644); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dir, "template.json"), append(meta, '\n'), 0o644); err != nil {
		return "", err
	}
	return dir, nil
}
