// SPDX-License-Identifier: Apache-2.0

package automation

import (
	"testing"

	"github.com/google/uuid"
)

// Spec 091: each problem says where it is, what kind it is and a code the screen translates,
// and keeps the step and message of before, so the form and other clients keep working.

func onPublish(actions ...Action) Definition {
	return Definition{Trigger: Trigger{Kind: "page.published"}, Actions: actions}
}

var (
	someGroup  = uuid.MustParse("0190a0a0-0000-7000-8000-000000000001")
	emptyLabel = Condition{Kind: CondLabel}
)

// problemCases is one definition with one problem each, and what the problem must say.
var problemCases = []struct {
	name string
	d    Definition
	want Problem
}{
	{"no trigger", Definition{Actions: []Action{{Type: ActFind}}},
		Problem{Step: stepTrigger, Where: "trigger", Kind: kindInput, Code: "choose_trigger", Message: "Choose when this rule runs."}},
	{"no schedule", Definition{Trigger: Trigger{Kind: TriggerSchedule}, Actions: []Action{{Type: ActFind}}},
		Problem{Step: stepTrigger, Where: "trigger", Kind: kindInput, Code: "choose_every", Message: "Choose how often: hourly, daily, weekly or monthly."}},
	{"no time", Definition{Trigger: Trigger{Kind: TriggerSchedule, Every: EveryDay}, Actions: []Action{{Type: ActFind}}},
		Problem{Step: stepTrigger, Where: "trigger", Kind: kindInput, Code: "give_time", Message: "Give the time as 09:30."}},
	{"no action", onPublish(),
		Problem{Step: 0, Where: "steps", Kind: kindInput, Code: "no_actions", Message: "A rule needs at least one action."}},
	{"an empty leaf alone", Definition{Trigger: Trigger{Kind: "page.published"}, Conditions: &emptyLabel, Actions: []Action{{Type: ActArchive}}},
		Problem{Step: stepConditions, Where: "conditions", Kind: kindInput, Code: "needs_value", Message: "This condition needs a value."}},
	{"no label", onPublish(Action{Type: ActAddLabel}),
		Problem{Step: 0, Where: "step/0", Kind: kindInput, Code: "give_label", Message: "Give the label."}},
	{"no recipient", onPublish(Action{Type: ActNotify, Text: "x"}),
		Problem{Step: 0, Where: "step/0", Kind: kindInput, Code: "choose_recipient", Message: "Choose who this is for."}},
	{"no host", onPublish(Action{Type: ActWebhook}),
		Problem{Step: 0, Where: "step/0", Kind: kindInput, Code: "choose_host", Message: "Choose an allowed host."}},
	{"no group to keep access", onPublish(Action{Type: ActRestrict, Restricted: "view"}),
		Problem{Step: 0, Where: "step/0", Kind: kindInput, Code: "choose_group", Message: "Choose the group that keeps access."}},
	{"no template", onPublish(Action{Type: ActTemplate}),
		Problem{Step: 0, Where: "step/0", Kind: kindInput, Code: "choose_template", Message: "Choose a template."}},
	{"an unknown type", onPublish(Action{Type: "x"}),
		Problem{Step: 0, Where: "step/0", Kind: kindInput, Code: "not_an_action", Message: "Choose what this step does."}},
	{"a page step without a page", Definition{Trigger: Trigger{Kind: TriggerIncoming}, Actions: []Action{{Type: ActArchive}}},
		Problem{Step: 0, Where: "step/0", Kind: kindFit, Code: "needs_page", Message: "This step needs a page. Add a Find pages step before it."}},
	{"a restriction with a group", onPublish(Action{Type: ActRestrict, Restricted: "view", TargetID: &someGroup}), Problem{}},
}

func TestEachProblemSaysWhereItIsWhatKindAndItsCode(t *testing.T) {
	for _, c := range problemCases {
		got := c.d.Problems()
		if c.want == (Problem{}) {
			if len(got) != 0 {
				t.Errorf("%s: got %+v", c.name, got)
			}
			continue
		}
		if len(got) != 1 || got[0] != c.want {
			t.Errorf("%s: got %+v, want %+v", c.name, got, c.want)
		}
	}
}

// complete says whether a problem has its place, its kind, its code and its words.
func complete(p Problem) bool {
	return p.Where != "" && (p.Kind == kindInput || p.Kind == kindFit) && p.Code != "" && p.Message != ""
}

func TestEveryProblemHasAWhereAKindAndACode(t *testing.T) {
	deep := Condition{Kind: CondLabel, Value: "x"}
	for range maxCondDepth + 2 {
		deep = Condition{Kind: CondNot, Items: []Condition{deep}}
	}
	many := make([]Action, maxActions+1)
	for i := range many {
		many[i] = Action{Type: ActArchive}
	}
	d := Definition{Trigger: Trigger{Kind: "x"}, Conditions: &deep, Actions: append(many, Action{Type: ActComment, Text: string(make([]rune, maxTextRunes+1))})}
	got := d.Problems()
	if len(got) < 4 {
		t.Fatalf("got %+v", got)
	}
	for _, p := range got {
		if !complete(p) {
			t.Errorf("a problem without its place, kind or code: %+v", p)
		}
	}
}

func TestEachItemOfAnAllTreeHasItsOwnProblem(t *testing.T) {
	all := Condition{Kind: CondAll, Items: []Condition{{Kind: CondLabel}, {Kind: CondTitle, Value: "x"}, {Kind: CondOlder}}}
	got := Definition{Trigger: Trigger{Kind: "page.published"}, Conditions: &all, Actions: []Action{{Type: ActArchive}}}.Problems()
	if len(got) != 2 || got[0].Where != "condition/0" || got[1].Where != "condition/2" {
		t.Fatalf("got %+v", got)
	}
	for _, p := range got {
		if p.Step != stepConditions {
			t.Errorf("the step of a condition stays -2: %+v", p)
		}
	}
	anyTree := Condition{Kind: CondAny, Items: []Condition{{Kind: CondLabel}, {Kind: CondOlder}}}
	got = Definition{Trigger: Trigger{Kind: "page.published"}, Conditions: &anyTree, Actions: []Action{{Type: ActArchive}}}.Problems()
	if len(got) != 1 || got[0].Where != "conditions" {
		t.Fatalf("an any tree is one card: %+v", got)
	}
}

func TestAnAllTreeStillCountsEveryCondition(t *testing.T) {
	items := make([]Condition, maxCondCount)
	for i := range items {
		items[i] = Condition{Kind: CondLabel, Value: "x"}
	}
	all := Condition{Kind: CondAll, Items: items}
	got := Definition{Trigger: Trigger{Kind: "page.published"}, Conditions: &all, Actions: []Action{{Type: ActArchive}}}.Problems()
	if len(got) != 1 || got[0].Code != "too_deep" {
		t.Fatalf("a group of 50 under its root is 51 conditions: %+v", got)
	}
}

func TestAPageStepUnderATriggerWithoutAPageIsAProblemOfFit(t *testing.T) {
	d := Definition{Trigger: Trigger{Kind: TriggerSchedule, Every: EveryHour}, Actions: []Action{{Type: ActAddLabel, Label: "x"}}}
	got := d.Problems()
	if len(got) != 1 || got[0].Kind != kindFit || got[0].Code != "needs_page" || got[0].Where != "step/0" {
		t.Fatalf("got %+v", got)
	}
}

func TestConditionsWithoutAPageAreAProblemOfFit(t *testing.T) {
	c := Condition{Kind: CondLabel, Value: "x"}
	d := Definition{Trigger: Trigger{Kind: TriggerIncoming}, Conditions: &c, Actions: []Action{{Type: ActFind}}}
	got := d.Problems()
	if len(got) != 1 || got[0].Kind != kindFit || got[0].Code != "conditions_need_page" || got[0].Where != "conditions" || got[0].Step != stepConditions {
		t.Fatalf("got %+v", got)
	}
}

func TestADefinitionNamesWhatItRefersTo(t *testing.T) {
	page, space, person, group, template := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	all := Condition{Kind: CondAll, Items: []Condition{
		{Kind: CondBelow, Value: page.String()}, {Kind: CondSpace, Value: space.String()},
		{Kind: CondAuthor, Value: person.String()}, {Kind: CondInGroup, Value: group.String()}, {Kind: CondLabel, Value: "not an id"},
	}}
	d := Definition{Trigger: Trigger{Kind: "page.published"}, Conditions: &all, Actions: []Action{
		{Type: ActMove, ParentID: &page, SpaceID: &space}, {Type: ActTemplate, TargetID: &template},
		{Type: ActNotify, To: ToGroup, TargetID: &group}, {Type: ActOwner, TargetID: &person},
	}}
	got := d.references()
	want := references{pages: []uuid.UUID{page}, spaces: []uuid.UUID{space}, people: []uuid.UUID{person},
		groups: []uuid.UUID{group}, templates: []uuid.UUID{template}}
	if !sameIDs(got.pages, want.pages) || !sameIDs(got.spaces, want.spaces) || !sameIDs(got.people, want.people) ||
		!sameIDs(got.groups, want.groups) || !sameIDs(got.templates, want.templates) {
		t.Fatalf("got %+v", got)
	}
}

func sameIDs(a, b []uuid.UUID) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
