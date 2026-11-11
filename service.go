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
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/wailsapp/wails/v3/pkg/application"

	"peanut-writer/internal/atomicfile"
	"peanut-writer/internal/backup"
	"peanut-writer/internal/doc"
	"peanut-writer/internal/docx"
	"peanut-writer/internal/html"
	"peanut-writer/internal/mdfmt"
	"peanut-writer/internal/render"
	"peanut-writer/internal/templates"
	"peanut-writer/internal/versions"
)

//go:embed starter
var starter embed.FS

// Sample documents the template gallery shows each template with, one per
// built-in template, named by its ID.
//
//go:embed samples
var samples embed.FS

// sampleFor is the sample document tpl's preview shows: its own, else its
// base template's, else Classic's.
func sampleFor(tpl templates.Template) (name, content string, err error) {
	for _, id := range []string{tpl.ID, tpl.Base} {
		if id == "" {
			continue
		}
		if b, err := samples.ReadFile("samples/" + id + ".md"); err == nil {
			return id, string(b), nil
		}
	}
	b, err := samples.ReadFile("samples/" + templates.Default + ".md")
	return templates.Default, string(b), err
}

// DocService is the editor's link to the file system and to Typst: it holds
// the open document's location and renders, saves and exports it.
type DocService struct {
	app    *application.App
	window *application.WebviewWindow

	mu        sync.Mutex
	path      string // the open document's file; "" until it's saved
	dir       string // where its images live: path's folder, or a scratch folder
	dirty     bool
	unsynced  bool // Sync on quit is on and the PDF and Word copies are behind the document
	quitting  bool // the user chose to quit, so closing mustn't ask again
	cancel    context.CancelFunc
	previews  map[string]preview // each template's latest preview, by id
	fonts     []string           // the fonts Typst can use, listed on first use
	typst     *render.Typst
	typstErr  error
	oxfmt     *mdfmt.Oxfmt // found on first use
	state     appState
	untitled  Settings          // the open document's settings while it has no file
	untitledT *templates.Custom // ...and its own template
	scratches []string          // scratch folders, removed on quit
	started   bool              // the editor has called Startup
	pending   string            // a document Finder asked to open before then

	backupMu   sync.Mutex     // one backup at a time
	stateMu    sync.Mutex     // one state.json write at a time
	backupOnce sync.Once      // starts the periodic backups
	backups    sync.WaitGroup // backups started in the background, which quitting waits for

	menuMu     sync.Mutex
	menu       *application.Menu // the menu bar
	recentMenu *application.Menu // File → Open Recent
}

// DocInfo describes the open document.
type DocInfo struct {
	Path     string `json:"path"` // "" for an unsaved document
	Name     string `json:"name"` // shown in the title bar
	Content  string `json:"content"`
	Canceled bool   `json:"canceled"` // the user canceled a dialog; nothing changed
}

// RenderResult is a preview: one SVG per page, and the document's headings.
type RenderResult struct {
	Pages    []string      `json:"pages"`
	Outline  []doc.Heading `json:"outline"`
	Warnings []string      `json:"warnings"`
	Error    string        `json:"error"`
	Template string        `json:"template"` // the template used
}

// StartupInfo is what the editor needs when it opens.
type StartupInfo struct {
	Document   DocInfo              `json:"document"`
	Templates  []templates.Template `json:"templates"`
	TypstError string               `json:"typstError"`
	Recent     []RecentFile         `json:"recent"`  // offered on opening, unless Finder opened a document
	Version    string               `json:"version"` // the app's, recorded in documents' front matter on saving
}

// RecentFile is a recently opened or saved document.
type RecentFile struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Folder string `json:"folder"` // its folder, with ~ for the home folder
}

// maxRecent is how many documents the recent list keeps.
const maxRecent = 10

// appState is what the app remembers between runs (state.json in its config
// folder).
type appState struct {
	Recent []string `json:"recent"` // newest first
}

// Settings are preferences, kept as JSON: the user's for every document
// (settings.json in the app's config folder), and a document's own (Name.settings.json
// beside its Name.md), which override the user's. nil means not set.
type Settings struct {
	AutoFormat  *bool   `json:"autoFormat,omitempty"`  // saving tidies the Markdown with oxfmt
	HeadingCase *string `json:"headingCase,omitempty"` // ...and puts headings in "title" or "sentence" case; anything else leaves them as written
	Author      *string `json:"author,omitempty"`      // a new document's author (global only); nil means the computer user's full name
	Peanut      *bool   `json:"peanut,omitempty"`      // Peanut keeps you company beside the ribbon tabs; nil means on
	SyncOnSave  *bool   `json:"syncOnSave,omitempty"`  // saving also writes the PDF and Word copies, as Sync Files does; nil means off
	SyncOnQuit  *bool   `json:"syncOnQuit,omitempty"`  // quitting or opening another document also writes the copies; nil means on
}

// SettingsInfo is both sets of settings, and the files they're kept in.
type SettingsInfo struct {
	User         Settings `json:"user"`
	Document     Settings `json:"document"`
	UserFile     string   `json:"userFile"`
	DocumentFile string   `json:"documentFile"` // "" until the document is saved
}

func newDocService() *DocService {
	s := &DocService{previews: map[string]preview{}}
	s.typst, s.typstErr = render.Find()
	s.loadState()
	return s
}

// --- Documents ---------------------------------------------------------------

// Startup opens the document Finder launched the app with, if any; else a
// blank document, with the recent ones for the editor to offer beside it.
func (s *DocService) Startup() (StartupInfo, error) {
	s.backupOnce.Do(func() { go s.backupPeriodically() })
	info := StartupInfo{Templates: templates.List(), Version: appVersion}
	if s.typstErr != nil {
		info.TypstError = s.typstErr.Error()
	}
	s.mu.Lock()
	pending := s.pending
	s.started, s.pending = true, ""
	s.mu.Unlock()
	if pending != "" {
		opened, err := s.OpenPath(pending)
		if err == nil {
			info.Document = opened
			return info, nil
		}
		s.app.Dialog.Error().SetTitle("Couldn't open " + filepath.Base(pending)).
			SetMessage(err.Error()).AttachToWindow(s.window).Show()
	}
	var err error
	info.Document, err = s.newUntitled()
	info.Recent = s.RecentFiles()
	return info, err
}

// newUntitled starts a blank document with no file yet.
func (s *DocService) newUntitled() (DocInfo, error) {
	dir, err := s.scratch()
	if err != nil {
		return DocInfo{}, err
	}
	s.setOpen("", dir)
	return DocInfo{Name: "Untitled"}, nil
}

// NewDocument asks for a name and a place, and starts a document in a package
// of that name there, its properties titled with the name (in title case),
// authored by the default author, dated today and marked with the app's version.
func (s *DocService) NewDocument() (DocInfo, error) {
	p, err := s.choosePackage("Untitled", "", "")
	if err != nil || p == "" {
		return DocInfo{Canceled: true}, err
	}
	name := docName(p)
	content := fillProperties("---\npeanut-version: "+frontMatterValue(appVersion)+"\n---\n\n", name)
	if err := atomicfile.Write(p, []byte(content), 0o644); err != nil {
		return DocInfo{}, err
	}
	os.Remove(documentSettingsPath(p)) // a replaced document's
	os.Remove(customTemplatePath(p))
	s.setOpen(p, filepath.Dir(p))
	s.remember(p)
	return DocInfo{Path: p, Name: name, Content: content}, nil
}

// frontMatterValue quotes v when it would otherwise read differently in front
// matter (as the editor's writeFrontMatter does).
func frontMatterValue(v string) string {
	if frontMatterQuote.MatchString(v) {
		return strconv.Quote(v)
	}
	return v
}

var frontMatterQuote = regexp.MustCompile("^[\\s\"'\\[{>|*&!%@`#-]|:\\s|\\s$|#")

// fillProperties gives content the core properties it lacks, as a new
// document starts with them: a title (name, in title case), the default
// author and today's date. One already given, even hidden, is kept; a new
// line goes where the editor's writeFrontMatter would put it.
func fillProperties(content, name string) string {
	var lines []string
	var tail string // from the closing fence on
	if rest, ok := strings.CutPrefix(content, "---\n"); ok {
		all := strings.Split(rest, "\n")
		for i, l := range all {
			if t := strings.TrimSpace(l); t == "---" || t == "..." {
				lines, tail = all[:i], strings.Join(all[i:], "\n")
				break
			}
		}
	}
	if tail == "" {
		tail = "---\n"
		if content != "" && !strings.HasPrefix(content, "\n") {
			tail += "\n"
		}
		tail += content
	}
	keyAt := func(key string) (int, bool) {
		for i, l := range lines {
			if k, v, ok := strings.Cut(l, ":"); ok && strings.EqualFold(strings.TrimSpace(k), key) {
				v = strings.TrimSpace(v)
				return i, v != "" && v != `""` && v != "''"
			}
		}
		return -1, false
	}
	changed := false
	before := []string{"title", "subtitle", "author", "topic"} // the editor's order
	for _, f := range []struct {
		key   string
		value func() string
	}{
		{"title", func() string { return mdfmt.TitleCase(name) }},
		{"author", defaultAuthor},
		{"date", func() string { return time.Now().Format("January 2, 2006") }},
	} {
		i, set := keyAt(f.key)
		if set {
			continue
		}
		v := strings.TrimSpace(f.value())
		if v == "" {
			continue
		}
		line := f.key + ": " + frontMatterValue(v)
		changed = true
		if i >= 0 {
			lines[i] = line
			continue
		}
		at := 0
		for _, k := range before {
			if k == f.key {
				break
			}
			if j, _ := keyAt(k); j >= at {
				at = j + 1
			}
		}
		lines = slices.Insert(lines, at, line)
	}
	if !changed {
		return content
	}
	return "---\n" + strings.Join(lines, "\n") + "\n" + tail
}

// packageExt is the extension of a document's package: a folder, shown by
// Finder as one file (build/darwin/Info.plist declares the type), holding
// Name.md, its settings, template, images and backups.
const packageExt = ".peanut"

// shownPath is the document whose file is p as Finder shows it: its package,
// or p itself if it isn't in one.
func shownPath(p string) string {
	if dir := filepath.Dir(p); strings.EqualFold(filepath.Ext(dir), packageExt) {
		return dir
	}
	return p
}

// docFile is the Markdown file of the document at p: p itself (or the file it
// links to, so saving writes that file rather than replacing the link), or
// for a package, the Markdown file inside it (Name.md, or its only one if the
// package was renamed). A package's Markdown file mustn't be a symlink: one
// from elsewhere could otherwise show (and save over) any file.
func docFile(p string) (string, error) {
	if fi, err := os.Lstat(p); err == nil && fi.Mode()&fs.ModeSymlink != 0 {
		if real, err := filepath.EvalSymlinks(p); err == nil {
			p = real
		}
	}
	if fi, err := os.Stat(p); err != nil || !fi.IsDir() {
		return p, err
	}
	md := filepath.Join(p, docName(p)+".md")
	if _, err := os.Lstat(md); err != nil {
		// Not filepath.Glob: p may hold pattern characters, like "[".
		entries, _ := os.ReadDir(p)
		var found []string
		for _, e := range entries {
			// Not hidden files, like the "._Name.md" macOS writes beside
			// each file on USB drives and network shares.
			if !strings.HasPrefix(e.Name(), ".") && strings.HasSuffix(e.Name(), ".md") {
				found = append(found, e.Name())
			}
		}
		if len(found) != 1 {
			return "", fmt.Errorf("%s holds no document", filepath.Base(p))
		}
		md = filepath.Join(p, found[0])
	}
	fi, err := os.Lstat(md)
	if err != nil {
		return "", err
	}
	if fi.Mode()&fs.ModeSymlink != 0 {
		return "", fmt.Errorf("%s isn't opened: its %s is a link to another file", filepath.Base(p), filepath.Base(md))
	}
	return md, nil
}

// choosePackage asks for a document's name and where to put it, makes a
// package of that name there (Name.peanut: it holds the document, its images
// and its backups) and returns the path of the document's file inside it. ""
// means the user canceled, or chose not to replace an existing document; only
// self (the document being saved as, if any) is replaced without asking.
func (s *DocService) choosePackage(name, dir, self string) (string, error) {
	d := s.app.Dialog.SaveFile().
		SetMessage("Saved as a " + packageExt + " package with pictures and backups.").
		SetFilename(name).
		CanCreateDirectories(true).
		AttachToWindow(s.window)
	if dir != "" {
		d.SetDirectory(dir)
	}
	p, err := d.PromptForSingleSelection()
	if err != nil || p == "" {
		return "", err
	}
	base := filepath.Base(p)
	switch strings.ToLower(filepath.Ext(base)) {
	case ".md", ".markdown", packageExt:
		base = strings.TrimSuffix(base, filepath.Ext(base))
	}
	name = safeFileName(base)
	pkg := filepath.Join(filepath.Dir(p), name+packageExt)
	if err := os.MkdirAll(pkg, 0o755); err != nil {
		return "", err
	}
	p = filepath.Join(pkg, name+".md")
	if self != "" && sameFile(p, self) {
		// Its own name in another case or Unicode form, or through a link:
		// saved as itself, not replaced (which would delete its settings
		// and template as a replaced document's).
		return self, nil
	}
	if _, err := os.Stat(p); err == nil && !s.confirmReplace(name, "Its package already holds a document of that name; replacing it overwrites that document.") {
		return "", nil
	}
	return p, nil
}

// sameFile reports whether the paths a and b name the same file: macOS
// ignores case and Unicode form in names.
func sameFile(a, b string) bool {
	fa, err := os.Stat(a)
	if err != nil {
		return false
	}
	fb, err := os.Stat(b)
	return err == nil && os.SameFile(fa, fb)
}

// confirmReplace asks whether to replace the existing file name, as detail
// explains.
func (s *DocService) confirmReplace(name, detail string) bool {
	choice := make(chan bool, 1)
	d := s.app.Dialog.Question().
		SetTitle(fmt.Sprintf("“%s” already exists. Do you want to replace it?", name)).
		SetMessage(detail)
	d.AddButton("Replace").OnClick(func() { choice <- true })
	cancel := d.AddButton("Cancel").OnClick(func() { choice <- false })
	d.SetDefaultButton(cancel).SetCancelButton(cancel).AttachToWindow(s.window).Show()
	return <-choice
}

// OpenWelcome opens the welcome guide as an unsaved document.
func (s *DocService) OpenWelcome() (DocInfo, error) {
	dir, err := s.scratch()
	if err != nil {
		return DocInfo{}, err
	}
	content, err := copyStarter(dir)
	if err != nil {
		return DocInfo{}, err
	}
	s.setOpen("", dir)
	return DocInfo{Name: "Welcome", Content: content}, nil
}

// copyStarter copies the welcome guide's images into dir and returns its
// text.
func copyStarter(dir string) (string, error) {
	images, err := fs.Sub(starter, "starter/images")
	if err != nil {
		return "", err
	}
	if err := os.CopyFS(filepath.Join(dir, "images"), images); err != nil {
		return "", err
	}
	b, err := starter.ReadFile("starter/welcome.md")
	return string(b), err
}

// OpenDocument asks for a document (a package, or a Markdown file) and opens
// it.
func (s *DocService) OpenDocument() (DocInfo, error) {
	p, err := s.app.Dialog.OpenFile().
		SetTitle("Open").
		AddFilter("Documents", "*"+packageExt+";*.md;*.markdown;*.txt").
		CanChooseFiles(true).
		AttachToWindow(s.window).
		PromptForSingleSelection()
	if err != nil || p == "" {
		return DocInfo{Canceled: true}, err
	}
	return s.OpenPath(p)
}

// OpenPath opens the document at p: a package, or a Markdown file. A file
// that's gone is dropped from the recent list.
func (s *DocService) OpenPath(p string) (DocInfo, error) {
	md, err := docFile(p)
	var b []byte
	if err == nil {
		b, err = os.ReadFile(md)
	}
	if errors.Is(err, fs.ErrNotExist) {
		s.ForgetRecent(p)
		return DocInfo{}, fmt.Errorf("%s isn't there anymore", filepath.Base(p))
	}
	if err != nil {
		return DocInfo{}, err
	}
	if !utf8.Valid(b) {
		// The editor would show its other characters as �, and save them so.
		return DocInfo{}, fmt.Errorf("%s isn't UTF-8 text: save it as UTF-8 in another editor (TextEdit, say) first", filepath.Base(md))
	}
	s.setOpen(md, filepath.Dir(md))
	s.remember(md)
	s.backupLater(md)
	return DocInfo{Path: md, Name: docName(md), Content: withoutBOM(string(b))}, nil
}

// withoutBOM is a document's text without a leading byte order mark, which
// some editors (Notepad, say) write and which would hide its front matter
// and first heading. Saving writes the text without it.
func withoutBOM(text string) string {
	return strings.TrimPrefix(text, "\ufeff")
}

// openedWithFile opens the document at p, which Finder asked the app to open:
// through the editor once it has started (so it deals with unsaved changes
// first), else as the document it starts with.
func (s *DocService) openedWithFile(p string) {
	s.mu.Lock()
	started := s.started
	if !started {
		s.pending = p
	}
	s.mu.Unlock()
	if started {
		s.app.Event.Emit("openRecent", p)
	}
}

// Save writes the document to its file, asking where first if it has none.
// Core properties it lacks are filled in (see fillProperties); the returned
// Content is what was written.
func (s *DocService) Save(content string) (DocInfo, error) {
	s.mu.Lock()
	p := s.path
	s.mu.Unlock()
	if p == "" {
		return s.SaveAs(content)
	}
	content = fillProperties(content, docName(p))
	if err := atomicfile.Write(p, []byte(content), 0o644); err != nil {
		return DocInfo{}, err
	}
	s.SetDirty(false)
	return DocInfo{Path: p, Name: docName(p), Content: content}, nil
}

// SaveAs asks for a name and a place and saves the document in a package of
// that name there, bringing its images along and filling in core properties
// it lacks.
func (s *DocService) SaveAs(content string) (DocInfo, error) {
	s.mu.Lock()
	oldDir, oldPath := s.dir, s.path
	s.mu.Unlock()
	name, dir := "Untitled", ""
	if oldPath != "" {
		// Start beside the document's package (or older folder), not inside it.
		name, dir = docName(oldPath), filepath.Dir(shownPath(oldPath))
		if filepath.Base(dir) == name {
			dir = filepath.Dir(dir)
		}
	} else if t := doc.Parse(content, "").Meta.Title; t != "" {
		name = safeFileName(t)
	}
	p, err := s.choosePackage(name, dir, oldPath)
	if err != nil || p == "" {
		return DocInfo{Canceled: true}, err
	}
	content = fillProperties(content, docName(p))
	if err := copyImages(content, oldDir, filepath.Dir(p)); err != nil {
		return DocInfo{}, fmt.Errorf("copying images: %w", err)
	}
	if err := atomicfile.Write(p, []byte(content), 0o644); err != nil {
		return DocInfo{}, err
	}
	if err := s.carrySettings(oldPath, p); err != nil {
		return DocInfo{}, fmt.Errorf("copying settings: %w", err)
	}
	if err := s.carryTemplate(oldPath, p); err != nil {
		return DocInfo{}, fmt.Errorf("copying the document's template: %w", err)
	}
	s.setOpen(p, filepath.Dir(p))
	s.remember(p)
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

// SetUnsynced records whether closing must first sync the PDF and Word
// copies (Sync on quit is on and they're behind the document).
func (s *DocService) SetUnsynced(unsynced bool) {
	s.mu.Lock()
	s.unsynced = unsynced
	s.mu.Unlock()
}

// Quit quits without asking about unsaved changes (the editor already did).
func (s *DocService) Quit() {
	s.mu.Lock()
	s.quitting = true
	s.mu.Unlock()
	s.app.Quit()
}

// shouldClose reports whether the window may close now; if not, the editor
// is asked to deal with unsaved changes (and unsynced copies) first.
func (s *DocService) shouldClose() bool {
	s.mu.Lock()
	ok := !(s.dirty || s.unsynced) || s.quitting
	s.mu.Unlock()
	if !ok {
		s.app.Event.Emit("menu", "quit")
	}
	return ok
}

// setOpen makes p (or an untitled document, if "") the open document. The
// document it replaces gets a last backup.
func (s *DocService) setOpen(p, dir string) {
	s.mu.Lock()
	old := s.path
	s.path, s.dir = p, dir
	if p == "" {
		s.untitled, s.untitledT = Settings{}, nil
	}
	s.mu.Unlock()
	s.SetDirty(false)
	if old != "" && old != p {
		s.backupLater(old)
	}
}

// --- Backups -----------------------------------------------------------------

// backupInterval is how often the open document is backed up.
const backupInterval = 10 * time.Minute

func (s *DocService) backupPeriodically() {
	for range time.Tick(backupInterval) {
		s.mu.Lock()
		p := s.path
		s.mu.Unlock()
		s.backupFailed(s.backup(p))
	}
}

// backupLater backs up p in the background; quitting waits for it.
func (s *DocService) backupLater(p string) {
	s.backups.Go(func() { s.backupFailed(s.backup(p)) })
}

// backup copies the saved file at p into a timestamped backups folder beside
// it, unless it hasn't changed since its last backup.
func (s *DocService) backup(p string) error {
	if p == "" {
		return nil
	}
	s.backupMu.Lock()
	defer s.backupMu.Unlock()
	b, err := os.ReadFile(p)
	if err != nil {
		return err
	}
	content := string(b)
	if !backup.Changed(p, content) {
		return nil
	}
	return backup.Write(p, content, time.Now())
}

// backupFailed tells the editor about a failed backup, if err is one.
func (s *DocService) backupFailed(err error) {
	if err != nil && s.app != nil {
		s.app.Event.Emit("backupFailed", err.Error())
	}
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

// ServiceShutdown backs up the open document, once the backups started in
// the background are done, and removes the scratch folders.
func (s *DocService) ServiceShutdown() error {
	s.backups.Wait()
	s.mu.Lock()
	p := s.path
	s.mu.Unlock()
	s.backupFailed(s.backup(p))
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
	// At most 80 characters and 200 bytes, so the files named after it (and
	// atomicfile's temporary copies of them, ".Name.template.json.123456789")
	// fit the 255-byte limit on file names.
	end := 0
	for n := 0; end < len(s) && n < 80; n++ {
		_, size := utf8.DecodeRuneInString(s[end:])
		if end+size > 200 {
			break
		}
		end += size
	}
	s = strings.TrimSpace(s[:end])
	if s == "" {
		return "Untitled"
	}
	return s
}

// copyImages copies the images content refers to (in from: see
// doc.ImagePath), in any Markdown form the document reads (inline,
// reference-style, `<…>` or escaped paths), from one folder to another,
// keeping any that are already there.
func copyImages(content, from, to string) error {
	if from == to {
		return nil
	}
	var srcs []string
	doc.Walk(doc.Parse(content, from).Blocks, func(b *doc.Block) {
		srcs = append(srcs, b.Src)
		for _, p := range b.Pictures {
			srcs = append(srcs, p.Src)
		}
	}, func(x *doc.Inline) { srcs = append(srcs, x.Src) })
	for _, src := range srcs {
		if src == "" {
			continue // not an image, or missing before, missing after
		}
		rel, err := filepath.Rel(from, src)
		if err != nil || !filepath.IsLocal(rel) {
			continue
		}
		dst := filepath.Join(to, rel)
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		b, err := os.ReadFile(src)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		if err := atomicfile.Write(dst, b, 0o644); err != nil {
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

// ChooseImages asks for one or more image files and stores each like
// AddImageFile; none if the user cancels.
func (s *DocService) ChooseImages() ([]string, error) {
	paths, err := s.app.Dialog.OpenFile().
		SetTitle("Insert Pictures").
		AddFilter("Images", "*.png;*.jpg;*.jpeg;*.gif;*.svg;*.webp").
		CanChooseFiles(true).
		AttachToWindow(s.window).
		PromptForMultipleSelection()
	if err != nil {
		return nil, err
	}
	srcs := make([]string, 0, len(paths))
	for _, p := range paths {
		src, err := s.AddImageFile(p)
		if err != nil {
			return srcs, err
		}
		srcs = append(srcs, src)
	}
	return srcs, nil
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
		// Only a new file: never through a (dangling) symlink left there.
		f, err := os.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if errors.Is(err, fs.ErrExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		_, err = f.Write(b)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			os.Remove(p)
			return "", err
		}
		return "images/" + file, nil
	}
}

// ImageURL returns an image the document refers to as a data URL, for the
// editor to show; "" if there's no such file.
func (s *DocService) ImageURL(ref string) string {
	s.mu.Lock()
	dir := s.dir
	s.mu.Unlock()
	p := doc.ImagePath(dir, ref)
	if p == "" || checkImageName(p) != nil {
		return ""
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

// equationPt is the text size the editor's equations are drawn at.
const equationPt = 13

// Equations draws display equations for the editor to show, each as an SVG
// data URL in texs' order: "" for one that can't be drawn, and for all of them
// when Typst can't run.
func (s *DocService) Equations(texs []string) []string {
	out := make([]string, len(texs))
	if s.typstErr != nil || len(texs) == 0 {
		return out
	}
	ms := make([]doc.Math, len(texs))
	for i, tex := range texs {
		ms[i] = doc.Math{TeX: tex, Display: true}
	}
	pics, _ := s.typst.Equations(context.Background(), ms, equationPt, "svg")
	for i, p := range pics {
		if p != nil {
			out[i] = "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString(p)
		}
	}
	return out
}

// --- Rendering and export ----------------------------------------------------

// Render renders the document for the preview. A newer call cancels an
// older one still running.
func (s *DocService) Render(content string) RenderResult {
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	if s.cancel != nil {
		s.cancel()
	}
	s.cancel = cancel
	dir, cur := s.dir, s.path
	s.mu.Unlock()
	defer cancel()

	d := doc.Parse(content, dir)
	if s.typstErr != nil {
		return RenderResult{Outline: d.Outline(), Error: s.typstErr.Error()}
	}
	tpl, err := s.templateFor(cur, d.Meta.Template)
	if err != nil {
		return RenderResult{Outline: d.Outline(), Error: err.Error(), Template: templates.CustomID}
	}
	pages, warnings, err := s.typst.Preview(ctx, d, tpl)
	if p := templates.Problem(d.Meta.Template); p != "" {
		warnings = append(warnings, p)
	}
	res := RenderResult{Pages: pages, Outline: d.Outline(), Warnings: append(d.Warnings, warnings...), Template: tpl.ID}
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
	return p, atomicfile.Write(p, b, 0o644)
}

// ExportDOCX asks where to save a Word document and writes it; returns the
// path, or "" if the user canceled.
func (s *DocService) ExportDOCX(content string) (string, error) {
	d, tpl, p, err := s.exportTarget(content, ".docx", "Word Document", "*.docx")
	if err != nil || p == "" {
		return "", err
	}
	b, err := s.docxBytes(d, tpl)
	if err != nil {
		return "", err
	}
	return p, atomicfile.Write(p, b, 0o644)
}

// ExportHTML asks where to save a web page of the document and writes it;
// returns the path, or "" if the user canceled.
func (s *DocService) ExportHTML(content string) (string, error) {
	d, tpl, p, err := s.exportTarget(content, ".html", "Web Page", "*.html")
	if err != nil || p == "" {
		return "", err
	}
	opt := html.Options{Title: strings.TrimSuffix(filepath.Base(p), filepath.Ext(p))}
	if s.typst != nil {
		opt.Equations = func(ms []doc.Math, sizePt float64) [][]byte {
			pics, _ := s.typst.Equations(context.Background(), ms, sizePt, "svg")
			return pics
		}
	}
	return p, atomicfile.Write(p, html.Write(d, tpl.Docx, opt), 0o644)
}

// SyncFiles writes a PDF and a Word copy of the saved document beside it (its
// package, if it's in one), under the same name, replacing earlier copies;
// returns their paths. Neither is written unless both render.
func (s *DocService) SyncFiles(content string) ([]string, error) {
	if s.typstErr != nil {
		return nil, s.typstErr
	}
	s.mu.Lock()
	dir, cur := s.dir, s.path
	s.mu.Unlock()
	if cur == "" {
		return nil, errors.New("save the document first")
	}
	d := doc.Parse(content, dir)
	tpl, err := s.templateFor(cur, d.Meta.Template)
	if err != nil {
		return nil, err
	}
	pdf, err := s.typst.PDF(context.Background(), d, tpl)
	if err != nil {
		return nil, fmt.Errorf("PDF: %w", err)
	}
	word, err := s.docxBytes(d, tpl)
	if err != nil {
		return nil, fmt.Errorf("Word: %w", err)
	}
	base := filepath.Join(filepath.Dir(shownPath(cur)), docName(cur))
	paths := []string{base + ".pdf", base + ".docx"}
	for i, b := range [][]byte{pdf, word} {
		if err := atomicfile.Write(paths[i], b, 0o644); err != nil {
			return nil, err
		}
	}
	return paths, nil
}

func (s *DocService) docxBytes(d *doc.Document, tpl templates.Template) ([]byte, error) {
	opt := docx.Options{}
	if s.typst != nil {
		opt.Rasterize = func(path string, widthPt float64) ([]byte, error) {
			return s.typst.PNG(context.Background(), path, widthPt)
		}
		opt.Equations = func(ms []doc.Math, sizePt float64) [][]byte {
			pics, _ := s.typst.Equations(context.Background(), ms, sizePt, "png")
			return pics
		}
	}
	return docx.Write(d, tpl.Docx, opt)
}

func (s *DocService) exportTarget(content, ext, kind, pattern string) (*doc.Document, templates.Template, string, error) {
	s.mu.Lock()
	dir, cur := s.dir, s.path
	s.mu.Unlock()
	d := doc.Parse(content, dir)
	tpl, err := s.templateFor(cur, d.Meta.Template)
	if err != nil {
		return nil, tpl, "", err
	}
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
		dlg.SetDirectory(filepath.Dir(shownPath(cur)))
	}
	p, err := dlg.PromptForSingleSelection()
	if err != nil || p == "" {
		return nil, tpl, "", err
	}
	if !strings.EqualFold(filepath.Ext(p), ext) {
		// The dialog (whose filter macOS doesn't apply) asked about replacing
		// the name without the extension, if anything; this one's asked here.
		p += ext
		if _, err := os.Stat(p); err == nil && !s.confirmReplace(filepath.Base(p), "Replacing it overwrites its contents.") {
			return nil, tpl, "", nil
		}
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

// --- Versions ----------------------------------------------------------------

// docSidecars are the files beside the document at p that belong to it: its
// own template and its settings.
func docSidecars(p string) []string {
	return []string{customTemplatePath(p), documentSettingsPath(p)}
}

// SaveVersion keeps the saved document, with its own template and settings,
// as a version named name in its versions folder, with Word and PDF copies.
// Nothing is kept unless both render.
func (s *DocService) SaveVersion(name string) (versions.Version, error) {
	if s.typstErr != nil {
		return versions.Version{}, s.typstErr
	}
	p := s.openPath()
	if p == "" {
		return versions.Version{}, errors.New("save the document first")
	}
	if strings.TrimSpace(name) == "" {
		return versions.Version{}, errors.New("a version needs a name")
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return versions.Version{}, err
	}
	d := doc.Parse(withoutBOM(string(b)), filepath.Dir(p))
	tpl, err := s.templateFor(p, d.Meta.Template)
	if err != nil {
		return versions.Version{}, err
	}
	pdf, err := s.typst.PDF(context.Background(), d, tpl)
	if err != nil {
		return versions.Version{}, fmt.Errorf("PDF: %w", err)
	}
	word, err := s.docxBytes(d, tpl)
	if err != nil {
		return versions.Version{}, fmt.Errorf("Word: %w", err)
	}
	return versions.Save(p, safeFileName(name), docSidecars(p), word, pdf)
}

// Versions lists the open document's versions, newest first; none while
// it's untitled.
func (s *DocService) Versions() ([]versions.Version, error) {
	p := s.openPath()
	if p == "" {
		return nil, nil
	}
	return versions.List(p)
}

// Backups lists the open document's backups, newest first; none while it's
// untitled.
func (s *DocService) Backups() []backup.Backup {
	p := s.openPath()
	if p == "" {
		return nil
	}
	return backup.List(p)
}

// LoadVersion asks, then replaces the saved document, its own template and
// its settings with the version named name, after backing the document up.
func (s *DocService) LoadVersion(name string) (DocInfo, error) {
	p := s.openPath()
	if p == "" {
		return DocInfo{}, errors.New("save the document first")
	}
	if !s.confirmOpenVersion(fmt.Sprintf("“%s” replaces the document's text, template and settings. The current text is kept in backups.", name)) {
		return DocInfo{Canceled: true}, nil
	}
	if err := s.backupFirst(p); err != nil {
		return DocInfo{}, err
	}
	content, err := versions.Restore(p, name, docSidecars(p))
	if err != nil {
		return DocInfo{}, err
	}
	s.SetDirty(false)
	return DocInfo{Path: p, Name: docName(p), Content: withoutBOM(content)}, nil
}

// LoadBackup asks, then replaces the saved document's text with that of its
// backup at path (a Backup's Path), after backing the document up.
func (s *DocService) LoadBackup(path string) (DocInfo, error) {
	p := s.openPath()
	if p == "" {
		return DocInfo{}, errors.New("save the document first")
	}
	var found *backup.Backup
	for _, b := range backup.List(p) {
		if b.Path == path {
			found = &b
			break
		}
	}
	if found == nil {
		return DocInfo{}, errors.New("that backup no longer exists")
	}
	at := time.UnixMilli(found.Saved).Format("Jan 2, 2006 at 3:04 PM")
	if !s.confirmOpenVersion(fmt.Sprintf("The backup from %s replaces the document's text. The current text is kept in backups.", at)) {
		return DocInfo{Canceled: true}, nil
	}
	// Read before backing up: the new backup may prune this one.
	content, err := os.ReadFile(found.Path)
	if err != nil {
		return DocInfo{}, err
	}
	if err := s.backupFirst(p); err != nil {
		return DocInfo{}, err
	}
	if err := atomicfile.Write(p, content, 0o644); err != nil {
		return DocInfo{}, err
	}
	s.SetDirty(false)
	return DocInfo{Path: p, Name: docName(p), Content: withoutBOM(string(content))}, nil
}

// backupFirst backs up the document at p before it's replaced: a document
// that can't be backed up isn't replaced, but one that's gone has nothing to
// lose.
func (s *DocService) backupFirst(p string) error {
	if err := s.backup(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("the document couldn't be backed up first, so it wasn't replaced: %w", err)
	}
	return nil
}

// confirmOpenVersion asks whether to open an earlier version of the document,
// described by message.
func (s *DocService) confirmOpenVersion(message string) bool {
	choice := make(chan bool, 1)
	d := s.app.Dialog.Question().SetTitle("Open this version?").SetMessage(message)
	d.AddButton("Open").OnClick(func() { choice <- true })
	cancel := d.AddButton("Cancel").OnClick(func() { choice <- false })
	d.SetDefaultButton(cancel).SetCancelButton(cancel).AttachToWindow(s.window).Show()
	return <-choice
}

// --- Formatting --------------------------------------------------------------

// Format tidies the document's Markdown with oxfmt and puts its headings in
// headingCase: "title" or "sentence" case, or as written.
func (s *DocService) Format(content, headingCase string) (string, error) {
	s.mu.Lock()
	o := s.oxfmt
	s.mu.Unlock()
	if o == nil {
		// Looked for again each time until found, so installing it needn't
		// mean restarting.
		var err error
		if o, err = mdfmt.Find(); err != nil {
			return "", err
		}
		s.mu.Lock()
		s.oxfmt = o
		s.mu.Unlock()
	}
	out, err := o.Format(context.Background(), content)
	if err != nil {
		// Looked for again next time: updating oxfmt or Node (with mise or
		// nvm, say) may have moved it.
		s.mu.Lock()
		s.oxfmt = nil
		s.mu.Unlock()
		return "", err
	}
	switch headingCase {
	case "title":
		out = mdfmt.CaseHeadings(out, mdfmt.TitleCase)
	case "sentence":
		out = mdfmt.CaseHeadings(out, mdfmt.SentenceCase)
	}
	return out, nil
}

// --- Templates ---------------------------------------------------------------

// Templates lists the output templates.
func (s *DocService) Templates() []templates.Template { return templates.List() }

// TemplatePreview is the first page of a sample document (see sampleFor) in a
// template (the open document's own for templates.CustomID), as SVG.
func (s *DocService) TemplatePreview(id string) (string, error) {
	if s.typstErr != nil {
		return "", s.typstErr
	}
	s.mu.Lock()
	cur := s.path
	s.mu.Unlock()
	tpl, err := s.templateFor(cur, id)
	if err != nil {
		return "", err
	}
	src, err := tpl.Source()
	if err != nil {
		return "", err
	}
	style, err := json.Marshal(tpl.TypstStyle())
	if err != nil {
		return "", err
	}
	name, content, err := sampleFor(tpl)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(append(src, style...))
	key := name + ":" + hex.EncodeToString(sum[:8])
	s.mu.Lock()
	cached, ok := s.previews[tpl.ID]
	s.mu.Unlock()
	if ok && cached.key == key {
		return cached.svg, nil
	}
	// The samples have no pictures, so they need no folder.
	pages, _, err := s.typst.Preview(context.Background(), doc.Parse(content, ""), tpl)
	if err != nil {
		return "", err
	}
	if len(pages) == 0 {
		return "", errors.New("no pages")
	}
	// Only the latest preview of each template is kept: restyling the
	// document's own template, or another document's, replaces it.
	s.mu.Lock()
	s.previews[tpl.ID] = preview{key, pages[0]}
	s.mu.Unlock()
	return pages[0], nil
}

// preview is a template preview, and the sample and template source it shows.
type preview struct {
	key string // the sample's name and a hash of the template's source and style
	svg string
}

// customTemplatePath is where the document at p keeps its own template
// (Design → Customize): Name.template.json beside Name.md.
func customTemplatePath(p string) string {
	return strings.TrimSuffix(p, filepath.Ext(p)) + ".template.json"
}

// readCustom reads the own template of the document at p (the untitled
// one's if ""); nil if it has none.
func (s *DocService) readCustom(p string) (*templates.Custom, error) {
	if p != "" {
		return templates.ReadCustom(customTemplatePath(p))
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.untitledT == nil {
		return nil, nil
	}
	c := *s.untitledT
	return &c, nil
}

// writeCustom keeps c as the own template of the document at p (the
// untitled one's if "").
func (s *DocService) writeCustom(p string, c *templates.Custom) error {
	if p != "" {
		return templates.WriteCustom(customTemplatePath(p), c)
	}
	if err := c.Style.Check(); err != nil {
		return err
	}
	cp := *c
	s.mu.Lock()
	s.untitledT = &cp
	s.mu.Unlock()
	return nil
}

// templateFor is the template the document at p (the untitled one if "")
// names by id: its own one for templates.CustomID, if it has one.
func (s *DocService) templateFor(p, id string) (templates.Template, error) {
	if id != templates.CustomID {
		return templates.Get(id), nil
	}
	c, err := s.readCustom(p)
	if err != nil || c == nil {
		return templates.Get(id), err
	}
	return c.Template(), nil
}

// carryTemplate gives the document saved as the own template of the one it
// was saved from (from, or the untitled document's if ""), if it has one.
func (s *DocService) carryTemplate(from, to string) error {
	if from == to {
		return nil
	}
	if err := os.Remove(customTemplatePath(to)); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err // a replaced document's
	}
	c, err := s.readCustom(from)
	if err != nil || c == nil {
		return err
	}
	return templates.WriteCustom(customTemplatePath(to), c)
}

// openPath is the open document's file; "" while it's untitled.
func (s *DocService) openPath() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.path
}

// CustomTemplate is the open document's own template; nil if it has none.
func (s *DocService) CustomTemplate() (*templates.Template, error) {
	c, err := s.readCustom(s.openPath())
	if err != nil || c == nil {
		return nil, err
	}
	t := c.Template()
	return &t, nil
}

// CustomizeTemplate gives the open document its own template, based on the
// template base with nothing changed yet, unless it has one already, and
// returns it. It's kept beside the document (an untitled one's once it's
// saved).
func (s *DocService) CustomizeTemplate(base string) (templates.Template, error) {
	p := s.openPath()
	c, err := s.readCustom(p)
	if err != nil {
		return templates.Template{}, err
	}
	if c == nil {
		c = &templates.Custom{Base: templates.Get(base).ID}
		if err := s.writeCustom(p, c); err != nil {
			return templates.Template{}, err
		}
	}
	return c.Template(), nil
}

// SetTemplateStyle sets the fonts and colors of the open document's own
// template and returns it.
func (s *DocService) SetTemplateStyle(style templates.Style) (templates.Template, error) {
	p := s.openPath()
	c, err := s.readCustom(p)
	if err != nil {
		return templates.Template{}, err
	}
	if c == nil {
		return templates.Template{}, errors.New("this document has no template of its own: use Customize first")
	}
	c.Style = style
	if err := s.writeCustom(p, c); err != nil {
		return templates.Template{}, err
	}
	return c.Template(), nil
}

// SetTemplateBase bases the open document's own template on the template
// base, keeping its changes, and returns it.
func (s *DocService) SetTemplateBase(base string) (templates.Template, error) {
	p := s.openPath()
	c, err := s.readCustom(p)
	if err != nil {
		return templates.Template{}, err
	}
	if c == nil {
		return templates.Template{}, errors.New("this document has no template of its own: use Customize first")
	}
	c.Base = templates.Get(base).ID
	if err := s.writeCustom(p, c); err != nil {
		return templates.Template{}, err
	}
	return c.Template(), nil
}

// SaveCustomTemplate adds the open document's own template to the user's
// templates as a new one named name, for any document to use, and returns
// its id.
func (s *DocService) SaveCustomTemplate(name, description string) (string, error) {
	c, err := s.readCustom(s.openPath())
	if err != nil {
		return "", err
	}
	if c == nil {
		return "", errors.New("this document has no template of its own: use Customize first")
	}
	return templates.Save(*c, name, description)
}

// RemoveCustomTemplate deletes the open document's own template and returns
// the id of the template it was based on.
func (s *DocService) RemoveCustomTemplate() (string, error) {
	p := s.openPath()
	c, err := s.readCustom(p)
	if err != nil || c == nil {
		return templates.Default, err
	}
	if p == "" {
		s.mu.Lock()
		s.untitledT = nil
		s.mu.Unlock()
	} else if err := os.Remove(customTemplatePath(p)); err != nil {
		return "", err
	}
	return templates.Get(c.Base).ID, nil
}

// Fonts lists the fonts a document's own template can use: those Typst
// finds.
func (s *DocService) Fonts() ([]string, error) {
	if s.typstErr != nil {
		return nil, s.typstErr
	}
	s.mu.Lock()
	fonts := s.fonts
	s.mu.Unlock()
	if fonts != nil {
		return fonts, nil
	}
	fonts, err := s.typst.Fonts(context.Background())
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.fonts = fonts
	s.mu.Unlock()
	return fonts, nil
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

// RenameTemplate sets one of the user's templates' name and description.
func (s *DocService) RenameTemplate(id, name, description string) error {
	return templates.Rename(id, name, description)
}

// EditTemplate shows one of the user's templates' template.typ in Finder,
// to open in a text editor.
func (s *DocService) EditTemplate(id string) error {
	t, err := templates.User(id)
	if err != nil {
		return err
	}
	return s.Reveal(filepath.Join(t.Dir(), "template.typ"))
}

// DeleteTemplate asks, then deletes one of the user's templates. It reports
// whether it did.
func (s *DocService) DeleteTemplate(id string) (bool, error) {
	t, err := templates.User(id)
	if err != nil {
		return false, err
	}
	choice := make(chan bool, 1)
	d := s.app.Dialog.Question().
		SetTitle(fmt.Sprintf("Delete the template “%s”?", t.Name)).
		SetMessage("Its folder is deleted from your templates folder; this can't be undone. Documents that use it look Classic.")
	d.AddButton("Delete").OnClick(func() { choice <- true })
	cancel := d.AddButton("Cancel").OnClick(func() { choice <- false })
	d.SetDefaultButton(cancel).SetCancelButton(cancel).AttachToWindow(s.window).Show()
	if !<-choice {
		return false, nil
	}
	return true, templates.Delete(id)
}

// ShareTemplate asks where to save one of the user's templates as a .zip
// (for ImportTemplate on another computer), writes it and shows it in
// Finder. It returns the file's path, or "" if canceled.
func (s *DocService) ShareTemplate(id string) (string, error) {
	t, err := templates.User(id)
	if err != nil {
		return "", err
	}
	p, err := s.app.Dialog.SaveFile().
		SetFilename(safeFileName(t.Name)+".zip").
		AddFilter("Template", "*.zip").
		CanCreateDirectories(true).
		AttachToWindow(s.window).
		PromptForSingleSelection()
	if err != nil || p == "" {
		return "", err
	}
	// Written whole, so a failure doesn't cost the zip it was to replace.
	var zip bytes.Buffer
	if err := templates.Export(id, &zip); err != nil {
		return "", err
	}
	if err := atomicfile.Write(p, zip.Bytes(), 0o644); err != nil {
		return "", err
	}
	return p, s.Reveal(p)
}

// ImportTemplate asks for a shared template .zip and adds it to the user's
// templates. It returns the new template's id, or "" if canceled.
func (s *DocService) ImportTemplate() (string, error) {
	p, err := s.app.Dialog.OpenFile().
		SetTitle("Import Template").
		AddFilter("Template", "*.zip").
		CanChooseFiles(true).
		AttachToWindow(s.window).
		PromptForSingleSelection()
	if err != nil || p == "" {
		return "", err
	}
	dir, err := templates.Import(p)
	if err != nil {
		return "", err
	}
	return filepath.Base(dir), nil
}

// --- Recent documents --------------------------------------------------------

// RecentFiles lists the recent documents that are still there, newest first.
func (s *DocService) RecentFiles() []RecentFile {
	s.mu.Lock()
	paths := slices.Clone(s.state.Recent)
	s.mu.Unlock()
	home, _ := os.UserHomeDir()
	files := []RecentFile{}
	for _, p := range paths {
		if _, err := os.Stat(p); err != nil {
			continue // moved, deleted, or on a drive that isn't mounted
		}
		folder := filepath.Dir(shownPath(p))
		if home != "" && (folder == home || strings.HasPrefix(folder, home+string(filepath.Separator))) {
			folder = "~" + folder[len(home):]
		}
		files = append(files, RecentFile{Path: p, Name: docName(p), Folder: folder})
	}
	return files
}

// ClearRecent empties the recent list.
func (s *DocService) ClearRecent() {
	s.mu.Lock()
	s.state.Recent = nil
	s.mu.Unlock()
	s.recentChanged()
}

// remember puts p at the top of the recent list.
func (s *DocService) remember(p string) {
	s.mu.Lock()
	r := slices.DeleteFunc(slices.Clone(s.state.Recent), func(q string) bool { return q == p })
	r = slices.Insert(r, 0, p)
	s.state.Recent = r[:min(len(r), maxRecent)]
	s.mu.Unlock()
	s.recentChanged()
}

// ForgetRecent takes p off the recent list.
func (s *DocService) ForgetRecent(p string) {
	s.mu.Lock()
	s.state.Recent = slices.DeleteFunc(slices.Clone(s.state.Recent), func(q string) bool { return q == p })
	s.mu.Unlock()
	s.recentChanged()
}

func (s *DocService) recentChanged() {
	s.saveState()
	s.fillRecentMenu()
}

// fillRecentMenu lists the recent documents in File → Open Recent and
// refreshes the menu bar; choosing one sends the editor an "openRecent"
// event with its path. Names that appear twice get their folder too.
func (s *DocService) fillRecentMenu() {
	s.menuMu.Lock()
	defer s.menuMu.Unlock()
	m := s.recentMenu
	if m == nil {
		return
	}
	m.Clear()
	files := s.RecentFiles()
	names := map[string]int{}
	for _, f := range files {
		names[f.Name]++
	}
	for _, f := range files {
		label := f.Name
		if names[f.Name] > 1 {
			label += " — " + f.Folder
		}
		p := f.Path
		m.Add(label).OnClick(func(*application.Context) { s.app.Event.Emit("openRecent", p) })
	}
	if len(files) > 0 {
		m.AddSeparator()
	}
	m.Add("Clear Menu").SetEnabled(len(files) > 0).OnClick(func(*application.Context) { s.ClearRecent() })
	if s.menu != nil {
		s.menu.Update() // a no-op until the app runs
	}
}

// --- Settings ----------------------------------------------------------------

// configPath is the path of the named file in the app's config folder.
func configPath(name string) (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Peanut Writer", name), nil
}

// documentSettingsPath is where the document at p keeps its settings:
// Name.settings.json beside Name.md.
func documentSettingsPath(p string) string {
	return strings.TrimSuffix(p, filepath.Ext(p)) + ".settings.json"
}

// Settings reads the user's settings and the open document's. Both files
// are read afresh, so edits made to them by hand count.
func (s *DocService) Settings() (SettingsInfo, error) {
	userFile, err := configPath("settings.json")
	if err != nil {
		return SettingsInfo{}, err
	}
	info := SettingsInfo{UserFile: userFile}
	if info.User, err = readSettings(userFile); err != nil {
		return info, err
	}
	if info.User.Author == nil {
		name := computerUserName()
		info.User.Author = &name
	}
	if info.User.Peanut == nil {
		on := true
		info.User.Peanut = &on
	}
	s.mu.Lock()
	p := s.path
	info.Document = s.untitled
	s.mu.Unlock()
	if p != "" {
		info.DocumentFile = documentSettingsPath(p)
		info.Document, err = readSettings(info.DocumentFile)
	}
	return info, err
}

// SetUserSettings sets the user's settings.
func (s *DocService) SetUserSettings(set Settings) error {
	p, err := configPath("settings.json")
	if err != nil {
		return err
	}
	return writeSettings(p, set)
}

// SetDocumentSettings sets the open document's settings; an untitled
// document's are written beside it when it's first saved.
func (s *DocService) SetDocumentSettings(set Settings) error {
	s.mu.Lock()
	p := s.path
	if p == "" {
		s.untitled = set
	}
	s.mu.Unlock()
	if p == "" {
		return nil
	}
	return writeSettings(documentSettingsPath(p), set)
}

// carrySettings gives the document saved as to the settings of the one it
// was saved from (from, or the untitled document's if "").
func (s *DocService) carrySettings(from, to string) error {
	if from == to {
		return nil
	}
	dst := documentSettingsPath(to)
	if err := os.Remove(dst); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err // a replaced document's
	}
	if from == "" {
		s.mu.Lock()
		set := s.untitled
		s.mu.Unlock()
		return writeSettings(dst, set)
	}
	b, err := os.ReadFile(documentSettingsPath(from))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	return atomicfile.Write(dst, b, 0o644)
}

// readSettings reads a settings file; one that isn't there sets nothing.
func readSettings(p string) (Settings, error) {
	var set Settings
	b, err := os.ReadFile(p)
	if errors.Is(err, fs.ErrNotExist) {
		return set, nil
	}
	if err == nil && len(bytes.TrimSpace(b)) > 0 { // an empty file sets nothing too
		err = json.Unmarshal(b, &set)
	}
	if err != nil {
		return set, fmt.Errorf("%s: %w", p, err)
	}
	return set, nil
}

// writeSettings writes set to a settings file, keeping any other keys it
// has. A file left empty is removed.
func writeSettings(p string, set Settings) error {
	m := map[string]json.RawMessage{}
	b, err := os.ReadFile(p)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if len(bytes.TrimSpace(b)) > 0 { // an empty file has nothing to keep
		if err := json.Unmarshal(b, &m); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
	}
	on, none := true, ""
	all, _ := json.Marshal(Settings{AutoFormat: &on, HeadingCase: &none, Author: &none, Peanut: &on, SyncOnSave: &on, SyncOnQuit: &on})
	var keys map[string]json.RawMessage
	json.Unmarshal(all, &keys)
	for k := range keys {
		delete(m, k)
	}
	b, _ = json.Marshal(set)
	json.Unmarshal(b, &m) // adds set's keys to m
	if len(m) == 0 {
		if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
		return nil
	}
	b, _ = json.MarshalIndent(m, "", "  ")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	return atomicfile.Write(p, append(b, '\n'), 0o644)
}

// defaultAuthor is the author a new document gets: the user's setting, or
// until there is one, the computer user's full name. "" means none.
func defaultAuthor() string {
	if p, err := configPath("settings.json"); err == nil {
		if set, err := readSettings(p); err == nil && set.Author != nil {
			return strings.TrimSpace(*set.Author)
		}
	}
	return computerUserName()
}

// computerUserName is the computer user's full name, or "" if the system has
// none (common on Windows and Linux; never a login name, which isn't one).
func computerUserName() string {
	u, err := user.Current()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(u.Name)
}

// loadState reads what the app remembers. Before state.json it was kept in
// settings.json; that's moved over, leaving settings.json to the user's
// settings.
func (s *DocService) loadState() {
	p, err := configPath("state.json")
	if err != nil {
		return
	}
	if b, err := os.ReadFile(p); err == nil {
		json.Unmarshal(b, &s.state)
		return
	}
	old, err := configPath("settings.json")
	if err != nil {
		return
	}
	b, err := os.ReadFile(old)
	if err != nil || json.Unmarshal(b, &s.state) != nil {
		return
	}
	s.saveState()
	m := map[string]json.RawMessage{}
	json.Unmarshal(b, &m)
	delete(m, "welcomed")
	delete(m, "recent")
	if len(m) == 0 {
		os.Remove(old)
	} else if b, err := json.MarshalIndent(m, "", "  "); err == nil {
		os.WriteFile(old, append(b, '\n'), 0o644)
	}
}

// saveState writes what the app remembers. Writes are one at a time, each of
// the state as it is then, so a slower, older one can't land last.
func (s *DocService) saveState() {
	p, err := configPath("state.json")
	if err != nil {
		return
	}
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.mu.Lock()
	b, _ := json.MarshalIndent(s.state, "", "  ")
	s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err == nil {
		atomicfile.Write(p, b, 0o644)
	}
}
