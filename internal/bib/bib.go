// Package bib reads and merges BibLaTeX files: the `Name.bib` a document
// keeps its cited sources in, filled from Zotero (see internal/zotero).
package bib

import (
	"bytes"
	"slices"
	"strings"
)

// Entry is one `@type{key, …}` entry, as written.
type Entry struct {
	Key  string
	Text []byte
}

// Entries are src's entries in order. `@comment`, `@string` and `@preamble`
// aren't entries; text between entries is skipped.
func Entries(src []byte) []Entry {
	var out []Entry
	for i := 0; i < len(src); {
		at := bytes.IndexByte(src[i:], '@')
		if at < 0 {
			break
		}
		start := i + at
		open := bytes.IndexAny(src[start:], "{(")
		if open < 0 {
			break
		}
		open += start
		typ := strings.ToLower(strings.TrimSpace(string(src[start+1 : open])))
		end := closing(src, open)
		i = end
		if typ == "" || strings.ContainsAny(typ, " \t\n@") {
			i = start + 1
			continue
		}
		if typ == "comment" || typ == "string" || typ == "preamble" {
			continue
		}
		body := src[open+1 : max(end-1, open+1)]
		key, _, _ := bytes.Cut(body, []byte(","))
		if k := strings.TrimSpace(string(key)); k != "" {
			out = append(out, Entry{Key: k, Text: bytes.TrimSpace(src[start:end])})
		}
	}
	return out
}

// closing is the offset just past the bracket matching the one at
// src[open], or len(src) when it isn't closed.
func closing(src []byte, open int) int {
	want := byte('}')
	if src[open] == '(' {
		want = ')'
	}
	depth := 0
	for j := open + 1; j < len(src); j++ {
		switch c := src[j]; {
		case c == '\\':
			j++
		case c == '{':
			depth++
		case c == '}' && depth > 0:
			depth--
		case c == want && depth == 0:
			return j + 1
		}
	}
	return len(src)
}

// Keys are the keys of src's entries.
func Keys(src []byte) map[string]bool {
	keys := map[string]bool{}
	for _, e := range Entries(src) {
		keys[e.Key] = true
	}
	return keys
}

// Merge is old with the entries of add in place of those of the same key,
// and add's others after them; only entries whose key is in keep are kept
// (all of them when keep is nil).
func Merge(old, add []byte, keep map[string]bool) []byte {
	fresh := map[string][]byte{}
	var order []string
	for _, e := range Entries(add) {
		if _, dup := fresh[e.Key]; !dup {
			order = append(order, e.Key)
		}
		fresh[e.Key] = e.Text
	}
	var b bytes.Buffer
	seen := map[string]bool{}
	write := func(key string, text []byte) {
		if seen[key] || keep != nil && !keep[key] {
			return
		}
		seen[key] = true
		b.Write(text)
		b.WriteString("\n\n")
	}
	for _, e := range Entries(old) {
		if t, ok := fresh[e.Key]; ok {
			write(e.Key, t)
		} else {
			write(e.Key, e.Text)
		}
	}
	for _, k := range order {
		write(k, fresh[k])
	}
	return bytes.TrimSuffix(b.Bytes(), []byte("\n"))
}

// Sorted are keys' members in order.
func Sorted(keys map[string]bool) []string {
	out := make([]string, 0, len(keys))
	for k := range keys {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}
