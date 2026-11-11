package doc

import (
	"bytes"
	"strings"

	"github.com/yuin/goldmark/ast"
	gmparser "github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// LaTeX math, as Pandoc reads it (tex_math_dollars):
//
//   - `$…$` in text: the opening `$` is followed by a non-space, the closing
//     one follows a non-space and isn't followed by a digit, and there's no
//     other `$` between them, so "$5 or $10" stays text. `\$` is a dollar
//     sign. It may run over a line break.
//   - `$$…$$` in text is display math.
//   - An equation: a line starting `$$` (it may interrupt a paragraph) runs
//     to the first line, maybe the same one, ending `$$` (then perhaps an
//     attribute block, `{#eq:name}`), or to the end of its container.
//
// Inside math a backslash escapes the next character, so `\$` doesn't
// close it.

var mathParsers = []gmparser.Option{
	gmparser.WithInlineParsers(util.Prioritized(mathInlineParser{}, 150)),
	gmparser.WithBlockParsers(util.Prioritized(equationParser{}, 750)),
}

var (
	kindMath     = ast.NewNodeKind("Math")
	kindEquation = ast.NewNodeKind("Equation")
)

// mathNode is math in text.
type mathNode struct {
	ast.BaseInline
	tex     string
	display bool
}

func (n *mathNode) Kind() ast.NodeKind { return kindMath }

func (n *mathNode) Dump(source []byte, level int) { ast.DumpHelper(n, source, level, nil, nil) }

// equationNode is an equation block.
type equationNode struct {
	ast.BaseBlock
	tex    strings.Builder
	attrs  string // the attribute block's inside
	closed bool
}

func (n *equationNode) Kind() ast.NodeKind { return kindEquation }

func (n *equationNode) IsRaw() bool { return true }

func (n *equationNode) Dump(source []byte, level int) { ast.DumpHelper(n, source, level, nil, nil) }

type mathInlineParser struct{}

func (mathInlineParser) Trigger() []byte { return []byte{'$'} }

func (mathInlineParser) Parse(parent ast.Node, block text.Reader, pc gmparser.Context) ast.Node {
	line, _ := block.PeekLine()
	display := len(line) > 1 && line[1] == '$'
	open := 1
	if display {
		open = 2
	} else if len(line) < 2 || util.IsSpace(line[1]) {
		return nil
	}
	block.Advance(open)
	var tex []byte
	for {
		line, _ := block.PeekLine()
		if line == nil {
			return nil // unclosed: the caller rewinds
		}
		for i := 0; i < len(line); i++ {
			switch c := line[i]; {
			case c == '\\':
				i++
			case c != '$':
			case display:
				if i+1 < len(line) && line[i+1] == '$' {
					block.Advance(i + 2)
					return &mathNode{tex: string(append(tex, line[:i]...)), display: true}
				}
			default:
				prev := byte('\n')
				if i > 0 {
					prev = line[i-1]
				}
				if util.IsSpace(prev) || i+1 < len(line) && line[i+1] >= '0' && line[i+1] <= '9' {
					return nil // not a closing `$`, and math can't hold one
				}
				block.Advance(i + 1)
				return &mathNode{tex: string(append(tex, line[:i]...))}
			}
		}
		tex = append(tex, line...)
		block.AdvanceLine()
	}
}

type equationParser struct{}

func (equationParser) Trigger() []byte { return []byte{'$'} }

func (equationParser) Open(parent ast.Node, reader text.Reader, pc gmparser.Context) (ast.Node, gmparser.State) {
	line, _ := reader.PeekLine()
	pos := pc.BlockOffset()
	if pos < 0 || !bytes.HasPrefix(line[pos:], []byte("$$")) {
		return nil, gmparser.NoChildren
	}
	n := &equationNode{}
	n.add(line[pos+2:])
	reader.AdvanceToEOL()
	return n, gmparser.NoChildren
}

func (equationParser) Continue(node ast.Node, reader text.Reader, pc gmparser.Context) gmparser.State {
	n := node.(*equationNode)
	// Closed on its first line: goldmark doesn't heed Close from Open, and
	// would add the next line.
	if n.closed {
		return gmparser.Close
	}
	line, _ := reader.PeekLine()
	if line == nil {
		return gmparser.Close
	}
	n.add(line)
	reader.AdvanceToEOL()
	if n.closed {
		return gmparser.Close
	}
	return gmparser.Continue | gmparser.NoChildren
}

func (equationParser) Close(node ast.Node, reader text.Reader, pc gmparser.Context) {}

func (equationParser) CanInterruptParagraph() bool { return true }

func (equationParser) CanAcceptIndentedLine() bool { return false }

// add takes a line of the equation: the end of the equation when it ends
// with `$$` (and maybe an attribute block).
func (n *equationNode) add(line []byte) {
	s := strings.TrimRight(string(line), " \t\r\n")
	attrs := ""
	if m := trailingAttrs.FindStringSubmatchIndex(s); m != nil {
		attrs, s = s[m[2]:m[3]], strings.TrimRight(s[:m[0]], " \t")
	}
	if strings.HasSuffix(s, "$$") {
		n.tex.WriteString(s[:len(s)-2])
		n.attrs = attrs
		n.closed = true
		return
	}
	n.tex.WriteString(strings.TrimRight(string(line), "\r\n"))
	n.tex.WriteByte('\n')
}

// equation reads an equation block. Only an `eq:` label numbers it.
func (p *parser) equation(n *equationNode) Block {
	b := Block{Type: BlockEquation, Text: strings.TrimSpace(n.tex.String())}
	if id, _ := parseAttrs(n.attrs); strings.HasPrefix(id, "eq:") {
		b.Label = id
	}
	b.Error = p.checkTeX(b.Text)
	return b
}

// math reads math in text.
func (p *parser) math(n *mathNode) Inline {
	tex := strings.TrimSpace(n.tex)
	return Inline{Type: InlineMath, Text: tex, Display: n.display, Error: p.checkTeX(tex)}
}

// Math is a formula to draw: equation blocks are display math.
type Math struct {
	TeX     string
	Display bool
}

// ReadableMath lists the math in bs not known to be unreadable, each
// formula once, in document order.
func ReadableMath(bs []Block) []Math {
	var out []Math
	seen := map[Math]bool{}
	add := func(m Math, known string) {
		if m.TeX != "" && known == "" && !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	Walk(bs, func(b *Block) {
		if b.Type == BlockEquation {
			add(Math{b.Text, true}, b.Error)
		}
	}, func(x *Inline) {
		if x.Type == InlineMath {
			add(Math{x.Text, x.Display}, x.Error)
		}
	})
	return out
}

// checkTeX finds what would stop the LaTeX being read (mitex rejects a
// closing brace with no opening one), warning about it; "" when there's
// nothing.
func (p *parser) checkTeX(tex string) string {
	depth := 0
	for i := 0; i < len(tex); i++ {
		switch tex[i] {
		case '\\':
			i++
		case '{':
			depth++
		case '}':
			if depth--; depth < 0 {
				msg := "a } with no { before it"
				p.warn("math can't be read (%s): %s", msg, tex)
				return msg
			}
		}
	}
	return ""
}
