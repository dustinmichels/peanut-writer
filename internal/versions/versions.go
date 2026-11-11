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
// at all. Documents in one folder share its versions folder: another's
// version of the same name gets this one's copies beside its own.
func Save(docPath, name string, sidecars []string, word, pdf []byte) (Version, error) {
	if err := checkName(name); err != nil {
		return Version{}, err
	}
	root := filepath.Join(filepath.Dir(docPath), Folder)
	dest := filepath.Join(root, name)
	shared := false
	if _, err := os.Stat(dest); err == nil {
		if _, err := os.Lstat(filepath.Join(dest, filepath.Base(docPath))); err == nil {
			return Version{}, fmt.Errorf("%w: “%s”", ErrExists, name)
		}
		shared = true
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
	var names []string      // the files written, the document's copy last
	write := func(name string, b []byte) error {
		names = append(names, name)
		return os.WriteFile(filepath.Join(tmp, name), b, 0o644)
	}
	for _, p := range sidecars {
		b, err := os.ReadFile(p)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err == nil {
			err = write(filepath.Base(p), b)
		}
		if err != nil {
			return Version{}, err
		}
	}
	b, err := os.ReadFile(docPath)
	if err == nil {
		err = errors.Join(write(stem(docPath)+".docx", word), write(stem(docPath)+".pdf", pdf), write(filepath.Base(docPath), b))
	}
	if err != nil {
		return Version{}, err
	}
	if !shared {
		if err := os.Chmod(tmp, 0o755); err != nil {
			return Version{}, err
		}
		if err := os.Rename(tmp, dest); err != nil {
			return Version{}, err
		}
		return read(docPath, name)
	}
	// Moved in one at a time, the document's copy last, as List finds the
	// version by it; nothing of the other document's is replaced.
	for _, n := range names {
		if _, err := os.Lstat(filepath.Join(dest, n)); err == nil {
			return Version{}, fmt.Errorf("%w: “%s”", ErrExists, name)
		}
	}
	for i, n := range names {
		if err := os.Rename(filepath.Join(tmp, n), filepath.Join(dest, n)); err != nil {
			for _, m := range names[:i] {
				os.Remove(filepath.Join(dest, m))
			}
			return Version{}, err
		}
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
// document's restored content. All of it is read before anything is replaced,
// and what was replaced is put back if a later file fails, so a failure leaves
// the document, its template and settings as they were.
func Restore(docPath, name string, sidecars []string) (string, error) {
	if err := checkName(name); err != nil {
		return "", err
	}
	v, err := read(docPath, name)
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(v.Path)
	paths := append(slices.Clone(sidecars), docPath)
	restored := make([]file, len(paths))
	was := make([]file, len(paths))
	for i, p := range paths {
		if restored[i], err = readFile(filepath.Join(dir, filepath.Base(p))); err != nil {
			return "", err
		}
		if was[i], err = readFile(p); err != nil {
			return "", err
		}
	}
	doc := restored[len(paths)-1]
	if !doc.exists {
		return "", fmt.Errorf("there's no version “%s”", name)
	}
	for i, p := range paths {
		if err := restored[i].put(p); err != nil {
			for j := i - 1; j >= 0; j-- {
				err = errors.Join(err, was[j].put(paths[j]))
			}
			return "", err
		}
	}
	return string(doc.data), nil
}

// file is a file's content, or its absence.
type file struct {
	data   []byte
	exists bool
}

func readFile(p string) (file, error) {
	b, err := os.ReadFile(p)
	if errors.Is(err, fs.ErrNotExist) {
		return file{}, nil
	}
	return file{b, err == nil}, err
}

// put makes the file at p hold f: f's content, or no file.
func (f file) put(p string) error {
	if f.exists {
		return atomicfile.Write(p, f.data, 0o644)
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
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
