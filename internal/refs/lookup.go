package refs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// The services Lookup asks: doi.org (Crossref, DataCite…) answers for a
// DOI in CSL-JSON, Open Library for an ISBN.
const (
	doiURL  = "https://doi.org/"
	isbnURL = "https://openlibrary.org/api/books"
)

var client = &http.Client{Timeout: 10 * time.Second}

var (
	doiRe  = regexp.MustCompile(`^10\.\d{4,9}/\S+$`)
	isbnRe = regexp.MustCompile(`^(\d{9}[\dX]|\d{13})$`)
)

// normDOI is s as a bare, lower-case DOI (`10.1000/xyz`), without a
// `https://doi.org/` or `doi:` before it; "" when it isn't one.
func normDOI(s string) string {
	s = strings.TrimSpace(s)
	for _, p := range []string{"https://doi.org/", "http://doi.org/", "https://dx.doi.org/", "http://dx.doi.org/", "doi.org/", "doi:"} {
		if len(s) >= len(p) && strings.EqualFold(s[:len(p)], p) {
			s = strings.TrimSpace(s[len(p):])
			break
		}
	}
	if !doiRe.MatchString(s) {
		return ""
	}
	return strings.ToLower(s)
}

// Lookup fetches the details of the source id names, a DOI or an ISBN, as
// a new reference (without a key). It needs the internet.
func Lookup(ctx context.Context, id string) (Reference, error) {
	if d := normDOI(id); d != "" {
		b, err := get(ctx, doiURL+d, "application/vnd.citationstyles.csl+json")
		if err != nil {
			return Reference{}, err
		}
		r, err := fromCSL(b)
		if r.DOI == "" {
			r.DOI = d
		}
		return r, err
	}
	isbn := strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(id)))
	isbn = strings.TrimPrefix(isbn, "ISBN:")
	isbn = strings.TrimPrefix(isbn, "ISBN")
	if !isbnRe.MatchString(isbn) {
		return Reference{}, errors.New("That isn't a DOI (10.…) or an ISBN")
	}
	q := url.Values{"bibkeys": {"ISBN:" + isbn}, "format": {"json"}, "jscmd": {"data"}}
	b, err := get(ctx, isbnURL+"?"+q.Encode(), "application/json")
	if err != nil {
		return Reference{}, err
	}
	return fromOpenLibrary(b, isbn)
}

// errNotFound is what Lookup says when the service doesn't know the id.
var errNotFound = errors.New("No source found for that DOI or ISBN")

func get(ctx context.Context, u, accept string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("User-Agent", "Peanut Writer (https://github.com/dustinmichels/peanut-writer)")
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("couldn't reach %s: is the internet on? (%w)", req.URL.Host, err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return nil, errNotFound
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s answered %s", req.URL.Host, res.Status)
	}
	return io.ReadAll(io.LimitReader(res.Body, 4<<20))
}

// text is a CSL value that may be a string, a number or a list of strings
// (Crossref gives some titles as lists).
type text string

func (t *text) UnmarshalJSON(b []byte) error {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	switch v := v.(type) {
	case string:
		*t = text(v)
	case float64:
		*t = text(fmt.Sprint(v))
	case []any:
		if len(v) > 0 {
			*t = text(fmt.Sprint(v[0]))
		}
	}
	return nil
}

// cslTypes are CSL types as BibLaTeX's.
var cslTypes = map[string]string{
	"article-journal": "article", "article-magazine": "article", "article-newspaper": "article", "article": "article",
	"journal-article": "article",
	"book":            "book", "monograph": "book", "edited-book": "book",
	"chapter": "incollection", "book-chapter": "incollection",
	"paper-conference": "inproceedings", "proceedings-article": "inproceedings",
	"report": "report",
	"thesis": "thesis", "dissertation": "thesis",
	"webpage": "online", "post-weblog": "online", "post": "online",
}

var tagRe = regexp.MustCompile(`<[^>]+>`)

// plain is s without markup (Crossref titles carry `<i>`) or extra spaces.
func plain(s text) string {
	return strings.Join(strings.Fields(html.UnescapeString(tagRe.ReplaceAllString(string(s), ""))), " ")
}

// fromCSL is the reference a CSL-JSON item describes.
func fromCSL(b []byte) (Reference, error) {
	var c struct {
		Type      string `json:"type"`
		Title     text   `json:"title"`
		Container text   `json:"container-title"`
		Publisher text   `json:"publisher"`
		Volume    text   `json:"volume"`
		Issue     text   `json:"issue"`
		Page      text   `json:"page"`
		DOI       text   `json:"DOI"`
		URL       text   `json:"URL"`
		Author    []struct {
			Family  string `json:"family"`
			Given   string `json:"given"`
			Literal string `json:"literal"`
		} `json:"author"`
		Issued struct {
			DateParts [][]any `json:"date-parts"`
		} `json:"issued"`
	}
	if err := json.Unmarshal(b, &c); err != nil {
		return Reference{}, fmt.Errorf("couldn't read the source's details: %w", err)
	}
	r := Reference{
		Type:      cslTypes[c.Type],
		Authors:   []string{},
		Title:     plain(c.Title),
		Container: plain(c.Container),
		Publisher: plain(c.Publisher),
		Volume:    plain(c.Volume),
		Issue:     plain(c.Issue),
		Pages:     strings.ReplaceAll(plain(c.Page), "-", "--"),
		DOI:       strings.ToLower(plain(c.DOI)),
		URL:       plain(c.URL),
	}
	if r.Type == "" {
		r.Type = "misc"
	}
	for _, a := range c.Author {
		switch {
		case a.Family != "" && a.Given != "":
			r.Authors = append(r.Authors, a.Family+", "+a.Given)
		case a.Family != "":
			r.Authors = append(r.Authors, a.Family)
		case a.Literal != "":
			r.Authors = append(r.Authors, "{"+a.Literal+"}")
		}
	}
	if p := c.Issued.DateParts; len(p) > 0 && len(p[0]) > 0 {
		r.Year = fmt.Sprint(p[0][0])
	}
	if r.Title == "" && len(r.Authors) == 0 {
		return Reference{}, errNotFound
	}
	return r, nil
}

// fromOpenLibrary is the book Open Library's books API describes for isbn.
func fromOpenLibrary(b []byte, isbn string) (Reference, error) {
	var books map[string]struct {
		Title      string                  `json:"title"`
		Subtitle   string                  `json:"subtitle"`
		URL        string                  `json:"url"`
		Date       string                  `json:"publish_date"`
		Authors    []struct{ Name string } `json:"authors"`
		Publishers []struct{ Name string } `json:"publishers"`
	}
	if err := json.Unmarshal(b, &books); err != nil {
		return Reference{}, fmt.Errorf("couldn't read the book's details: %w", err)
	}
	x, ok := books["ISBN:"+isbn]
	if !ok {
		return Reference{}, errNotFound
	}
	r := Reference{Type: "book", Authors: []string{}, Title: x.Title, Year: yearRe.FindString(x.Date), URL: x.URL}
	if x.Subtitle != "" {
		r.Title += ": " + x.Subtitle
	}
	for _, a := range x.Authors {
		// Open Library writes "First Last".
		if f := strings.Fields(a.Name); len(f) > 1 {
			r.Authors = append(r.Authors, f[len(f)-1]+", "+strings.Join(f[:len(f)-1], " "))
		} else if len(f) == 1 {
			r.Authors = append(r.Authors, f[0])
		}
	}
	if len(x.Publishers) > 0 {
		r.Publisher = x.Publishers[0].Name
	}
	return r, nil
}
