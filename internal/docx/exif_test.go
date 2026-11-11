package docx

import (
	"bytes"
	"encoding/binary"
	"image"
	imgcolor "image/color"
	"image/jpeg"
	"testing"
)

// A photo stored on its side (EXIF orientation 6, as phones write it) is
// turned so Word lays it out upright: 16×8 stored, red left and blue right,
// becomes 8×16 with red on top.
func TestUpright(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 16, 8))
	for y := range 8 {
		for x := range 16 {
			c := imgcolor.RGBA{255, 0, 0, 255}
			if x >= 8 {
				c = imgcolor.RGBA{0, 0, 255, 255}
			}
			img.Set(x, y, c)
		}
	}
	var stored bytes.Buffer
	if err := jpeg.Encode(&stored, img, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	if got := upright(stored.Bytes()); !bytes.Equal(got, stored.Bytes()) {
		t.Error("a JPEG without EXIF was re-encoded")
	}

	// APP1: Exif, big-endian TIFF, one directory entry: Orientation = 6.
	exif := []byte("Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08\x00\x01")
	exif = binary.BigEndian.AppendUint16(exif, 0x0112)
	exif = binary.BigEndian.AppendUint16(exif, 3) // SHORT
	exif = binary.BigEndian.AppendUint32(exif, 1)
	exif = append(exif, 0, 6, 0, 0, 0, 0, 0, 0)
	app1 := binary.BigEndian.AppendUint16([]byte{0xFF, 0xE1}, uint16(len(exif)+2))
	data := append(append(append([]byte{}, stored.Bytes()[:2]...), append(app1, exif...)...), stored.Bytes()[2:]...)

	p := decodePic(upright(data))
	if p == nil || p.px != 8 || p.py != 16 {
		t.Fatalf("size: %+v, want 8×16", p)
	}
	out, err := jpeg.Decode(bytes.NewReader(p.data))
	if err != nil {
		t.Fatal(err)
	}
	if jpegOrientation(p.data) != 1 {
		t.Error("the turned copy still says to turn it")
	}
	for _, c := range []struct {
		y    int
		red  bool
		name string
	}{{2, true, "top"}, {13, false, "bottom"}} {
		r, _, b, _ := out.At(4, c.y).RGBA()
		if (r > b) != c.red {
			t.Errorf("%s: r=%d b=%d, want red=%v", c.name, r>>8, b>>8, c.red)
		}
	}
}
