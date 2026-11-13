// Package zotero reaches Zotero through Better BibTeX's JSON-RPC endpoint,
// which Zotero serves while it runs (with the Better BibTeX add-on): to
// search the library and to export sources as BibLaTeX.
package zotero

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Endpoint is Better BibTeX's JSON-RPC URL.
const Endpoint = "http://127.0.0.1:23119/better-bibtex/json-rpc"

// Errors a caller tells the user about.
var (
	ErrNotRunning = errors.New("Zotero isn't open. Open Zotero, then try again")
	ErrNoBBT      = errors.New("Zotero is open, but without the Better BibTeX add-on. Install it, then try again")
)

// Client calls the endpoint.
type Client struct {
	URL  string
	HTTP *http.Client
}

// New is a client of the local Zotero.
func New() *Client {
	return &Client{URL: Endpoint, HTTP: &http.Client{Timeout: 20 * time.Second}}
}

// Status is what's ready for citing.
type Status struct {
	Zotero       bool   `json:"zotero"`       // Zotero is open
	BetterBibTeX bool   `json:"betterBibTeX"` // ...with the Better BibTeX add-on
	Version      string `json:"version"`      // Better BibTeX's, when it is
	Error        string `json:"error"`        // why neither answered, if not one of the above
}

// Status asks Zotero, briefly, whether it's open with Better BibTeX.
func (c *Client) Status(ctx context.Context) Status {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var ready struct {
		BetterBibTeX string `json:"betterbibtex"`
	}
	switch err := c.call(ctx, "api.ready", []any{}, &ready); {
	case err == nil:
		return Status{Zotero: true, BetterBibTeX: true, Version: ready.BetterBibTeX}
	case errors.Is(err, ErrNoBBT):
		return Status{Zotero: true}
	case errors.Is(err, ErrNotRunning), errors.Is(err, context.DeadlineExceeded):
		return Status{}
	default:
		return Status{Zotero: true, Error: err.Error()}
	}
}

// Source is a library item, as the citation dialog lists it.
type Source struct {
	Key     string `json:"key"` // the citation key
	Title   string `json:"title"`
	Authors string `json:"authors"` // "Smith, Doe & Lee"
	Year    string `json:"year"`
	Type    string `json:"type"`      // CSL type: "article-journal", "book"…
	In      string `json:"container"` // the journal or book it's in
	Library string `json:"library"`   // the library it's in: "My Library", or a group's
}

// maxResults caps a search: the dialog shows the best few.
const maxResults = 50

// Search finds the library's sources whose title, authors or year contain
// query (Zotero's "Title, Creator, Year" search); sources without a citation
// key are left out.
func (c *Client) Search(ctx context.Context, query string) ([]Source, error) {
	terms := [][]any{
		{"ignore_feeds"},
		{"itemType", "isNot", "attachment"},
		{"itemType", "isNot", "note"},
		{"itemType", "isNot", "annotation"},
		{"quicksearch-titleCreatorYear", "contains", query},
	}
	var items []cslItem
	if err := c.call(ctx, "item.search", []any{terms}, &items); err != nil {
		return nil, err
	}
	out := []Source{}
	for _, it := range items {
		if it.Citekey == "" {
			continue
		}
		out = append(out, it.source())
		if len(out) == maxResults {
			break
		}
	}
	return out, nil
}

// Export is the sources of keys in library (a group's name; "" for My
// Library), as BibLaTeX. Keys the library lacks are a *NotFoundError.
func (c *Client) Export(ctx context.Context, keys []string, library string) ([]byte, error) {
	params := []any{keys, "Better BibLaTeX"}
	if library != "" {
		params = append(params, library)
	}
	var s string
	if err := c.call(ctx, "item.export", params, &s); err != nil {
		var rpc *rpcError
		if errors.As(err, &rpc) {
			for _, line := range strings.Split(rpc.msg, "\n") {
				if list, ok := strings.CutPrefix(line, "not found: "); ok {
					return nil, &NotFoundError{Keys: strings.Split(list, ", ")}
				}
			}
		}
		return nil, err
	}
	return []byte(s), nil
}

// NotFoundError names keys the library has no source for.
type NotFoundError struct{ Keys []string }

func (e *NotFoundError) Error() string {
	return "Zotero has no source with the citation key " + strings.Join(e.Keys, ", ")
}

// rpcError is an error Better BibTeX answered with.
type rpcError struct{ msg string }

func (e *rpcError) Error() string { return "Better BibTeX: " + e.msg }

// cslItem is an item as item.search returns it: CSL-JSON, with its key and
// library.
type cslItem struct {
	Citekey   string `json:"citekey"`
	Library   string `json:"library"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Container string `json:"container-title"`
	Author    []struct {
		Family  string `json:"family"`
		Given   string `json:"given"`
		Literal string `json:"literal"`
	} `json:"author"`
	Editor []struct {
		Family  string `json:"family"`
		Literal string `json:"literal"`
	} `json:"editor"`
	Issued struct {
		DateParts [][]any `json:"date-parts"`
		Literal   string  `json:"literal"`
	} `json:"issued"`
}

func (it cslItem) source() Source {
	var names []string
	for _, a := range it.Author {
		names = append(names, firstOf(a.Family, a.Literal, a.Given))
	}
	if len(names) == 0 {
		for _, e := range it.Editor {
			names = append(names, firstOf(e.Family, e.Literal))
		}
	}
	authors := strings.Join(names, ", ")
	if len(names) > 3 {
		authors = names[0] + " et al."
	} else if len(names) > 1 {
		authors = strings.Join(names[:len(names)-1], ", ") + " & " + names[len(names)-1]
	}
	year := it.Issued.Literal
	if len(it.Issued.DateParts) > 0 && len(it.Issued.DateParts[0]) > 0 {
		switch y := it.Issued.DateParts[0][0].(type) {
		case float64:
			year = strconv.Itoa(int(y))
		case string:
			year = y
		}
	}
	return Source{Key: it.Citekey, Title: it.Title, Authors: authors, Year: year, Type: it.Type, In: it.Container, Library: it.Library}
}

func firstOf(xs ...string) string {
	for _, x := range xs {
		if x = strings.TrimSpace(x); x != "" {
			return x
		}
	}
	return ""
}

// call calls method with params and reads its result into out.
func (c *Client) call(ctx context.Context, method string, params []any, out any) error {
	body, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return ErrNotRunning
	}
	defer res.Body.Close()
	b, err := io.ReadAll(io.LimitReader(res.Body, 64<<20))
	if err != nil {
		return err
	}
	// Zotero answers paths no add-on serves with 404 "No endpoint found".
	if res.StatusCode == http.StatusNotFound {
		return ErrNoBBT
	}
	var reply struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(b, &reply); err != nil {
		return fmt.Errorf("Better BibTeX answered %s: %s", res.Status, strings.TrimSpace(string(b)))
	}
	if reply.Error != nil {
		return &rpcError{reply.Error.Message}
	}
	return json.Unmarshal(reply.Result, out)
}
