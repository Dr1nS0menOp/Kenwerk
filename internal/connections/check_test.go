// SPDX-License-Identifier: Apache-2.0

package connections

import (
	"net/url"
	"strings"
	"testing"

	"github.com/kenwerk/kenwerk/internal/outward"
	"github.com/kenwerk/kenwerk/internal/settings"
)

// The limits of spec 101: refusals first, then what passes.

func checker(allowPrivate bool) *Service {
	public, _ := url.Parse("https://wiki.example.com")
	return &Service{o: Options{Outward: outward.Options{AllowPrivate: allowPrivate}, PublicURL: public}}
}

func provider(issuer string) IdentityProviderChange {
	return IdentityProviderChange{Issuer: issuer, ClientID: "kenwerk",
		ClientSecret: settings.SecretChange{Action: settings.SecretSet, Value: "a-secret"}}
}

func TestAnInvalidIssuerIsRefused(t *testing.T) {
	s := checker(false)
	for _, issuer := range []string{
		"auth.example.com", "ftp://auth.example.com", "https://", "https://user:pw@auth.example.com",
		"https://auth.example.com/?tenant=1", "https://auth.example.com/#x", "https://auth example.com",
		"http://auth.example.com", "https://localhost/realm", "https://sso.localhost", "https://127.0.0.1",
		"https://10.0.0.5/o/kenwerk/", "https://[::1]:8443", "https://169.254.169.254/latest",
		"https://auth.example.com/" + strings.Repeat("a", maxAddressLength),
	} {
		if _, err := s.checkProvider(provider(issuer)); err == nil {
			t.Errorf("issuer %q was accepted", issuer)
		}
	}
}

func TestAProviderWithoutAClientIDOrWithABadFieldIsRefused(t *testing.T) {
	s := checker(false)
	noID := provider("https://auth.example.com")
	noID.ClientID = ""
	longButton := provider("https://auth.example.com")
	longButton.DisplayName = strings.Repeat("b", maxButtonRunes+1)
	badClaim := provider("https://auth.example.com")
	badClaim.GroupsClaim = "groups; drop"
	twoLines := provider("https://auth.example.com")
	twoLines.ClientID = "a\nb"
	noAction := provider("https://auth.example.com")
	noAction.ClientSecret = settings.SecretChange{}
	for name, ch := range map[string]IdentityProviderChange{"no client ID": noID, "long button": longButton,
		"bad claim": badClaim, "two lines": twoLines, "no action": noAction} {
		if _, err := s.checkProvider(ch); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
}

func TestAnIssuerIsKeptAsTyped(t *testing.T) {
	s := checker(false)
	got, err := s.checkProvider(provider("  https://auth.example.com/application/o/kenwerk/  "))
	if err != nil || got.Issuer != "https://auth.example.com/application/o/kenwerk/" {
		t.Fatalf("issuer: %q %v", got.Issuer, err)
	}
	if got, err := s.checkProvider(IdentityProviderChange{ClientSecret: settings.SecretChange{Action: settings.SecretKeep}}); err != nil || got.Issuer != "" {
		t.Fatalf("an empty issuer turns the provider off: %v", err)
	}
}

func TestAPrivateAddressNeedsTheSwitchOfOutgoingCalls(t *testing.T) {
	for _, address := range []string{"http://pdf:3000", "http://10.0.0.5:3000/", "https://localhost:9980"} {
		if _, err := checker(false).checkHelper(address); err == nil {
			t.Errorf("%s was accepted without KENWERK_OUTWARD_ALLOW_PRIVATE", address)
		}
		if _, err := checker(true).checkHelper(address); err != nil {
			t.Errorf("%s was refused with KENWERK_OUTWARD_ALLOW_PRIVATE: %v", address, err)
		}
	}
	if got, err := checker(false).checkHelper(" https://pdf.example.com/ "); err != nil || got != "https://pdf.example.com" {
		t.Fatalf("a helper: %q %v", got, err)
	}
}

func TestADrawingServiceFollowsTheRuleOfTheEnvironment(t *testing.T) {
	s := checker(false)
	for _, address := range []string{"https://wiki.example.com", "https://draw.example.com/path", "draw.example.com",
		"https://user@draw.example.com"} {
		if _, err := s.checkDrawing(address); err == nil {
			t.Errorf("drawing %q was accepted", address)
		}
	}
	if got, err := s.checkDrawing("https://Draw.Example.com/"); err != nil || got != "https://draw.example.com" {
		t.Fatalf("drawing: %q %v", got, err)
	}
}

func TestAMetricsTokenMustBeLongAndSendable(t *testing.T) {
	set := func(v string) settings.SecretChange {
		return settings.SecretChange{Action: settings.SecretSet, Value: v}
	}
	for _, token := range []string{"", "short", strings.Repeat("a", 31), strings.Repeat("a", 31) + " ",
		strings.Repeat("a", 40) + "\"", strings.Repeat("a", maxTokenLength+1)} {
		if checkToken(set(token)) == nil {
			t.Errorf("token %q was accepted", token)
		}
	}
	for _, ok := range []settings.SecretChange{set(strings.Repeat("aZ0-._~+/", 4) + "=="),
		{Action: settings.SecretKeep}, {Action: settings.SecretRemove}} {
		if err := checkToken(ok); err != nil {
			t.Errorf("%+v was refused: %v", ok.Action, err)
		}
	}
}
