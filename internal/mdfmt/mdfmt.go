// Package mdfmt tidies a document's Markdown: oxfmt lays it out (blank
// lines, list markers, table columns, trailing spaces), and headings can be
// put in title case.
package mdfmt

import (
	"bytes"
	"context"
	"encoding/json"
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

	"peanut-writer/internal/doc"
)

const timeout = 20 * time.Second

// Oxfmt runs the oxfmt formatter: the native binary, which the packaged app
// keeps beside its executable.
type Oxfmt struct {
	Bin string
}

// Find looks for oxfmt beside the app's executable, then on PATH, then where
// Homebrew and mise install it: apps opened from Finder don't get the shell's
// PATH.
func Find() (*Oxfmt, error) {
	name := "oxfmt"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	if exe, err := os.Executable(); err == nil {
		if p := filepath.Join(filepath.Dir(exe), name); isFile(p) {
			return &Oxfmt{Bin: p}, nil
		}
	}
	// Not a mise shim: it picks a version by the working folder, which the
	// app's isn't. The real binary is found below.
	if p, err := exec.LookPath(name); err == nil && !strings.Contains(filepath.ToSlash(p), "/mise/shims/") {
		return &Oxfmt{Bin: p}, nil
	}
	candidates := []string{"/opt/homebrew/bin/oxfmt", "/usr/local/bin/oxfmt"}
	if home, err := os.UserHomeDir(); err == nil {
		mise, _ := filepath.Glob(filepath.Join(home, ".local/share/mise/installs/aqua-oxc-project-oxc-oxfmt/*/oxfmt"))
		slices.Reverse(mise) // newest version first, roughly
		candidates = append(candidates, mise...)
	}
	for _, p := range candidates {
		if isFile(p) {
			return &Oxfmt{Bin: p}, nil
		}
	}
	return nil, errors.New("oxfmt wasn't found: it comes with the app; for a development build, run `mise install`")
}

func isFile(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && !fi.IsDir()
}

// config is oxfmt's configuration: its defaults, except that code blocks
// keep their code as written (by default it lays out JavaScript, CSS, JSON,
// Markdown and more inside them, changing what the document shows).
const config = `{"embeddedLanguageFormatting": "off"}`

// Format returns src as oxfmt lays it out.
func (o *Oxfmt) Format(ctx context.Context, src string) (string, error) {
	// oxfmt's math ends only at a bare `$$` line: an equation's attribute
	// block (`$$ {#eq:a}`) is taken out, and put back afterwards. One left
	// open (being typed) oxfmt would close, changing the document.
	md, attrs, closed := takeEquationAttrs(src)
	if !closed {
		return "", errors.New("an equation's closing $$ is missing")
	}
	// The native oxfmt formats files, not standard input: the document goes
	// in a temporary folder, with the configuration given explicitly so no
	// config file oxfmt might find around it applies.
	dir, err := os.MkdirTemp("", "peanut-oxfmt-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	cfg, file := filepath.Join(dir, "oxfmt.json"), filepath.Join(dir, "document.md")
	if err := errors.Join(os.WriteFile(cfg, []byte(config), 0o600), os.WriteFile(file, []byte(md), 0o600)); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, o.Bin, "--config", cfg, "--write", "--threads", "1", file)
	// A launcher that runs oxfmt as its child (a version manager's shim, say)
	// leaves it holding the output when the timeout kills the launcher: the
	// wait for that output is cut short.
	cmd.WaitDelay = time.Second
	cmd.Dir = dir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return "", errors.New(msg)
		}
		return "", err
	}
	formatted, err := os.ReadFile(file)
	if err != nil {
		return "", err
	}
	out, ok := putEquationAttrs(string(formatted), attrs)
	if !ok {
		return "", errors.New("formatting would lose equation labels")
	}
	// oxfmt reads some Markdown differently from the app (a table right
	// under a paragraph, a row without pipes, an equation right after a
	// list): there its layout would change the document, so it's not used.
	if reading(out) != reading(src) {
		return "", errors.New("formatting would change how the document reads, so it's left as written")
	}
	return out, nil
}

var (
	lineField = regexp.MustCompile(`"line":\d+,?`)
	spaces    = regexp.MustCompile(`(?:\\t| )+`)
)

// reading is the document src describes, as the renderers see it, without
// source lines or differences in spacing within text.
func reading(src string) string {
	d := doc.Parse(src, "")
	d.Warnings = nil
	b, _ := json.Marshal(d)
	return spaces.ReplaceAllString(lineField.ReplaceAllString(string(b), ""), " ")
}

var (
	// A line's quote markers and list marker, before its content.
	container = regexp.MustCompile(`^(?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?[ \t]*`)
	mathClose = regexp.MustCompile(`\$\$[ \t]*(\{[^{}]*\})?[ \t]*$`)
)

// equationEnds finds the last line of each equation block (in quotes and
// lists too): from a line starting `$$` to one ending `$$` (and maybe an
// attribute block), outside top-level code fences. closed is false when the
// last one never ends.
func equationEnds(lines []string) (ends []int, closed bool) {
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
				return ends, false
			}
			rest = strings.TrimRight(lines[j], "\r\n")
		}
		ends = append(ends, j)
		i = j
	}
	return ends, true
}

// takeEquationAttrs removes equations' attribute blocks, returning them in
// order ("" for none), and whether every equation is closed.
func takeEquationAttrs(src string) (string, []string, bool) {
	lines := strings.SplitAfter(src, "\n")
	var attrs []string
	ends, closed := equationEnds(lines)
	for _, i := range ends {
		body := strings.TrimRight(lines[i], "\r\n")
		m := mathClose.FindStringSubmatchIndex(body)
		a := ""
		if m[2] >= 0 {
			a = body[m[2]:m[3]]
			lines[i] = strings.TrimRight(body[:m[2]], " \t") + lines[i][len(body):]
		}
		attrs = append(attrs, a)
	}
	return strings.Join(lines, ""), attrs, closed
}

// putEquationAttrs puts attribute blocks back on src's equations; false if
// the equations aren't the ones they were taken from.
func putEquationAttrs(src string, attrs []string) (string, bool) {
	lines := strings.SplitAfter(src, "\n")
	ends, closed := equationEnds(lines)
	if !closed || len(ends) != len(attrs) {
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
	protected = regexp.MustCompile("`+[^`]*`+|\\$\\$?(?:\\\\.|[^$\\\\])+\\$\\$?|\\]\\((?:[^()]|\\([^()]*\\))*\\)|\\]\\([^)]*\\)|\\]\\[[^\\]]*\\]|\\{[^}]*\\}|@[\\w:.-]+|\\[\\^[^\\]]*\\]|<[^>]*>|https?://\\S+|&#?\\w+;|\\\\.")
	// A word: letters and digits with their accents (decomposed ones too),
	// joined by apostrophes and dots (don't, Node.js, U.S).
	word = regexp.MustCompile(`[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’.][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*`)
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
// SentenceCase), leaving front matter and code blocks alone. A `---` first
// line that's never closed is a rule, not front matter.
func CaseHeadings(src string, recase func(string) string) string {
	lines := strings.SplitAfter(src, "\n")
	i := 0
	if len(lines) > 0 && strings.TrimRight(lines[0], "\r\n") == "---" {
		for j := 1; j < len(lines); j++ {
			if t := strings.TrimSpace(lines[j]); t == "---" || t == "..." {
				i = j + 1
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

// capitalize puts w's first letter in title case (upper case, except for
// digraphs like ǆ, which become ǅ).
func capitalize(w string) string {
	r, n := utf8.DecodeRuneInString(w)
	return string(unicode.ToTitle(r)) + w[n:]
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
