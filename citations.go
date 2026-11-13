package main

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"peanut-writer/internal/atomicfile"
	"peanut-writer/internal/bib"
	"peanut-writer/internal/doc"
	"peanut-writer/internal/zotero"
)

// bibPath is the BibLaTeX file of the document at p, its cited sources
// (Name.bib beside Name.md); an untitled one's is in its scratch folder dir.
func bibPath(p, dir string) string {
	if p == "" {
		return filepath.Join(dir, "Untitled.bib")
	}
	return strings.TrimSuffix(p, filepath.Ext(p)) + ".bib"
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

// CitationStyles are the styles front matter can name (`citation-style`),
// the default first.
func (s *DocService) CitationStyles() []string { return doc.Styles }

// ZoteroStatus says whether Zotero is open with Better BibTeX, which citing
// needs.
func (s *DocService) ZoteroStatus() zotero.Status {
	return zotero.New().Status(context.Background())
}

// SearchSources searches the Zotero library for sources whose title, authors
// or year contain query.
func (s *DocService) SearchSources(query string) ([]zotero.Source, error) {
	return zotero.New().Search(context.Background(), query)
}

// AddSources fetches sources from Zotero into the open document's BibLaTeX
// file, replacing older copies of them.
func (s *DocService) AddSources(sources []zotero.Source) error {
	byLibrary := map[string][]string{}
	for _, src := range sources {
		byLibrary[src.Library] = append(byLibrary[src.Library], src.Key)
	}
	s.mu.Lock()
	p := bibPath(s.path, s.dir)
	s.mu.Unlock()
	b, err := os.ReadFile(p)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	z := zotero.New()
	for library, keys := range byLibrary {
		add, err := z.Export(context.Background(), keys, library)
		if err != nil {
			return err
		}
		b = bib.Merge(b, add, nil)
	}
	return atomicfile.Write(p, b, 0o644)
}

// SourcesUpdate is what UpdateSources did.
type SourcesUpdate struct {
	Sources  int      `json:"sources"`  // how many the document's references hold
	NotFound []string `json:"notFound"` // cited keys Zotero's library (My Library) has no source for
}

// UpdateSources fetches every source content cites from Zotero afresh into
// the open document's BibLaTeX file, which then holds only those: changes
// made in Zotero show, and sources no longer cited go. A source Zotero's
// library lacks (deleted, or in a group library) keeps the copy it has.
func (s *DocService) UpdateSources(content string) (SourcesUpdate, error) {
	keys := map[string]bool{}
	doc.Walk(doc.Parse(content, "").Blocks, func(*doc.Block) {}, func(x *doc.Inline) {
		for _, c := range x.Cites {
			keys[c.Key] = true
		}
	})
	s.mu.Lock()
	p := bibPath(s.path, s.dir)
	s.mu.Unlock()
	old, err := os.ReadFile(p)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return SourcesUpdate{}, err
	}
	var res SourcesUpdate
	var fresh []byte
	if want := bib.Sorted(keys); len(want) > 0 {
		z := zotero.New()
		fresh, err = z.Export(context.Background(), want, "")
		var nf *zotero.NotFoundError
		if errors.As(err, &nf) {
			res.NotFound = nf.Keys
			want = slices.DeleteFunc(want, func(k string) bool { return slices.Contains(nf.Keys, k) })
			fresh, err = nil, nil
			if len(want) > 0 {
				fresh, err = z.Export(context.Background(), want, "")
			}
		}
		if err != nil {
			return SourcesUpdate{}, err
		}
	}
	merged := bib.Merge(old, fresh, keys)
	res.Sources = len(bib.Entries(merged))
	if res.Sources == 0 {
		if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return SourcesUpdate{}, err
		}
		return res, nil
	}
	return res, atomicfile.Write(p, merged, 0o644)
}
