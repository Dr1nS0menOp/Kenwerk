// SPDX-License-Identifier: Apache-2.0

package connections

import (
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/settings"
)

// The limits of the parts (spec 101, Limits).
const (
	maxAddressLength = 2048
	maxClientIDRunes = 255
	maxButtonRunes   = 100
	minTokenLength   = 32
	maxTokenLength   = 256
)

var (
	// groupsClaim is the name of a claim: letters, digits and a few separators that providers use.
	groupsClaim = regexp.MustCompile(`^[A-Za-z0-9_.:/-]{0,100}$`)
	// bearerToken is the token68 alphabet of RFC 6750, which a scraper sends after "Bearer ".
	bearerToken = regexp.MustCompile(`^[A-Za-z0-9._~+/-]+=*$`)
)

var (
	errAddress = apperr.Invalid("An address looks like https://example.com or https://example.com/path, " +
		"without a user name, a query or a fragment.")
	errPlain  = apperr.Invalid("An address starts with https://. Plain http needs KENWERK_OUTWARD_ALLOW_PRIVATE.")
	errInside = apperr.Invalid("The address is on this machine or a private network, which outgoing connections may not reach. " +
		"Set KENWERK_OUTWARD_ALLOW_PRIVATE, or set it in the environment.")
)

// checkProvider refuses an identity provider that breaks a limit, and returns it cleaned. The
// issuer is kept as typed apart from spaces: the provider must name the very same issuer.
func (s *Service) checkProvider(ch IdentityProviderChange) (IdentityProviderChange, error) {
	ch.Issuer, ch.ClientID = strings.TrimSpace(ch.Issuer), strings.TrimSpace(ch.ClientID)
	ch.DisplayName, ch.GroupsClaim = strings.TrimSpace(ch.DisplayName), strings.TrimSpace(ch.GroupsClaim)
	if ch.Issuer != "" {
		if _, err := s.checkAddress(ch.Issuer); err != nil {
			return ch, err
		}
		if ch.ClientID == "" {
			return ch, apperr.Invalid("An identity provider needs a client ID.")
		}
	}
	if !oneLineOf(ch.ClientID, maxClientIDRunes) {
		return ch, apperr.Invalid("The client ID is one line of at most 255 characters.")
	}
	if !oneLineOf(ch.DisplayName, maxButtonRunes) {
		return ch, apperr.Invalid("The name on the login button is one line of at most 100 characters.")
	}
	if !groupsClaim.MatchString(ch.GroupsClaim) {
		return ch, apperr.Invalid("The groups claim is a name of letters, digits and _ . : / -, at most 100 characters.")
	}
	return ch, settings.CheckSecret(ch.ClientSecret, "client secret")
}

// checkHelper checks the address of a helper the server calls, and returns it without the
// trailing slash; empty turns the helper off.
func (s *Service) checkHelper(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if _, err := s.checkAddress(raw); err != nil {
		return "", err
	}
	return strings.TrimRight(raw, "/"), nil
}

// checkAddress accepts an address the server reaches: https, or http where outgoing calls may
// use it, never this machine or a private network unless they may reach one (D4). A name that
// resolves to such an address is refused when connecting.
func (s *Service) checkAddress(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || !wellFormed(u, raw) {
		return nil, errAddress
	}
	if u.Scheme != "https" && (u.Scheme != "http" || !s.o.Outward.AllowPrivate) {
		return nil, errPlain
	}
	if s.inside(u.Hostname()) {
		return nil, errInside
	}
	return u, nil
}

// wellFormed says an address has a host and nothing that could hide where it goes.
func wellFormed(u *url.URL, raw string) bool {
	if len(raw) > maxAddressLength || strings.ContainsAny(raw, " \t\r\n?#\\") {
		return false
	}
	return u.Host != "" && u.Hostname() != "" && u.User == nil && u.Opaque == ""
}

// inside says a host is this machine or a private network that outgoing calls may not reach.
func (s *Service) inside(host string) bool {
	if a, err := netip.ParseAddr(host); err == nil {
		return !s.o.Outward.Allows(a)
	}
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return !s.o.Outward.AllowPrivate && (host == "localhost" || strings.HasSuffix(host, ".localhost"))
}

// checkDrawing checks the drawing service as the environment's setting is checked, and returns
// its origin; empty turns drawing off. The browser frames it, the server never calls it.
func (s *Service) checkDrawing(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	u, err := config.ParseDrawingURL(raw, s.o.PublicURL)
	if err != nil {
		return "", apperr.Invalid("The address of the drawing service " + err.Error() + ".")
	}
	return u.Scheme + "://" + u.Host, nil
}

// checkToken refuses a metrics token a scraper could not send, or one too short to guess.
func checkToken(p settings.SecretChange) error {
	if err := settings.CheckSecret(p, "metrics token"); err != nil || p.Action != settings.SecretSet {
		return err
	}
	if len(p.Value) < minTokenLength || len(p.Value) > maxTokenLength || !bearerToken.MatchString(p.Value) {
		return apperr.Invalid("A metrics token is 32 to 256 characters of letters, digits and - . _ ~ + /, " +
			"as a scraper sends it after Bearer.")
	}
	return nil
}

func oneLineOf(text string, limit int) bool {
	return utf8.RuneCountInString(text) <= limit && !strings.ContainsAny(text, "\r\n\x00")
}
