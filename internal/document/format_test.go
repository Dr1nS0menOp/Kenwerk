// SPDX-License-Identifier: Apache-2.0

package document

import (
	"slices"
	"testing"
)

// TestTheFormatListsTheGatesOwnNodesMarksAndLimits is spec 082 D23: the description comes from
// the lists Normalize checks against, so it can never describe another format.
func TestTheFormatListsTheGatesOwnNodesMarksAndLimits(t *testing.T) {
	f := Format()
	if f.SchemaVersion != SchemaVersion || f.MaxBytes != MaxBytes || f.MaxDepth != MaxDepth {
		t.Fatalf("limits: %+v", f)
	}
	if !slices.Equal(f.Marks, MarkTypes()) {
		t.Fatalf("marks: %v", f.Marks)
	}
	names := make([]string, 0, len(f.Nodes))
	for _, n := range f.Nodes {
		names = append(names, n.Type)
	}
	if !slices.Equal(names, NodeTypes()) {
		t.Fatalf("nodes: %v", names)
	}
}

// TestTheFormatDescribesWhatTheGateAccepts is spec 082 D23: an API client that writes what the
// format allows gets past Normalize, and what the format leaves out is refused.
func TestTheFormatDescribesWhatTheGateAccepts(t *testing.T) {
	doc := nodeOf(t, Format(), TypeDoc)
	if !slices.Contains(doc.Children, TypeParagraph) || slices.Contains(doc.Children, TypeTableRow) {
		t.Fatalf("doc children: %v", doc.Children)
	}
	if !slices.IsSorted(doc.Children) {
		t.Fatalf("children are not sorted: %v", doc.Children)
	}
	accepted := `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hi","marks":[{"type":"bold"}]}]}]}`
	if _, err := Normalize([]byte(accepted)); err != nil {
		t.Fatalf("a document the format allows was refused: %v", err)
	}
	refused := `{"type":"doc","content":[{"type":"tableRow"}]}`
	if _, err := Normalize([]byte(refused)); err == nil {
		t.Fatal("a child the format leaves out got past the gate")
	}
}

func TestTheFormatCannotBeChangedByItsCaller(t *testing.T) {
	first := Format()
	doc := nodeOf(t, first, TypeDoc)
	doc.Children[0] = "script"
	if slices.Contains(nodeOf(t, Format(), TypeDoc).Children, "script") {
		t.Fatal("a caller changed the gate's list")
	}
	if _, err := Normalize([]byte(`{"type":"doc","content":[{"type":"script"}]}`)); err == nil {
		t.Fatal("a changed description reached the gate")
	}
}

func nodeOf(t *testing.T, f Description, name string) NodeFormat {
	t.Helper()
	for _, n := range f.Nodes {
		if n.Type == name {
			return n
		}
	}
	t.Fatalf("%s is not in the format", name)
	return NodeFormat{}
}
