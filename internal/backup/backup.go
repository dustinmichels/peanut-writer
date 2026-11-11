// Package backup keeps timestamped Markdown copies of a document in
// "backups/<datetime>/" folders beside it.
package backup

import (
	"bytes"
	"cmp"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"peanut-writer/internal/atomicfile"
)

// Keep is how many backups of each document are kept.
const Keep = 10

// Folder is the backups folder's name, inside the document's folder.
const Folder = "backups"

// stampLayout names backup folders in local time with its UTC offset, so
// the repeated hour when clocks go back still sorts in order. Folders named
// before the offset was added (oldStampLayout) are read in local time.
const (
	stampLayout    = "2006-01-02T15-04-05-0700"
	oldStampLayout = "2006-01-02T15-04-05"
)

// Backup is one backup of a document.
type Backup struct {
	Saved int64  `json:"saved"` // when it was made, in Unix milliseconds
	Path  string `json:"path"`  // its Markdown copy
}

// List returns the document's backups, newest first.
func List(docPath string) []Backup {
	stamps := list(docPath)
	bs := make([]Backup, 0, len(stamps))
	for _, s := range slices.Backward(stamps) {
		bs = append(bs, Backup{Saved: s.at.UnixMilli(), Path: file(docPath, s.name, ".md")})
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
	b, err := os.ReadFile(file(docPath, stamps[len(stamps)-1].name, ".md"))
	return err != nil || !bytes.Equal(b, []byte(content))
}

// Write saves content as a backup of the document at docPath in a folder
// stamped with at (or the next free second, so a backup made in the same
// second as the last doesn't replace it), then removes all but its newest
// Keep backups. Once the backup is written, a backup that can't be removed
// (locked in Finder, say) is left: the new one is still made.
func Write(docPath, content string, at time.Time) error {
	name := at.Format(stampLayout)
	for {
		if _, err := os.Lstat(file(docPath, name, ".md")); err != nil {
			break
		}
		at = at.Add(time.Second)
		name = at.Format(stampLayout)
	}
	if err := os.MkdirAll(stampDir(docPath, name), 0o755); err != nil {
		return err
	}
	// Whole or not at all: a part copy (on a full disk, say) would be listed
	// as the newest backup.
	if err := atomicfile.Write(file(docPath, name, ".md"), []byte(content), 0o644); err != nil {
		_ = os.Remove(stampDir(docPath, name)) // if it's left empty
		return err
	}
	stamps := list(docPath)
	for _, old := range stamps[:max(0, len(stamps)-Keep)] {
		// Older backups also hold a Word copy.
		for _, ext := range []string{".md", ".docx"} {
			_ = os.Remove(file(docPath, old.name, ext))
		}
		// Another document's backups may share the folder; it's removed
		// only once empty.
		_ = os.Remove(stampDir(docPath, old.name))
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

var stampRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}([+-]\d{4})?$`)

// stamp is a backup folder's name and the time it stands for.
type stamp struct {
	name string
	at   time.Time
}

// parseStamp reads a backup folder's name.
func parseStamp(name string) (time.Time, error) {
	if len(name) == len(oldStampLayout) {
		return time.ParseInLocation(oldStampLayout, name, time.Local)
	}
	return time.Parse(stampLayout, name)
}

// list returns the stamps of the document's backups, oldest first: the
// stamped folders holding a copy of it, so "notes.md" doesn't claim
// "notes-draft.md"'s backups.
func list(docPath string) []stamp {
	entries, err := os.ReadDir(filepath.Join(filepath.Dir(docPath), Folder))
	if err != nil {
		return nil
	}
	var stamps []stamp
	for _, e := range entries {
		if !e.IsDir() || !stampRe.MatchString(e.Name()) {
			continue
		}
		at, err := parseStamp(e.Name())
		if err != nil {
			continue
		}
		if _, err := os.Stat(file(docPath, e.Name(), ".md")); err == nil {
			stamps = append(stamps, stamp{e.Name(), at})
		}
	}
	slices.SortFunc(stamps, func(a, b stamp) int {
		return cmp.Or(a.at.Compare(b.at), strings.Compare(a.name, b.name))
	})
	return stamps
}
