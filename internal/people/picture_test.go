// SPDX-License-Identifier: Apache-2.0

package people

import (
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/png"
	"testing"

	"github.com/kenwerk/kenwerk/internal/apperr"
)

func pngOf(t *testing.T, width, height int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewNRGBA(image.Rect(0, 0, width, height))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestACropMustLieInsideThePicture(t *testing.T) {
	size := image.Config{Width: 300, Height: 200}
	for _, crop := range []Crop{
		{X: -1, Y: 0, Size: 10}, {X: 0, Y: -1, Size: 10}, {X: 0, Y: 0, Size: -1},
		{X: 201, Y: 0, Size: 100}, {X: 0, Y: 101, Size: 100},
	} {
		if _, err := fitCrop(crop, size); err == nil {
			t.Errorf("%+v was taken", crop)
		}
	}
	for _, crop := range []Crop{{X: 200, Y: 100, Size: 100}, {X: 0, Y: 0, Size: 1}} {
		if got, err := fitCrop(crop, size); err != nil || got != crop {
			t.Errorf("%+v: %+v, %v", crop, got, err)
		}
	}
}

func TestNoCropIsTheLargestSquareAtTheTopLeft(t *testing.T) {
	got, err := fitCrop(Crop{}, image.Config{Width: 300, Height: 200})
	if err != nil || got != (Crop{Size: 200}) {
		t.Fatalf("%+v, %v", got, err)
	}
}

func TestOnlyAPictureOfAKnownFormatAndSizeIsRead(t *testing.T) {
	if size, err := pictureSize(pngOf(t, 3, 2)); err != nil || size.Width != 3 || size.Height != 2 {
		t.Fatalf("a PNG: %+v, %v", size, err)
	}
	if _, err := pictureSize([]byte("<svg></svg>")); kindOf(err) != apperr.KindInvalid {
		t.Fatalf("not a picture: %v", err)
	}
	header := pngOf(t, 1, 1)
	// A header that claims 100,000 by 100,000 pixels.
	copy(header[16:24], []byte{0x00, 0x01, 0x86, 0xA0, 0x00, 0x01, 0x86, 0xA0})
	// The checksum of the header chunk covers its type and its 13 bytes of data.
	binary.BigEndian.PutUint32(header[29:33], crc32.ChecksumIEEE(header[12:29]))
	if _, err := pictureSize(header); kindOf(err) != apperr.KindTooLarge {
		t.Fatalf("a giant picture: %v", err)
	}
}

func kindOf(err error) apperr.Kind {
	if e, ok := apperr.As(err); ok {
		return e.Kind
	}
	return 0
}
