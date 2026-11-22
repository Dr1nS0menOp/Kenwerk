// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/permissions"
)

// Spec 094: the key of a space in addresses, and what a person without access sees.

// answerOf sets what a person without access to a space sees.
func (u *user) answerOf(space, answer string) {
	u.e.t.Helper()
	u.ok("PUT", "/api/v1/spaces/"+space+"/access-answer", map[string]any{"answer": answer})
}

// refusals is a space with a page of every kind a person without access may hit, and a person
// who may see the space but not one page in it.
type refusals struct {
	e                                   *env
	owner, reader, outsider             *user
	space, other                        string
	open, trashed, draft, restricted    string
	template, elsewhere, otherSpaceHome string
}

func newRefusals(e *env, key string) refusals {
	e.t.Helper()
	r := refusals{e: e}
	r.owner = e.user(strings.ToLower(key)+"-owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	r.reader = e.user(strings.ToLower(key)+"-reader@example.com", identity.PermUseProduct)
	r.outsider = e.user(strings.ToLower(key)+"-outsider@example.com", identity.PermUseProduct)
	r.space, _ = r.owner.spaceAsMade(key)
	r.owner.grant(r.space, "user", r.reader.id, permissions.TemplateViewer)
	r.open = r.owner.page(r.space, nil, "Open zanzibar", "x")
	r.trashed = r.owner.page(r.space, nil, "Trashed zanzibar", "x")
	r.owner.ok("DELETE", "/api/v1/pages/"+r.trashed, nil)
	r.draft = r.owner.ok("POST", "/api/v1/pages", map[string]any{"space_id": r.space, "title": "Draft zanzibar"})["id"].(string)
	r.restricted = r.owner.page(r.space, nil, "Restricted zanzibar", "x")
	r.owner.restrict(r.restricted, "view", r.owner.id)
	tpl := r.owner.ok("POST", "/api/v1/spaces/"+r.space+"/templates", map[string]any{"name": "Template zanzibar", "document": para("x")})["id"].(string)
	r.template = e.scalar("SELECT page_id::text FROM templates WHERE id = $1", tpl)
	r.other, r.otherSpaceHome = r.owner.spaceAsMade(key + "OTHER")
	r.elsewhere = r.owner.page(r.other, nil, "Elsewhere zanzibar", "x")
	return r
}

// TestASpaceThatStaysHiddenAnswersEveryRefusalAlike is test 1 of spec 094: for a space at Not
// found, every page and key a person may not see answers byte for byte as one that never existed.
func TestASpaceThatStaysHiddenAnswersEveryRefusalAlike(t *testing.T) {
	e := newEnv(t)
	r := newRefusals(e, "HID")
	r.owner.answerOf(r.space, "not_found")
	r.owner.answerOf(r.other, "not_found")
	r.owner.ok("PUT", "/api/v1/spaces/"+r.space+"/key", map[string]any{"key": "HIDNEW"})

	unknown := r.outsider.want(404, "GET", "/api/v1/pages/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", nil)
	for who, u := range map[string]*user{"outsider": r.outsider, "reader": r.reader} {
		for name, page := range map[string]string{"trashed": r.trashed, "draft": r.draft, "restricted": r.restricted,
			"template": r.template, "elsewhere": r.elsewhere, "open": r.open} {
			if who == "reader" && name == "open" {
				continue
			}
			if got := u.want(404, "GET", "/api/v1/pages/"+page, nil); got != unknown {
				t.Fatalf("%s, %s page: %s, want %s", who, name, got, unknown)
			}
		}
	}
	unknownKey := r.outsider.want(404, "GET", "/api/v1/space-keys/NEVERWAS", nil)
	for _, key := range []string{"HID", "hidnew", "HIDOTHER"} {
		if got := r.outsider.want(404, "GET", "/api/v1/space-keys/"+key, nil); got != unknownKey {
			t.Fatalf("key %s: %s, want %s", key, got, unknownKey)
		}
	}
}

// TestASpaceSetToStayHiddenStillAnswersNotFound is test 2: a space that went to No access and
// back answers not found again, and the instance's switch changes nothing of that.
func TestASpaceSetToStayHiddenStillAnswersNotFound(t *testing.T) {
	e := newEnv(t)
	r := newRefusals(e, "BACK")
	r.owner.answerOf(r.space, "no_access")
	r.outsider.want(403, "GET", "/api/v1/pages/"+r.open, nil)
	r.owner.answerOf(r.space, "not_found")
	unknown := r.outsider.want(404, "GET", "/api/v1/pages/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", nil)
	if got := r.outsider.want(404, "GET", "/api/v1/pages/"+r.open, nil); got != unknown {
		t.Fatalf("back to hidden: %s", got)
	}
	admin(e).ok("PUT", "/api/v1/admin/features", map[string]any{"off": []string{"access_requests"}, "new_off": []string{}})
	if got := r.outsider.want(404, "GET", "/api/v1/pages/"+r.open, nil); got != unknown {
		t.Fatalf("with requests off everywhere: %s", got)
	}
	r.outsider.want(404, "GET", "/api/v1/space-keys/BACK", nil)
	r.outsider.want(404, "POST", "/api/v1/pages/"+r.open+"/access-requests", map[string]any{"kind": "view"})
}

// TestNoAccessSaysSoAndNothingMore is test 3: the answer names nothing of the page or its space,
// is the same inside a visible space and outside it, and leaves the cases of rule 21 not found.
func TestNoAccessSaysSoAndNothingMore(t *testing.T) {
	e := newEnv(t)
	r := newRefusals(e, "NOACC")
	r.owner.answerOf(r.space, "no_access")
	outside := r.outsider.want(403, "GET", "/api/v1/pages/"+r.open, nil)
	inside := r.reader.want(403, "GET", "/api/v1/pages/"+r.restricted, nil)
	if outside != inside {
		t.Fatalf("the answer differs: %s and %s", outside, inside)
	}
	if !strings.Contains(outside, `"no_access"`) {
		t.Fatalf("code: %s", outside)
	}
	for _, secret := range []string{"zanzibar", "NOACC", "noacc", r.open, r.restricted, r.space, "Space"} {
		if strings.Contains(outside, secret) {
			t.Fatalf("the answer names %q: %s", secret, outside)
		}
	}
	for _, page := range []string{r.trashed, r.draft, r.template} {
		r.outsider.want(404, "GET", "/api/v1/pages/"+page, nil)
	}
	if body := r.outsider.want(403, "GET", "/api/v1/space-keys/NOACC", nil); !strings.Contains(body, `"no_access"`) || strings.Contains(body, r.space) {
		t.Fatalf("the space's answer: %s", body)
	}
	r.outsider.want(404, "POST", "/api/v1/pages/"+r.open+"/access-requests", map[string]any{"kind": "view"})
}

// TestNoAccessAndAskOffersARequest is test 4: the code says asking is possible, asking works as
// before, and the instance's switch takes the offer away (D12).
func TestNoAccessAndAskOffersARequest(t *testing.T) {
	e := newEnv(t)
	r := newRefusals(e, "ASK")
	// A new space starts here (D11).
	if body := r.outsider.want(403, "GET", "/api/v1/pages/"+r.open, nil); !strings.Contains(body, `"no_access_ask"`) {
		t.Fatalf("a new space: %s", body)
	}
	r.outsider.want(403, "GET", "/api/v1/space-keys/ASK", nil)
	r.outsider.ok("POST", "/api/v1/pages/"+r.open+"/access-requests", map[string]any{"kind": "view"})
	r.outsider.want(409, "POST", "/api/v1/pages/"+r.open+"/access-requests", map[string]any{"kind": "view"})
	if e.auditActions("access.requested") != 1 {
		t.Fatal("a request is audited")
	}
	admin(e).ok("PUT", "/api/v1/admin/features", map[string]any{"off": []string{"access_requests"}, "new_off": []string{}})
	if body := r.outsider.want(403, "GET", "/api/v1/pages/"+r.open, nil); !strings.Contains(body, `"no_access"`) {
		t.Fatalf("with requests off everywhere: %s", body)
	}
	r.outsider.want(404, "POST", "/api/v1/pages/"+r.restricted+"/access-requests", map[string]any{"kind": "view"})
}

// TestTheDraftSpaceOfAPairStaysHidden is test 5 (rule 28, PUB-108).
func TestTheDraftSpaceOfAPairStaysHidden(t *testing.T) {
	e := newEnv(t)
	w := newPubWorld(e, "DRAFTHID")
	page := w.writer.page(w.draft, nil, "Draft only", "x")
	if body := w.admin.want(409, "PUT", "/api/v1/spaces/"+w.draft+"/access-answer", map[string]any{"answer": "no_access"}); !strings.Contains(body, "managed_space") {
		t.Fatalf("the setting of a draft space: %s", body)
	}
	// Even a value written before the space joined a pair changes nothing.
	e.sql("UPDATE spaces SET access_answer = 'no_access_ask' WHERE id = $1", w.draft)
	unknown := w.reader.want(404, "GET", "/api/v1/pages/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", nil)
	if got := w.reader.want(404, "GET", "/api/v1/pages/"+page, nil); got != unknown {
		t.Fatalf("a page of the draft space: %s", got)
	}
	w.reader.want(404, "GET", "/api/v1/space-keys/"+w.draftKey, nil)
	if got := w.admin.ok("GET", "/api/v1/spaces/"+w.draft, nil)["access_answer"]; got != "not_found" {
		t.Fatalf("the draft space shows %v", got)
	}
}

// TestTheAccessAnswerIsASettingOfItsAdministrators is test 6, and the API of section 5.
func TestTheAccessAnswerIsASettingOfItsAdministrators(t *testing.T) {
	e := newEnv(t)
	owner := e.user("setans-owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	editor := e.user("setans-editor@example.com", identity.PermUseProduct)
	viewer := e.user("setans-viewer@example.com", identity.PermUseProduct)
	space, _ := owner.spaceAsMade("SETANS")
	owner.grant(space, "user", editor.id, permissions.TemplateEditor)
	owner.grant(space, "user", viewer.id, permissions.TemplateViewer)
	if got := owner.ok("GET", "/api/v1/spaces/"+space, nil)["access_answer"]; got != "no_access_ask" {
		t.Fatalf("a new space starts at %v", got)
	}
	if _, shown := viewer.ok("GET", "/api/v1/spaces/"+space, nil)["access_answer"]; shown {
		t.Fatal("only its administrators read the setting")
	}
	editor.want(403, "PUT", "/api/v1/spaces/"+space+"/access-answer", map[string]any{"answer": "not_found"})
	owner.want(400, "PUT", "/api/v1/spaces/"+space+"/access-answer", map[string]any{"answer": "maybe"})
	owner.answerOf(space, "no_access")
	if got := owner.ok("GET", "/api/v1/spaces/"+space, nil)["access_answer"]; got != "no_access" {
		t.Fatalf("after the change: %v", got)
	}
	if n := e.audited(`action = 'space.access_answer_changed' AND payload::text LIKE '%"from":"no_access_ask"%' AND payload::text LIKE '%"to":"no_access"%'`); n != 1 {
		t.Fatalf("audited %d times", n)
	}
	if e.outboxCount("space.access_answer_changed") != 1 {
		t.Fatal("no outbox event")
	}
	// The previous release reads the feature, which follows the setting.
	if e.scalar("SELECT enabled::text FROM space_features WHERE space_id = $1 AND feature = 'access_requests'", space) != "false" {
		t.Fatal("the feature did not follow")
	}
	owner.want(400, "PUT", "/api/v1/spaces/"+space+"/features", map[string]any{"access_requests": true})
	if _, listed := owner.ok("GET", "/api/v1/spaces/"+space, nil)["features"].(map[string]any)["access_requests"]; listed {
		t.Fatal("the setting replaces the feature switch")
	}
}

// TestTheMigrationKeepsWhatEachSpaceAnswered is test 7: an existing space that offered requests
// asks, every other existing space stays hidden, and a new space asks.
func TestTheMigrationKeepsWhatEachSpaceAnswered(t *testing.T) {
	e := newEnv(t)
	owner := e.user("mig@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	offering, _ := owner.space("OFFERING")
	quiet, _ := owner.space("QUIET")
	never, _ := owner.space("NEVER")
	e.sql("UPDATE space_features SET enabled = (space_id = $1) WHERE feature = 'access_requests'", offering)
	e.sql("DELETE FROM space_features WHERE space_id = $1", never)
	e.sql("ALTER TABLE spaces DROP COLUMN access_answer")
	migs, err := db.Migrations()
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range migs {
		if m.Name == "space_access_answer" {
			e.sql(m.SQL)
			e.sql(m.SQL) // it may run twice
		}
	}
	for space, want := range map[string]string{offering: "no_access_ask", quiet: "not_found", never: "not_found"} {
		if got := e.scalar("SELECT access_answer FROM spaces WHERE id = $1", space); got != want {
			t.Fatalf("space %s: %s, want %s", space, got, want)
		}
	}
	made, _ := owner.spaceAsMade("MADELATER")
	if got := e.scalar("SELECT access_answer FROM spaces WHERE id = $1", made); got != "no_access_ask" {
		t.Fatalf("a space made afterwards: %s", got)
	}
}

// TestARequestFromTheNoAccessScreenAsksTheSpaceOwnersFirst is test 7a (rule 29a, D17, D18).
func TestARequestFromTheNoAccessScreenAsksTheSpaceOwnersFirst(t *testing.T) {
	e := newEnv(t)
	r := newRefusals(e, "OWNERS")
	keeper := e.user("keeper@example.com", identity.PermUseProduct)
	idle := e.user("idle@example.com", identity.PermUseProduct)
	r.owner.grant(r.space, "user", keeper.id, permissions.TemplateSpaceAdmin)
	// An owner who may not grant is passed over; the first who may is asked.
	r.owner.ok("PUT", "/api/v1/spaces/"+r.space+"/owners", map[string]any{"user_ids": []string{idle.id, keeper.id}})
	r.outsider.ok("POST", "/api/v1/pages/"+r.open+"/access-requests", map[string]any{"kind": "view"})
	if got := e.scalar("SELECT asked_id::text FROM access_requests WHERE requester_id = $1", r.outsider.id); got != keeper.id {
		t.Fatalf("asked %s, want the owner %s", got, keeper.id)
	}
	// Without an owner who may grant, today's chain: the creator of the page.
	r.owner.ok("PUT", "/api/v1/spaces/"+r.space+"/owners", map[string]any{"user_ids": []string{idle.id}})
	r.reader.ok("POST", "/api/v1/pages/"+r.restricted+"/access-requests", map[string]any{"kind": "view"})
	if got := e.scalar("SELECT asked_id::text FROM access_requests WHERE requester_id = $1", r.reader.id); got != r.owner.id {
		t.Fatalf("asked %s, want the creator %s", got, r.owner.id)
	}
}

// TestOnePersonHasAtMostTwentyOpenViewRequests is D18.
func TestOnePersonHasAtMostTwentyOpenViewRequests(t *testing.T) {
	e := newEnv(t)
	r := newRefusals(e, "CAP")
	for i := range 21 {
		page := r.owner.page(r.space, nil, fmt.Sprintf("Page %d", i), "x")
		if i < 20 {
			r.outsider.ok("POST", "/api/v1/pages/"+page+"/access-requests", map[string]any{"kind": "view"})
			continue
		}
		if body := r.outsider.want(429, "POST", "/api/v1/pages/"+page+"/access-requests", map[string]any{"kind": "view"}); !strings.Contains(body, "too_many_requests") {
			t.Fatalf("the 21st: %s", body)
		}
	}
	if e.auditActions("access.requested") != 20 {
		t.Fatal("twenty requests are audited")
	}
}

// TestAKeyInAnyCaseOrAnOldKeyFindsTheSpaceUnderItsCurrentKey is test 8.
func TestAKeyInAnyCaseOrAnOldKeyFindsTheSpaceUnderItsCurrentKey(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("Blue")
	owner.ok("PUT", "/api/v1/spaces/"+space+"/key", map[string]any{"key": "Navy"})
	for _, key := range []string{"blue", "BLUE", "navy", "NAVY", "Navy"} {
		if got := viewer.ok("GET", "/api/v1/space-keys/"+key, nil)["key"]; got != "Navy" {
			t.Fatalf("%s: %v", key, got)
		}
	}
}

// TestOneKeyBelongsToOneSpaceInEitherTable proves the database refuses what a change of key and
// a new space at the same moment could otherwise write: one key as one space's old key and
// another space's current key.
func TestOneKeyBelongsToOneSpaceInEitherTable(t *testing.T) {
	e := newEnv(t)
	owner := e.user("keys@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	first, _ := owner.space("FIRST")
	second, _ := owner.space("SECOND")
	ctx := context.Background()
	pool := e.app.Pool()
	if _, err := pool.Exec(ctx, "INSERT INTO space_key_aliases (alias, space_id) VALUES ('second', $1)", first); !db.IsUniqueViolation(err) {
		t.Fatalf("an old key that is another's current key: %v", err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO space_key_aliases (alias, space_id) VALUES ('third', $1)", first); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE spaces SET key = 'Third' WHERE id = $1", second); !db.IsUniqueViolation(err) {
		t.Fatalf("a current key that is another's old key: %v", err)
	}
	// What a space lets go of is free again, and its own old key it may take back.
	if _, err := pool.Exec(ctx, "DELETE FROM space_key_aliases WHERE alias = 'third'"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE spaces SET key = 'Third' WHERE id = $1", second); err != nil {
		t.Fatalf("a freed key: %v", err)
	}
	owner.ok("PUT", "/api/v1/spaces/"+first+"/key", map[string]any{"key": "FOURTH"})
	owner.ok("PUT", "/api/v1/spaces/"+first+"/key", map[string]any{"key": "FIRST"})
	owner.ok("POST", "/api/v1/spaces", map[string]any{"key": "SECOND", "name": "Takes the freed key"})
	owner.want(409, "POST", "/api/v1/spaces", map[string]any{"key": "fourth", "name": "An old key stays taken"})
}

// TestThePageCarriesItsCanonicalAddress is the API of sections 1 and 2: every reader of a page
// can read its address, built from its space's current key.
func TestThePageCarriesItsCanonicalAddress(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("Addr")
	home := owner.ok("GET", "/api/v1/spaces/"+space, nil)["home_page_id"].(string)
	page := owner.page(space, nil, "Child", "x")
	if got := viewer.ok("GET", "/api/v1/pages/"+home, nil); got["address"] != "/spaces/Addr" || got["space_key"] != "Addr" {
		t.Fatalf("home: %v %v", got["address"], got["space_key"])
	}
	if got := viewer.ok("GET", "/api/v1/pages/"+page, nil)["address"]; got != "/spaces/Addr/pages/"+page {
		t.Fatalf("page: %v", got)
	}
	owner.ok("PUT", "/api/v1/spaces/"+space+"/key", map[string]any{"key": "Moved"})
	if got := viewer.ok("GET", "/api/v1/pages/"+page, nil)["address"]; got != "/spaces/Moved/pages/"+page {
		t.Fatalf("after a change of key: %v", got)
	}
	facts := viewer.ok("POST", "/api/v1/pages/link-facts", map[string]any{"ids": []string{page}})
	if !strings.Contains(fmt.Sprint(facts), "space_key:Moved") {
		t.Fatalf("link facts: %v", facts)
	}
}

// TestMailNamesTheCanonicalAddress is test 11: a mail links to the page under its space's key,
// with the comment it is about, and the notification list carries the same address.
func TestMailNamesTheCanonicalAddress(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("Mailed")
	page := owner.page(space, nil, "Mailed page", "x")
	mailAt(owner, "comment")
	e.deliver()
	sendMail(e)
	comment := viewer.comment(page, "A remark")
	e.deliver()
	sent := sendMail(e)[owner.email]
	want := "/spaces/Mailed/pages/" + page + "#comment-" + comment
	if !strings.Contains(sent, want) {
		t.Fatalf("the mail does not link to %s:\n%s", want, sent)
	}
	rows := owner.notifications()
	if len(rows) == 0 || rows[0]["address"] != "/spaces/Mailed/pages/"+page {
		t.Fatalf("the notification's address: %v", rows)
	}
}
