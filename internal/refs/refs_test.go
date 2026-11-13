package refs

import (
	"strings"
	"testing"

	"peanut-writer/internal/bib"
)

// Editing a reference Zotero exported changes only what was edited: the
// fields the dialog doesn't show, a full date and a bare macro stay.
func TestSaveKeepsOtherFields(t *testing.T) {
	b := []byte(`@article{smith2020,
  title = {On {DNA}, and Other Things},
  author = {Smith, Jane and {World Health Organization}},
  date = {2020-05-01},
  journaltitle = "Nature",
  month = may,
  abstract = {Long, with {braces}.},
}

@book{lee2019, title = {Other}}
`)
	refs := List(b)
	if len(refs) != 2 {
		t.Fatalf("List: %v", refs)
	}
	r := refs[0]
	if r.Title != "On {DNA}, and Other Things" || r.Year != "2020" || r.Container != "Nature" ||
		strings.Join(r.Authors, "|") != "Smith, Jane|{World Health Organization}" {
		t.Fatalf("read %+v", r)
	}
	r.Volume = "12"
	r.Container = ""
	b, _, err := Save(b, r.Key, r)
	if err != nil {
		t.Fatal(err)
	}
	e := bib.Entries(b)
	if len(e) != 2 || e[0].Key != "smith2020" || e[1].Key != "lee2019" {
		t.Fatalf("entries %s", b)
	}
	got := string(e[0].Text)
	for _, want := range []string{"date = {2020-05-01}", "month = may", "abstract = {Long, with {braces}.}", "volume = {12}", "title = {On {DNA}, and Other Things}"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in\n%s", want, got)
		}
	}
	if strings.Contains(got, "Nature") {
		t.Errorf("cleared journal kept:\n%s", got)
	}

	// A new one gets a key Better BibTeX's way, not one taken.
	b, n, err := Save(b, "", Reference{Type: "book", Authors: []string{"Smith, Jane"}, Title: "The Origin", Year: "2020"})
	if err != nil || n.Key != "smith2020origin" {
		t.Fatalf("new: %+v %v", n, err)
	}
	_, n, err = Save(b, "", Reference{Type: "book", Authors: []string{"Jane Smith"}, Title: "Origin", Year: "2020"})
	if err != nil || n.Key != "smith2020origina" {
		t.Fatalf("second: %+v %v", n, err)
	}
}

// Importing spots sources the document has (by DOI, or title and year) and
// gives a taken key a new one, keeping a BibTeX entry's other fields.
func TestImport(t *testing.T) {
	have := []byte(`@article{smith2020, title = {Peanuts}, date = {2020}, doi = {10.1000/ABC}}`)
	paste := `@article{smith2020, title = {Legumes}, author = {Smith, Ann}, year = 2021, abstract = {Kept.}}
@misc{x, title = {Other}, doi = {https://doi.org/10.1000/abc}}
@book{y, title = {{P}eanuts}, year = {2020}}
`
	cs, err := Preview(have, paste)
	if err != nil {
		t.Fatal(err)
	}
	if len(cs) != 3 || cs[0].Key != "smith2021legumes" || cs[0].Duplicate != "" ||
		cs[1].Duplicate != "smith2020" || cs[2].Duplicate != "smith2020" {
		t.Fatalf("preview %+v", cs)
	}
	b, err := Import(have, paste, []int{0})
	if err != nil {
		t.Fatal(err)
	}
	e := bib.Entries(b)
	if len(e) != 2 || e[1].Key != "smith2021legumes" || !strings.Contains(string(e[1].Text), "abstract = {Kept.}") {
		t.Fatalf("imported %s", b)
	}
}

func TestRIS(t *testing.T) {
	ris := "TY  - JOUR\r\nAU  - Smith, Jane\r\nAU  - Doe, J.\r\nTI  - Nuts & Bolts\r\nT2  - Nut Science\r\nPY  - 2019/05/02/\r\nVL  - 7\r\nSP  - 10\r\nEP  - 20\r\nDO  - 10.1/x\r\nER  - \r\n" +
		"TY  - BOOK\nAU  - Lee, Kim\nTI  - Shells\nPB  - Acorn\nPY  - 2001\nER  -\n"
	b, err := Import(nil, ris, []int{0, 1})
	if err != nil {
		t.Fatal(err)
	}
	refs := List(b)
	if len(refs) != 2 {
		t.Fatalf("got %s", b)
	}
	a, k := refs[0], refs[1]
	if a.Key != "smith2019nuts" || a.Type != "article" || a.Year != "2019" || a.Container != "Nut Science" ||
		a.Pages != "10--20" || len(a.Authors) != 2 || a.DOI != "10.1/x" {
		t.Errorf("article %+v", a)
	}
	if k.Type != "book" || k.Publisher != "Acorn" || k.Key != "lee2001shells" {
		t.Errorf("book %+v", k)
	}
}

func TestFromCSL(t *testing.T) {
	r, err := fromCSL([]byte(`{"type":"journal-article","title":["The <i>Arachis</i> genome"],
		"container-title":"Nature Genetics","volume":51,"issue":"5","page":"877-884",
		"DOI":"10.1038/S41588-019-0405-Z","issued":{"date-parts":[[2019,4,29]]},
		"author":[{"family":"Bertioli","given":"David J."},{"literal":"Peanut Consortium"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if r.Type != "article" || r.Title != "The Arachis genome" || r.Volume != "51" || r.Pages != "877--884" ||
		r.Year != "2019" || r.DOI != "10.1038/s41588-019-0405-z" ||
		strings.Join(r.Authors, "|") != "Bertioli, David J.|{Peanut Consortium}" {
		t.Errorf("%+v", r)
	}
}

func TestNormDOI(t *testing.T) {
	for in, want := range map[string]string{
		"10.1000/XYZ":                   "10.1000/xyz",
		" https://doi.org/10.1000/a.b ": "10.1000/a.b",
		"doi:10.1234/5":                 "10.1234/5",
		"978-0-14-044913-6":             "",
	} {
		if got := normDOI(in); got != want {
			t.Errorf("normDOI(%q) = %q, want %q", in, got, want)
		}
	}
}
