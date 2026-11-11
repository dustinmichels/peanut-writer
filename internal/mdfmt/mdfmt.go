// Package mdfmt tidies a document's Markdown: oxfmt lays it out (blank
// lines, list markers, table columns, trailing spaces), and headings can be
// put in title case.
package mdfmt

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const timeout = 20 * time.Second

// Oxfmt runs the oxfmt formatter. It's a Node program, so it also needs
// node, which apps opened from Finder won't find on their PATH.
type Oxfmt struct {
	Bin  string
	Node string
}

// Find looks for oxfmt and node on PATH, then where Homebrew, mise, Volta,
// nvm and Bun install them.
func Find() (*Oxfmt, error) {
	bin := find("oxfmt",
		"/opt/homebrew/bin/oxfmt",
		"/usr/local/bin/oxfmt",
		"~/.local/share/mise/installs/npm-oxfmt/*/node_modules/.bin/oxfmt",
		"~/.local/share/mise/installs/npm-oxfmt/*/bin/oxfmt",
		"~/.volta/bin/oxfmt",
		"~/.bun/bin/oxfmt",
		"~/.npm-global/bin/oxfmt",
	)
	if bin == "" {
		return nil, errors.New("oxfmt wasn't found: install it with `npm install -g oxfmt` (or `mise install`)")
	}
	node := find("node",
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
		"~/.local/share/mise/installs/node/*/bin/node",
		"~/.volta/bin/node",
		"~/.nvm/versions/node/*/bin/node",
	)
	if node == "" {
		return nil, errors.New("oxfmt needs Node.js, which wasn't found: install it with `brew install node` (or `mise install`)")
	}
	return &Oxfmt{Bin: bin, Node: node}, nil
}

// find returns name from PATH, else the first candidate that exists; globs
// try the newest version first, roughly.
func find(name string, candidates ...string) string {
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	// Not a mise shim: it picks a version by the working folder, which the
	// app's isn't.
	if p, err := exec.LookPath(name); err == nil && !strings.Contains(filepath.ToSlash(p), "/mise/shims/") {
		return p
	}
	home, _ := os.UserHomeDir()
	for _, c := range candidates {
		if strings.HasPrefix(c, "~/") {
			if home == "" {
				continue
			}
			c = filepath.Join(home, c[2:])
		}
		matches, _ := filepath.Glob(c)
		slices.Reverse(matches)
		for _, p := range matches {
			if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
				return p
			}
		}
	}
	return ""
}

// Format returns src as oxfmt lays it out.
func (o *Oxfmt) Format(ctx context.Context, src string) (string, error) {
	// oxfmt's math ends only at a bare `$$` line: an equation's attribute
	// block (`$$ {#eq:a}`) is taken out, and put back afterwards.
	src, attrs := takeEquationAttrs(src)
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, o.Bin, "--stdin-filepath", "document.md")
	// No project's formatter config applies.
	cmd.Dir = os.TempDir()
	cmd.Env = append(os.Environ(), "PATH="+filepath.Dir(o.Node)+string(os.PathListSeparator)+os.Getenv("PATH"))
	cmd.Stdin = strings.NewReader(src)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return "", errors.New(msg)
		}
		return "", err
	}
	out, ok := putEquationAttrs(stdout.String(), attrs)
	if !ok {
		return "", errors.New("formatting would lose equation labels")
	}
	return out, nil
}

var (
	// A line's quote markers and list marker, before its content.
	container = regexp.MustCompile(`^(?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?[ \t]*`)
	mathClose = regexp.MustCompile(`\$\$[ \t]*(\{[^{}]*\})?[ \t]*$`)
)

// equationEnds finds the last line of each equation block (in quotes and
// lists too): from a line starting `$$` to one ending `$$` (and maybe an
// attribute block), outside top-level code fences.
func equationEnds(lines []string) []int {
	var ends []int
	open := "" // the open code fence
	for i := 0; i < len(lines); i++ {
		body := strings.TrimRight(lines[i], "\r\n")
		if m := fence.FindStringSubmatch(body); m != nil {
			switch {
			case open == "":
				open = m[1]
			case m[1][0] == open[0] && len(m[1]) >= len(open) && strings.TrimSpace(body[len(m[0]):]) == "":
				open = ""
			}
			continue
		}
		content := body[len(container.FindString(body)):]
		if open != "" || !strings.HasPrefix(content, "$$") {
			continue
		}
		// The opening line closes it too if more follows its `$$`.
		j, rest := i, content[2:]
		for !mathClose.MatchString(rest) {
			if j++; j == len(lines) {
				return ends // unclosed
			}
			rest = strings.TrimRight(lines[j], "\r\n")
		}
		ends = append(ends, j)
		i = j
	}
	return ends
}

// takeEquationAttrs removes equations' attribute blocks, returning them in
// order ("" for none).
func takeEquationAttrs(src string) (string, []string) {
	lines := strings.SplitAfter(src, "\n")
	var attrs []string
	for _, i := range equationEnds(lines) {
		body := strings.TrimRight(lines[i], "\r\n")
		m := mathClose.FindStringSubmatchIndex(body)
		a := ""
		if m[2] >= 0 {
			a = body[m[2]:m[3]]
			lines[i] = strings.TrimRight(body[:m[2]], " \t") + lines[i][len(body):]
		}
		attrs = append(attrs, a)
	}
	return strings.Join(lines, ""), attrs
}

// putEquationAttrs puts attribute blocks back on src's equations; false if
// the equations aren't the ones they were taken from.
func putEquationAttrs(src string, attrs []string) (string, bool) {
	lines := strings.SplitAfter(src, "\n")
	ends := equationEnds(lines)
	if len(ends) != len(attrs) {
		return "", false
	}
	for k, i := range ends {
		if attrs[k] != "" {
			body := strings.TrimRight(lines[i], "\r\n")
			lines[i] = body + " " + attrs[k] + lines[i][len(body):]
		}
	}
	return strings.Join(lines, ""), true
}

// --- Title case ----------------------------------------------------------------

var (
	atxHeading = regexp.MustCompile(`^( {0,3}#{1,6}[ \t]+)(.*?)([ \t]+#+)?[ \t]*$`)
	fence      = regexp.MustCompile("^ {0,3}(`{3,}|~{3,})")
	// Parts of a heading that aren't its words: code, math, link targets and
	// reference labels, attribute blocks, cross-references, footnotes,
	// autolinks, URLs, entities and escapes.
	protected = regexp.MustCompile("`+[^`]*`+|\\$\\$?(?:\\\\.|[^$\\\\])+\\$\\$?|\\]\\([^)]*\\)|\\]\\[[^\\]]*\\]|\\{[^}]*\\}|@[\\w:.-]+|\\[\\^[^\\]]*\\]|<[^>]*>|https?://\\S+|&#?\\w+;|\\\\.")
	word      = regexp.MustCompile(`[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*`)
)

// minor words stay lowercase in a title unless they start or end it, or
// start a phrase (APA: articles, conjunctions and prepositions of three
// letters or fewer; not "up" or "off", which are often adverbs).
var minor = map[string]bool{
	"a": true, "an": true, "the": true,
	"and": true, "as": true, "but": true, "for": true, "if": true, "nor": true, "or": true, "so": true, "yet": true,
	"at": true, "by": true, "in": true, "of": true, "on": true, "per": true, "to": true, "via": true, "vs": true,
}

// CaseHeadings recases src's ATX headings with recase (TitleCase or
// SentenceCase), leaving front matter and code blocks alone.
func CaseHeadings(src string, recase func(string) string) string {
	lines := strings.SplitAfter(src, "\n")
	i := 0
	if len(lines) > 0 && strings.TrimRight(lines[0], "\r\n") == "---" {
		for i = 1; i < len(lines); i++ {
			if t := strings.TrimRight(lines[i], "\r\n"); t == "---" || t == "..." {
				i++
				break
			}
		}
	}
	open := "" // the open code fence
	for ; i < len(lines); i++ {
		body := strings.TrimRight(lines[i], "\r\n")
		if m := fence.FindStringSubmatch(body); m != nil {
			switch {
			case open == "":
				open = m[1]
			case m[1][0] == open[0] && len(m[1]) >= len(open) && strings.TrimSpace(body[len(m[0]):]) == "":
				open = ""
			}
			continue
		}
		if open != "" {
			continue
		}
		m := atxHeading.FindStringSubmatchIndex(body)
		if m == nil {
			continue
		}
		text := body[m[4]:m[5]]
		if tc := recase(text); tc != text {
			lines[i] = body[:m[4]] + tc + body[m[5]:] + lines[i][len(body):]
		}
	}
	return strings.Join(lines, "")
}

// TitleCase capitalizes a heading's words, except minor words in the middle.
// Words with digits or capitals after their first letter (NASA, iPhone, 3D)
// are kept as they are.
func TitleCase(text string) string {
	return eachWord(text, func(w string, first, last bool, before string) string {
		lower := strings.ToLower(w)
		if minor[lower] && !first && !last && !startsPhrase(before) {
			return lower
		}
		return capitalize(w)
	})
}

// SentenceCase capitalizes a heading's first word, any word starting a
// phrase, and "I"; the rest are lowercased. Words with digits or capitals
// after their first letter (NASA, iPhone, 3D) are kept as they are, but
// names like "London" can't be told apart and are lowercased too.
func SentenceCase(text string) string {
	return eachWord(text, func(w string, first, _ bool, before string) string {
		lower := strings.ToLower(w)
		if first || startsPhrase(before) || lower == "i" || strings.HasPrefix(lower, "i'") || strings.HasPrefix(lower, "i’") {
			return capitalize(w)
		}
		return lower
	})
}

// eachWord rewrites text's words with recase, skipping its protected parts
// and words kept as they are. recase is told whether the word is the first
// or last and what comes before it.
func eachWord(text string, recase func(w string, first, last bool, before string) string) string {
	type span struct{ from, to int }
	var words []span
	at := 0
	gaps := append(protected.FindAllStringIndex(text, -1), []int{len(text), len(text)})
	for _, g := range gaps {
		for _, w := range word.FindAllStringIndex(text[at:g[0]], -1) {
			words = append(words, span{at + w[0], at + w[1]})
		}
		at = g[1]
	}
	var b strings.Builder
	at = 0
	for i, s := range words {
		w := text[s.from:s.to]
		b.WriteString(text[at:s.from])
		at = s.to
		if keepAsIs(w) {
			b.WriteString(w)
			continue
		}
		b.WriteString(recase(w, i == 0, i == len(words)-1, text[:s.from]))
	}
	b.WriteString(text[at:])
	return b.String()
}

// capitalize puts w's first letter in upper case.
func capitalize(w string) string {
	r, n := utf8.DecodeRuneInString(w)
	return string(unicode.ToUpper(r)) + w[n:]
}

// keepAsIs reports whether w has a digit, or a capital after its first
// letter.
func keepAsIs(w string) bool {
	for i, r := range w {
		if unicode.IsDigit(r) || (i > 0 && unicode.IsUpper(r)) {
			return true
		}
	}
	return false
}

// startsPhrase reports whether the word after before begins a new phrase
// (after a colon, a dash, or a question or exclamation mark), and so is
// capitalized even if it's minor.
func startsPhrase(before string) bool {
	before = strings.TrimRightFunc(before, func(r rune) bool {
		return unicode.IsSpace(r) || strings.ContainsRune("*_\"“‘([", r)
	})
	r, _ := utf8.DecodeLastRuneInString(before)
	return strings.ContainsRune(":—–?!", r)
}
