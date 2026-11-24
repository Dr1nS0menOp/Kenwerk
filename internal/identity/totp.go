// SPDX-License-Identifier: Apache-2.0

package identity

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"image/png"
	"net/url"
	"strings"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/qr"
	"github.com/creachadair/otp"
)

const (
	totpDigits = 6
	// 160 bits, the length RFC 4226 recommends, and what every seed made before had.
	totpSeedBytes = 20
	// The side of the QR code in pixels, as the account screen shows it.
	totpQRSize = 240
)

// totpKey is a new authenticator entry: its seed in base32, as apps show it, and the address
// an app reads from the QR code.
type totpKey struct {
	Secret string
	URL    string
}

// makeTOTPKey makes a random seed and its address for an account at an issuer.
func makeTOTPKey(issuer, account string) (totpKey, error) {
	if issuer == "" || account == "" {
		return totpKey{}, errors.New("identity: an authenticator entry needs an issuer and an account")
	}
	seed := make([]byte, totpSeedBytes)
	// crypto/rand.Read never fails: it crashes the program instead.
	_, _ = rand.Read(seed)
	secret := otp.FormatKey(string(seed))
	return totpKey{Secret: secret, URL: totpAddress(issuer, account, secret)}, nil
}

// totpAddress is the otpauth address of the key URI format that authenticator apps read. It
// writes what the previous library wrote, in the same order, with a space as %20, which some
// apps need instead of the + of a query; unlike that library, it also escapes & and = in a name.
func totpAddress(issuer, account, secret string) string {
	u := url.URL{
		Scheme:   "otpauth",
		Host:     "totp",
		Path:     "/" + issuer + ":" + account,
		RawQuery: "algorithm=SHA1&digits=6&issuer=" + queryValue(issuer) + "&period=30&secret=" + queryValue(secret),
	}
	return u.String()
}

// queryValue escapes a value of a query, with a space as %20.
func queryValue(v string) string { return strings.ReplaceAll(url.QueryEscape(v), "+", "%20") }

// totpQRCode draws an address as a QR code, returned as the data address of a PNG.
func totpQRCode(address string) (string, error) {
	code, err := qr.Encode(address, qr.M, qr.Auto)
	if err != nil {
		return "", err
	}
	scaled, err := barcode.Scale(code, totpQRSize, totpQRSize)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, scaled); err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

// totpCode is the code of a seed at one time step (RFC 6238 with SHA-1 and six digits). The
// seed is base32; spaces and lower case are allowed, as apps write it either way.
func totpCode(secret string, step int64) (string, error) {
	if step < 0 {
		return "", errors.New("identity: a time step before 1970")
	}
	cfg, err := otp.Config{Digits: totpDigits}.WithKey(secret)
	if err != nil {
		return "", err
	}
	return cfg.HOTP(uint64(step)), nil
}
