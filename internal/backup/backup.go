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
		bs = append(bs, Backup{Saved: s.saved.UnixMilli(), Path: s.path})
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
	b, err := os.ReadFile(stamps[len(stamps)-1].path)
	return err != nil || !bytes.Equal(b, []byte(content))
}

// Write saves content as a backup of the document at docPath in a folder
// stamped with at, or just after its newest backup if that's later, then
// removes all but its newest Keep backups. Once the backup is written, a
// backup that can't be removed (locked in Finder, say) is left: the new one
// is still made.
func Write(docPath, content string, at time.Time) error {
	// Always the newest: one listed before others would be pruned as soon as
	// it's made, once the clock has gone back past them (or they were made
	// on a computer whose clock was ahead). A backup in the same second as
	// the last takes the next rather than replace it.
	if stamps := list(docPath); len(stamps) > 0 {
		if next := stamps[len(stamps)-1].at.Add(time.Second); at.Before(next) {
			at = next.In(at.Location())
		}
	}
	name := at.Format(stampLayout)
	if err := os.MkdirAll(stampDir(docPath, name), 0o755); err != nil {
		return err
	}
	// Whole or not at all: a part copy (on a full disk, say) would be listed
	// as the newest backup.
	if err := atomicfile.Write(filepath.Join(stampDir(docPath, name), filepath.Base(docPath)), []byte(content), 0o644); err != nil {
		_ = os.Remove(stampDir(docPath, name)) // if it's left empty
		return err
	}
	stamps := list(docPath)
	for _, old := range stamps[:max(0, len(stamps)-Keep)] {
		_ = os.Remove(old.path)
		if filepath.Base(old.path) == stem(docPath)+".md" {
			// Older backups also hold a Word copy.
			_ = os.Remove(filepath.Join(stampDir(docPath, old.name), stem(docPath)+".docx"))
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

var stampRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}([+-]\d{4})?$`)

// stamp is a backup: its folder's name, the time that stands for, its copy
// of the document and when the copy was made.
type stamp struct {
	name  string
	at    time.Time
	path  string
	saved time.Time
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
//
// A copy is named after the document ("notes.txt"). Before, every copy was
// named Name.md, so "notes.md" and "notes.txt" shared them: such a copy
// counts as a "notes.txt" backup only while there's no "notes.md" beside it.
func list(docPath string) []stamp {
	entries, err := os.ReadDir(filepath.Join(filepath.Dir(docPath), Folder))
	if err != nil {
		return nil
	}
	names := []string{filepath.Base(docPath)}
	if legacy := stem(docPath) + ".md"; legacy != names[0] && !ownsLegacy(docPath, filepath.Join(filepath.Dir(docPath), legacy)) {
		names = append(names, legacy)
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
		for _, n := range names {
			p := filepath.Join(stampDir(docPath, e.Name()), n)
			if info, err := os.Stat(p); err == nil {
				// The folder's time, unless the copy was made before it: a
				// backup stamped after future-dated ones (see Write) shows
				// when it was made.
				saved := at
				if info.ModTime().Before(at) {
					saved = info.ModTime()
				}
				stamps = append(stamps, stamp{e.Name(), at, p, saved})
				break
			}
		}
	}
	slices.SortFunc(stamps, func(a, b stamp) int {
		return cmp.Or(a.at.Compare(b.at), strings.Compare(a.name, b.name))
	})
	return stamps
}

// ownsLegacy reports whether md, the Name.md beside the document at docPath,
// is another document, which Name.md backup copies belong to.
func ownsLegacy(docPath, md string) bool {
	a, err := os.Stat(md)
	if err != nil {
		return false
	}
	b, err := os.Stat(docPath)
	return err != nil || !os.SameFile(a, b)
}
