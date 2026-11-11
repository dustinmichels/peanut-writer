package docx

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"image"
	imgcolor "image/color"
	"image/jpeg"
	"testing"
)

// withOrientation is JPEG data with an EXIF block saying orientation o.
func withOrientation(data []byte, o byte) []byte {
	// APP1: Exif, big-endian TIFF, one directory entry: Orientation = o.
	exif := []byte("Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08\x00\x01")
	exif = binary.BigEndian.AppendUint16(exif, 0x0112)
	exif = binary.BigEndian.AppendUint16(exif, 3) // SHORT
	exif = binary.BigEndian.AppendUint32(exif, 1)
	exif = append(exif, 0, o, 0, 0, 0, 0, 0, 0)
	app1 := binary.BigEndian.AppendUint16([]byte{0xFF, 0xE1}, uint16(len(exif)+2))
	return append(append(append([]byte{}, data[:2]...), append(app1, exif...)...), data[2:]...)
}

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

	data := withOrientation(stored.Bytes(), 6)

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

// An 11×7 JPEG with 4:1:1 chroma (ImageMagick -sampling-factor 4x1): four
// colored corners.
const jpeg411 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAAHAAsDAUEAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAEH/8QAJBAAAQMDAgcBAAAAAAAAAAAAAgEEBQADBwYJCBEUGiJXltX/xAAVAQEBAAAAAAAAAAAAAAAAAAADB//EACURAAIBAwIFBQAAAAAAAAAAAAIDAQQFEQcSAAYIISIJEzFRUv/aAAwDAQACEQMRAD8AxvJUnkDarfaa4ucWTcNqaeYzxxrCO1BDXRaD1LF2B3LiWXImfK2hogoQ+RCSqqColO6U3AfT+HPn5X9OlKommPpTdPGt2ndq5+vd0uqqu6IVUsBL6QVATBgtoQdCw9sdo8jKZ+e2cQd26hLtqjXnzaqhCmGuw2FSRNle4Y8ZZEK34/Xthn6jj//Z"

// Every orientation of a photo with chroma subsampling, odd-sized (as
// pictures cropped on a phone are), turns without a crash, and every pixel
// keeps its color: a mirrored chroma plane still lines up with the light.
func TestUprightSubsampled(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 13, 9))
	for y := range 9 {
		for x := range 13 {
			img.Set(x, y, imgcolor.RGBA{uint8(x * 255 / 12), uint8(y * 255 / 8), uint8(255 * (x % 2)), 255})
		}
	}
	var go420 bytes.Buffer // Go writes 4:2:0
	if err := jpeg.Encode(&go420, img, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	im411, err := base64.StdEncoding.DecodeString(jpeg411)
	if err != nil {
		t.Fatal(err)
	}
	for _, stored := range [][]byte{go420.Bytes(), im411} {
		src, err := jpeg.Decode(bytes.NewReader(stored))
		if err != nil {
			t.Fatal(err)
		}
		b := src.Bounds()
		idx := make([]byte, 0, 4*b.Dx()*b.Dy()) // each pixel's own position
		for i := range b.Dx() * b.Dy() {
			idx = binary.LittleEndian.AppendUint32(idx, uint32(i))
		}
		ratio := src.(*image.YCbCr).SubsampleRatio
		for o := 2; o <= 8; o++ {
			if _, err := jpeg.Decode(bytes.NewReader(upright(withOrientation(stored, byte(o))))); err != nil {
				t.Fatalf("%v, orientation %d: %v", ratio, o, err)
			}
			got := turned(src, o)
			from, _, dw, dh := turn(idx, 4*b.Dx(), b.Dx(), b.Dy(), 4, o)
			gb := got.Bounds()
			if gb.Dx() != dw || gb.Dy() != dh {
				t.Fatalf("%v, orientation %d: %v, want %d×%d", ratio, o, gb, dw, dh)
			}
			wrong := 0
			for y := range dh {
				for x := range dw {
					i := int(binary.LittleEndian.Uint32(from[4*(y*dw+x):]))
					r1, g1, b1, _ := got.At(gb.Min.X+x, gb.Min.Y+y).RGBA()
					r2, g2, b2, _ := src.At(i%b.Dx(), i/b.Dx()).RGBA()
					// Within 1 in 255: 4:1:1 turns a quarter in RGB.
					for _, d := range []int{int(r1>>8) - int(r2>>8), int(g1>>8) - int(g2>>8), int(b1>>8) - int(b2>>8)} {
						if d < -1 || d > 1 {
							wrong++
							break
						}
					}
				}
			}
			if wrong > 0 {
				t.Errorf("%v, orientation %d: %d of %d pixels changed color", ratio, o, wrong, dw*dh)
			}
		}
	}
}
