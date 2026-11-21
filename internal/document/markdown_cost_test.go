// SPDX-License-Identifier: Apache-2.0

package document

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func documentText(t *testing.T, n Node) string {
	t.Helper()
	b, err := json.Marshal(n)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// The parser's work grows with the square of one block, so a block of a megabyte takes minutes.
func TestABlockTooLargeToParseStaysPlainText(t *testing.T) {
	size := 1 << 20
	for name, source := range map[string]string{
		"open brackets":  strings.Repeat("[", size),
		"open links":     strings.Repeat("[a](", size/4),
		"nested quotes":  strings.Repeat("> ", size/2) + "x",
		"nested lists":   strings.Repeat("- ", size/2) + "x",
		"numbered lists": strings.Repeat("1. ", size/3) + "x",
		"short lines":    strings.Repeat("a\n", size/2),
		"open emphasis":  strings.Repeat("*a **a ", size/7),
		"after a header": "# Fine\n\n" + strings.Repeat("![a](", size/5),
	} {
		start := time.Now()
		doc, warnings := FromMarkdown([]byte(source), nil)
		if took := time.Since(start); took > 3*time.Second {
			t.Errorf("%s took %s", name, took)
		}
		if len(warnings) == 0 {
			t.Errorf("%s gave no warning", name)
		}
		if got := documentText(t, doc); !strings.Contains(got, `"codeBlock"`) {
			t.Errorf("%s is not kept as plain text: %.80s", name, got)
		}
	}
}

func TestTheLimitOfOneBlockIsExact(t *testing.T) {
	if _, warnings := FromMarkdown([]byte(strings.Repeat("[", maxMarkdownBlockMarks)), nil); len(warnings) != 0 {
		t.Fatalf("at the limit: %v", warnings)
	}
	if _, warnings := FromMarkdown([]byte(strings.Repeat("[", maxMarkdownBlockMarks+1)), nil); len(warnings) == 0 {
		t.Fatal("past the limit there was no warning")
	}
}

func TestLargeButOrdinaryMarkdownIsStillParsed(t *testing.T) {
	for name, test := range map[string]struct{ source, want string }{
		"many paragraphs": {strings.Repeat("A paragraph with *some* words.\n\n", 20_000), `"italic"`},
		"long code":       {"```go\n" + strings.Repeat("x := 1\n", 10_000) + "```\n", `"language":"go"`},
		"long table":      {"|a|b|\n|-|-|\n" + strings.Repeat("|c|d|\n", 10_000), `"tableCell"`},
		"one long line":   {strings.Repeat("long text ", 100_000), `"paragraph"`},
	} {
		doc, warnings := FromMarkdown([]byte(test.source), nil)
		if got := documentText(t, doc); !strings.Contains(got, test.want) {
			t.Errorf("%s lost %s: %.80s", name, test.want, got)
		}
		if len(warnings) != 0 {
			t.Errorf("%s warned: %v", name, warnings)
		}
	}
}

// A fence must be longer than every run of backticks inside it. Finding that length must take
// one pass over the text, however long the run is.
func TestLongRunsOfBackticksAreWrittenAsMarkdownInLinearTime(t *testing.T) {
	text := "a" + strings.Repeat("`", 256<<10) + "a"
	fence := strings.Repeat("`", 256<<10+1)
	for name, test := range map[string]struct {
		block Node
		want  string
	}{
		"in a code block": {Node{Type: TypeCodeBlock, Content: textNode(text, nil)}, fence + "\n" + text + "\n" + fence + "\n"},
		"in inline code":  {Node{Type: TypeParagraph, Content: textNode(text, []Mark{{Type: MarkCode}})}, fence + text + fence + "\n"},
	} {
		start := time.Now()
		got := ToMarkdown(Node{Type: TypeDoc, Content: []Node{test.block}}, nil)
		if took := time.Since(start); took > 2*time.Second {
			t.Errorf("%s took %s", name, took)
		}
		if got != test.want {
			t.Errorf("%s: the fence is not one backtick longer than the run", name)
		}
	}
}

func TestAFenceIsOneLongerThanTheLongestRunOfBackticks(t *testing.T) {
	for name, test := range map[string]struct {
		doc  Node
		want string
	}{
		"code without backticks":   {Node{Type: TypeCodeBlock, Content: textNode("x", nil)}, "```\nx\n```\n"},
		"code with a short run":    {Node{Type: TypeCodeBlock, Content: textNode("a``b", nil)}, "```\na``b\n```\n"},
		"code with three":          {Node{Type: TypeCodeBlock, Content: textNode("a```b`", nil)}, "````\na```b`\n````\n"},
		"code with runs apart":     {Node{Type: TypeCodeBlock, Content: textNode("``a````b```", nil)}, "`````\n``a````b```\n`````\n"},
		"inline without backticks": {Node{Type: TypeParagraph, Content: textNode("x", []Mark{{Type: MarkCode}})}, "`x`\n"},
		"inline with one":          {Node{Type: TypeParagraph, Content: textNode("a`b", []Mark{{Type: MarkCode}})}, "``a`b``\n"},
		"inline with runs apart":   {Node{Type: TypeParagraph, Content: textNode("`a```b``", []Mark{{Type: MarkCode}})}, "````" + "`a```b``" + "````\n"},
	} {
		if got := ToMarkdown(Node{Type: TypeDoc, Content: []Node{test.doc}}, nil); got != test.want {
			t.Errorf("%s: got %q, want %q", name, got, test.want)
		}
	}
}

// Blank lines end a block, so many hard blocks must not add up to minutes either.
func TestManyHardBlocksStayCheap(t *testing.T) {
	hard := strings.Repeat("[", maxMarkdownBlockMarks-1) + "\n\n"
	for name, source := range map[string]string{
		"blocks just under the limit": strings.Repeat(hard, 16),
		"a loose list":                strings.Repeat("- x\n\n", 50_000),
		"a loose quote":               strings.Repeat("> x\n\n", 50_000),
	} {
		start := time.Now()
		FromMarkdown([]byte(source), nil)
		if took := time.Since(start); took > 20*time.Second {
			t.Errorf("%s took %s", name, took)
		}
	}
}
