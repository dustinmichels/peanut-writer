package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"mime"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"

	"peanut-writer/internal/doc"
	"peanut-writer/internal/docx"
	"peanut-writer/internal/render"
	"peanut-writer/internal/templates"
)

//go:embed starter
var starter embed.FS

// DocService is the editor's link to the file system and to Typst: it holds
// the open document's location and renders, saves and exports it.
type DocService struct {
	app    *application.App
	window *application.WebviewWindow

	mu        sync.Mutex
	path      string // the open document's file; "" until it's saved
	dir       string // where its images live: path's folder, or a scratch folder
	dirty     bool
	quitting  bool // the user chose to quit, so closing mustn't ask again
	cancel    context.CancelFunc
	previews  map[string]string // template previews by id and source hash
	typst     *render.Typst
	typstErr  error
	settings  settings
	scratches []string // scratch folders, removed on quit
}

// DocInfo describes the open document.
type DocInfo struct {
	Path     string `json:"path"` // "" for an unsaved document
	Name     string `json:"name"` // shown in the title bar
	Content  string `json:"content"`
	Canceled bool   `json:"canceled"` // the user canceled a dialog; nothing changed
}

// RenderResult is a preview: one SVG per page.
type RenderResult struct {
	Pages    []string `json:"pages"`
	Warnings []string `json:"warnings"`
	Error    string   `json:"error"`
	Template string   `json:"template"` // the template used
}

// StartupInfo is what the editor needs when it opens.
type StartupInfo struct {
	Document   DocInfo              `json:"document"`
	Templates  []templates.Template `json:"templates"`
	TypstError string               `json:"typstError"`
}

type settings struct {
	Welcomed bool `json:"welcomed"`
}

func newDocService() *DocService {
	s := &DocService{previews: map[string]string{}}
	s.typst, s.typstErr = render.Find()
	s.loadSettings()
	return s
}

// --- Documents ---------------------------------------------------------------

// Startup opens the welcome guide on the first run, and a blank document
// after that.
func (s *DocService) Startup() (StartupInfo, error) {
	info := StartupInfo{Templates: templates.List()}
	if s.typstErr != nil {
		info.TypstError = s.typstErr.Error()
	}
	var err error
	if !s.settings.Welcomed {
		info.Document, err = s.OpenWelcome()
		s.settings.Welcomed = true
		s.saveSettings()
	} else {
		info.Document, err = s.NewDocument()
	}
	return info, err
}

// NewDocument starts a blank, unsaved document.
func (s *DocService) NewDocument() (DocInfo, error) {
	dir, err := s.scratch()
	if err != nil {
		return DocInfo{}, err
	}
	s.setOpen("", dir)
	return DocInfo{Name: "Untitled"}, nil
}

// OpenWelcome opens the welcome guide as an unsaved document.
func (s *DocService) OpenWelcome() (DocInfo, error) {
	dir, err := s.scratch()
	if err != nil {
		return DocInfo{}, err
	}
	sub, err := fs.Sub(starter, "starter")
	if err != nil {
		return DocInfo{}, err
	}
	if err := os.CopyFS(dir, sub); err != nil {
		return DocInfo{}, err
	}
	content, err := os.ReadFile(filepath.Join(dir, "welcome.md"))
	if err != nil {
		return DocInfo{}, err
	}
	os.Remove(filepath.Join(dir, "welcome.md"))
	s.setOpen("", dir)
	return DocInfo{Name: "Welcome", Content: string(content)}, nil
}

// OpenDocument asks for a Markdown file and opens it.
func (s *DocService) OpenDocument() (DocInfo, error) {
	p, err := s.app.Dialog.OpenFile().
		SetTitle("Open").
		AddFilter("Markdown", "*.md;*.markdown;*.txt").
		CanChooseFiles(true).
		AttachToWindow(s.window).
		PromptForSingleSelection()
	if err != nil || p == "" {
		return DocInfo{Canceled: true}, err
	}
	return s.OpenPath(p)
}

// OpenPath opens the Markdown file at p.
func (s *DocService) OpenPath(p string) (DocInfo, error) {
	b, err := os.ReadFile(p)
	if err != nil {
		return DocInfo{}, err
	}
	s.setOpen(p, filepath.Dir(p))
	return DocInfo{Path: p, Name: docName(p), Content: string(b)}, nil
}

// Save writes the document to its file, asking where first if it has none.
func (s *DocService) Save(content string) (DocInfo, error) {
	s.mu.Lock()
	p := s.path
	s.mu.Unlock()
	if p == "" {
		return s.SaveAs(content)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		return DocInfo{}, err
	}
	s.SetDirty(false)
	return DocInfo{Path: p, Name: docName(p), Content: content}, nil
}

// SaveAs asks where to save the document and writes it there, bringing its
// images along.
func (s *DocService) SaveAs(content string) (DocInfo, error) {
	s.mu.Lock()
	oldDir, oldPath := s.dir, s.path
	s.mu.Unlock()
	name := "Untitled.md"
	if oldPath != "" {
		name = filepath.Base(oldPath)
	} else if t := doc.Parse(content, "").Meta.Title; t != "" {
		name = safeFileName(t) + ".md"
	}
	p, err := s.app.Dialog.SaveFile().
		SetFilename(name).
		AddFilter("Markdown", "*.md").
		CanCreateDirectories(true).
		AttachToWindow(s.window).
		PromptForSingleSelection()
	if err != nil || p == "" {
		return DocInfo{Canceled: true}, err
	}
	if filepath.Ext(p) == "" {
		p += ".md"
	}
	if err := copyImages(content, oldDir, filepath.Dir(p)); err != nil {
		return DocInfo{}, fmt.Errorf("copying images: %w", err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		return DocInfo{}, err
	}
	s.setOpen(p, filepath.Dir(p))
	return DocInfo{Path: p, Name: docName(p), Content: content}, nil
}

// SetDirty records whether the document has unsaved changes.
func (s *DocService) SetDirty(dirty bool) {
	s.mu.Lock()
	s.dirty = dirty
	name := "Untitled"
	if s.path != "" {
		name = docName(s.path)
	}
	s.mu.Unlock()
	if s.window != nil {
		if dirty {
			name += " — Edited"
		}
		s.window.SetTitle(name)
	}
}

// ConfirmDiscard asks what to do with unsaved changes: "save", "discard" or
// "cancel".
func (s *DocService) ConfirmDiscard(name string) string {
	choice := make(chan string, 1)
	d := s.app.Dialog.Question().
		SetTitle(fmt.Sprintf("Do you want to save the changes you made to “%s”?", name)).
		SetMessage("Your changes will be lost if you don't save them.")
	save := d.AddButton("Save").OnClick(func() { choice <- "save" })
	d.AddButton("Don't Save").OnClick(func() { choice <- "discard" })
	cancel := d.AddButton("Cancel").OnClick(func() { choice <- "cancel" })
	d.SetDefaultButton(save).SetCancelButton(cancel).AttachToWindow(s.window).Show()
	return <-choice
}

// Quit quits without asking about unsaved changes (the editor already did).
func (s *DocService) Quit() {
	s.mu.Lock()
	s.quitting = true
	s.mu.Unlock()
	s.app.Quit()
}

// shouldClose reports whether the window may close now; if not, the editor
// is asked to deal with unsaved changes first.
func (s *DocService) shouldClose() bool {
	s.mu.Lock()
	ok := !s.dirty || s.quitting
	s.mu.Unlock()
	if !ok {
		s.app.Event.Emit("menu", "quit")
	}
	return ok
}

func (s *DocService) setOpen(p, dir string) {
	s.mu.Lock()
	s.path, s.dir, s.dirty = p, dir, false
	s.mu.Unlock()
	s.SetDirty(false)
}

// scratch makes a folder for an unsaved document's images.
func (s *DocService) scratch() (string, error) {
	dir, err := os.MkdirTemp("", "peanut-untitled-*")
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	s.scratches = append(s.scratches, dir)
	s.mu.Unlock()
	return dir, nil
}

// ServiceShutdown removes the scratch folders.
func (s *DocService) ServiceShutdown() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range s.scratches {
		os.RemoveAll(d)
	}
	if s.cancel != nil {
		s.cancel()
	}
	return nil
}

func docName(p string) string { return strings.TrimSuffix(filepath.Base(p), filepath.Ext(p)) }

var unsafeName = regexp.MustCompile(`[/\\:*?"<>|]+`)

func safeFileName(s string) string {
	s = strings.TrimSpace(unsafeName.ReplaceAllString(s, "-"))
	if len(s) > 80 {
		s = s[:80]
	}
	if s == "" {
		return "Untitled"
	}
	return s
}

var imageRef = regexp.MustCompile(`!\[[^\]]*\]\(\s*<?([^)\s>]+)>?`)

// copyImages copies the images content refers to by relative path from one
// folder to another, keeping any that are already there.
func copyImages(content, from, to string) error {
	if from == "" || from == to {
		return nil
	}
	for _, m := range imageRef.FindAllStringSubmatch(content, -1) {
		rel := m[1]
		if strings.Contains(rel, "://") || filepath.IsAbs(rel) || strings.HasPrefix(path.Clean(rel), "..") {
			continue
		}
		src := filepath.Join(from, filepath.FromSlash(rel))
		dst := filepath.Join(to, filepath.FromSlash(rel))
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		b, err := os.ReadFile(src)
		if err != nil {
			continue // missing before, missing after
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(dst, b, 0o644); err != nil {
			return err
		}
	}
	return nil
}

// --- Images ------------------------------------------------------------------

// AddImage stores an image (base64 data, from a paste) in the document's
// images folder and returns its path relative to the document.
func (s *DocService) AddImage(name, data string) (string, error) {
	b, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return "", err
	}
	return s.storeImage(name, b)
}

// ChooseImage asks for an image file and stores it like AddImageFile; "" if
// the user cancels.
func (s *DocService) ChooseImage() (string, error) {
	p, err := s.app.Dialog.OpenFile().
		SetTitle("Insert Picture").
		AddFilter("Images", "*.png;*.jpg;*.jpeg;*.gif;*.svg;*.webp").
		CanChooseFiles(true).
		AttachToWindow(s.window).
		PromptForSingleSelection()
	if err != nil || p == "" {
		return "", err
	}
	return s.AddImageFile(p)
}

// AddImageFile copies the image at path (picked or dropped) into the
// document's images folder and returns its path relative to the document.
func (s *DocService) AddImageFile(path string) (string, error) {
	name := filepath.Base(path)
	if err := checkImageName(name); err != nil {
		return "", err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return s.storeImage(name, b)
}

var (
	imageExts    = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".svg": true, ".webp": true}
	nonNameChars = regexp.MustCompile(`[^A-Za-z0-9_-]+`)
)

func checkImageName(name string) error {
	if !imageExts[strings.ToLower(filepath.Ext(name))] {
		return fmt.Errorf("%s isn't a picture Peanut Writer can use (PNG, JPEG, GIF, SVG or WebP)", name)
	}
	return nil
}

func (s *DocService) storeImage(name string, b []byte) (string, error) {
	if err := checkImageName(name); err != nil {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(name))
	base := strings.Trim(nonNameChars.ReplaceAllString(strings.TrimSuffix(filepath.Base(name), filepath.Ext(name)), "-"), "-")
	if base == "" || strings.EqualFold(base, "image") {
		sum := sha256.Sum256(b)
		base = "image-" + hex.EncodeToString(sum[:4])
	}
	s.mu.Lock()
	dir := s.dir
	s.mu.Unlock()
	images := filepath.Join(dir, "images")
	if err := os.MkdirAll(images, 0o755); err != nil {
		return "", err
	}
	for i := 1; ; i++ {
		file := base + ext
		if i > 1 {
			file = fmt.Sprintf("%s-%d%s", base, i, ext)
		}
		p := filepath.Join(images, file)
		existing, err := os.ReadFile(p)
		if err == nil {
			if bytes.Equal(existing, b) {
				return "images/" + file, nil // the same picture again
			}
			continue
		}
		if err := os.WriteFile(p, b, 0o644); err != nil {
			return "", err
		}
		return "images/" + file, nil
	}
}

// ImageURL returns an image the document refers to as a data URL, for the
// editor to show; "" if there's no such file.
func (s *DocService) ImageURL(ref string) string {
	if strings.Contains(ref, "://") {
		return ""
	}
	s.mu.Lock()
	dir := s.dir
	s.mu.Unlock()
	p := ref
	if !filepath.IsAbs(p) {
		p = filepath.Join(dir, filepath.FromSlash(ref))
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	typ := mime.TypeByExtension(strings.ToLower(filepath.Ext(p)))
	if typ == "" {
		typ = "application/octet-stream"
	}
	return "data:" + typ + ";base64," + base64.StdEncoding.EncodeToString(b)
}

// --- Rendering and export ----------------------------------------------------

// Render renders the document for the preview. A newer call cancels an
// older one still running.
func (s *DocService) Render(content string) RenderResult {
	if s.typstErr != nil {
		return RenderResult{Error: s.typstErr.Error()}
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	if s.cancel != nil {
		s.cancel()
	}
	s.cancel = cancel
	dir := s.dir
	s.mu.Unlock()
	defer cancel()

	d := doc.Parse(content, dir)
	tpl := templates.Get(d.Meta.Template)
	pages, warnings, err := s.typst.Preview(ctx, d, tpl)
	res := RenderResult{Pages: pages, Warnings: append(d.Warnings, warnings...), Template: tpl.ID}
	if err != nil {
		if errors.Is(err, context.Canceled) {
			res.Error = "canceled"
		} else {
			res.Error = err.Error()
		}
	}
	return res
}

// ExportPDF asks where to save a PDF of the document and writes it; returns
// the path, or "" if the user canceled.
func (s *DocService) ExportPDF(content string) (string, error) {
	if s.typstErr != nil {
		return "", s.typstErr
	}
	d, tpl, p, err := s.exportTarget(content, ".pdf", "PDF", "*.pdf")
	if err != nil || p == "" {
		return "", err
	}
	b, err := s.typst.PDF(context.Background(), d, tpl)
	if err != nil {
		return "", err
	}
	return p, os.WriteFile(p, b, 0o644)
}

// ExportDOCX asks where to save a Word document and writes it; returns the
// path, or "" if the user canceled.
func (s *DocService) ExportDOCX(content string) (string, error) {
	d, tpl, p, err := s.exportTarget(content, ".docx", "Word Document", "*.docx")
	if err != nil || p == "" {
		return "", err
	}
	opt := docx.Options{}
	if s.typst != nil {
		opt.Rasterize = func(path string, widthPt float64) ([]byte, error) {
			return s.typst.PNG(context.Background(), path, widthPt)
		}
	}
	b, err := docx.Write(d, tpl.Docx, opt)
	if err != nil {
		return "", err
	}
	return p, os.WriteFile(p, b, 0o644)
}

func (s *DocService) exportTarget(content, ext, kind, pattern string) (*doc.Document, templates.Template, string, error) {
	s.mu.Lock()
	dir, cur := s.dir, s.path
	s.mu.Unlock()
	d := doc.Parse(content, dir)
	tpl := templates.Get(d.Meta.Template)
	name := "Untitled"
	if cur != "" {
		name = docName(cur)
	} else if d.Meta.Title != "" {
		name = safeFileName(d.Meta.Title)
	}
	dlg := s.app.Dialog.SaveFile().
		SetFilename(name+ext).
		AddFilter(kind, pattern).
		CanCreateDirectories(true).
		AttachToWindow(s.window)
	if cur != "" {
		dlg.SetDirectory(filepath.Dir(cur))
	}
	p, err := dlg.PromptForSingleSelection()
	if err != nil || p == "" {
		return nil, tpl, "", err
	}
	if !strings.EqualFold(filepath.Ext(p), ext) {
		p += ext
	}
	return d, tpl, p, nil
}

// Reveal shows a file in Finder (or the system's file manager).
func (s *DocService) Reveal(p string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", "-R", p)
	case "windows":
		cmd = exec.Command("explorer", "/select,", p)
	default:
		cmd = exec.Command("xdg-open", filepath.Dir(p))
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	go cmd.Wait()
	return nil
}

// --- Templates ---------------------------------------------------------------

// Templates lists the output templates.
func (s *DocService) Templates() []templates.Template { return templates.List() }

// TemplatePreview is the welcome guide's first page in a template, as SVG.
func (s *DocService) TemplatePreview(id string) (string, error) {
	if s.typstErr != nil {
		return "", s.typstErr
	}
	tpl := templates.Get(id)
	src, err := tpl.Source()
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(src)
	key := tpl.ID + ":" + hex.EncodeToString(sum[:8])
	s.mu.Lock()
	cached, ok := s.previews[key]
	s.mu.Unlock()
	if ok {
		return cached, nil
	}
	dir, err := os.MkdirTemp("", "peanut-preview-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	sub, _ := fs.Sub(starter, "starter")
	if err := os.CopyFS(dir, sub); err != nil {
		return "", err
	}
	content, err := os.ReadFile(filepath.Join(dir, "welcome.md"))
	if err != nil {
		return "", err
	}
	pages, _, err := s.typst.Preview(context.Background(), doc.Parse(string(content), dir), tpl)
	if err != nil {
		return "", err
	}
	if len(pages) == 0 {
		return "", errors.New("no pages")
	}
	s.mu.Lock()
	s.previews[key] = pages[0]
	s.mu.Unlock()
	return pages[0], nil
}

// CustomizeTemplate copies a template into the user's templates folder,
// shows it in Finder and returns the new template's id.
func (s *DocService) CustomizeTemplate(id string) (string, error) {
	dir, err := templates.Customize(id)
	if err != nil {
		return "", err
	}
	if err := s.Reveal(filepath.Join(dir, "template.typ")); err != nil {
		return "", err
	}
	return filepath.Base(dir), nil
}

// OpenTemplatesFolder shows the user's templates folder, creating it first.
func (s *DocService) OpenTemplatesFolder() error {
	dir, err := templates.UserDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return s.Reveal(dir)
}

// --- Settings ----------------------------------------------------------------

func settingsPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Peanut Writer", "settings.json"), nil
}

func (s *DocService) loadSettings() {
	p, err := settingsPath()
	if err != nil {
		return
	}
	if b, err := os.ReadFile(p); err == nil {
		json.Unmarshal(b, &s.settings)
	}
}

func (s *DocService) saveSettings() {
	p, err := settingsPath()
	if err != nil {
		return
	}
	b, _ := json.MarshalIndent(s.settings, "", "  ")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err == nil {
		os.WriteFile(p, b, 0o644)
	}
}
