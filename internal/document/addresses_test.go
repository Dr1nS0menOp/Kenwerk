// SPDX-License-Identifier: Apache-2.0

package document

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// Spec 094, rules 32 to 34 and 37: a saved document names a page by its id alone, whichever form
// of address was pasted, and every reader of links finds both forms.

func linkTo(href string) string {
	return `{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"` + href + `"}}]}`
}

func linkHrefIn(t *testing.T, n Node) string {
	t.Helper()
	var found string
	Walk(n, func(c Node) {
		for _, m := range c.Marks {
			if m.Type == MarkLink {
				found, _ = m.Attrs["href"].(string)
			}
		}
	})
	return found
}

func TestASavedLinkToAPageHoldsNoKey(t *testing.T) {
	cases := map[string]string{
		"/spaces/BLUE/pages/" + linkedID + "#steps":            "/pages/" + linkedID + "#steps",
		"/spaces/~0190abcd12/pages/" + linkedID + "/history?a": "/pages/" + linkedID + "/history?a",
		"/spaces/blue/pages/" + linkedID:                       "/pages/" + linkedID,
		"/pages/" + linkedID + "#steps":                        "/pages/" + linkedID + "#steps",
		"/spaces/BLUE":                                         "/spaces/BLUE",
		"/spaces/BLUE/settings":                                "/spaces/BLUE/settings",
		"/spaces/BLUE/pages":                                   "/spaces/BLUE/pages",
		"/spaces/BLUE/pages/not-an-id":                         "/spaces/BLUE/pages/not-an-id",
		"https://example.org/spaces/BLUE/pages/" + linkedID:    "https://example.org/spaces/BLUE/pages/" + linkedID,
	}
	for in, want := range cases {
		n, err := Normalize(paragraphWith(linkTo(in)))
		if err != nil {
			t.Fatalf("%s: %v", in, err)
		}
		if got := linkHrefIn(t, n); got != want {
			t.Errorf("%s: stored %s, want %s", in, got, want)
		}
	}
}

func TestLinkedPagesAndTheHTMLExportFindBothForms(t *testing.T) {
	first, second := uuid.New(), uuid.New()
	var doc Node
	raw := `{"type":"doc","content":[{"type":"paragraph","content":[` + linkTo("/pages/"+first.String()+"#a") + `,` +
		linkTo("/spaces/KEY/pages/"+second.String()+"#b") + `]}]}`
	// Not through the gate: content saved by a release that did not normalise yet holds the new form.
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		t.Fatal(err)
	}
	got := LinkedPages(doc)
	if len(got) != 2 || got[0] != first || got[1] != second {
		t.Fatalf("linked pages: %v", got)
	}
	out := ToHTML(doc, HTMLOptions{PageHref: func(id uuid.UUID) (string, bool) { return id.String()[:4] + ".html", true }})
	for _, want := range []string{`href="` + first.String()[:4] + `.html#a"`, `href="` + second.String()[:4] + `.html#b"`} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %s in %s", want, out)
		}
	}
	if strings.Contains(out, "KEY") {
		t.Fatalf("a key left the instance: %s", out)
	}
}
