package refs

import (
	"bufio"
	"errors"
	"regexp"
	"strings"
	"unicode"

	"peanut-writer/internal/bib"
	"peanut-writer/internal/doc"
)

// Candidate is a reference found in text to import, as Preview shows it:
// with the key it would get, and the reference already in the document it
// is the same source as, if any.
type Candidate struct {
	Reference
	Duplicate string `json:"duplicate"` // the key of the document's reference it is the same source as; "" if none
}

// incoming is a reference parsed from text to import: as BibTeX, an entry
// whose fields are all kept; from RIS, only those Reference has.
type incoming struct {
	ref   Reference
	typ   string
	entry *bib.Entry // nil from RIS
}

var risTag = regexp.MustCompile(`(?m)^[A-Z][A-Z0-9]  -`)

// parse finds the references in text: RIS when it has RIS tags
// (`TY  - JOUR`), else BibTeX.
func parse(text string) ([]incoming, error) {
	var out []incoming
	if risTag.MatchString(text) {
		out = parseRIS(text)
	} else {
		for _, e := range bib.Entries([]byte(text)) {
			typ, _ := bib.Fields(e)
			out = append(out, incoming{ref: reference(e), typ: typ, entry: &e})
		}
	}
	if len(out) == 0 {
		return nil, errors.New("No references found: paste BibTeX (@article{…}) or RIS (TY  - JOUR …)")
	}
	return out, nil
}

// sameAs are normalized forms of r for spotting the same source twice: its
// DOI, and its title's letters with its year.
func sameAs(r Reference) []string {
	var out []string
	if d := normDOI(r.DOI); d != "" {
		out = append(out, "doi:"+d)
	}
	if t := keyWord(r.Title); t != "" {
		out = append(out, "title:"+t+"/"+r.Year)
	}
	return out
}

// keyed gives each of in a key not taken (its own when it has a free valid
// one) and says which reference of have, or earlier of in, it duplicates.
func keyed(have []Reference, in []incoming) []Candidate {
	taken := map[string]bool{}
	seen := map[string]string{}
	note := func(r Reference) {
		for _, s := range sameAs(r) {
			if _, ok := seen[s]; !ok {
				seen[s] = r.Key
			}
		}
	}
	for _, r := range have {
		taken[r.Key] = true
		note(r)
	}
	out := make([]Candidate, len(in))
	for i, x := range in {
		r := x.ref
		if r.Key == "" || !doc.IsCiteKey(r.Key) || taken[r.Key] {
			r.Key = newKey(r, taken)
		}
		taken[r.Key] = true
		c := Candidate{Reference: r}
		for _, s := range sameAs(r) {
			if k, ok := seen[s]; ok {
				c.Duplicate = k
				break
			}
		}
		note(r)
		out[i] = c
	}
	return out
}

// Preview is the references text holds, to import into b, a BibLaTeX file.
func Preview(b []byte, text string) ([]Candidate, error) {
	in, err := parse(text)
	if err != nil {
		return nil, err
	}
	return keyed(List(b), in), nil
}

// Import is b with the references of text at the indexes pick (as Preview
// lists them) added, under the keys Preview gave them.
func Import(b []byte, text string, pick []int) ([]byte, error) {
	in, err := parse(text)
	if err != nil {
		return nil, err
	}
	cs := keyed(List(b), in)
	var add []byte
	for _, i := range pick {
		if i < 0 || i >= len(in) {
			continue
		}
		x, key := in[i], cs[i].Key
		var e []byte
		switch {
		case x.entry != nil && x.entry.Key == key:
			e = x.entry.Text
		case x.entry != nil:
			_, fields := bib.Fields(*x.entry)
			e = bib.Format(x.typ, key, fields)
		default:
			r := x.ref
			r.Key = key
			if err := clean(&r); err != nil {
				return nil, err
			}
			e = bib.Format(r.Type, key, apply(nil, Reference{}, r))
		}
		add = append(append(add, e...), "\n\n"...)
	}
	return bib.Merge(b, add, nil), nil
}

// risTypes are RIS reference types as BibLaTeX's.
var risTypes = map[string]string{
	"JOUR": "article", "JFULL": "article", "MGZN": "article", "NEWS": "article", "EJOUR": "article",
	"BOOK": "book", "EBOOK": "book", "EDBOOK": "book",
	"CHAP": "incollection", "ECHAP": "incollection",
	"CONF": "inproceedings", "CPAPER": "inproceedings",
	"RPRT": "report", "GOVDOC": "report",
	"THES": "thesis",
	"ELEC": "online", "WEB": "online", "BLOG": "online",
}

var yearRe = regexp.MustCompile(`\d{4}`)

// parseRIS reads RIS records (`TY  - JOUR` … `ER  -`).
func parseRIS(text string) []incoming {
	var out []incoming
	var r *Reference
	var start, end string
	finish := func() {
		if r == nil {
			return
		}
		switch {
		case start != "" && end != "":
			r.Pages = start + "--" + end
		case start != "":
			r.Pages = start
		}
		if r.Title != "" || len(r.Authors) > 0 {
			out = append(out, incoming{ref: *r, typ: r.Type})
		}
		r, start, end = nil, "", ""
	}
	sc := bufio.NewScanner(strings.NewReader(text))
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for sc.Scan() {
		line := strings.TrimRightFunc(sc.Text(), unicode.IsSpace)
		if len(line) < 5 || !risTag.MatchString(line) {
			continue
		}
		tag, v := line[:2], strings.TrimSpace(strings.TrimPrefix(line[5:], " "))
		if tag == "TY" {
			finish()
			typ := risTypes[v]
			if typ == "" {
				typ = "misc"
			}
			r = &Reference{Type: typ, Authors: []string{}}
			continue
		}
		if r == nil {
			continue
		}
		set := func(p *string) {
			if *p == "" {
				*p = v
			}
		}
		switch tag {
		case "ER":
			finish()
		case "AU", "A1":
			r.Authors = append(r.Authors, v)
		case "TI", "T1":
			set(&r.Title)
		case "PY", "Y1", "DA":
			if y := yearRe.FindString(v); y != "" && r.Year == "" {
				r.Year = y
			}
		case "JO", "JF", "T2", "BT", "JA":
			set(&r.Container)
		case "PB":
			set(&r.Publisher)
		case "VL":
			set(&r.Volume)
		case "IS":
			set(&r.Issue)
		case "SP":
			start = v
		case "EP":
			end = v
		case "DO":
			set(&r.DOI)
		case "UR":
			set(&r.URL)
		}
	}
	finish()
	return out
}
