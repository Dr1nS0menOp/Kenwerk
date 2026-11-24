// SPDX-License-Identifier: Apache-2.0

package identity

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // G505: RFC 6238 defines the codes of authenticator apps on HMAC-SHA-1
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/qr"
)

// rfcSeed is the SHA-1 seed of the test vectors of RFC 6238, appendix B, "12345678901234567890",
// in base32. It has the shape the previous library gave every seed it made: 20 bytes, upper-case
// base32 without padding, which is how existing seeds are stored.
const rfcSeed = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

func serviceAt(at time.Time) *Service {
	return &Service{now: func() time.Time { return at }, issuer: "Kenwerk"}
}

// referenceCode is the six-digit code of a step by RFC 4226, section 5.3, written out here so
// the tests do not trust the library they check.
func referenceCode(seed []byte, step int64) string {
	mac := hmac.New(sha1.New, seed) //nolint:gosec // G401: as the import, HMAC-SHA-1 is what RFC 6238 defines
	_ = binary.Write(mac, binary.BigEndian, step)
	sum := mac.Sum(nil)
	at := sum[len(sum)-1] & 0x0f
	value := binary.BigEndian.Uint32(sum[at:at+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", value%1_000_000)
}

// The vectors of RFC 6238, appendix B, for SHA-1, cut to the six digits authenticator apps show.
func TestACodeMatchesTheTestVectorsOfRFC6238(t *testing.T) {
	vectors := []struct {
		unix int64
		code string
	}{
		{59, "287082"},
		{1111111109, "081804"},
		{1111111111, "050471"},
		{1234567890, "005924"},
		{2000000000, "279037"},
		{20000000000, "353130"},
	}
	for _, v := range vectors {
		if got := referenceCode([]byte("12345678901234567890"), v.unix/totpPeriod); got != v.code {
			t.Fatalf("the reference itself is wrong at %d: %s", v.unix, got)
		}
		step, err := serviceAt(time.Unix(v.unix, 0)).matchTOTP(rfcSeed, v.code)
		if err != nil {
			t.Fatal(err)
		}
		if want := v.unix / totpPeriod; step != want {
			t.Errorf("at %d the code %s matched step %d, want %d", v.unix, v.code, step, want)
		}
	}
}

func TestAWrongCodeMatchesNoStep(t *testing.T) {
	step, err := serviceAt(time.Unix(1111111109, 0)).matchTOTP(rfcSeed, "081805")
	if err != nil || step != 0 {
		t.Fatalf("a wrong code matched step %d (%v)", step, err)
	}
}

// Clocks differ a little, so the code of one step before or after counts, under the step it
// belongs to; that step is what keeps a code from being used twice (TestTOTP in internal/app).
func TestACodeFromOneStepEitherSideIsAccepted(t *testing.T) {
	const at = 1111111109
	step := int64(at / totpPeriod)
	for _, offset := range []int64{-1, 1} {
		code := referenceCode([]byte("12345678901234567890"), step+offset)
		got, err := serviceAt(time.Unix(at, 0)).matchTOTP(rfcSeed, code)
		if err != nil {
			t.Fatal(err)
		}
		if got != step+offset {
			t.Errorf("the code of step %+d matched step %d, want %d", offset, got, step+offset)
		}
	}
}

func TestACodeTwoStepsAwayIsRefused(t *testing.T) {
	const at = 1111111109
	step := int64(at / totpPeriod)
	for _, offset := range []int64{-2, 2} {
		code := referenceCode([]byte("12345678901234567890"), step+offset)
		got, err := serviceAt(time.Unix(at, 0)).matchTOTP(rfcSeed, code)
		if err != nil {
			t.Fatal(err)
		}
		if got != 0 {
			t.Errorf("the code of step %+d was accepted", offset)
		}
	}
}

// People type codes with spaces, as some apps show them, and a seed may come in lower case.
func TestACodeWithSpacesAndALowerCaseSeedStillMatch(t *testing.T) {
	step, err := serviceAt(time.Unix(59, 0)).matchTOTP(strings.ToLower(rfcSeed), " 287 082 ")
	if err != nil || step != 1 {
		t.Fatalf("matched step %d (%v), want 1", step, err)
	}
}

func TestASeedThatIsNotBase32IsAnError(t *testing.T) {
	if _, err := serviceAt(time.Unix(59, 0)).matchTOTP("not base32!", "287082"); err == nil {
		t.Fatal("a broken seed matched without an error")
	}
}

func TestANewKeyHolds160RandomBits(t *testing.T) {
	a, err := makeTOTPKey("Kenwerk", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	b, err := makeTOTPKey("Kenwerk", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if a.Secret == b.Secret {
		t.Fatal("two keys share a seed")
	}
	raw, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(a.Secret)
	if err != nil {
		t.Fatalf("the seed is not unpadded upper-case base32: %v", err)
	}
	if len(raw) != 20 {
		t.Fatalf("the seed holds %d bytes, want 20", len(raw))
	}
}

// A new seed gives the codes RFC 4226 says it gives, so every authenticator app agrees.
func TestANewKeyGivesTheCodesOfItsSeed(t *testing.T) {
	key, err := makeTOTPKey("Kenwerk", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(key.Secret)
	const at = 1_800_000_000
	step, err := serviceAt(time.Unix(at, 0)).matchTOTP(key.Secret, referenceCode(raw, at/totpPeriod))
	if err != nil || step != at/totpPeriod {
		t.Fatalf("the code of a new seed matched step %d (%v)", step, err)
	}
}

// The address follows the key URI format that authenticator apps read, exactly as the previous
// library wrote it: a space is %20, which some apps need.
func TestTheEnrolmentAddressNamesTheIssuerTheAccountAndTheSeed(t *testing.T) {
	key, err := makeTOTPKey("My Wiki", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	want := "otpauth://totp/My%20Wiki:a@example.com?algorithm=SHA1&digits=6&issuer=My%20Wiki&period=30&secret=" + key.Secret
	if key.URL != want {
		t.Fatalf("address\n got %s\nwant %s", key.URL, want)
	}
	u, err := url.Parse(key.URL)
	if err != nil {
		t.Fatal(err)
	}
	if u.Path != "/My Wiki:a@example.com" || u.Query().Get("issuer") != "My Wiki" || u.Query().Get("secret") != key.Secret {
		t.Fatalf("the address reads back as %s %v", u.Path, u.Query())
	}
}

func TestTheQRCodeHoldsTheEnrolmentAddress(t *testing.T) {
	const address = "otpauth://totp/Kenwerk:a@example.com?algorithm=SHA1&digits=6&issuer=Kenwerk&period=30&secret=" + rfcSeed
	got, err := totpQRCode(address)
	if err != nil {
		t.Fatal(err)
	}
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(got, prefix) {
		t.Fatalf("not a PNG data address: %.40s", got)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(got, prefix))
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if b := img.Bounds(); b.Dx() != 240 || b.Dy() != 240 {
		t.Fatalf("the QR code is %dx%d, want 240x240", b.Dx(), b.Dy())
	}
	// No QR reader is a dependency, so the picture is compared with the code of the address.
	if !bytes.Equal(darkPixels(img), darkPixels(qrOf(t, address))) {
		t.Fatal("the QR code is not that of the address")
	}
	if bytes.Equal(darkPixels(img), darkPixels(qrOf(t, address+"X"))) {
		t.Fatal("the comparison cannot tell two addresses apart")
	}
}

func qrOf(t *testing.T, content string) image.Image {
	t.Helper()
	code, err := qr.Encode(content, qr.M, qr.Auto)
	if err != nil {
		t.Fatal(err)
	}
	scaled, err := barcode.Scale(code, 240, 240)
	if err != nil {
		t.Fatal(err)
	}
	return scaled
}

// darkPixels is a picture as one byte per pixel: 1 where it is dark.
func darkPixels(img image.Image) []byte {
	b := img.Bounds()
	out := make([]byte, 0, b.Dx()*b.Dy())
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r, g, bl, _ := img.At(x, y).RGBA()
			var dark byte
			if r+g+bl < 3*0x8000 {
				dark = 1
			}
			out = append(out, dark)
		}
	}
	return out
}
