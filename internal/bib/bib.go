// Package bib reads, edits and merges BibLaTeX files: the `Name.bib` a
// document keeps its cited sources in, written by the citation dialog or
// filled from Zotero (see internal/zotero).
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

// Field is one `name = value` of an entry. Value is the text inside its
// braces or quotes; Raw, when set, is the value as written (a number, a
// macro, a `#` concatenation) and is written back as it was.
type Field struct {
	Name  string
	Value string
	Raw   string
}

// Fields are e's type (lower case) and its fields in order.
func Fields(e Entry) (typ string, fields []Field) {
	src := e.Text
	open := bytes.IndexAny(src, "{(")
	if open < 0 {
		return "", nil
	}
	typ = strings.ToLower(strings.TrimSpace(string(bytes.TrimPrefix(src[:open], []byte("@")))))
	end := closing(src, open)
	body := src[open+1 : max(end-1, open+1)]
	comma := bytes.IndexByte(body, ',')
	if comma < 0 {
		return typ, nil
	}
	for i := comma + 1; i < len(body); {
		eq := bytes.IndexByte(body[i:], '=')
		if eq < 0 {
			break
		}
		name := strings.ToLower(strings.TrimSpace(strings.Trim(string(body[i:i+eq]), ",")))
		j := i + eq + 1
		start := j
		// The value runs to the next comma outside braces and quotes.
		depth, quoted := 0, false
		for ; j < len(body); j++ {
			switch c := body[j]; {
			case c == '\\':
				j++
			case c == '{':
				depth++
			case c == '}' && depth > 0:
				depth--
			case c == '"' && depth == 0:
				quoted = !quoted
			case c == ',' && depth == 0 && !quoted:
				goto done
			}
		}
	done:
		raw := strings.TrimSpace(string(body[start:min(j, len(body))]))
		i = j + 1
		if name == "" {
			continue
		}
		f := Field{Name: name, Raw: raw}
		if v, ok := delimited(raw); ok {
			f = Field{Name: name, Value: v}
		}
		fields = append(fields, f)
	}
	return typ, fields
}

// delimited is the text inside raw's one pair of braces or quotes.
func delimited(raw string) (string, bool) {
	if len(raw) < 2 {
		return "", false
	}
	if raw[0] == '{' && closing([]byte(raw), 0) == len(raw) || raw[0] == '"' && raw[len(raw)-1] == '"' && !strings.Contains(raw[1:len(raw)-1], `"`) {
		return raw[1 : len(raw)-1], true
	}
	return "", false
}

// Format writes an entry of type typ and key, its fields' values in braces.
func Format(typ, key string, fields []Field) []byte {
	var b bytes.Buffer
	b.WriteString("@" + typ + "{" + key + ",\n")
	for _, f := range fields {
		v := f.Raw
		if v == "" {
			v = "{" + f.Value + "}"
		}
		b.WriteString("  " + f.Name + " = " + v + ",\n")
	}
	b.WriteString("}")
	return b.Bytes()
}

// Balanced says whether s's braces pair up, as a value in braces needs.
func Balanced(s string) bool {
	depth := 0
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '\\':
			i++
		case '{':
			depth++
		case '}':
			if depth--; depth < 0 {
				return false
			}
		}
	}
	return depth == 0
}
