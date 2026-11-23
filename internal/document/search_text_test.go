// SPDX-License-Identifier: Apache-2.0

package document

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// textLines gives the lines of the text search holds for a document.
func textLines(t *testing.T, content string) []string {
	t.Helper()
	n, err := Normalize(doc(content))
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	return strings.Split(Text(n), "\n")
}

func TestTextHoldsTheWordsAReaderSeesInCaptionsTitlesAndButtons(t *testing.T) {
	table := `{"type":"table","attrs":{"caption":"tablecaption","block_id":"abcdefgh"},"content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"cell"}]}]}]}]}`
	cases := map[string]struct{ content, line string }{
		"table caption":    {table, "tablecaption"},
		"code block title": {`{"type":"codeBlock","attrs":{"title":"codetitle"},"content":[{"type":"text","text":"x := 1"}]}`, "codetitle"},
		"chart titles": {table + `,{"type":"chart","attrs":{"table":"abcdefgh","title":"charttitle","x_title":"xaxis","y_title":"yaxis"}}`,
			"charttitle xaxis yaxis"},
		"media caption":    {`{"type":"media","attrs":{"attachment_id":"` + anAttachment + `","kind":"video","caption":"mediacaption"}}`, "mediacaption"},
		"spotlight button": {`{"type":"spotlight","attrs":{"button_text":"buttonwords","button_href":"https://example.com/"},"content":[{"type":"paragraph"}]}`, "buttonwords"},
	}
	for name, c := range cases {
		if lines := textLines(t, c.content); !slices.Contains(lines, c.line) {
			t.Errorf("%s: no line %q of its own in %q", name, c.line, lines)
		}
	}
}

func TestTextPutsTheTitleOfACodeBlockOnALineBeforeTheCode(t *testing.T) {
	lines := textLines(t, `{"type":"codeBlock","attrs":{"title":"codetitle"},"content":[{"type":"text","text":"x := 1"}]}`)
	if len(lines) < 2 || lines[0] != "codetitle" || lines[1] != "x := 1" {
		t.Fatalf("lines: %q", lines)
	}
}

func TestTextLeavesOutTooltipsAndNames(t *testing.T) {
	n, err := Normalize(doc(`{"type":"image","attrs":{"attachment_id":"` + anAttachment + `","title":"imagetooltip"}},
		{"type":"paragraph","content":[{"type":"text","text":"link","marks":[{"type":"link","attrs":{"href":"https://example.com/","title":"linktooltip"}}]}]},
		{"type":"paragraph","content":[{"type":"anchor","attrs":{"name":"anchorname"}}]},
		{"type":"excerpt","attrs":{"name":"excerptname"},"content":[{"type":"paragraph"}]},
		{"type":"pageFacts","attrs":{"facts_id":"factsid"},"content":[{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph"}]}]}]}]},
		{"type":"dynamic","attrs":{"kind":"search_box","settings":{"placeholder":"settingword"}}},
		{"type":"unknownBlock","attrs":{"name":"blockname","original":"originalword"}}`))
	if err != nil {
		t.Fatal(err)
	}
	text := Text(n)
	for _, word := range []string{"imagetooltip", "linktooltip", "anchorname", "excerptname", "factsid", "settingword", "blockname", "originalword"} {
		if strings.Contains(text, word) {
			t.Errorf("%q is not reader text, yet search holds it: %q", word, text)
		}
	}
}

// notReaderText names every text attribute the gate keeps that search does not read, with the
// reason. Together with searchedAttrs it must cover every text attribute of the gate.
var notReaderText = map[string]map[string]string{
	TypeImage:         {"attachment_id": "an id", "title": "a tooltip, not on the page", "href": "an address"},
	TypeInlineImage:   {"attachment_id": "an id"},
	TypeFile:          {"attachment_id": "an id"},
	TypeMedia:         {"attachment_id": "an id"},
	TypeCodeBlock:     {"language": "a setting of the highlighting"},
	TypeTable:         {"block_id": "an id"},
	TypeChart:         {"table": "the id of the table it draws"},
	TypePanel:         {"emoji": "a picture, not a word"},
	TypeSpotlight:     {"button_href": "an address"},
	TypeTaskItem:      {"id": "an id"},
	TypeMention:       {"id": "an id; the name is filled in on reading"},
	TypeUnknownBlock:  {"name": "never shown (EDT-158)", "original": "never shown (EDT-158)"},
	TypeTemplateField: {"name": "a template is never found", "options": "a template is never found"},
	TypeInstruction:   {"text": "a template is never found"},
	TypeTemplateValue: {"source": "the field it fills in"},
	TypeDynamic:       {"kind": "a setting; the answer changes without the page changing"},
	TypePageFacts:     {"facts_id": "an identifier"},
	TypeExcerpt:       {"name": "an identifier"},
	TypeAnchor:        {"name": "an identifier"},
	TypePageLink:      {"page_id": "an id", "fragment": "an address within the page"},
	TypePageCard:      {"page_id": "an id"},
	TypeSheet:         {"id": "an id of a column or a row; the cells are read", "type": "the type of a column"},
}

// TestEveryTextAttributeIsSearchedOrNamedAsNotRead reads the gate's source: every string
// attribute a cleaner keeps (keepText, stringAttr, or a string read from its input) must be
// read by search through searchedAttrs or be named above with a reason. A new text attribute
// without a place in either fails here, as a part name of a tabs block would.
func TestEveryTextAttributeIsSearchedOrNamedAsNotRead(t *testing.T) {
	kept := gateTextAttrs(t)
	for typ, attrs := range kept {
		for _, attr := range attrs {
			if !isSearched(typ, attr) && notReaderText[typ][attr] == "" {
				t.Errorf("%s.%s is a text attribute of the gate that search neither reads nor names as not reader text", typ, attr)
			}
		}
	}
	checkNoNameOutlivesTheGate(t, kept)
}

// checkNoNameOutlivesTheGate fails on a line of either table that the gate no longer keeps,
// so both tables stay a true account of the gate.
func checkNoNameOutlivesTheGate(t *testing.T, kept map[string][]string) {
	t.Helper()
	for typ, attrs := range notReaderText {
		for attr := range attrs {
			if !slices.Contains(kept[typ], attr) {
				t.Errorf("%s.%s is named as not reader text, but the gate does not keep it", typ, attr)
			}
		}
	}
	for typ, sa := range searchedAttrs {
		for _, attr := range append([]string{sa.own}, sa.line...) {
			if attr != "" && !slices.Contains(kept[typ], attr) {
				t.Errorf("search reads %s.%s, which the gate does not keep", typ, attr)
			}
		}
	}
}

// The guard above reads the source, so it must see a cleaner's own reads and the reads of
// the functions it calls: a table's block_id is read by keepBlockID, not by cleanTable.
func TestTheGuardSeesTheReadsOfCalledFunctions(t *testing.T) {
	kept := gateTextAttrs(t)
	for typ, want := range map[string]string{TypeTable: "block_id", TypeImage: "caption", TypeExcerpt: "name"} {
		if !slices.Contains(kept[typ], want) {
			t.Errorf("the guard misses %s.%s: %v", typ, want, kept[typ])
		}
	}
}

func isSearched(typ, attr string) bool {
	sa := searchedAttrs[typ]
	return sa.own == attr || slices.Contains(sa.line, attr)
}

// gateTextAttrs lists, per type of node, the string attributes its cleaner and the functions
// it calls read from their input.
func gateTextAttrs(t *testing.T) map[string][]string {
	t.Helper()
	src := parseGate(t)
	out := map[string][]string{}
	for typ, clean := range attrCleaners {
		name := runtime.FuncForPC(reflect.ValueOf(clean).Pointer()).Name()
		name = name[strings.LastIndex(name, ".")+1:]
		if _, ok := src.keys[name]; !ok {
			t.Fatalf("the cleaner of %s, %s, is not in the source", typ, name)
		}
		out[typ] = src.reached(name, map[string]bool{})
	}
	return out
}

// gateSource holds, per function of the package, the string keys it reads and the functions
// of the package it calls.
type gateSource struct {
	keys  map[string][]string
	calls map[string][]string
}

func (g gateSource) reached(name string, seen map[string]bool) []string {
	if seen[name] {
		return nil
	}
	seen[name] = true
	out := slices.Clone(g.keys[name])
	for _, callee := range g.calls[name] {
		for _, key := range g.reached(callee, seen) {
			if !slices.Contains(out, key) {
				out = append(out, key)
			}
		}
	}
	return out
}

func parseGate(t *testing.T) gateSource {
	t.Helper()
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	g := gateSource{keys: map[string][]string{}, calls: map[string][]string{}}
	fset := token.NewFileSet()
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		// The parser reads the file itself; the names come from the package's own folder.
		f, err := parser.ParseFile(fset, file, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, decl := range f.Decls {
			if fn, ok := decl.(*ast.FuncDecl); ok && fn.Recv == nil && fn.Body != nil {
				g.keys[fn.Name.Name], g.calls[fn.Name.Name] = readsOf(fn.Body)
			}
		}
	}
	return g
}

// readsOf finds the string keys a function body reads, and the plain functions it calls.
func readsOf(body *ast.BlockStmt) (keys, calls []string) {
	ast.Inspect(body, func(node ast.Node) bool {
		switch n := node.(type) {
		case *ast.CallExpr:
			keys = append(keys, textKeyOfCall(n)...)
			if id, ok := n.Fun.(*ast.Ident); ok {
				calls = append(calls, id.Name)
			}
		case *ast.TypeAssertExpr:
			keys = append(keys, stringRead(n)...)
		}
		return true
	})
	return keys, calls
}

// textKeyOfCall gives the key of keepText(in, out, "key", n) and stringAttr(in, "key", n).
func textKeyOfCall(call *ast.CallExpr) []string {
	id, ok := call.Fun.(*ast.Ident)
	if !ok {
		return nil
	}
	at := map[string]int{"keepText": 2, "stringAttr": 1}[id.Name]
	if at == 0 || len(call.Args) <= at {
		return nil
	}
	return literal(call.Args[at])
}

// stringRead gives the key of in["key"].(string).
func stringRead(a *ast.TypeAssertExpr) []string {
	typ, ok := a.Type.(*ast.Ident)
	index, isIndex := a.X.(*ast.IndexExpr)
	if !ok || typ.Name != "string" || !isIndex {
		return nil
	}
	return literal(index.Index)
}

func literal(e ast.Expr) []string {
	lit, ok := e.(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return nil
	}
	s, err := strconv.Unquote(lit.Value)
	if err != nil {
		return nil
	}
	return []string{s}
}
