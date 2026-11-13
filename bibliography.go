package main

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"peanut-writer/internal/atomicfile"
	"peanut-writer/internal/doc"
)

// A document's references are in its BibLaTeX file, Name.bib beside Name.md.
// Rendering citations needs only that file; adding and editing references is
// the citation manager's (internal/citations).

// bibPath is the BibLaTeX file of the document at p, its references
// (Name.bib beside Name.md); an untitled one's is in its scratch folder dir.
func bibPath(p, dir string) string {
	if p == "" {
		return filepath.Join(dir, "Untitled.bib")
	}
	return strings.TrimSuffix(p, filepath.Ext(p)) + ".bib"
}

// bibFile is the open document's BibLaTeX file.
func (s *DocService) bibFile() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return bibPath(s.path, s.dir)
}

// parseDoc reads content, the document at cur (whose pictures are in dir),
// with its citations resolved against its BibLaTeX file.
func parseDoc(content, dir, cur string) *doc.Document {
	d := doc.Parse(content, dir)
	d.UseBibliography(bibPath(cur, dir))
	return d
}

// carryBib copies the BibLaTeX file of the document at from (in dir while
// untitled) to the document at to, removing a replaced document's.
func carryBib(from, dir, to string) error {
	src, dst := bibPath(from, dir), bibPath(to, "")
	if src == dst {
		return nil
	}
	if err := os.Remove(dst); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	b, err := os.ReadFile(src)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	return atomicfile.Write(dst, b, 0o644)
}
