package doc

import (
	"github.com/yuin/goldmark/ast"
	gmparser "github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// Highlighted text: `==text==`, read as strikethrough's `~~` is (Pandoc's
// mark extension, Obsidian): exactly two `=`, opening before a non-space and
// closing after one.

var highlightParsers = []gmparser.Option{
	gmparser.WithInlineParsers(util.Prioritized(highlightParser{}, 500)),
}

var kindHighlight = ast.NewNodeKind("Highlight")

type highlightNode struct{ ast.BaseInline }

func (n *highlightNode) Kind() ast.NodeKind { return kindHighlight }

func (n *highlightNode) Dump(source []byte, level int) { ast.DumpHelper(n, source, level, nil, nil) }

type highlightDelimiter struct{}

func (highlightDelimiter) IsDelimiter(b byte) bool { return b == '=' }

func (highlightDelimiter) CanOpenCloser(opener, closer *gmparser.Delimiter) bool {
	return opener.Char == closer.Char
}

func (highlightDelimiter) OnMatch(consumes int) ast.Node { return &highlightNode{} }

type highlightParser struct{}

func (highlightParser) Trigger() []byte { return []byte{'='} }

func (highlightParser) Parse(parent ast.Node, block text.Reader, pc gmparser.Context) ast.Node {
	before := block.PrecendingCharacter()
	line, segment := block.PeekLine()
	node := gmparser.ScanDelimiter(line, before, 2, highlightDelimiter{})
	if node == nil || node.OriginalLength != 2 || before == '=' {
		return nil
	}
	node.Segment = segment.WithStop(segment.Start + node.OriginalLength)
	block.Advance(node.OriginalLength)
	pc.PushDelimiter(node)
	return node
}

func (highlightParser) CloseBlock(parent ast.Node, pc gmparser.Context) {}
