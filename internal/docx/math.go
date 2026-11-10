package docx

import (
	"fmt"
	"strconv"
	"strings"

	"peanut-writer/internal/doc"
)

// Word gets LaTeX math as pictures drawn by Options.Equation (Word's own
// equations would need the LaTeX converted to Office Math), or as its
// source when it can't be drawn.

// mathPPI is the resolution Options.Equation draws at.
const mathPPI = 192

// equationPic is tex drawn by Options.Equation; nil when it can't be.
func (w *writer) equationPic(tex string, display bool) *pic {
	if w.opt.Equation == nil {
		return nil
	}
	key := fmt.Sprintf("math\x00%t\x00%s", display, tex)
	if p, ok := w.pics[key]; ok {
		return p
	}
	var p *pic
	if data, err := w.opt.Equation(tex, display, w.st.FontSize); err == nil {
		p = decodePic(data)
	}
	w.pics[key] = p
	return p
}

// picSize is p's size in points as drawn by Options.Equation, shrunk to
// fit the text width.
func (w *writer) picSize(p *pic) (float64, float64) {
	wPt, hPt := float64(p.px)*72/mathPPI, float64(p.py)*72/mathPPI
	if maxW := w.textWidthPt(); wPt > maxW {
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
		w.para("Equation", "", runs)
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
	w.field(&sb, `SEQ Equation \* ARABIC`, strconv.Itoa(b.Number), runProps{})
	if name != "" {
		fmt.Fprintf(&sb, `<w:bookmarkEnd w:id="%d"/>`, w.bookmarkID)
	}
	sb.WriteString(w.run(")", runProps{}))
	w.para("Equation", fmt.Sprintf(`<w:tabs><w:tab w:val="center" w:pos="%d"/><w:tab w:val="right" w:pos="%d"/></w:tabs><w:jc w:val="left"/>`, w.textW/2, w.textW), sb.String())
}
