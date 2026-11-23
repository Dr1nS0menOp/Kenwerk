// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestALongPageComesInPartsThatAddUpToIt(t *testing.T) {
	text := strings.Repeat("A line of text, with ë in it.\n", 20000)
	all := parts(text)
	if len(all) < 2 {
		t.Fatalf("%d bytes in %d part", len(text), len(all))
	}
	for i, p := range all {
		if len(p) > maxPart || !utf8.ValidString(p) || (i < len(all)-1 && !strings.HasSuffix(p, "\n")) {
			t.Fatalf("part %d of %d bytes is not cut at a line", i+1, len(p))
		}
	}
	if strings.Join(all, "") != text {
		t.Fatal("the parts lose text")
	}
	if one := parts(strings.Repeat("€", maxPart)); strings.Join(one, "") != strings.Repeat("€", maxPart) || !utf8.ValidString(one[0]) {
		t.Fatal("a line longer than a part is cut inside a character")
	}
}

func TestMarkdownRoundTripsWithItsFiles(t *testing.T) {
	doc, _, err := documentOf("# Title\n\nSee ![plan](attachment:" + pageID1 + ")\n")
	if err != nil {
		t.Fatal(err)
	}
	back, err := markdownOf(doc)
	if err != nil || !strings.Contains(back, "# Title") || !strings.Contains(back, "attachment:"+pageID1) {
		t.Fatalf("%v %q", err, back)
	}
	if _, _, err := documentOf(strings.Repeat("x", maxMarkdownIn+1)); err == nil {
		t.Fatal("Markdown past the limit was taken")
	}
}
