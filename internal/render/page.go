package render

import (
	"hash/maphash"
	"regexp"
	"strconv"
	"strings"
)

// Page is a page of the preview: its SVG, without the marks Typst drew on
// it, and where they were.
type Page struct {
	// Key is the same for the same SVG, so the editor can keep a page it has.
	Key    string  `json:"key"`
	SVG    string  `json:"svg"`
	Width  float64 `json:"width"` // points
	Height float64 `json:"height"`
	Marks  []Mark  `json:"marks"` // in source order
}

// Mark is where a marked block (see peanut.typ's _mark) starts on its page:
// the top left of its first line, in points from the page's top left.
type Mark struct {
	Line int     `json:"line"` // its source line
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

var (
	keySeed     = maphash.MakeSeed()
	viewBox     = regexp.MustCompile(`viewBox="0 0 ([\d.]+) ([\d.]+)"`)
	transformFn = regexp.MustCompile(`(\w+)\(([^)]*)\)`)
)

// markOpen starts a mark: an invisible link to `peanut:<line>`.
const markOpen = `<a href="peanut:`

// readPage reads a page Typst drew for the preview. Its marks are taken out:
// they hold source line numbers, so with them a page would change whenever
// lines were added or removed above it, though it looks the same.
func readPage(svg string) Page {
	p := Page{Width: 612, Height: 792}
	if m := viewBox.FindStringSubmatch(svg[:min(len(svg), 300)]); m != nil {
		p.Width, _ = strconv.ParseFloat(m[1], 64)
		p.Height, _ = strconv.ParseFloat(m[2], 64)
	}
	if strings.Contains(svg, markOpen) {
		svg, p.Marks = takeMarks(svg)
	}
	p.SVG = svg
	p.Key = strconv.FormatUint(maphash.String(keySeed, svg), 36)
	return p
}

// takeMarks returns svg without its marks, and where they were: each mark's
// origin mapped through the transforms of the elements around it. Typst's
// SVG has no comments, text or CDATA, so its tags are all there is to read.
func takeMarks(svg string) (string, []Mark) {
	var b strings.Builder
	b.Grow(len(svg))
	var marks []Mark
	var transforms []string // the open elements'
	kept := 0               // svg[:kept] is in b, or left out
	for i := 0; i < len(svg); {
		lt := strings.IndexByte(svg[i:], '<')
		if lt < 0 {
			break
		}
		i += lt
		end := tagEnd(svg, i)
		tag := svg[i:end]
		switch {
		case strings.HasPrefix(tag, "</"):
			if len(transforms) > 0 {
				transforms = transforms[:len(transforms)-1]
			}
		case strings.HasPrefix(tag, markOpen):
			closeAt := strings.Index(svg[end:], "</a>")
			n := strings.IndexByte(tag[len(markOpen):], '"')
			if closeAt < 0 || n < 0 { // not a mark after all: an element like any other
				transforms = append(transforms, "")
				break
			}
			line, _ := strconv.Atoi(tag[len(markOpen) : len(markOpen)+n])
			var x, y float64
			for j := len(transforms) - 1; j >= 0; j-- {
				x, y = applyTransform(transforms[j], x, y)
			}
			marks = append(marks, Mark{line, x, y})
			b.WriteString(svg[kept:i])
			end += closeAt + len("</a>")
			kept = end
		case strings.HasSuffix(tag, "/>"), strings.HasPrefix(tag, "<?"), strings.HasPrefix(tag, "<!"):
		default:
			transforms = append(transforms, attr(tag, "transform"))
		}
		i = end
	}
	b.WriteString(svg[kept:])
	return b.String(), marks
}

// tagEnd is where the tag starting at s[i] ends: past its '>', skipping any
// in quoted attribute values.
func tagEnd(s string, i int) int {
	var quote byte
	for j := i + 1; j < len(s); j++ {
		switch c := s[j]; {
		case quote != 0:
			if c == quote {
				quote = 0
			}
		case c == '"' || c == '\'':
			quote = c
		case c == '>':
			return j + 1
		}
	}
	return len(s)
}

// attr is tag's attribute name, or "".
func attr(tag, name string) string {
	k := strings.Index(tag, " "+name+`="`)
	if k < 0 {
		return ""
	}
	v := tag[k+len(name)+3:]
	if end := strings.IndexByte(v, '"'); end >= 0 {
		return v[:end]
	}
	return ""
}

// applyTransform maps (x, y) through an SVG transform attribute.
func applyTransform(t string, x, y float64) (float64, float64) {
	if t == "" {
		return x, y
	}
	fns := transformFn.FindAllStringSubmatch(t, -1)
	for i := len(fns) - 1; i >= 0; i-- {
		var v []float64
		for _, f := range strings.FieldsFunc(fns[i][2], func(r rune) bool { return r == ' ' || r == ',' }) {
			n, _ := strconv.ParseFloat(f, 64)
			v = append(v, n)
		}
		switch {
		case fns[i][1] == "translate" && len(v) > 0:
			x += v[0]
			if len(v) > 1 {
				y += v[1]
			}
		case fns[i][1] == "scale" && len(v) > 0:
			sy := v[0]
			if len(v) > 1 {
				sy = v[1]
			}
			x, y = x*v[0], y*sy
		case fns[i][1] == "matrix" && len(v) == 6:
			x, y = v[0]*x+v[2]*y+v[4], v[1]*x+v[3]*y+v[5]
		}
	}
	return x, y
}
