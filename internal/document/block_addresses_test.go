// SPDX-License-Identifier: Apache-2.0

package document

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/apperr"
)

// codeAddresses lead a browser to run code or to open a document of its own, in the
// spellings that slip past a simple check: case, space and control characters around or
// inside the scheme, and entities and escapes in place of the colon or a letter.
var codeAddresses = []string{
	"javascript:alert(1)",
	"JaVaScRiPt:alert(1)",
	" javascript:alert(1)",
	"\t\njavascript:alert(1)",
	" javascript:alert(1)",
	"\x01javascript:alert(1)",
	"java\tscript:alert(1)",
	"java\x00script:alert(1)",
	"data:text/html,<script>alert(1)</script>",
	"DATA:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
	"vbscript:msgbox(1)",
	"javascript&#58;alert(1)",
	"javascript&colon;alert(1)",
	"&#106;avascript:alert(1)",
	"&#x6A;avascript:alert(1)",
	"%6Aavascript:alert(1)",
}

// linkedBlock gives the JSON of a block that shows an address as a link.
func linkedBlock(t *testing.T, kind, href string) string {
	t.Helper()
	quoted, err := json.Marshal(href)
	if err != nil {
		t.Fatal(err)
	}
	if kind == TypeImage {
		return `{"type":"image","attrs":{"attachment_id":"` + anAttachment + `","href":` + string(quoted) + `}}`
	}
	return `{"type":"spotlight","attrs":{"button_text":"Go","button_href":` + string(quoted) + `},"content":[{"type":"paragraph"}]}`
}

func TestAnImageLinkOrButtonThatRunsCodeIsRefusedWithItsReason(t *testing.T) {
	for _, kind := range []string{TypeImage, TypeSpotlight} {
		for _, href := range codeAddresses {
			_, err := Normalize(doc(linkedBlock(t, kind, href)))
			var refused *apperr.Error
			if !errors.As(err, &refused) || refused.Code != "invalid_input" ||
				refused.Message != "links must use http, https or mailto, or be a relative path" {
				t.Errorf("%s with %q: %v", kind, href, err)
			}
		}
	}
}

// planted is a document as it may sit in the database without ever passing the gate, such as
// one restored from a backup or changed by hand.
func planted(href string) Node {
	return Node{Type: TypeDoc, Content: []Node{
		{Type: TypeImage, Attrs: map[string]any{"attachment_id": anAttachment, "alt": "Picture", "href": href}},
		{Type: TypeSpotlight, Attrs: map[string]any{"button_text": "Go on", "button_href": href},
			Content: []Node{{Type: TypeParagraph, Content: []Node{{Type: TypeText, Text: "Read"}}}}},
	}}
}

func TestAStoredImageLinkOrButtonThatRunsCodeIsNoLinkInAnExport(t *testing.T) {
	options := HTMLOptions{ImageSrc: func(uuid.UUID) (string, bool) { return "a.png", true }}
	for _, href := range codeAddresses {
		out := ToHTML(planted(href), options)
		if strings.Contains(out, "<a ") || strings.Contains(out, "href=") {
			t.Errorf("%q became a link: %s", href, out)
		}
		for _, want := range []string{`<img src="a.png" alt="Picture">`, "<p>Go on</p>", "Read"} {
			if !strings.Contains(out, want) {
				t.Errorf("%q: the export lacks %q: %s", href, want, out)
			}
		}
	}
}

func TestAStoredButtonThatRunsCodeIsNoLinkInMarkdown(t *testing.T) {
	for _, href := range codeAddresses {
		out := ToMarkdown(planted(href), func(uuid.UUID) string { return "a.png" })
		if strings.Contains(out, "[Go on](") {
			t.Errorf("%q became a link: %s", href, out)
		}
		if !strings.Contains(out, "Go on") {
			t.Errorf("%q: the words of the button are gone: %s", href, out)
		}
	}
}

func TestAButtonAddressCannotEndItsLinkInMarkdown(t *testing.T) {
	n, err := Normalize(doc(`{"type":"spotlight","attrs":{"button_text":"Go","button_href":"/x)[a](javascript:alert(1)"},"content":[{"type":"paragraph"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	out := ToMarkdown(n, func(uuid.UUID) string { return "" })
	if strings.Count(out, "](") != 1 || strings.Contains(out, "(javascript:") {
		t.Errorf("the address opened a second link: %s", out)
	}
}

func TestASafeButtonStaysALinkInMarkdown(t *testing.T) {
	out := ToMarkdown(planted("https://example.org/b"), func(uuid.UUID) string { return "a.png" })
	if !strings.Contains(out, "[Go on](https://example.org/b)") {
		t.Errorf("the button lost its address: %s", out)
	}
}
