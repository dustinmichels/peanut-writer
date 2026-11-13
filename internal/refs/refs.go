// Package refs is a document's references as the citation manager shows
// and edits them: the entries of its BibLaTeX file (see internal/bib) as
// Reference values, edited without losing the fields they don't show, new
// ones keyed as Better BibTeX would, imported from BibTeX or RIS, or looked
// up by DOI or ISBN. It works on the file's bytes; reading and writing the
// file is the caller's.
package refs

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode"

	"peanut-writer/internal/bib"
	"peanut-writer/internal/doc"
)

// Reference is a source in a document's BibLaTeX file, as the citation
// dialog lists and edits it. Fields it doesn't show are kept.
type Reference struct {
	Key       string   `json:"key"`
	Type      string   `json:"type"`    // BibLaTeX entry type: "article", "book"…
	Authors   []string `json:"authors"` // "Last, First" each
	Title     string   `json:"title"`
	Year      string   `json:"year"`
	Container string   `json:"container"` // the journal or book it's in
	Publisher string   `json:"publisher"` // or institution
	Volume    string   `json:"volume"`
	Issue     string   `json:"issue"`
	Pages     string   `json:"pages"`
	DOI       string   `json:"doi"`
	URL       string   `json:"url"`
}

// slot is one of Reference's fields: the BibLaTeX fields it's read from, the
// first present first, and the one it's written to when none is.
type slot struct {
	names []string
	write func(typ string) string
	get   func(*Reference) *string
}

func named(n string) func(string) string { return func(string) string { return n } }

var slots = []slot{
	{[]string{"title"}, named("title"), func(r *Reference) *string { return &r.Title }},
	{[]string{"date", "year"}, named("date"), func(r *Reference) *string { return &r.Year }},
	{[]string{"journaltitle", "journal", "booktitle", "maintitle"}, func(t string) string {
		if t == "article" {
			return "journaltitle"
		}
		return "booktitle"
	}, func(r *Reference) *string { return &r.Container }},
	{[]string{"publisher", "institution", "school", "organization"}, func(t string) string {
		if t == "report" || t == "thesis" {
			return "institution"
		}
		return "publisher"
	}, func(r *Reference) *string { return &r.Publisher }},
	{[]string{"volume"}, named("volume"), func(r *Reference) *string { return &r.Volume }},
	{[]string{"number", "issue"}, named("number"), func(r *Reference) *string { return &r.Issue }},
	{[]string{"pages"}, named("pages"), func(r *Reference) *string { return &r.Pages }},
	{[]string{"doi"}, named("doi"), func(r *Reference) *string { return &r.DOI }},
	{[]string{"url"}, named("url"), func(r *Reference) *string { return &r.URL }},
}

func value(f bib.Field) string {
	if f.Raw != "" {
		return f.Raw
	}
	return f.Value
}

// find is the index of the first of fields named one of names, or -1.
func find(fields []bib.Field, names []string) int {
	for _, n := range names {
		for i, f := range fields {
			if f.Name == n {
				return i
			}
		}
	}
	return -1
}

// reference is e as the dialog shows it.
func reference(e bib.Entry) Reference {
	typ, fields := bib.Fields(e)
	r := Reference{Key: e.Key, Type: typ, Authors: []string{}}
	if i := find(fields, []string{"author", "editor"}); i >= 0 {
		r.Authors = splitAuthors(value(fields[i]))
	}
	for _, s := range slots {
		if i := find(fields, s.names); i >= 0 {
			*s.get(&r) = strings.TrimSpace(value(fields[i]))
		}
	}
	if len(r.Year) > 4 && find(fields, []string{"date"}) >= 0 {
		r.Year = r.Year[:4] // 2020-05-01
	}
	return r
}

// splitAuthors splits `A and B` at the top level (`{Smith and Sons}` is one).
func splitAuthors(s string) []string {
	out := []string{}
	depth, last := 0, 0
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '{':
			depth++
		case '}':
			depth--
		case ' ', '\n', '\t':
			if depth == 0 && i+5 <= len(s) && strings.EqualFold(s[i+1:i+4], "and") && strings.ContainsRune(" \n\t", rune(s[i+4])) {
				if a := strings.TrimSpace(s[last:i]); a != "" {
					out = append(out, a)
				}
				last = i + 5
				i += 4
			}
		}
	}
	if a := strings.TrimSpace(s[last:]); a != "" {
		out = append(out, a)
	}
	return out
}

// apply is fields (those of old) with r's changes from old.
func apply(fields []bib.Field, old, r Reference) []bib.Field {
	set := func(names []string, write, v, was string) {
		if v == was {
			return
		}
		i := find(fields, names)
		switch {
		case i >= 0 && v == "":
			fields = append(fields[:i], fields[i+1:]...)
		case i >= 0:
			fields[i] = bib.Field{Name: fields[i].Name, Value: v}
		case v != "":
			fields = append(fields, bib.Field{Name: write, Value: v})
		}
	}
	set([]string{"author", "editor"}, "author", strings.Join(r.Authors, " and "), strings.Join(old.Authors, " and "))
	for _, s := range slots {
		set(s.names, s.write(r.Type), *s.get(&r), *s.get(&old))
	}
	return fields
}

// clean trims r's fields, drops empty authors and checks the values can be
// written in braces.
func clean(r *Reference) error {
	r.Key = strings.TrimSpace(r.Key)
	r.Type = strings.ToLower(strings.TrimSpace(r.Type))
	if r.Type == "" {
		r.Type = "misc"
	}
	for _, c := range r.Type {
		if !unicode.IsLetter(c) {
			return fmt.Errorf("%q isn't a reference type", r.Type)
		}
	}
	authors := []string{}
	for _, a := range r.Authors {
		if a = strings.TrimSpace(a); a != "" {
			authors = append(authors, a)
		}
	}
	r.Authors = authors
	vals := []string{strings.Join(authors, " and ")}
	for _, s := range slots {
		p := s.get(r)
		*p = strings.TrimSpace(*p)
		vals = append(vals, *p)
	}
	if r.Title == "" && len(authors) == 0 {
		return errors.New("A reference needs a title or an author")
	}
	for _, v := range vals {
		if !bib.Balanced(v) {
			return fmt.Errorf("%q has a { without its } (or the other way round)", v)
		}
	}
	return nil
}

// stopWords aren't a key's title word.
var stopWords = map[string]bool{"a": true, "an": true, "the": true, "of": true, "on": true, "in": true, "and": true, "for": true, "to": true, "at": true}

// keyWord is s's letters and digits, lower case.
func keyWord(s string) string {
	return strings.Map(func(c rune) rune {
		if unicode.IsLetter(c) || unicode.IsDigit(c) {
			return unicode.ToLower(c)
		}
		return -1
	}, s)
}

// newKey is a key for r as Better BibTeX would make one, `smith2020title`,
// not one of taken.
func newKey(r Reference, taken map[string]bool) string {
	var who, word string
	if len(r.Authors) > 0 {
		last, _, ok := strings.Cut(r.Authors[0], ",")
		if !ok {
			if f := strings.Fields(last); len(f) > 0 {
				last = f[len(f)-1]
			}
		}
		who = keyWord(last)
	}
	for _, w := range strings.Fields(r.Title) {
		if w = keyWord(w); w != "" && !stopWords[w] {
			word = w
			break
		}
	}
	base := who + keyWord(r.Year) + word
	if base == "" || !doc.IsCiteKey(base) {
		base = "ref"
	}
	if !taken[base] {
		return base
	}
	for c := 'a'; c <= 'z'; c++ {
		if k := base + string(c); !taken[k] {
			return k
		}
	}
	for n := 2; ; n++ {
		if k := base + "-" + strconv.Itoa(n); !taken[k] {
			return k
		}
	}
}

// List is the references in b, a BibLaTeX file, in order.
func List(b []byte) []Reference {
	out := []Reference{}
	for _, e := range bib.Entries(b) {
		out = append(out, reference(e))
	}
	return out
}

// Save is b with r written into it, and r as saved. With old "", r is new:
// its key is made up if it has none. A saved reference keeps its key
// (citations use it), and the fields the dialog doesn't show.
func Save(b []byte, old string, r Reference) ([]byte, Reference, error) {
	if err := clean(&r); err != nil {
		return nil, Reference{}, err
	}
	entries := bib.Entries(b)
	taken := map[string]bool{}
	var was *bib.Entry
	for i, e := range entries {
		taken[e.Key] = true
		if old != "" && e.Key == old {
			was = &entries[i]
		}
	}
	var fields []bib.Field
	before := Reference{}
	switch {
	case old != "" && was == nil:
		return nil, Reference{}, fmt.Errorf("the references have no @%s any more", old)
	case old != "":
		r.Key = old
		_, fields = bib.Fields(*was)
		before = reference(*was)
	case r.Key == "":
		r.Key = newKey(r, taken)
	case !doc.IsCiteKey(r.Key):
		return nil, Reference{}, fmt.Errorf("%q can't be a key: use letters, digits and _, with single : . - / between them", r.Key)
	case taken[r.Key]:
		return nil, Reference{}, fmt.Errorf("the references have a @%s already", r.Key)
	}
	add := bib.Format(r.Type, r.Key, apply(fields, before, r))
	return bib.Merge(b, add, nil), reference(bib.Entries(add)[0]), nil
}

// Delete is b without the reference of key; empty when none is left.
func Delete(b []byte, key string) []byte {
	keep := bib.Keys(b)
	delete(keep, key)
	if len(keep) == 0 {
		return nil
	}
	return bib.Merge(b, nil, keep)
}
