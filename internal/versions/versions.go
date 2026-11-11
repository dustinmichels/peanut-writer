// Package versions keeps named versions of a document in "versions/<name>/"
// folders beside it: a copy of its Markdown and of its JSON sidecar files (its
// own template and settings), with Word and PDF copies made from it.
package versions

import (
	"cmp"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"peanut-writer/internal/atomicfile"
)

// Folder is the versions folder's name, inside the document's folder.
const Folder = "versions"

// ErrExists is returned for a name the document already has a version of.
var ErrExists = errors.New("there's already a version of that name")

// Version is one named version of a document.
type Version struct {
	Name  string `json:"name"`
	Saved int64  `json:"saved"` // when it was made, in Unix milliseconds
	Path  string `json:"path"`  // its copy of the document's Markdown
}

// Save makes the version name of the document at docPath: copies of the
// document and of those of its sidecars (files beside it) that exist, and
// word and pdf as its Word and PDF copies. The version appears whole or not
// at all.
func Save(docPath, name string, sidecars []string, word, pdf []byte) (Version, error) {
	if err := checkName(name); err != nil {
		return Version{}, err
	}
	root := filepath.Join(filepath.Dir(docPath), Folder)
	dest := filepath.Join(root, name)
	if _, err := os.Stat(dest); err == nil {
		return Version{}, fmt.Errorf("%w: “%s”", ErrExists, name)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return Version{}, err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return Version{}, err
	}
	// Written to a hidden folder first, which List skips, then renamed.
	tmp, err := os.MkdirTemp(root, ".saving-*")
	if err != nil {
		return Version{}, err
	}
	defer os.RemoveAll(tmp) // left only if the rename failed
	for _, p := range append([]string{docPath}, sidecars...) {
		b, err := os.ReadFile(p)
		if errors.Is(err, fs.ErrNotExist) && p != docPath {
			continue
		}
		if err != nil {
			return Version{}, err
		}
		if err := os.WriteFile(filepath.Join(tmp, filepath.Base(p)), b, 0o644); err != nil {
			return Version{}, err
		}
	}
	base := filepath.Join(tmp, stem(docPath))
	if err := os.WriteFile(base+".docx", word, 0o644); err != nil {
		return Version{}, err
	}
	if err := os.WriteFile(base+".pdf", pdf, 0o644); err != nil {
		return Version{}, err
	}
	if err := os.Chmod(tmp, 0o755); err != nil {
		return Version{}, err
	}
	if err := os.Rename(tmp, dest); err != nil {
		return Version{}, err
	}
	return read(docPath, name)
}

// List returns the document's versions, newest first: the folders in its
// versions folder holding a copy of it, so "notes.md" doesn't claim
// "notes-draft.md"'s versions.
func List(docPath string) ([]Version, error) {
	entries, err := os.ReadDir(filepath.Join(filepath.Dir(docPath), Folder))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var vs []Version
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		if v, err := read(docPath, e.Name()); err == nil {
			vs = append(vs, v)
		}
	}
	slices.SortFunc(vs, func(a, b Version) int {
		return cmp.Or(cmp.Compare(b.Saved, a.Saved), strings.Compare(a.Name, b.Name))
	})
	return vs, nil
}

// Restore puts the version name's copies back as the document at docPath and
// its sidecars: a sidecar the version has none of is removed. It returns the
// document's restored content.
func Restore(docPath, name string, sidecars []string) (string, error) {
	if err := checkName(name); err != nil {
		return "", err
	}
	v, err := read(docPath, name)
	if err != nil {
		return "", err
	}
	content, err := os.ReadFile(v.Path)
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(v.Path)
	for _, p := range sidecars {
		b, err := os.ReadFile(filepath.Join(dir, filepath.Base(p)))
		switch {
		case errors.Is(err, fs.ErrNotExist):
			if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return "", err
			}
		case err != nil:
			return "", err
		default:
			if err := atomicfile.Write(p, b, 0o644); err != nil {
				return "", err
			}
		}
	}
	return string(content), atomicfile.Write(docPath, content, 0o644)
}

// read describes the version name of the document at docPath, which must
// hold a copy of it.
func read(docPath, name string) (Version, error) {
	p := filepath.Join(filepath.Dir(docPath), Folder, name, filepath.Base(docPath))
	info, err := os.Stat(p)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Version{}, fmt.Errorf("there's no version “%s”", name)
		}
		return Version{}, err
	}
	return Version{Name: name, Saved: info.ModTime().UnixMilli(), Path: p}, nil
}

// checkName rejects names that aren't one visible folder.
func checkName(name string) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("a version needs a name")
	}
	if strings.HasPrefix(name, ".") || strings.ContainsAny(name, `/\`) {
		return fmt.Errorf("“%s” can't be a version's name", name)
	}
	return nil
}

func stem(docPath string) string {
	base := filepath.Base(docPath)
	return strings.TrimSuffix(base, filepath.Ext(base))
}
