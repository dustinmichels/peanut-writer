// Package backup keeps timestamped Markdown copies of a document in
// "backups/<datetime>/" folders beside it.
package backup

import (
	"bytes"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
)

// Keep is how many backups of each document are kept.
const Keep = 10

// Folder is the backups folder's name, inside the document's folder.
const Folder = "backups"

const stampLayout = "2006-01-02T15-04-05"

// Backup is one backup of a document.
type Backup struct {
	Saved int64  `json:"saved"` // when it was made, in Unix milliseconds
	Path  string `json:"path"`  // its Markdown copy
}

// List returns the document's backups, newest first.
func List(docPath string) []Backup {
	stamps := list(docPath)
	bs := make([]Backup, 0, len(stamps))
	for _, stamp := range slices.Backward(stamps) {
		at, err := time.ParseInLocation(stampLayout, stamp, time.Local)
		if err != nil {
			continue
		}
		p := file(docPath, stamp, ".md")
		bs = append(bs, Backup{Saved: at.UnixMilli(), Path: p})
	}
	return bs
}

// Changed reports whether content differs from the newest backup of the
// document at docPath (true if it has none).
func Changed(docPath, content string) bool {
	stamps := list(docPath)
	if len(stamps) == 0 {
		return true
	}
	b, err := os.ReadFile(file(docPath, stamps[len(stamps)-1], ".md"))
	return err != nil || !bytes.Equal(b, []byte(content))
}

// Write saves content as a backup of the document at docPath in a folder
// stamped with at, then removes all but its newest Keep backups.
func Write(docPath, content string, at time.Time) error {
	stamp := at.Format(stampLayout)
	if err := os.MkdirAll(stampDir(docPath, stamp), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(file(docPath, stamp, ".md"), []byte(content), 0o644); err != nil {
		return err
	}
	stamps := list(docPath)
	for _, old := range stamps[:max(0, len(stamps)-Keep)] {
		// Older backups also hold a Word copy.
		for _, ext := range []string{".md", ".docx"} {
			if err := os.Remove(file(docPath, old, ext)); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
		// Another document's backups may share the folder; it's removed
		// only once empty.
		_ = os.Remove(stampDir(docPath, old))
	}
	return nil
}

func stem(docPath string) string {
	base := filepath.Base(docPath)
	return strings.TrimSuffix(base, filepath.Ext(base))
}

func stampDir(docPath, stamp string) string {
	return filepath.Join(filepath.Dir(docPath), Folder, stamp)
}

func file(docPath, stamp, ext string) string {
	return filepath.Join(stampDir(docPath, stamp), stem(docPath)+ext)
}

var stampRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$`)

// list returns the stamps of the document's backups, oldest first: the
// stamped folders holding a copy of it, so "notes.md" doesn't claim
// "notes-draft.md"'s backups.
func list(docPath string) []string {
	entries, err := os.ReadDir(filepath.Join(filepath.Dir(docPath), Folder))
	if err != nil {
		return nil
	}
	var stamps []string
	for _, e := range entries {
		if !e.IsDir() || !stampRe.MatchString(e.Name()) {
			continue
		}
		if _, err := os.Stat(file(docPath, e.Name(), ".md")); err == nil {
			stamps = append(stamps, e.Name())
		}
	}
	slices.Sort(stamps)
	return stamps
}
