// Package citations is the citation manager, bound to the editor as its own
// service: the open document's references (its BibLaTeX file, Name.bib)
// listed, edited, imported and looked up (see internal/refs), and sources
// cited from Zotero (see internal/zotero). Rendering citations is the
// document's own (internal/doc, internal/render) and works without it.
package citations

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"slices"

	"peanut-writer/internal/atomicfile"
	"peanut-writer/internal/bib"
	"peanut-writer/internal/doc"
	"peanut-writer/internal/refs"
	"peanut-writer/internal/zotero"
)

// Service is the citation manager of the open document, whose BibLaTeX file
// bibFile names.
type Service struct {
	bibFile func() string
}

// New is the citation manager of the document whose BibLaTeX file bibFile
// names, asked each call (the open document changes).
func New(bibFile func() string) *Service { return &Service{bibFile: bibFile} }

// read is the open document's BibLaTeX file and its path; empty when it has
// none yet.
func (s *Service) read() ([]byte, string, error) {
	p := s.bibFile()
	b, err := os.ReadFile(p)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, p, err
	}
	return b, p, nil
}

// write writes b to the BibLaTeX file at p, or removes it when b holds no
// reference.
func write(p string, b []byte) error {
	if len(bib.Entries(b)) == 0 {
		if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
		return nil
	}
	return atomicfile.Write(p, b, 0o644)
}

// CitationStyles are the styles front matter can name (`citation-style`),
// the default first.
func (s *Service) CitationStyles() []string { return doc.Styles }

// References are the open document's references, in order.
func (s *Service) References() ([]refs.Reference, error) {
	b, _, err := s.read()
	if err != nil {
		return nil, err
	}
	return refs.List(b), nil
}

// SaveReference writes r into the open document's references and returns it
// as saved. With old "", r is new: its key is made up if it has none. A
// saved reference keeps its key (citations use it), and the fields the
// dialog doesn't show.
func (s *Service) SaveReference(old string, r refs.Reference) (refs.Reference, error) {
	b, p, err := s.read()
	if err != nil {
		return refs.Reference{}, err
	}
	b, saved, err := refs.Save(b, old, r)
	if err != nil {
		return refs.Reference{}, err
	}
	return saved, write(p, b)
}

// DeleteReference takes the reference of key out of the open document's
// references. Citations of it then show as missing.
func (s *Service) DeleteReference(key string) error {
	b, p, err := s.read()
	if err != nil {
		return err
	}
	return write(p, refs.Delete(b, key))
}

// Lookup fetches the details of the source a DOI or ISBN names, as a new
// reference to review before saving. It needs the internet.
func (s *Service) Lookup(id string) (refs.Reference, error) {
	return refs.Lookup(context.Background(), id)
}

// PreviewImport lists the references in text (BibTeX or RIS) as Import
// would add them, saying which the document has already.
func (s *Service) PreviewImport(text string) ([]refs.Candidate, error) {
	b, _, err := s.read()
	if err != nil {
		return nil, err
	}
	return refs.Preview(b, text)
}

// Import adds the references of text at the indexes pick (as PreviewImport
// lists them) to the open document's references.
func (s *Service) Import(text string, pick []int) error {
	b, p, err := s.read()
	if err != nil {
		return err
	}
	b, err = refs.Import(b, text, pick)
	if err != nil {
		return err
	}
	return write(p, b)
}

// ZoteroStatus says whether Zotero is open with Better BibTeX, which citing
// from it needs.
func (s *Service) ZoteroStatus() zotero.Status {
	return zotero.New().Status(context.Background())
}

// SearchSources searches the Zotero library for sources whose title, authors
// or year contain query.
func (s *Service) SearchSources(query string) ([]zotero.Source, error) {
	return zotero.New().Search(context.Background(), query)
}

// AddSources fetches sources from Zotero into the open document's
// references, replacing older copies of them.
func (s *Service) AddSources(sources []zotero.Source) error {
	byLibrary := map[string][]string{}
	for _, src := range sources {
		byLibrary[src.Library] = append(byLibrary[src.Library], src.Key)
	}
	b, p, err := s.read()
	if err != nil {
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
	return write(p, b)
}

// SourcesUpdate is what UpdateSources did.
type SourcesUpdate struct {
	Sources  int      `json:"sources"`  // how many the document's references hold
	NotFound []string `json:"notFound"` // cited keys Zotero's library (My Library) has no source for
}

// UpdateSources fetches every source content cites from Zotero afresh into
// the open document's references, so changes made in Zotero show. Other
// references keep the copy they have: those not cited (entered to cite
// later), and those Zotero's library lacks (entered in the dialog, deleted,
// or in a group library).
func (s *Service) UpdateSources(content string) (SourcesUpdate, error) {
	keys := map[string]bool{}
	doc.Walk(doc.Parse(content, "").Blocks, func(*doc.Block) {}, func(x *doc.Inline) {
		for _, c := range x.Cites {
			keys[c.Key] = true
		}
	})
	old, p, err := s.read()
	if err != nil {
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
	merged := bib.Merge(old, fresh, nil)
	res.Sources = len(bib.Entries(merged))
	return res, write(p, merged)
}
