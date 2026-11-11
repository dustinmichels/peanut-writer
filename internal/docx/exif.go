package docx

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/draw"
	"image/jpeg"
)

// maxUprightPixels is the most pixels upright turns (a 108 MP phone photo
// fits): turning holds the decoded image and two RGBA copies (about 12 bytes
// a pixel), and a tiny file can claim a huge size.
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
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	in := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(in, in.Bounds(), src, b.Min, draw.Src)
	dw, dh := w, h
	if o >= 5 { // a quarter turn
		dw, dh = h, w
	}
	out := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := range h {
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
			copy(out.Pix[out.PixOffset(dx, dy):][:4], in.Pix[in.PixOffset(x, y):][:4])
		}
	}
	var buf bytes.Buffer
	if jpeg.Encode(&buf, out, &jpeg.Options{Quality: 92}) != nil {
		return data
	}
	return buf.Bytes()
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
