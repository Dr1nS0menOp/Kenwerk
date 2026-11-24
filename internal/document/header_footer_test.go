// SPDX-License-Identifier: Apache-2.0

package document_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/kenwerk/kenwerk/internal/document"
)

// The installation's header and footer (spec 089): what a field may hold, refusals first.

type jsonNode = map[string]any

const someID = "0193f6d2-c1e4-7a8b-9c0d-1e2f3a4b5c6d"

func hfText(s string, marks ...jsonNode) jsonNode {
	n := jsonNode{"type": "text", "text": s}
	if len(marks) > 0 {
		list := make([]any, len(marks))
		for i, m := range marks {
			list[i] = m
		}
		n["marks"] = list
	}
	return n
}

func hfPara(content ...jsonNode) jsonNode {
	list := make([]any, len(content))
	for i, c := range content {
		list[i] = c
	}
	return jsonNode{"type": "paragraph", "content": list}
}

func hfLink(href string) jsonNode {
	return jsonNode{"type": "link", "attrs": jsonNode{"href": href}}
}

func hfStatus(words string) jsonNode {
	return jsonNode{"type": "status", "attrs": jsonNode{"color": "blue", "text": words}}
}

func hfDoc(t *testing.T, blocks ...jsonNode) []byte {
	t.Helper()
	list := make([]any, len(blocks))
	for i, b := range blocks {
		list[i] = b
	}
	raw, err := json.Marshal(jsonNode{"type": "doc", "content": list})
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func linkDoc(t *testing.T, href string) []byte {
	t.Helper()
	return hfDoc(t, hfPara(hfText("Contact", hfLink(href))))
}

// problemFor checks raw as a header or footer and gives the problem its refusal names, or ""
// when it passed.
func problemFor(t *testing.T, raw []byte) string {
	t.Helper()
	_, err := document.HeaderFooterContent(raw)
	if err == nil {
		return ""
	}
	var refusal *document.HeaderFooterRefusal
	if !errors.As(err, &refusal) {
		t.Fatalf("a refusal of another kind: %v", err)
	}
	if refusal.Reason == "" {
		t.Fatal("a refusal without words")
	}
	return refusal.Problem
}

// isRefusedLink reports a problem that refuses a link: the band's own rule, or the gate.
func isRefusedLink(problem string) bool {
	return problem == document.ProblemLinkNotAllowed || problem == document.ProblemNotAllowed
}

func TestAHeaderOrFooterKeepsMarkupAsText(t *testing.T) {
	const markup = "<script>alert(1)</script><img src=x onerror=alert(1)>"
	got, err := document.HeaderFooterContent(hfDoc(t, hfPara(hfText(markup))))
	if err != nil {
		t.Fatal(err)
	}
	only := got.Content[0].Content
	if len(only) != 1 || only[0].Type != document.TypeText || only[0].Text != markup {
		t.Fatalf("markup did not stay one text: %+v", got)
	}
}

func TestAHeaderOrFooterRefusesNodesThatAreNoDocument(t *testing.T) {
	for _, kind := range []string{"html", "iframe", "script", "object", "svg"} {
		raw := hfDoc(t, jsonNode{"type": kind, "attrs": jsonNode{"src": "https://other.example/x.js"}})
		if p := problemFor(t, raw); p != document.ProblemNotAllowed {
			t.Errorf("a node %q: problem %q, want %q", kind, p, document.ProblemNotAllowed)
		}
	}
}

func TestAHeaderOrFooterDropsEveryOtherAttribute(t *testing.T) {
	para := hfPara(hfText("Internal"))
	para["attrs"] = jsonNode{"onclick": "alert(1)", "style": "color:red", "class": "x", "src": "https://other.example/",
		"indent": 3, "align": "center"}
	got, err := document.HeaderFooterContent(hfDoc(t, para))
	if err != nil {
		t.Fatal(err)
	}
	if attrs := got.Content[0].Attrs; len(attrs) != 1 || attrs["align"] != "center" {
		t.Fatalf("a paragraph kept more than its alignment: %v", attrs)
	}
}

func TestAHeaderOrFooterRefusesEveryOtherLinkScheme(t *testing.T) {
	for _, href := range []string{
		"javascript:alert(1)", "JaVaScRiPt:alert(1)", "   javascript:alert(1)", "java\tscript:alert(1)",
		"java\nscript:alert(1)", "javascript&#58;alert(1)", "%6Aavascript:alert(1)", "vbscript:msgbox(1)",
		"data:text/html,<script>alert(1)</script>", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
		"file:///etc/passwd", "blob:https://other.example/1", "ftp://files.example/",
	} {
		if p := problemFor(t, linkDoc(t, href)); !isRefusedLink(p) {
			t.Errorf("%q: problem %q, want a refused link", href, p)
		}
	}
	// The gate lets plain http through for pages; only the rule of the band refuses it.
	if p := problemFor(t, linkDoc(t, "http://intranet.example/")); p != document.ProblemLinkNotAllowed {
		t.Fatalf("plain http: problem %q", p)
	}
}

func TestAHeaderOrFooterRefusesLinksThatHideWhereTheyGo(t *testing.T) {
	for _, href := range []string{
		"//other.example/", "/\\other.example/", "\\\\other.example", "https:///path", "mailto:",
		"https://help.example.org/" + strings.Repeat("a", 2049-len("https://help.example.org/")),
		"https://help.example.org/a b", "https://help.example.org/a\tb", "https://help.example.org/a\nb",
		"https://help.example.org/a\x00b", "mailto:a@example.org,b@example.org",
	} {
		if p := problemFor(t, linkDoc(t, href)); !isRefusedLink(p) {
			t.Errorf("%q: problem %q, want a refused link", href, p)
		}
	}
	// Each of these passes the gate of a page, so only the rule of the band stops it.
	for _, href := range []string{"https://intranet.example@other.example/", "https://user:pass@other.example/",
		"https://\u0435xample.org/", "https://ex\u0430mple.org/", "#top", "mailto:a@example.org?bcc=b@example.org"} {
		if p := problemFor(t, linkDoc(t, href)); p != document.ProblemLinkNotAllowed {
			t.Errorf("%q: problem %q, want %q", href, p, document.ProblemLinkNotAllowed)
		}
	}
}

func TestAHeaderOrFooterKeepsLinksThatSayWhereTheyGo(t *testing.T) {
	longest := "https://help.example.org/" + strings.Repeat("a", 2048-len("https://help.example.org/"))
	for _, href := range []string{"https://help.example.org/wiki", "https://xn--bcher-kva.example/", "mailto:help@example.org",
		"/spaces/HR/pages/0193f6d2", "https://help.example.org:8443/wiki?topic=a#b", longest} {
		if p := problemFor(t, linkDoc(t, href)); p != "" {
			t.Errorf("%q: refused as %q", href, p)
		}
	}
}

func TestAHeaderOrFooterLinkKeepsNoTitle(t *testing.T) {
	link := hfLink("https://help.example.org/")
	link["attrs"].(jsonNode)["title"] = "Log in again at intranet.example"
	got, err := document.HeaderFooterContent(hfDoc(t, hfPara(hfText("Help", link))))
	if err != nil {
		t.Fatal(err)
	}
	if attrs := got.Content[0].Content[0].Marks[0].Attrs; len(attrs) != 1 {
		t.Fatalf("a link kept more than its address: %v", attrs)
	}
	titleOnly := jsonNode{"type": "link", "attrs": jsonNode{"title": "https://help.example.org/"}}
	if p := problemFor(t, hfDoc(t, hfPara(hfText("Help", titleOnly)))); p == "" {
		t.Fatal("a link with a title and no address passed")
	}
}

// outsideTheSubset are nodes a page may hold and the band may not, each valid for the gate where
// it can be, so the band's own rule is what refuses it.
func outsideTheSubset() map[string]jsonNode {
	words := []any{hfText("x")}
	return map[string]jsonNode{
		"heading":       {"type": "heading", "attrs": jsonNode{"level": 2}, "content": words},
		"bulletList":    {"type": "bulletList", "content": []any{jsonNode{"type": "listItem", "content": []any{hfPara(hfText("x"))}}}},
		"blockquote":    {"type": "blockquote", "content": []any{hfPara(hfText("x"))}},
		"codeBlock":     {"type": "codeBlock", "content": words},
		"rule":          {"type": "horizontalRule"},
		"panel":         {"type": "panel", "attrs": jsonNode{"kind": "info"}, "content": []any{hfPara(hfText("x"))}},
		"dynamic":       {"type": "dynamic", "attrs": jsonNode{"kind": "recent_changes"}},
		"image":         {"type": "image", "attrs": jsonNode{"attachment_id": someID}},
		"mention":       hfPara(jsonNode{"type": "mention", "attrs": jsonNode{"id": someID, "kind": "user", "label": "Ann"}}),
		"pageLink":      hfPara(jsonNode{"type": "pageLink", "attrs": jsonNode{"page": someID}}),
		"date":          hfPara(jsonNode{"type": "date", "attrs": jsonNode{"value": "2026-11-23"}}),
		"inlineImage":   hfPara(jsonNode{"type": "inlineImage", "attrs": jsonNode{"attachment_id": someID}}),
		"templateField": hfPara(jsonNode{"type": "templateField", "attrs": jsonNode{"name": "Owner"}}),
	}
}

func TestAHeaderOrFooterRefusesEveryNodeOutsideItsSubset(t *testing.T) {
	for name, node := range outsideTheSubset() {
		if p := problemFor(t, hfDoc(t, node)); p != document.ProblemNotAllowed {
			t.Errorf("%s: problem %q, want %q", name, p, document.ProblemNotAllowed)
		}
	}
}

func TestAHeaderOrFooterRefusesEveryMarkOutsideItsSubset(t *testing.T) {
	for _, mark := range []jsonNode{{"type": "strike"}, {"type": "code"}, {"type": "subscript"}, {"type": "superscript"},
		{"type": "highlight", "attrs": jsonNode{"color": "yellow"}}} {
		if p := problemFor(t, hfDoc(t, hfPara(hfText("x", mark)))); p != document.ProblemNotAllowed {
			t.Errorf("%v: problem %q, want %q", mark["type"], p, document.ProblemNotAllowed)
		}
	}
	allowed := []jsonNode{{"type": "bold"}, {"type": "italic"}, {"type": "underline"}, {"type": "textColor", "attrs": jsonNode{"color": "teal"}}}
	if p := problemFor(t, hfDoc(t, hfPara(hfText("x", allowed...)))); p != "" {
		t.Fatalf("the marks of the subset: %q", p)
	}
}

func TestAHeaderOrFooterRefusesCharactersThatTurnTextAround(t *testing.T) {
	for _, r := range []rune{0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069} {
		s := "gro" + string(r) + "gle.com"
		if p := problemFor(t, hfDoc(t, hfPara(hfText(s)))); p != document.ProblemTextNotAllowed {
			t.Errorf("U+%04X in text: problem %q", r, p)
		}
		if p := problemFor(t, hfDoc(t, hfPara(hfStatus(s)))); p != document.ProblemTextNotAllowed {
			t.Errorf("U+%04X in a status: problem %q", r, p)
		}
	}
	if p := problemFor(t, hfDoc(t, hfPara(hfText("\u05e9\u05dc\u05d5\u05dd\u200f")))); p != "" {
		t.Fatalf("a right-to-left mark is ordinary text, refused as %q", p)
	}
}

func repeatParas(t *testing.T, n int) []byte {
	t.Helper()
	paras := make([]jsonNode, n)
	for i := range paras {
		paras[i] = hfPara(hfText("line"))
	}
	return hfDoc(t, paras...)
}

func repeatLinks(t *testing.T, n int) []byte {
	t.Helper()
	words := make([]jsonNode, 0, 2*n)
	for i := range n {
		words = append(words, hfText("l", hfLink("https://help.example.org/")), hfText(strings.Repeat(" ", i+1)))
	}
	return hfDoc(t, hfPara(words...))
}

func TestAHeaderOrFooterStaysWithinItsLimits(t *testing.T) {
	limits := document.HeaderFooterLimitsInForce()
	status := hfStatus(strings.Repeat("s", 10))
	cases := []struct {
		name  string
		raw   []byte
		fails bool
	}{
		{"600 characters with a status", hfDoc(t, hfPara(hfText(strings.Repeat("a", limits.Characters-10)), status)), false},
		{"601 characters with a status", hfDoc(t, hfPara(hfText(strings.Repeat("a", limits.Characters-9)), status)), true},
		{"5 paragraphs", repeatParas(t, limits.Paragraphs), false},
		{"6 paragraphs", repeatParas(t, limits.Paragraphs+1), true},
		{"5 links", repeatLinks(t, limits.Links), false},
		{"6 links", repeatLinks(t, limits.Links+1), true},
		{"3 statuses", hfDoc(t, hfPara(hfStatus("a"), hfStatus("b"), hfStatus("c"))), false},
		{"4 statuses", hfDoc(t, hfPara(hfStatus("a"), hfStatus("b"), hfStatus("c"), hfStatus("d"))), true},
	}
	for _, c := range cases {
		want := ""
		if c.fails {
			want = document.ProblemTooLong
		}
		if got := problemFor(t, c.raw); got != want {
			t.Errorf("%s: problem %q, want %q", c.name, got, want)
		}
	}
}

// docOfBytes is a document whose normalised form takes exactly size bytes, held in the
// addresses of five links so the visible text stays short.
func docOfBytes(t *testing.T, size int) []byte {
	t.Helper()
	build := func(pad int) []byte {
		words := []jsonNode{}
		for i := range 5 {
			length := 1500
			if i == 4 {
				length = pad
			}
			words = append(words, hfText("l", hfLink("https://help.example.org/"+strings.Repeat("p", length))), hfText(" "))
		}
		return hfDoc(t, hfPara(words...))
	}
	measure := func(raw []byte) int {
		n, err := document.Normalize(raw)
		if err != nil {
			t.Fatal(err)
		}
		out, err := document.Marshal(n)
		if err != nil {
			t.Fatal(err)
		}
		return len(out)
	}
	raw := build(1000 + size - measure(build(1000)))
	if got := measure(raw); got != size {
		t.Fatalf("the document takes %d bytes, not %d", got, size)
	}
	return raw
}

func TestAHeaderOrFooterStaysWithinItsBytes(t *testing.T) {
	limit := document.HeaderFooterLimitsInForce().Bytes
	if p := problemFor(t, docOfBytes(t, limit)); p != "" {
		t.Fatalf("%d bytes: refused as %q", limit, p)
	}
	if p := problemFor(t, docOfBytes(t, limit+1)); p != document.ProblemTooLong {
		t.Fatalf("%d bytes: problem %q", limit+1, p)
	}
}

func TestAnEmptyHeaderOrFooterIsNothing(t *testing.T) {
	for _, raw := range [][]byte{hfDoc(t, jsonNode{"type": "paragraph"}), hfDoc(t),
		hfDoc(t, hfPara(hfText("   ")), jsonNode{"type": "paragraph"}, hfPara(jsonNode{"type": "hardBreak"}))} {
		got, err := document.HeaderFooterContent(raw)
		if err != nil || got != nil {
			t.Fatalf("%s: %v %v", raw, got, err)
		}
	}
}

// sameJSON reports whether two encodings hold the same value, whatever the order of their keys.
func sameJSON(t *testing.T, a, b []byte) bool {
	t.Helper()
	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &y); err != nil {
		t.Fatal(err)
	}
	ax, _ := json.Marshal(x)
	by, _ := json.Marshal(y)
	return string(ax) == string(by)
}

func TestAClassificationAndAContactPassUnchanged(t *testing.T) {
	header := hfPara(hfStatus("Internal"))
	header["attrs"] = jsonNode{"align": "center"}
	contact := hfText("help@example.org", hfLink("mailto:help@example.org"), jsonNode{"type": "bold"})
	raw := hfDoc(t, header, hfPara(hfText("Questions: "), contact))
	got, err := document.HeaderFooterContent(raw)
	if err != nil {
		t.Fatal(err)
	}
	out, err := document.Marshal(*got)
	if err != nil {
		t.Fatal(err)
	}
	if !sameJSON(t, raw, out) {
		t.Fatalf("changed on the way:\n got %s\nwant %s", out, raw)
	}
}
