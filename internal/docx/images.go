package docx

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/gif" // image formats Word shows as they are
	_ "image/jpeg"
	_ "image/png"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// pic is an image Word shows (PNG, JPEG or GIF) and its pixel size. It goes
// into word/media, as name, when first drawn.
type pic struct {
	data   []byte
	format string
	px, py int
	name   string
}

// native is a PNG, JPEG or GIF image as it is; nil for anything else (or a
// file that can't be read).
func (w *writer) native(path string) *pic {
	if p, ok := w.pics[path]; ok {
		return p
	}
	var p *pic
	if data, err := os.ReadFile(path); err == nil {
		p = decodePic(data)
	}
	w.pics[path] = p
	return p
}

// raster is an image Word can't show, drawn widthPt points wide by
// Options.Rasterize; nil when it can't be.
func (w *writer) raster(path string, widthPt float64) *pic {
	if w.opt.Rasterize == nil || widthPt <= 0 {
		return nil
	}
	key := fmt.Sprintf("%s\x00%.1f", path, widthPt)
	if p, ok := w.pics[key]; ok {
		return p
	}
	var p *pic
	if data, err := w.opt.Rasterize(path, widthPt); err == nil {
		p = decodePic(data)
	}
	w.pics[key] = p
	return p
}

// decodePic is data as a pic, nil when it isn't an image Word shows.
func decodePic(data []byte) *pic {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return nil
	}
	switch format {
	case "png", "jpeg", "gif":
		return &pic{data: data, format: format, px: cfg.Width, py: cfg.Height}
	}
	return nil
}

// picture is a figure's image as a run: widthPt wide (0 for its natural
// size at 96 dpi), shrunk to fit the text width and most of the page height.
func (w *writer) picture(path string, widthPt float64, alt string) string {
	maxW, maxH := w.textWidthPt(), w.textHeightPt()*0.85
	p := w.native(path)
	if p != nil {
		if widthPt <= 0 {
			widthPt = float64(p.px) * 0.75
		}
	} else {
		if widthPt <= 0 {
			widthPt = maxW
			if sw, _, ok := svgSize(path); ok {
				widthPt = sw
			}
		}
		widthPt = min(widthPt, maxW)
		if p = w.raster(path, widthPt); p == nil {
			return w.imagePlaceholder(path, runProps{})
		}
	}
	widthPt = min(widthPt, maxW)
	heightPt := widthPt * float64(p.py) / float64(p.px)
	if heightPt > maxH {
		widthPt, heightPt = widthPt*maxH/heightPt, maxH
	}
	return w.drawingRun(p, widthPt, heightPt, alt, runProps{})
}

// inlineImage is an image in a line of text, about as tall as the text.
func (w *writer) inlineImage(path string, rp runProps) string {
	if path == "" {
		rp.i = true
		return w.run("[missing image]", rp)
	}
	h := 1.2 * w.st.FontSize
	p := w.native(path)
	if p == nil {
		guess := h
		if sw, sh, ok := svgSize(path); ok {
			guess = h * sw / sh
		}
		if p = w.raster(path, guess); p == nil {
			return w.imagePlaceholder(path, rp)
		}
		// Draw it again at the width it will have, if the guess was off.
		if want := h * float64(p.px) / float64(p.py); math.Abs(want-guess) > 0.1*guess {
			if q := w.raster(path, want); q != nil {
				p = q
			}
		}
	}
	return w.drawingRun(p, h*float64(p.px)/float64(p.py), h, filepath.Base(path), rp)
}

func (w *writer) imagePlaceholder(path string, rp runProps) string {
	rp.i = true
	return w.run("[image: "+filepath.Base(path)+"]", rp)
}

// drawingRun is a run holding an inline picture.
func (w *writer) drawingRun(p *pic, widthPt, heightPt float64, alt string, rp runProps) string {
	if p.name == "" {
		w.media = append(w.media, p)
		p.name = fmt.Sprintf("image%d.%s", len(w.media), p.format)
	}
	rid := w.part.add(relImage, "media/"+p.name, false)
	w.drawing++
	id := w.drawing
	cx, cy := emu(widthPt), emu(heightPt)
	rp.code = false
	return fmt.Sprintf(`<w:r>%s<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`+
		`<wp:extent cx="%[2]d" cy="%[3]d"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`+
		`<wp:docPr id="%[4]d" name="Picture %[4]d" descr="%[5]s"/>`+
		`<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`+
		`<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>`+
		`<pic:nvPicPr><pic:cNvPr id="%[4]d" name="%[6]s"/><pic:cNvPicPr/></pic:nvPicPr>`+
		`<pic:blipFill><a:blip r:embed="%[7]s"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`+
		`<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%[2]d" cy="%[3]d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`+
		`</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`,
		w.rPr(rp), cx, cy, id, esc(alt), esc(p.name), rid)
}

// svgSize reads an SVG file's natural size in points from its root
// element's width and height (or viewBox, as pixels).
func svgSize(path string) (wPt, hPt float64, ok bool) {
	if !strings.EqualFold(filepath.Ext(path), ".svg") {
		return 0, 0, false
	}
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, false
	}
	defer f.Close()
	dec := xml.NewDecoder(f)
	dec.Strict = false
	var root xml.StartElement
	for {
		tok, err := dec.Token()
		if err != nil {
			return 0, 0, false
		}
		if se, isStart := tok.(xml.StartElement); isStart {
			root = se
			break
		}
	}
	if root.Name.Local != "svg" {
		return 0, 0, false
	}
	var vbW, vbH float64
	for _, a := range root.Attr {
		switch a.Name.Local {
		case "width":
			wPt = svgLength(a.Value)
		case "height":
			hPt = svgLength(a.Value)
		case "viewBox":
			f := strings.FieldsFunc(a.Value, func(r rune) bool { return r == ' ' || r == ',' })
			if len(f) == 4 {
				vbW, _ = strconv.ParseFloat(f[2], 64)
				vbH, _ = strconv.ParseFloat(f[3], 64)
			}
		}
	}
	switch {
	case wPt > 0 && hPt > 0:
	case vbW > 0 && vbH > 0 && wPt > 0:
		hPt = wPt * vbH / vbW
	case vbW > 0 && vbH > 0 && hPt > 0:
		wPt = hPt * vbW / vbH
	case vbW > 0 && vbH > 0:
		wPt, hPt = vbW*0.75, vbH*0.75
	default:
		return 0, 0, false
	}
	return wPt, hPt, true
}

// svgLength is an SVG length in points; 0 for none or a percentage.
func svgLength(s string) float64 {
	s = strings.TrimSpace(s)
	units := map[string]float64{"px": 0.75, "pt": 1, "pc": 12, "in": 72, "cm": 72 / 2.54, "mm": 72 / 25.4}
	scale := 0.75
	if len(s) > 2 {
		if u, ok := units[s[len(s)-2:]]; ok {
			s, scale = s[:len(s)-2], u
		}
	}
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil || v <= 0 {
		return 0
	}
	return v * scale
}
