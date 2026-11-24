// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/features"
	"github.com/kenwerk/kenwerk/internal/headerfooter"
	"github.com/kenwerk/kenwerk/internal/identity"
)

// The installation's header and footer (spec 089). Refusals first: off, who may not, what is
// refused and stores nothing; then what a change records and what every reader reads.

const (
	bandRoute      = "/api/v1/header-footer"
	bandAdminRoute = "/api/v1/admin/header-footer"
)

// classification is a header of one centred status mark.
func classification() map[string]any {
	return map[string]any{"type": "doc", "content": []any{map[string]any{"type": "paragraph", "attrs": map[string]any{"align": "center"},
		"content": []any{map[string]any{"type": "status", "attrs": map[string]any{"color": "blue", "text": "Internal"}}}}}}
}

// contactTo is a footer with one link.
func contactTo(href string) map[string]any {
	return map[string]any{"type": "doc", "content": []any{map[string]any{"type": "paragraph", "content": []any{
		map[string]any{"type": "text", "text": "Questions: "},
		map[string]any{"type": "text", "text": "the help desk", "marks": []any{map[string]any{"type": "link", "attrs": map[string]any{"href": href}}}},
	}}}}
}

func band(header, footer any) map[string]any {
	return map[string]any{"header": header, "footer": footer}
}

// bandEvents are the audit events of changes to the header and footer.
func bandEvents(t *testing.T, e *env) []audit.Stored {
	t.Helper()
	evs, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{Action: "settings.updated", ObjectID: "header_footer", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	return evs
}

// setParts turns on exactly the experimental parts named, as an administrator would.
func setParts(root *user, on []string) {
	root.ok("PUT", "/api/v1/admin/experimental", map[string]any{"on": on})
}

func partsBut(part string) []string {
	return slices.DeleteFunc(slices.Clone(features.ExperimentalParts), func(p string) bool { return p == part })
}

// assertNothingStored fails when the header and footer hold something, or a change was audited.
func assertNothingStored(t *testing.T, e *env, root *user) {
	t.Helper()
	if got := root.ok("GET", bandAdminRoute, nil); got["header"] != nil || got["footer"] != nil || got["changed_by"] != nil {
		t.Fatalf("something was stored: %v", got)
	}
	if n := len(bandEvents(t, e)); n != 0 {
		t.Fatalf("%d changes were audited", n)
	}
}

func TestTheHeaderAndFooterAreOffOnANewInstallation(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	member := e.user("member@example.com", identity.PermUseProduct)
	e.sql("DELETE FROM settings WHERE key = 'experimental'")
	mailRefusal(t, member, http.StatusNotFound, "GET", bandRoute, nil, "experimental_off")
	mailRefusal(t, root, http.StatusNotFound, "GET", bandAdminRoute, nil, "experimental_off")
	mailRefusal(t, root, http.StatusNotFound, "PUT", bandAdminRoute, band(classification(), nil), "experimental_off")
	if got := member.ok("GET", "/api/v1/system/capabilities", nil); got["header_footer"] != false {
		t.Fatalf("the capabilities offer the part: %v", got)
	}
	if n := len(bandEvents(t, e)); n != 0 {
		t.Fatalf("a change was audited while the part is off: %d", n)
	}
}

func TestOnlyAnAdministratorChangesTheHeaderAndFooter(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	member := e.user("member@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	member.space("OWNED")
	guest := e.userOfType("guest@example.com", identity.TypeGuest, identity.PermUseProduct)
	for _, u := range []*user{member, guest} {
		u.want(http.StatusForbidden, "PUT", bandAdminRoute, band(classification(), nil))
		u.want(http.StatusForbidden, "GET", bandAdminRoute, nil)
	}
	if status, out := e.bearer("PUT", bandAdminRoute, adminToken(root), `{"header": null, "footer": null}`); status != http.StatusForbidden ||
		!strings.Contains(out, "session_only") {
		t.Fatalf("a token changed the header and footer: %d %s", status, out)
	}
	_, err := e.app.HeaderFooter().Set(context.Background(), identity.Caller{UserID: uuid.MustParse(member.id)},
		headerfooter.Input{Header: []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x"}]}]}`)})
	if refusal, ok := apperr.As(err); !ok || refusal.Kind != apperr.KindForbidden {
		t.Fatalf("the service stored for a member: %v", err)
	}
	assertNothingStored(t, e, root)
}

func TestChangingTheHeaderAndFooterNeedsAFreshLogin(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	e.sql("UPDATE sessions SET created_at = now() - interval '11 minutes', reauth_at = NULL WHERE user_id = $1", root.id)
	mailRefusal(t, root, http.StatusForbidden, "PUT", bandAdminRoute, band(classification(), nil), "reauth_required")
	assertNothingStored(t, e, root)
	root.ok("POST", "/api/v1/auth/reauth", map[string]any{"password": adminPassword})
	if got := root.ok("PUT", bandAdminRoute, band(classification(), nil)); got["header"] == nil {
		t.Fatalf("the save after a fresh login: %v", got)
	}
}

func TestTheGenericSettingsRouteCannotReachTheHeaderAndFooter(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	root.want(http.StatusNotFound, "PUT", "/api/v1/admin/settings/header_footer", band(classification(), nil))
	root.want(http.StatusNotFound, "GET", "/api/v1/admin/settings/header_footer", nil)
	assertNothingStored(t, e, root)
}

func TestARefusedHeaderAndFooterStoreNothing(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	outbox := e.outboxCount("settings.updated")
	for href, problem := range map[string]string{"javascript:alert(1)": "not_allowed", "http://intranet.example/": "link_not_allowed",
		"https://intranet.example@other.example/": "link_not_allowed"} {
		out := root.want(http.StatusBadRequest, "PUT", bandAdminRoute, band(classification(), contactTo(href)))
		if !strings.Contains(out, `"field":"footer"`) || !strings.Contains(out, `"problem":"`+problem+`"`) {
			t.Fatalf("%s: the refusal does not name the footer and %s: %s", href, problem, out)
		}
	}
	assertNothingStored(t, e, root)
	if e.outboxCount("settings.updated") != outbox {
		t.Fatal("a refused change was sent on")
	}
}

// changeOf is what the newest change of the header and footer recorded of field.
func changeOf(t *testing.T, e *env, field string) map[string]any {
	t.Helper()
	evs := bandEvents(t, e)
	if len(evs) == 0 {
		t.Fatal("no change was audited")
	}
	change, _ := evs[0].Details["changes"].(map[string]any)[field].(map[string]any)
	return change
}

// shapeOf says which parts the newest change recorded of field: "none" when the field is not in it,
// else which of before, after and removed it holds.
func shapeOf(t *testing.T, e *env, field string) string {
	t.Helper()
	c := changeOf(t, e, field)
	if c == nil {
		return "none"
	}
	return fmt.Sprintf("before:%t after:%t removed:%v", c["before"] != nil, c["after"] != nil, c["removed"])
}

func TestTheHeaderAndFooterChangeIsAuditedWithWhatChanged(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	root.ok("PUT", bandAdminRoute, band(classification(), nil))
	if got := shapeOf(t, e, "header") + " / " + shapeOf(t, e, "footer"); got != "before:false after:true removed:<nil> / none" {
		t.Fatalf("a new header: %s", got)
	}
	root.ok("PUT", bandAdminRoute, band(classification(), nil))
	if n := len(bandEvents(t, e)); n != 1 {
		t.Fatalf("saving the same value twice wrote %d events", n)
	}
	root.ok("PUT", bandAdminRoute, band(nil, contactTo("mailto:help@example.org")))
	if got := shapeOf(t, e, "header"); got != "before:true after:false removed:true" {
		t.Fatalf("a removed header: %s", got)
	}
	if after, _ := json.Marshal(changeOf(t, e, "footer")["after"]); !strings.Contains(string(after), "mailto:help@example.org") {
		t.Fatal("the footer's content is not in the audit")
	}
	if e.outboxCount("settings.updated") < 2 {
		t.Fatal("a change was not sent on")
	}
}
func TestEveryReaderSeesTheSameHeaderAndFooter(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	member := e.user("member@example.com", identity.PermUseProduct)
	guest := e.userOfType("guest@example.com", identity.TypeGuest, identity.PermUseProduct)
	root.ok("PUT", bandAdminRoute, band(classification(), contactTo("https://help.example.org/")))
	_, asMember := member.do("GET", bandRoute, nil)
	_, asGuest := guest.do("GET", bandRoute, nil)
	if asMember != asGuest || !strings.Contains(asMember, "help.example.org") || !strings.Contains(asMember, `"version"`) {
		t.Fatalf("a member and a guest read differently:\n%s\n%s", asMember, asGuest)
	}
	if strings.Contains(asMember, "changed_by") || strings.Contains(asMember, root.id) {
		t.Fatalf("readers learn who changed it: %s", asMember)
	}
	if resp, _ := e.do(e.client(), "GET", bandRoute, ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("without a login: %d", resp.StatusCode)
	}
}

func TestTurningThePartOffKeepsWhatWasWritten(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	member := e.user("member@example.com", identity.PermUseProduct)
	root.ok("PUT", bandAdminRoute, band(classification(), nil))
	member.ok("GET", bandRoute, nil)
	setParts(root, partsBut(features.ExperimentalHeaderFooter))
	mailRefusal(t, member, http.StatusNotFound, "GET", bandRoute, nil, "experimental_off")
	setParts(root, features.ExperimentalParts)
	if got := member.ok("GET", bandRoute, nil); got["header"] == nil {
		t.Fatalf("turning the part on again lost the header: %v", got)
	}
}

func TestTheHeaderAndFooterNeverCarryContentOfASpace(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	space, home := root.space("SECRET")
	secret := root.page(space, home, "Secret plans", "the launch codes")
	stranger := e.user("stranger@example.com", identity.PermUseProduct)
	if status, _ := stranger.do("GET", "/api/v1/pages/"+secret, nil); status == http.StatusOK {
		t.Fatal("the stranger may read the secret page")
	}
	root.ok("PUT", bandAdminRoute, band(nil, contactTo("/pages/"+secret)))
	_, out := stranger.do("GET", bandRoute, nil)
	if !strings.Contains(out, secret) || strings.Contains(out, "Secret plans") || strings.Contains(out, "launch codes") ||
		strings.Contains(out, "SECRET") {
		t.Fatalf("the band carries content of a space the reader may not see: %s", out)
	}
	for _, node := range []map[string]any{
		{"type": "mention", "attrs": map[string]any{"id": root.id, "kind": "user", "label": "Admin"}},
		{"type": "pageLink", "attrs": map[string]any{"page": secret}},
	} {
		doc := map[string]any{"type": "doc", "content": []any{map[string]any{"type": "paragraph", "content": []any{node}}}}
		root.want(http.StatusBadRequest, "PUT", bandAdminRoute, band(doc, nil))
	}
}

// coldAndWarm counts the statements of the reader route with the node's copy dropped and kept,
// the lowest of a few runs each, because background work can only add statements.
func coldAndWarm(t *testing.T, e *env, u *user) (cold, warm int64) {
	t.Helper()
	cold, warm = -1, -1
	for range 3 {
		e.app.HeaderFooter().Forget()
		for _, n := range []*int64{&cold, &warm} {
			before := db.Queries(e.app.Pool())
			u.ok("GET", bandRoute, nil)
			if got := db.Queries(e.app.Pool()) - before; *n < 0 || got < *n {
				*n = got
			}
		}
	}
	return cold, warm
}

func TestTheHeaderAndFooterCostOneStatementWhenColdAndNoneWhenWarm(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	member := e.user("member@example.com", identity.PermUseProduct)
	root.ok("PUT", bandAdminRoute, band(classification(), nil))
	// Warm, the route costs only its access checks, which queryBudgets holds; cold, one more.
	if cold, warm := coldAndWarm(t, e, member); cold != warm+1 || warm > queryBudgets["the header and footer"] {
		t.Fatalf("the reader route costs %d statements cold and %d warm", cold, warm)
	}
	root.ok("PUT", bandAdminRoute, band(nil, nil))
	if got := member.ok("GET", bandRoute, nil); got["header"] != nil {
		t.Fatalf("a save on this node did not show at once: %v", got)
	}
}
