// Package backup keeps timestamped copies of a document, as Markdown and as
// a Word file, in a "backups" folder beside it.
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

// Write saves content, and word unless it's nil, as backups of the document
// at docPath stamped with at, then removes all but its newest Keep backups.
func Write(docPath, content string, word []byte, at time.Time) error {
	if err := os.MkdirAll(filepath.Join(filepath.Dir(docPath), Folder), 0o755); err != nil {
		return err
	}
	stamp := at.Format(stampLayout)
	if err := os.WriteFile(file(docPath, stamp, ".md"), []byte(content), 0o644); err != nil {
		return err
	}
	if word != nil {
		if err := os.WriteFile(file(docPath, stamp, ".docx"), word, 0o644); err != nil {
			return err
		}
	}
	stamps := list(docPath)
	for _, old := range stamps[:max(0, len(stamps)-Keep)] {
		for _, ext := range []string{".md", ".docx"} {
			if err := os.Remove(file(docPath, old, ext)); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}
	return nil
}

func stem(docPath string) string {
	base := filepath.Base(docPath)
	return strings.TrimSuffix(base, filepath.Ext(base))
}

func file(docPath, stamp, ext string) string {
	return filepath.Join(filepath.Dir(docPath), Folder, stem(docPath)+"-"+stamp+ext)
}

// list returns the stamps of the document's backups, oldest first. Only
// names that are exactly the document's name and a stamp count, so
// "notes.md" doesn't claim "notes-draft.md"'s backups.
func list(docPath string) []string {
	entries, err := os.ReadDir(filepath.Join(filepath.Dir(docPath), Folder))
	if err != nil {
		return nil
	}
	re := regexp.MustCompile(`^` + regexp.QuoteMeta(stem(docPath)) +
		`-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.(?:md|docx)$`)
	var stamps []string
	for _, e := range entries {
		if m := re.FindStringSubmatch(e.Name()); m != nil {
			stamps = append(stamps, m[1])
		}
	}
	slices.Sort(stamps)
	return slices.Compact(stamps)
}
