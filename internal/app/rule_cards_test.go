// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/automation"
	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/permissions"
)

// Rules as a chain of cards (spec 091): the screen's check, what it may name, and that the
// rules of who holds a rule (specs 092 and 093) hold for it as for every other client.

// scopedToken makes a token of the person that holds only these scopes.
func (u *user) scopedToken(scopes ...string) string {
	u.e.t.Helper()
	return u.e.tokenWith(u, scopes, "")
}

// doToken sends a request with a token in place of a session.
func (e *env) doToken(token, method, path string, body any) (int, string) {
	e.t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		e.t.Fatal(err)
	}
	resp, out := e.do(e.client(), method, path, string(raw), "Authorization", "Bearer "+token, "Content-Type", "application/json")
	return resp.StatusCode, out
}

func checkBody(definition map[string]any) map[string]any {
	return map[string]any{"definition": definition}
}

func TestTheRuleCardsAreOffUntilBothPartsAreOn(t *testing.T) {
	e := newEnv(t)
	owner, _, space, _ := ruleTeam(t, e)
	check := checkBody(onComment(map[string]any{"type": "add_label", "label": "x"}))
	refused := func(when string) {
		t.Helper()
		for _, path := range []string{"/api/v1/spaces/" + space + "/rules/check", "/api/v1/admin/rules/check"} {
			if out := owner.want(http.StatusNotFound, "POST", path, check); !strings.Contains(out, "experimental_off") {
				t.Errorf("%s: %s does not say the part is off: %s", when, path, out)
			}
		}
		if on := owner.ok("GET", "/api/v1/system/capabilities", nil)["rule_cards"]; on != false {
			t.Errorf("%s: the screens offer the cards: %v", when, on)
		}
	}
	owner.want(http.StatusNoContent, "PUT", "/api/v1/admin/experimental", map[string]any{"on": []string{"automation"}})
	refused("automation alone")
	owner.want(http.StatusNoContent, "PUT", "/api/v1/admin/experimental", map[string]any{"on": []string{"rule_cards"}})
	refused("the cards alone")
	// A rule still saves as before while the cards are off.
	owner.want(http.StatusNoContent, "PUT", "/api/v1/admin/experimental", map[string]any{"on": []string{"automation"}})
	owner.rule(space, "Tag", onComment(map[string]any{"type": "add_label", "label": "x"}))

	owner.want(http.StatusNoContent, "PUT", "/api/v1/admin/experimental", map[string]any{"on": []string{"automation", "rule_cards"}})
	if on := owner.ok("GET", "/api/v1/system/capabilities", nil)["rule_cards"]; on != true {
		t.Fatalf("both parts on, and the cards are not offered: %v", on)
	}
	owner.ok("POST", "/api/v1/spaces/"+space+"/rules/check", check)
}

func TestOnlyThoseWhoManageRulesMayCheckOne(t *testing.T) {
	e := newEnv(t)
	owner, reader, space, _ := ruleTeam(t, e)
	second := secondManager(t, e, space, owner)
	check := checkBody(onComment(map[string]any{"type": "add_label", "label": "x"}))
	if status, out := reader.do("POST", "/api/v1/spaces/"+space+"/rules/check", check); status != http.StatusForbidden && status != http.StatusNotFound {
		t.Fatalf("a reader checked a rule: %d %s", status, out)
	}
	// Managing the rules of a space is not managing the instance's.
	second.ok("POST", "/api/v1/spaces/"+space+"/rules/check", check)
	if status, out := second.do("POST", "/api/v1/admin/rules/check", check); status != http.StatusForbidden && status != http.StatusNotFound {
		t.Fatalf("a space's manager checked an instance rule: %d %s", status, out)
	}
	// The module decides, so no caller can skip the rule.
	spaceID := uuid.MustParse(space)
	if _, err := e.app.Automation().Check(context.Background(), identity.Caller{UserID: uuid.MustParse(reader.id)}, &spaceID, automation.Definition{}); err == nil {
		t.Fatal("the service checked a rule for someone who may not manage it")
	}
	if _, err := e.app.Automation().Check(context.Background(), identity.Caller{UserID: uuid.MustParse(second.id)}, nil, automation.Definition{}); err == nil {
		t.Fatal("the service checked an instance rule for someone who is no administrator")
	}
}

func TestATokenWithoutReadingContentCannotCheckARule(t *testing.T) {
	e := newEnv(t)
	owner, _, space, _ := ruleTeam(t, e)
	token := owner.scopedToken("people:read")
	check := checkBody(onComment(map[string]any{"type": "add_label", "label": "x"}))
	if status, _ := e.doToken(token, "POST", "/api/v1/spaces/"+space+"/rules/check", check); status != http.StatusForbidden {
		t.Fatalf("a token without content:read checked a rule: %d", status)
	}
	if status, _ := e.doToken(owner.scopedToken("content:read"), "POST", "/api/v1/spaces/"+space+"/rules/check", check); status != http.StatusOK {
		t.Fatalf("a token with content:read could not check a rule: %d", status)
	}
}

func TestCheckingARuleStoresNothing(t *testing.T) {
	e := newEnv(t)
	owner, _, space, _ := ruleTeam(t, e)
	counts := func() [3]int {
		return [3]int{e.count("SELECT count(*) FROM automation_rules"), e.count("SELECT count(*) FROM audit_entries"),
			e.count("SELECT count(*) FROM outbox_events")}
	}
	before := counts()
	got := owner.ok("POST", "/api/v1/spaces/"+space+"/rules/check", checkBody(onComment(map[string]any{"type": "add_label"})))
	if after := counts(); after != before {
		t.Fatalf("a check stored something: %v, then %v", before, after)
	}
	want := []any{map[string]any{"where": "step/0", "kind": "input", "code": "give_label", "step": float64(0), "message": "Give the label."}}
	if !reflect.DeepEqual(got["problems"], want) {
		t.Fatalf("a problem without its place: %v", got["problems"])
	}
}
func TestARuleWithoutATriggerCannotBeSaved(t *testing.T) {
	e := newEnv(t)
	owner, _, space, _ := ruleTeam(t, e)
	none := map[string]any{"trigger": map[string]any{"kind": ""}, "actions": []map[string]any{{"type": "add_label", "label": "x"}}}
	before := e.count("SELECT count(*) FROM automation_rules")
	for _, body := range []map[string]any{ruleBody("No trigger", false, none), {"name": "Imported", "definition": map[string]any{"actions": []any{}}}} {
		if code := errorCode(t, owner.want(http.StatusBadRequest, "POST", "/api/v1/spaces/"+space+"/rules", body)); code != "invalid_input" {
			t.Fatalf("code %q", code)
		}
	}
	owner.want(http.StatusBadRequest, "POST", "/api/v1/admin/rules", ruleBody("No trigger", false, none))
	if after := e.count("SELECT count(*) FROM automation_rules"); after != before {
		t.Fatal("a rule without a trigger was stored")
	}
	id := owner.rule(space, "Tag", onComment(map[string]any{"type": "add_label", "label": "x"}))
	owner.want(http.StatusBadRequest, "PUT", "/api/v1/rules/"+id, ruleBody("Tag", false, none))
	second := secondManager(t, e, space, owner)
	second.want(http.StatusBadRequest, "PUT", "/api/v1/rules/"+id, map[string]any{"name": "Tag", "enabled": false, "definition": none, "take_over": true})
	if got := owner.ok("GET", "/api/v1/rules/"+id, nil)["definition"].(map[string]any)["trigger"].(map[string]any)["kind"]; got != "page.commented" {
		t.Fatalf("the trigger became %v", got)
	}
}

// notReadyFields reads the fields of a refusal as field:problem, and its code.
func notReadyFields(t *testing.T, out string) (string, []string) {
	t.Helper()
	var body struct {
		Error struct {
			Code   string                `json:"code"`
			Fields []apperr.FieldProblem `json:"fields"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(out), &body); err != nil {
		t.Fatal(err)
	}
	fields := []string{}
	for _, f := range body.Error.Fields {
		fields = append(fields, f.Field+":"+f.Problem)
	}
	return body.Error.Code, fields
}

func TestSwitchingOnARuleThatIsNotReadyNamesItsProblems(t *testing.T) {
	e := newEnv(t)
	owner, _, space, _ := ruleTeam(t, e)
	unfinished := onComment(map[string]any{"type": "add_label"}, map[string]any{"type": "notify", "text": "x"})
	before := e.count("SELECT count(*) FROM automation_rules")
	out := owner.want(http.StatusBadRequest, "POST", "/api/v1/spaces/"+space+"/rules", ruleBody("Unfinished", true, unfinished))
	code, fields := notReadyFields(t, out)
	if code != "rule_not_ready" || !slices.Equal(fields, []string{"step/0:give_label", "step/1:choose_recipient"}) {
		t.Fatalf("the refusal does not name each problem: %s", out)
	}
	if e.count("SELECT count(*) FROM automation_rules") != before {
		t.Fatal("a rule that is not ready was stored")
	}
	id := owner.ok("POST", "/api/v1/spaces/"+space+"/rules", ruleBody("Unfinished", false, unfinished))["id"].(string)
	if code := errorCode(t, owner.want(http.StatusBadRequest, "PUT", "/api/v1/rules/"+id, ruleBody("Unfinished", true, unfinished))); code != "rule_not_ready" {
		t.Fatalf("code %q", code)
	}
	if owner.ok("GET", "/api/v1/rules/"+id, nil)["enabled"] != false {
		t.Fatal("a rule that is not ready was switched on")
	}
}

// naming is a rule that names a page only its owner may see, a page everyone in the space may
// see, a space only its owner may see, a person, and an id that is nothing.
type naming struct {
	owner, second              *user
	space, page, secret, other string
	definition                 map[string]any
}

func newNaming(t *testing.T) naming {
	t.Helper()
	e := newEnv(t)
	n := naming{}
	n.owner, _, n.space, n.page = ruleTeam(t, e)
	n.second = secondManager(t, e, n.space, n.owner)
	n.secret = n.owner.page(n.space, nil, "Salaries 2027", "x")
	n.owner.restrict(n.secret, "view", n.owner.id)
	n.other, _ = n.owner.space("OTH")
	n.definition = map[string]any{"trigger": map[string]any{"kind": "page.published"},
		"conditions": map[string]any{"kind": "any", "items": []map[string]any{
			{"kind": "below_page", "value": n.secret}, {"kind": "below_page", "value": n.page}, {"kind": "in_space", "value": n.other},
			{"kind": "created_by", "value": n.owner.id}, {"kind": "below_page", "value": uuid.NewString()},
		}},
		"actions": []map[string]any{{"type": "move", "parent_id": n.secret}}}
	return n
}

// namesFor checks the rule as u, and gives the names u's cards may show.
func (n naming) namesFor(t *testing.T, u *user) map[string]any {
	t.Helper()
	got, _ := u.ok("POST", "/api/v1/spaces/"+n.space+"/rules/check", checkBody(n.definition))["names"].(map[string]any)
	return got
}

func TestARuleCardNamesWhatItsViewerMaySee(t *testing.T) {
	n := newNaming(t)
	want := []string{n.secret, n.page, n.other, n.owner.id}
	got := n.namesFor(t, n.owner)
	for _, id := range want {
		if got[id] == nil {
			t.Errorf("%s is not named for the owner: %v", id, got)
		}
	}
	if len(got) != len(want) || got[n.secret] != "Salaries 2027" {
		t.Fatalf("the owner's names: %v", got)
	}
}

func TestARuleCardNeverNamesWhatItsViewerMayNotSee(t *testing.T) {
	n := newNaming(t)
	theirs := n.namesFor(t, n.second)
	for _, hidden := range []string{n.secret, n.other} {
		if _, named := theirs[hidden]; named {
			t.Errorf("a card named what its viewer may not see: %v", theirs)
		}
	}
	if theirs[n.page] != "Plan" || theirs[n.owner.id] == nil {
		t.Fatalf("a card does not name what its viewer may see: %v", theirs)
	}
	if raw, _ := json.Marshal(theirs); strings.Contains(string(raw), "Salaries") {
		t.Fatalf("the title leaked: %s", raw)
	}
}
func TestARuleSaysWhoHoldsIt(t *testing.T) {
	e := newEnv(t)
	owner, _, space, _ := ruleTeam(t, e)
	second := secondManager(t, e, space, owner)
	id := owner.rule(space, "Tag", onComment(map[string]any{"type": "add_label", "label": "x"}))
	if owner.ok("GET", "/api/v1/rules/"+id, nil)["you_hold"] != true {
		t.Fatal("the holder is not told they hold the rule")
	}
	if second.ok("GET", "/api/v1/rules/"+id, nil)["you_hold"] != false {
		t.Fatal("someone else is told they hold the rule")
	}
	for _, r := range second.ok("GET", "/api/v1/spaces/"+space+"/rules", nil)["rules"].([]any) {
		if r.(map[string]any)["you_hold"] != false {
			t.Fatal("the list tells someone else they hold the rule")
		}
	}
}

func TestTheCardsKeepTheHolderRules(t *testing.T) {
	e := newEnv(t)
	owner, _, space, _ := ruleTeam(t, e)
	second := secondManager(t, e, space, owner)
	tag := onComment(map[string]any{"type": "add_label", "label": "x"})
	id := owner.rule(space, "Tag", tag)
	// The check works for them, and their save and their address still need a take-over.
	second.ok("POST", "/api/v1/spaces/"+space+"/rules/check", checkBody(tag))
	changed := onComment(map[string]any{"type": "add_label", "label": "theirs"})
	for _, out := range []string{second.want(http.StatusConflict, "PUT", "/api/v1/rules/"+id, ruleBody("Tag", true, changed)),
		second.want(http.StatusConflict, "POST", "/api/v1/rules/"+id+"/hook", map[string]any{})} {
		if code := errorCode(t, out); code != "rule_held" {
			t.Fatalf("code %q", code)
		}
	}
	got := second.ok("PUT", "/api/v1/rules/"+id, map[string]any{"name": "Tag", "enabled": true, "definition": changed, "take_over": true})
	want := map[string]any{"you_hold": true, "enabled": false, "account_id": second.id}
	for key, value := range want {
		if got[key] != value {
			t.Fatalf("a take-over through the cards: %v", got)
		}
	}
	if owner.ok("GET", "/api/v1/rules/"+id, nil)["you_hold"] != false {
		t.Fatal("the previous holder is still told they hold the rule")
	}
}

// everyType is a rule of every condition kind and action type a client can save.
func everyType(t *testing.T, owner *user, space, page, group, template string) map[string]any {
	t.Helper()
	return map[string]any{
		"trigger": map[string]any{"kind": "page.published"},
		"conditions": map[string]any{"kind": "all", "items": []map[string]any{
			{"kind": "in_space", "value": space}, {"kind": "below_page", "value": page}, {"kind": "has_label", "value": "a"},
			{"kind": "has_status", "value": "Draft"}, {"kind": "title_contains", "value": "b"}, {"kind": "text_contains", "value": "c"},
			{"kind": "created_by", "value": owner.id}, {"kind": "older_than", "days": 3}, {"kind": "member_of", "value": group},
			{"kind": "any", "items": []map[string]any{{"kind": "has_label", "value": "d"}, {"kind": "not", "items": []map[string]any{{"kind": "has_label", "value": "e"}}}}},
		}},
		"actions": []map[string]any{
			{"type": "add_label", "label": "x"}, {"type": "remove_label", "label": "y"}, {"type": "set_status", "text": "Done"},
			{"type": "add_comment", "text": "Hi {page.title}"}, {"type": "notify", "to": "owner", "text": "See {page.url}"},
			{"type": "email", "to": "author", "text": "Mail"}, {"type": "assign_task", "to": "user", "target_id": owner.id, "text": "Do"},
			{"type": "add_watcher", "to": "group", "target_id": group}, {"type": "remove_watcher", "to": "owner"},
			{"type": "set_owner", "target_id": owner.id}, {"type": "restrict", "restricted": "edit", "target_id": group},
			{"type": "copy", "space_id": space}, {"type": "move", "parent_id": page},
			{"type": "new_from_template", "target_id": template, "title": "From {page.title}"},
			{"type": "find_pages", "label": "old", "older_days": 30}, {"type": "archive"}, {"type": "delete"},
		},
	}
}

func TestTheCardsSaveWhatTheFormSaves(t *testing.T) {
	e := newEnv(t)
	owner, _, space, page := ruleTeam(t, e)
	group := owner.ok("POST", "/api/v1/admin/groups", map[string]any{"name": "Editors"})["id"].(string)
	template := owner.ok("POST", "/api/v1/spaces/"+space+"/templates", map[string]any{"name": "Note", "document": fieldDocument("Topic", false)})["id"].(string)
	definition := everyType(t, owner, space, page, group, template)
	made := owner.ok("POST", "/api/v1/spaces/"+space+"/rules", ruleBody("Everything", false, definition))
	id := made["id"].(string)
	read := owner.ok("GET", "/api/v1/rules/"+id, nil)["definition"]
	want, err := json.Marshal(definition)
	if err != nil {
		t.Fatal(err)
	}
	var wanted any
	if err := json.Unmarshal(want, &wanted); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(read, wanted) {
		t.Fatalf("saved and read back differ:\n%v\n%v", read, wanted)
	}
	// The check names every reference of the rule for its owner.
	names := owner.ok("POST", "/api/v1/spaces/"+space+"/rules/check", checkBody(definition))["names"].(map[string]any)
	for _, ref := range []string{space, page, group, template, owner.id} {
		if names[ref] == nil {
			t.Errorf("%s is not named: %v", ref, names)
		}
	}
}

func TestTheCheckOfAnInstanceRuleIsForAdministratorsAndSessionsOnly(t *testing.T) {
	e := newEnv(t)
	owner, _, space, _ := ruleTeam(t, e)
	keeper := e.user("keeper@example.com", identity.PermUseProduct)
	owner.grant(space, "user", keeper.id, permissions.TemplateSpaceAdmin)
	check := checkBody(onComment(map[string]any{"type": "add_label", "label": "x"}))
	owner.ok("POST", "/api/v1/admin/rules/check", check)
	if status, _ := keeper.do("POST", "/api/v1/admin/rules/check", check); status != http.StatusForbidden {
		t.Fatalf("someone who is no administrator checked an instance rule: %d", status)
	}
	if status, _ := e.doToken(owner.scopedToken("admin:read"), "POST", "/api/v1/admin/rules/check", check); status == http.StatusOK {
		t.Fatal("a token checked an instance rule, which is for a session only")
	}
}

// ruleCheckBudget is what one check of the screen of cards may cost (spec 091, load budget):
// the session, the rule on rules, and one lookup for each thing the rule names. A check is
// asked at most every 400 milliseconds while someone edits a rule. Measured on 2026-11-23 for a
// rule that names one page and one group: 19, of which the page's title as its viewer may see it
// costs the most, because it goes through the same access rule as opening the page.
const ruleCheckBudget = 19

func TestTheCheckOfARuleStaysWithinItsBudget(t *testing.T) {
	e := newEnv(t)
	owner, _, space, page := ruleTeam(t, e)
	group := owner.ok("POST", "/api/v1/admin/groups", map[string]any{"name": "Editors"})["id"].(string)
	body := checkBody(map[string]any{"trigger": map[string]any{"kind": "page.published"},
		"conditions": map[string]any{"kind": "all", "items": []map[string]any{{"kind": "below_page", "value": page}}},
		"actions":    []map[string]any{{"type": "notify", "to": "group", "target_id": group, "text": "x"}}})
	lowest := int64(-1)
	for range 3 {
		before := db.Queries(e.app.Pool())
		owner.ok("POST", "/api/v1/spaces/"+space+"/rules/check", body)
		if n := db.Queries(e.app.Pool()) - before; lowest < 0 || n < lowest {
			lowest = n
		}
	}
	switch {
	case lowest > ruleCheckBudget:
		t.Errorf("a check costs %d queries, over its budget of %d", lowest, ruleCheckBudget)
	case lowest < ruleCheckBudget:
		t.Logf("a check costs %d queries, under its budget of %d: lower the budget", lowest, ruleCheckBudget)
	}
}
