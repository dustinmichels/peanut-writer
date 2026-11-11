package docx

import (
	"fmt"
	"strings"

	"peanut-writer/internal/doc"
)

// Word gets LaTeX math as pictures drawn by Options.Equations (Word's own
// equations would need the LaTeX converted to Office Math), or as its
// source when it can't be drawn.

// mathPPI is the resolution Options.Equations draws at.
const mathPPI = 192

func mathKey(tex string, display bool) string { return fmt.Sprintf("math\x00%t\x00%s", display, tex) }

// drawMath draws all the math in bs, in one call of Options.Equations.
func (w *writer) drawMath(bs []doc.Block) {
	if w.opt.Equations == nil {
		return
	}
	ms := doc.ReadableMath(bs)
	if len(ms) == 0 {
		return
	}
	pics := w.opt.Equations(ms, w.st.FontSize)
	for i, m := range ms {
		var p *pic
		if i < len(pics) && pics[i] != nil {
			p = decodePic(pics[i])
		}
		w.pics[mathKey(m.TeX, m.Display)] = p
	}
}

// equationPic is tex as drawMath drew it; nil when it couldn't be.
func (w *writer) equationPic(tex string, display bool) *pic {
	return w.pics[mathKey(tex, display)]
}

// picSize is p's size in points as drawn by Options.Equations, shrunk to
// fit the text width.
func (w *writer) picSize(p *pic) (float64, float64) {
	wPt, hPt := float64(p.px)*72/mathPPI, float64(p.py)*72/mathPPI
	if maxW := float64(w.availW()) / 20; wPt > maxW {
		wPt, hPt = maxW, hPt*maxW/wPt
	}
	return wPt, hPt
}

// math is math in a line. Its picture's middle is its baseline, so the
// picture is lowered by half its height; display math (`$$…$$` in text) is
// centered on the line instead, a quarter of the text size above the
// baseline (about where a fraction's bar sits).
func (w *writer) math(x doc.Inline, rp runProps) string {
	if x.Error == "" {
		if p := w.equationPic(x.Text, x.Display); p != nil {
			wPt, hPt := w.picSize(p)
			rp.lower = hPt / 2
			if x.Display {
				rp.lower -= w.st.FontSize / 4
			}
			return w.drawingRun(p, wPt, hPt, x.Text, rp)
		}
	}
	rp.code = true
	return w.run(strings.ReplaceAll(x.Text, "\n", " "), rp)
}

// equation writes an equation block centered on its line; a numbered one
// is set left, with a tab stop centering it and another putting its
// number, "(N)", at the right margin, the number bookmarked when labelled,
// for REF fields to point at.
func (w *writer) equation(b *doc.Block) {
	var runs string
	if p := w.equationPic(b.Text, true); b.Error == "" && p != nil {
		wPt, hPt := w.picSize(p)
		runs = w.drawingRun(p, wPt, hPt, b.Text, runProps{})
	} else {
		runs = w.run(b.Text, runProps{code: true})
	}
	if b.Number == 0 {
		w.para("Equation", w.ind("", 0), runs)
		return
	}
	var sb strings.Builder
	sb.WriteString("<w:r><w:tab/></w:r>" + runs + "<w:r><w:tab/></w:r>" + w.run("(", runProps{}))
	name := w.bookmarks[b.Label]
	if name != "" && !w.placed[b.Label] {
		w.placed[b.Label] = true
		w.bookmarkID++
		fmt.Fprintf(&sb, `<w:bookmarkStart w:id="%d" w:name="%s"/>`, w.bookmarkID, name)
	} else {
		name = ""
	}
	w.seq(&sb, "Equation", b.Number)
	if name != "" {
		fmt.Fprintf(&sb, `<w:bookmarkEnd w:id="%d"/>`, w.bookmarkID)
	}
	sb.WriteString(w.run(")", runProps{}))
	// Tab stops are measured from the margin, not the indent.
	w.para("Equation", fmt.Sprintf(`<w:tabs><w:tab w:val="center" w:pos="%d"/><w:tab w:val="right" w:pos="%d"/></w:tabs>%s<w:jc w:val="left"/>`,
		w.indent+w.availW()/2, w.textW-w.right, w.ind("", 0)), sb.String())
}
