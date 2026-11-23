// SPDX-License-Identifier: Apache-2.0

package sites

import (
	"strings"
	"testing"
)

func TestASiteGetsItsDefaultsAndATidyAddress(t *testing.T) {
	in := Input{Name: "  Handbook ", Address: " https://docs.example.org/ "}
	if err := in.clean(); err != nil {
		t.Fatal(err)
	}
	want := Input{Name: "Handbook", Address: "https://docs.example.org", Language: "en", Accent: "blue", UpdateMode: UpdateManual}
	if in != want {
		t.Fatalf("%+v, want %+v", in, want)
	}
}

func TestASiteRefusesWhatDoesNotFit(t *testing.T) {
	for name, in := range map[string]Input{
		"no name":           {Name: " "},
		"a long name":       {Name: strings.Repeat("a", maxNameRunes+1)},
		"a name with lines": {Name: "a\nb"},
		"a long address":    {Name: "a", Address: "https://" + strings.Repeat("a", maxAddressRunes)},
		"another scheme":    {Name: "a", Address: "ftp://example.org"},
		"no language tag":   {Name: "a", Language: "english!"},
		"an unknown accent": {Name: "a", Accent: "plaid"},
		"an unknown mode":   {Name: "a", UpdateMode: "hourly"},
	} {
		if err := in.clean(); err == nil {
			t.Errorf("%s was taken: %+v", name, in)
		}
	}
}

func TestASiteTakesEveryKnownChoice(t *testing.T) {
	for _, mode := range []string{UpdateOnPublish, UpdateDaily, UpdateManual} {
		for accent := range Accents {
			in := Input{Name: strings.Repeat("a", maxNameRunes), Address: "http://example.org", Language: "nl-BE", Accent: accent, UpdateMode: mode}
			if err := in.clean(); err != nil {
				t.Errorf("%s, %s: %v", mode, accent, err)
			}
		}
	}
}
