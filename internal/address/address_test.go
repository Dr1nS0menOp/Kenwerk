// SPDX-License-Identifier: Apache-2.0

package address

import (
	"testing"

	"github.com/google/uuid"
)

func TestTheHomePageIsAtItsSpaceAndOtherPagesUnderTheKey(t *testing.T) {
	id := uuid.MustParse("0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b")
	if got := Page("Blue", id, true); got != "/spaces/Blue" {
		t.Fatalf("home: %s", got)
	}
	if got := Page("~0190abcd12", id, false); got != "/spaces/~0190abcd12/pages/"+id.String() {
		t.Fatalf("page: %s", got)
	}
}

func TestPageOfReadsBothFormsAndNothingElse(t *testing.T) {
	id := uuid.MustParse("0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b")
	for href, rest := range map[string]string{
		"/pages/" + id.String():                       "",
		"/pages/" + id.String() + "#h":                "#h",
		"/spaces/X/pages/" + id.String() + "/edit?a":  "/edit?a",
		"/spaces/~01/pages/" + id.String() + "?from=": "?from=",
	} {
		got, after, ok := PageOf(href)
		if !ok || got != id || after != rest {
			t.Fatalf("%s: %v %q %v", href, got, after, ok)
		}
	}
	for _, href := range []string{"/spaces/X", "/spaces/X/pages", "/spaces/X/y/pages/" + id.String(), "/pages/" + id.String() + "x",
		"https://example.org/pages/" + id.String(), "pages/" + id.String()} {
		if _, _, ok := PageOf(href); ok {
			t.Fatalf("%s was read as a page", href)
		}
	}
}

func TestKeyFreeDropsTheKeyAndKeepsTheRest(t *testing.T) {
	id := uuid.MustParse("0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b")
	if got := KeyFree("/spaces/Blue/pages/" + id.String() + "#h"); got != "/pages/"+id.String()+"#h" {
		t.Fatalf("got %s", got)
	}
	if got := KeyFree("/spaces/Blue/settings"); got != "/spaces/Blue/settings" {
		t.Fatalf("got %s", got)
	}
}
