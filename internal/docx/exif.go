package docx

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/draw"
	"image/jpeg"
)

// maxUprightPixels is the most pixels upright turns (a 108 MP phone photo
// fits): turning holds the decoded image and a turned copy of it (3 bytes a
// pixel for a typical photo, 8 for CMYK), and a tiny file can claim a huge
// size.
const maxUprightPixels = 1 << 27

// upright is a JPEG turned the way its EXIF orientation says it's seen.
// Word lays a picture out by its stored pixels, so a phone photo stored on
// its side would come out stretched. The turned copy has no EXIF, so nothing
// turns it again. data itself when it's stored upright (or can't be read,
// or is too big to turn: see maxUprightPixels).
func upright(data []byte) []byte {
	o := jpegOrientation(data)
	if o == 1 {
		return data
	}
	if cfg, err := jpeg.DecodeConfig(bytes.NewReader(data)); err != nil || cfg.Width*cfg.Height > maxUprightPixels {
		return data
	}
	src, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		return data
	}
	var buf bytes.Buffer
	if jpeg.Encode(&buf, turned(src, o), &jpeg.Options{Quality: 92}) != nil {
		return data
	}
	return buf.Bytes()
}

// turned is a decoded JPEG turned to orientation o (2 to 8). The decoded
// pixels are turned as they are, without a copy in RGBA.
func turned(src image.Image, o int) image.Image {
	switch m := src.(type) {
	case *image.YCbCr:
		if ratio, ok := turnedRatio(m.SubsampleRatio, o); ok {
			w, h := m.Rect.Dx(), m.Rect.Dy()
			kx, ky := subsampling(m.SubsampleRatio)
			cw, ch := (w+kx-1)/kx, (h+ky-1)/ky // the chroma planes' size, as image.NewYCbCr makes them
			y, ys, dw, dh := turn(m.Y, m.YStride, w, h, 1, o)
			cb, cs, _, _ := turn(m.Cb, m.CStride, cw, ch, 1, o)
			cr, _, _, _ := turn(m.Cr, m.CStride, cw, ch, 1, o)
			// Mirrored along a subsampled side whose length isn't a multiple
			// of the subsampling, the part-used last chroma sample comes
			// first: the picture starts that far into it.
			if o >= 5 {
				kx, ky = ky, kx
			}
			var ox, oy int
			if o == 2 || o == 3 || o == 6 || o == 7 {
				ox = (kx - dw%kx) % kx
			}
			if o == 3 || o == 4 || o == 7 || o == 8 {
				oy = (ky - dh%ky) % ky
			}
			return &image.YCbCr{Y: y, Cb: cb, Cr: cr, YStride: ys, CStride: cs, SubsampleRatio: ratio, Rect: image.Rect(ox, oy, ox+dw, oy+dh)}
		}
	case *image.Gray:
		pix, s, dw, dh := turn(m.Pix, m.Stride, m.Rect.Dx(), m.Rect.Dy(), 1, o)
		return &image.Gray{Pix: pix, Stride: s, Rect: image.Rect(0, 0, dw, dh)}
	case *image.CMYK:
		pix, s, dw, dh := turn(m.Pix, m.Stride, m.Rect.Dx(), m.Rect.Dy(), 4, o)
		return &image.CMYK{Pix: pix, Stride: s, Rect: image.Rect(0, 0, dw, dh)}
	}
	// RGB, or chroma subsampled in a way that can't be turned.
	b := src.Bounds()
	in := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(in, in.Bounds(), src, b.Min, draw.Src)
	pix, s, dw, dh := turn(in.Pix, in.Stride, b.Dx(), b.Dy(), 4, o)
	return &image.RGBA{Pix: pix, Stride: s, Rect: image.Rect(0, 0, dw, dh)}
}

// turnedRatio is the chroma subsampling of a YCbCr image turned to
// orientation o; false when a quarter turn has none (4:1:1, 4:1:0).
func turnedRatio(r image.YCbCrSubsampleRatio, o int) (image.YCbCrSubsampleRatio, bool) {
	if o < 5 {
		return r, true
	}
	switch r {
	case image.YCbCrSubsampleRatio444, image.YCbCrSubsampleRatio420:
		return r, true
	case image.YCbCrSubsampleRatio422:
		return image.YCbCrSubsampleRatio440, true
	case image.YCbCrSubsampleRatio440:
		return image.YCbCrSubsampleRatio422, true
	}
	return r, false
}

// subsampling is how many pixels across and down share a chroma sample.
func subsampling(r image.YCbCrSubsampleRatio) (x, y int) {
	switch r {
	case image.YCbCrSubsampleRatio422:
		return 2, 1
	case image.YCbCrSubsampleRatio420:
		return 2, 2
	case image.YCbCrSubsampleRatio440:
		return 1, 2
	case image.YCbCrSubsampleRatio411:
		return 4, 1
	case image.YCbCrSubsampleRatio410:
		return 4, 2
	}
	return 1, 1
}

// turn is a w×h plane of n-byte pixels, rows stride bytes apart, turned to
// orientation o; with its row length in bytes and its size.
func turn(pix []byte, stride, w, h, n, o int) (out []byte, outStride, dw, dh int) {
	dw, dh = w, h
	if o >= 5 { // a quarter turn
		dw, dh = h, w
	}
	out = make([]byte, dw*dh*n)
	for y := range h {
		row := pix[y*stride:]
		for x := range w {
			var dx, dy int
			switch o {
			case 2: // mirrored
				dx, dy = w-1-x, y
			case 3: // upside down
				dx, dy = w-1-x, h-1-y
			case 4: // mirrored upside down
				dx, dy = x, h-1-y
			case 5: // mirrored, on its left side
				dx, dy = y, x
			case 6: // on its left side: turn right
				dx, dy = h-1-y, x
			case 7: // mirrored, on its right side
				dx, dy = h-1-y, w-1-x
			case 8: // on its right side: turn left
				dx, dy = y, w-1-x
			}
			copy(out[(dy*dw+dx)*n:][:n], row[x*n:][:n])
		}
	}
	return out, dw * n, dw, dh
}

// jpegOrientation is a JPEG's EXIF orientation, 1 to 8; 1 (as stored) when
// it has none or isn't a JPEG.
func jpegOrientation(data []byte) int {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 1
	}
	for i := 2; i+4 <= len(data); {
		if data[i] != 0xFF {
			return 1
		}
		marker := data[i+1]
		switch {
		case marker == 0xFF: // fill
			i++
			continue
		case marker == 0x01 || marker >= 0xD0 && marker <= 0xD7: // no length
			i += 2
			continue
		case marker == 0xDA || marker == 0xD9: // the image data: EXIF comes before it
			return 1
		}
		n := int(binary.BigEndian.Uint16(data[i+2:]))
		if n < 2 || i+2+n > len(data) {
			return 1
		}
		if seg := data[i+4 : i+2+n]; marker == 0xE1 && bytes.HasPrefix(seg, []byte("Exif\x00\x00")) {
			return tiffOrientation(seg[6:])
		}
		i += 2 + n
	}
	return 1
}

// tiffOrientation is the Orientation tag (0x0112) of an EXIF block's first
// image directory; 1 when there's none.
func tiffOrientation(t []byte) int {
	if len(t) < 8 {
		return 1
	}
	var bo binary.ByteOrder
	switch string(t[:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return 1
	}
	ifd := int(bo.Uint32(t[4:]))
	if ifd < 8 || ifd+2 > len(t) {
		return 1
	}
	for k := range int(bo.Uint16(t[ifd:])) {
		e := ifd + 2 + 12*k
		if e+12 > len(t) {
			return 1
		}
		if bo.Uint16(t[e:]) == 0x0112 {
			if o := int(bo.Uint16(t[e+8:])); o >= 1 && o <= 8 {
				return o
			}
			return 1
		}
	}
	return 1
}
