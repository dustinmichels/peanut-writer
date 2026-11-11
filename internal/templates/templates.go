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
	"archive/zip"
	"cmp"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"peanut-writer/internal/atomicfile"
)

//go:embed all:builtin
var builtin embed.FS

// Default is the template used when a document names none, or one that
// doesn't exist.
const Default = "classic"

// CustomID is what a document's front matter names its own template (see
// Custom) by. No other template can have it.
const CustomID = "custom"

// Order of the built-in templates in the gallery.
var builtinOrder = []string{"classic", "wordy", "academic", "report", "minimal", "manuscript", "elegant", "editorial", "journal", "peanut"}

// reserved reports whether a user template folder can't be named id.
func reserved(id string) bool { return id == CustomID || slices.Contains(builtinOrder, id) }

// Template is one output template.
type Template struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Builtin     bool      `json:"builtin"`
	Docx        DocxStyle `json:"docx"`
	Base        string    `json:"base"`  // a custom template's base template; "" for others
	Style       Style     `json:"style"` // a custom template's changes to its base; a saved one's (see Save) to the template it was made from

	dir       string // the user template's folder; "" for a built-in one
	baseStyle Style  // a custom template's base's Style
}

// TypstStyle is the style.json Typst gets: a custom template's changes over
// its base's own.
func (t Template) TypstStyle() Style { return t.Style.over(t.baseStyle) }

// Style is the fonts and colors a document's custom template changes in the
// template it's based on; "" and 0 keep the base's. Colors are RRGGBB.
//
// It reaches Word through DocxStyle, and Typst as style.json beside the
// template, which the built-in templates read through style.typ.
type Style struct {
	BodyFont        string  `json:"bodyFont,omitempty"`
	HeadingFont     string  `json:"headingFont,omitempty"` // headings and the title
	MonoFont        string  `json:"monoFont,omitempty"`    // code
	FontSize        float64 `json:"fontSize,omitempty"`    // body text, points
	TextColor       string  `json:"textColor,omitempty"`
	HeadingColor    string  `json:"headingColor,omitempty"`
	TitleColor      string  `json:"titleColor,omitempty"`
	CaptionColor    string  `json:"captionColor,omitempty"`
	AccentColor     string  `json:"accentColor,omitempty"` // rules and table borders
	TableHeaderFill string  `json:"tableHeaderFill,omitempty"`
}

// over is s with b's values where s keeps the base's.
func (s Style) over(b Style) Style {
	return Style{
		BodyFont:        cmp.Or(s.BodyFont, b.BodyFont),
		HeadingFont:     cmp.Or(s.HeadingFont, b.HeadingFont),
		MonoFont:        cmp.Or(s.MonoFont, b.MonoFont),
		FontSize:        cmp.Or(s.FontSize, b.FontSize),
		TextColor:       cmp.Or(s.TextColor, b.TextColor),
		HeadingColor:    cmp.Or(s.HeadingColor, b.HeadingColor),
		TitleColor:      cmp.Or(s.TitleColor, b.TitleColor),
		CaptionColor:    cmp.Or(s.CaptionColor, b.CaptionColor),
		AccentColor:     cmp.Or(s.AccentColor, b.AccentColor),
		TableHeaderFill: cmp.Or(s.TableHeaderFill, b.TableHeaderFill),
	}
}

// Custom is a document's own template: the template it's based on, with
// some fonts and colors changed. It's kept beside the document (see
// ReadCustom) and named in its front matter by CustomID.
type Custom struct {
	Base  string `json:"base"`
	Style Style  `json:"style"`
}

// Template is the custom template: its base, under CustomID, with its Style
// applied to the Word styles. A base that's gone is Default.
func (c Custom) Template() Template {
	t := Get(c.Base)
	t.Description = "This document's own version of " + t.Name + "."
	t.baseStyle = t.Style
	t.Base, t.ID, t.Style = t.ID, CustomID, c.Style
	t.Name = "Custom"
	s, d := c.Style, &t.Docx
	d.BodyFont = cmp.Or(s.BodyFont, d.BodyFont)
	d.HeadingFont = cmp.Or(s.HeadingFont, d.HeadingFont)
	d.MonoFont = cmp.Or(s.MonoFont, d.MonoFont)
	d.FontSize = cmp.Or(s.FontSize, d.FontSize)
	d.TextColor = cmp.Or(s.TextColor, d.TextColor)
	d.HeadingColor = cmp.Or(s.HeadingColor, d.HeadingColor)
	d.TitleColor = cmp.Or(s.TitleColor, d.TitleColor)
	d.CaptionColor = cmp.Or(s.CaptionColor, d.CaptionColor)
	d.AccentColor = cmp.Or(s.AccentColor, d.AccentColor)
	d.TableHeaderFill = cmp.Or(s.TableHeaderFill, d.TableHeaderFill)
	return t
}

// Save adds c to the user's templates folder as a new template named name,
// which keeps c's changes to its base, and returns its id.
func Save(c Custom, name, description string) (string, error) {
	if err := c.Style.Check(); err != nil {
		return "", err
	}
	t := c.Template()
	src, err := t.Source()
	if err != nil {
		return "", err
	}
	if t.Name = strings.TrimSpace(name); t.Name == "" {
		return "", errors.New("a template needs a name")
	}
	t.Description = strings.TrimSpace(description)
	t.Style = t.TypstStyle()
	dir, err := create(slug(t.Name), src, t)
	if err != nil {
		return "", err
	}
	return filepath.Base(dir), nil
}

var hexColor = regexp.MustCompile(`^[0-9A-F]{6}$`)

// Check tidies s (colors upper case, without "#"; fonts trimmed) and reports
// what's wrong with it.
func (s *Style) Check() error {
	for _, f := range []*string{&s.BodyFont, &s.HeadingFont, &s.MonoFont} {
		*f = strings.TrimSpace(*f)
	}
	if s.FontSize != 0 && (s.FontSize < 6 || s.FontSize > 72) {
		return fmt.Errorf("a font size of %gpt is out of range (6–72)", s.FontSize)
	}
	for _, c := range []*string{&s.TextColor, &s.HeadingColor, &s.TitleColor, &s.CaptionColor, &s.AccentColor, &s.TableHeaderFill} {
		*c = strings.ToUpper(strings.TrimPrefix(strings.TrimSpace(*c), "#"))
		if *c != "" && !hexColor.MatchString(*c) {
			return fmt.Errorf("%q isn't a color: use RRGGBB", *c)
		}
	}
	return nil
}

// ReadCustom reads the custom template kept in the file at p; nil if there's
// none.
func ReadCustom(p string) (*Custom, error) {
	b, err := os.ReadFile(p)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	var c Custom
	if err == nil {
		err = json.Unmarshal(b, &c)
	}
	if err == nil {
		err = c.Style.Check()
	}
	if err != nil {
		return nil, fmt.Errorf("%s: %w", filepath.Base(p), err)
	}
	return &c, nil
}

// WriteCustom tidies c and keeps it in the file at p.
func WriteCustom(p string, c *Custom) error {
	if err := c.Style.Check(); err != nil {
		return err
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return atomicfile.Write(p, append(b, '\n'), 0o644)
}

// DocxStyle is how a template looks in Word. Colors are RRGGBB.
type DocxStyle struct {
	Paper            string    `json:"paper"`            // "letter" or "a4"
	Margin           float64   `json:"margin"`           // inches, every side
	Columns          int       `json:"columns"`          // text columns below the title block; 0 or 1 for one
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
	TitleRule        bool      `json:"titleRule"`        // a hairline under the title and byline
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
		if !e.IsDir() || reserved(e.Name()) {
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

// Source is the template's Typst file (a custom template's base's).
func (t Template) Source() ([]byte, error) {
	if t.Builtin {
		return builtin.ReadFile("builtin/" + cmp.Or(t.Base, t.ID) + "/template.typ")
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

// decode reads template.json; Word styles left out take Wordy's look.
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

// slug turns s into a folder name: lowercase letters, digits and dashes.
func slug(s string) string {
	return strings.Trim(safeID.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

// User finds one of the user's templates (not a built-in one) by id.
func User(id string) (Template, error) {
	for _, t := range List() {
		if t.ID == id && !t.Builtin {
			return t, nil
		}
	}
	return Template{}, fmt.Errorf("there's no template %q in your templates folder", id)
}

// Dir is the user template's folder; "" for a built-in one.
func (t Template) Dir() string { return t.dir }

// Rename sets a user template's name and description.
func Rename(id, name, description string) error {
	t, err := User(id)
	if err != nil {
		return err
	}
	if t.Name = strings.TrimSpace(name); t.Name == "" {
		return errors.New("a template needs a name")
	}
	t.Description = strings.TrimSpace(description)
	return writeMeta(t.dir, t)
}

// Delete removes a user template's folder.
func Delete(id string) error {
	t, err := User(id)
	if err != nil {
		return err
	}
	return os.RemoveAll(t.dir)
}

// Export writes a user template to w as a zip holding its folder, for Import
// on another computer.
func Export(id string, w io.Writer) error {
	t, err := User(id)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(w)
	for _, name := range []string{"template.typ", "template.json"} {
		b, err := os.ReadFile(filepath.Join(t.dir, name))
		if err != nil {
			return err
		}
		f, err := zw.Create(t.ID + "/" + name)
		if err != nil {
			return err
		}
		if _, err := f.Write(b); err != nil {
			return err
		}
	}
	return zw.Close()
}

// maxImport caps each file read from a zip being imported.
const maxImport = 8 << 20

// Import adds the template in the zip at p (as Export writes it, or with the
// files at the top of the zip) to the user's templates folder as a new
// template, and returns its folder.
func Import(p string) (string, error) {
	zr, err := zip.OpenReader(p)
	if err != nil {
		return "", fmt.Errorf("%s isn't a template zip: %w", filepath.Base(p), err)
	}
	defer zr.Close()
	var typ, meta *zip.File
	for _, f := range zr.File {
		dir, name := path.Split(f.Name)
		if strings.Count(dir, "/") > 1 || strings.HasPrefix(dir, "__MACOSX/") {
			continue
		}
		switch name {
		case "template.typ":
			typ = cmp.Or(typ, f)
		case "template.json":
			meta = cmp.Or(meta, f)
		}
	}
	if typ == nil || meta == nil || path.Dir(typ.Name) != path.Dir(meta.Name) {
		return "", fmt.Errorf("%s doesn't hold a template: it needs template.typ and template.json, side by side", filepath.Base(p))
	}
	src, err := readZipped(typ)
	if err != nil {
		return "", err
	}
	b, err := readZipped(meta)
	if err != nil {
		return "", err
	}
	t, err := decode(b)
	if err != nil {
		return "", err
	}
	base := slug(path.Dir(typ.Name))
	if base == "" {
		base = slug(strings.TrimSuffix(filepath.Base(p), filepath.Ext(p)))
	}
	if t.Name = strings.TrimSpace(t.Name); t.Name == "" {
		t.Name = cmp.Or(base, "Imported template")
	}
	return create(base, src, t)
}

func readZipped(f *zip.File) ([]byte, error) {
	r, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer r.Close()
	b, err := io.ReadAll(io.LimitReader(r, maxImport+1))
	if err == nil && len(b) > maxImport {
		err = fmt.Errorf("%s is too big for a template", path.Base(f.Name))
	}
	return b, err
}

// create writes a new user template into a new folder named base (or base-2,
// base-3… if that's taken) and returns the folder.
func create(base string, src []byte, t Template) (string, error) {
	root, err := UserDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	base = cmp.Or(base, "template")
	id := base
	for i := 2; ; i++ {
		// List skips user folders with reserved names.
		if !reserved(id) {
			dir := filepath.Join(root, id)
			err := os.Mkdir(dir, 0o755)
			if err == nil {
				if err := os.WriteFile(filepath.Join(dir, "template.typ"), src, 0o644); err != nil {
					os.RemoveAll(dir)
					return "", err
				}
				if err := writeMeta(dir, t); err != nil {
					os.RemoveAll(dir)
					return "", err
				}
				return dir, nil
			}
			if !errors.Is(err, fs.ErrExist) {
				return "", err
			}
		}
		id = fmt.Sprintf("%s-%d", base, i)
	}
}

// writeMeta writes the template's template.json into dir.
func writeMeta(dir string, t Template) error {
	meta, err := json.MarshalIndent(struct {
		Name        string    `json:"name"`
		Description string    `json:"description"`
		Docx        DocxStyle `json:"docx"`
		Style       Style     `json:"style,omitzero"`
	}{t.Name, t.Description, t.Docx, t.Style}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "template.json"), append(meta, '\n'), 0o644)
}
