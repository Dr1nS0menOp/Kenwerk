// SPDX-License-Identifier: Apache-2.0

package example

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/document"
)

func documents(t *testing.T) map[string]document.Node {
	t.Helper()
	plan, err := loadPlan()
	if err != nil {
		t.Fatal(err)
	}
	refs := references{files: map[string]uuid.UUID{}, pages: map[string]uuid.UUID{}, owner: uuid.New()}
	for _, name := range plan.assets() {
		refs.files[name] = uuid.New()
	}
	plan.walk(func(p planPage, _ *planPage) { refs.pages[p.Slug] = uuid.New() })

	out := map[string]document.Node{}
	add := func(file string) {
		raw, err := content.ReadFile("content/" + file)
		if err != nil {
			t.Fatalf("%s: %v", file, err)
		}
		filled, err := refs.fill(raw)
		if err != nil {
			t.Fatalf("%s: %v", file, err)
		}
		doc, err := document.Normalize(filled)
		if err != nil {
			t.Fatalf("%s does not pass the gate: %v", file, err)
		}
		out[file] = doc
	}
	add(plan.Home)
	plan.walk(func(p planPage, _ *planPage) { add(p.Document) })
	for _, post := range plan.Posts {
		add(post.Document)
	}
	for _, template := range plan.Templates {
		add(template.Document)
	}
	return out
}

func TestEveryDocumentPassesTheGate(t *testing.T) {
	if len(documents(t)) < 10 {
		t.Fatal("the example should have ten documents at least")
	}
}

// "Everything that is possible" would go stale without anyone noticing. When this
// fails, the format gained something: show it in internal/example/content.
func TestTheExampleShowsEverythingTheFormatCanHold(t *testing.T) {
	s := shownIn(documents(t))
	// Nobody writes the unknown block: it is what a block of a newer release turns into.
	// A value of a template makes its template a guided one (spec 074), which a new
	// installation does not offer while that experimental part is off, so the example's
	// template stays plain. A section a condition shows makes it guided as well.
	notWritten := map[string]bool{document.TypeUnknownBlock: true, document.TypeTemplateValue: true, document.TypeConditional: true}
	missing := []string{}
	for _, name := range document.NodeTypes() {
		if !s.nodes[name] && !notWritten[name] {
			missing = append(missing, "node "+name)
		}
	}
	missing = append(missing, absent("mark", document.MarkTypes(), s.marks)...)
	missing = append(missing, absent("panel", document.PanelKinds(), s.panels)...)
	missing = append(missing, absent("text colour", document.TextColors(), s.colours)...)
	missing = append(missing, absent("highlight", document.MarkColors(), s.highlights)...)
	if len(missing) > 0 {
		t.Fatalf("the example does not show: %s. Add it to internal/example/content.", strings.Join(missing, ", "))
	}
}

// shown is what the documents of the example hold, by kind.
type shown struct{ nodes, marks, panels, colours, highlights map[string]bool }

func shownIn(docs map[string]document.Node) shown {
	s := shown{nodes: map[string]bool{}, marks: map[string]bool{}, panels: map[string]bool{},
		colours: map[string]bool{}, highlights: map[string]bool{}}
	for _, doc := range docs {
		document.Walk(doc, s.add)
	}
	return s
}

func (s shown) add(n document.Node) {
	s.nodes[n.Type] = true
	if n.Type == document.TypePanel {
		kind, _ := n.Attrs["kind"].(string)
		s.panels[kind] = true
	}
	for _, m := range n.Marks {
		s.marks[m.Type] = true
		color, _ := m.Attrs["color"].(string)
		if m.Type == document.MarkTextColor {
			s.colours[color] = true
		}
		if m.Type == document.MarkHighlight {
			s.highlights[color] = true
		}
	}
}

// absent lists the names the example does not show, each after the kind it is.
func absent(kind string, names []string, have map[string]bool) []string {
	var out []string
	for _, name := range names {
		if !have[name] {
			out = append(out, kind+" "+name)
		}
	}
	return out
}

func TestTheExampleShowsAStretchedTableAndAnUncommonLanguage(t *testing.T) {
	stretched, rust := false, false
	for _, doc := range documents(t) {
		document.Walk(doc, func(n document.Node) {
			stretched = stretched || (n.Type == document.TypeTable && n.Attrs["stretch"] != nil)
			rust = rust || (n.Type == document.TypeCodeBlock && n.Attrs["language"] == "rust")
		})
	}
	if !stretched || !rust {
		t.Fatalf("stretched table %v, rust %v", stretched, rust)
	}
}

func TestEveryQuoteOfACommentIsInItsPage(t *testing.T) {
	plan, err := loadPlan()
	if err != nil {
		t.Fatal(err)
	}
	docs := documents(t)
	quotes := 0
	plan.walk(func(p planPage, _ *planPage) {
		for _, comment := range p.Comments {
			if comment.Quote == "" {
				continue
			}
			quotes++
			if !document.HoldsQuote(docs[p.Document], comment.Quote) {
				t.Errorf("%s does not hold %q", p.Document, comment.Quote)
			}
		}
	})
	if quotes == 0 {
		t.Fatal("the example should show a comment on words")
	}
}

func TestAPlaceholderWithoutATargetIsRefused(t *testing.T) {
	refs := references{files: map[string]uuid.UUID{}, pages: map[string]uuid.UUID{}}
	if _, err := refs.fill([]byte(`{"href":"/pages/@page:nowhere"}`)); err == nil {
		t.Fatal("an unknown page must not pass silently")
	}
	if _, err := refs.fill([]byte(`{"attachment_id":"@file:missing.png"}`)); err == nil {
		t.Fatal("an unknown file must not pass silently")
	}
}
