// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"encoding/json"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/httpapi"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/ids"
)

// Credentials with limits (spec 096, wave MC2): a token never does more than its scopes, its
// spaces and its person allow.

// allScopes is every scope a credential can hold, written out apart from the identity package.
var allScopes = []string{"content:read", "content:write", "content:delete", "content:share", "content:export",
	"spaces:manage", "people:read", "account:read", "account:write", "admin:read", "admin:audit", "admin:system", "admin:write"}

// oldWords is what each word of a token made before spec 096 reaches (AC-15).
var oldWords = map[string][]string{
	"read":   {"content:read", "people:read", "account:read"},
	"write":  {"content:write", "content:delete", "content:share", "spaces:manage", "account:write"},
	"export": {"content:export"},
	"admin":  {"admin:read"},
}

// outsideEverySpace is the literal list of routes a credential limited to spaces never reaches:
// making a space, the members of a group, and changing a template, which may belong to no space.
var outsideEverySpace = regexp.MustCompile(`^(POST /api/v1/spaces|POST /api/v1/me/personal-space|(PUT|DELETE) /api/v1/groups/\{id\}/members/\{user\}|(POST|PUT|PATCH|DELETE) /api/v1/templates/\{id\}(/(entries|fields|sets|versions|withdraw|publishing|rights|rules).*)?)$`)

// gateCodes are the answers of the token check itself, before any rule of the route.
var gateCodes = []string{"session_only", "token_scope", "token_spaces", "token_read_only"}

// tokenWith makes a token of u and stores exactly these scope words for it, as a token of any
// release would have them. space limits it, when not empty.
func (e *env) tokenWith(u *user, stored []string, space string) string {
	e.t.Helper()
	body := map[string]any{"name": "t", "scopes": []string{"read"}}
	if space != "" {
		body["spaces"] = []string{space}
	}
	made := u.ok("POST", "/api/v1/me/tokens", body)
	id := made["token"].(map[string]any)["id"].(string)
	if _, err := e.app.Pool().Exec(context.Background(), "UPDATE api_tokens SET scopes = $2 WHERE id = $1", id, stored); err != nil {
		e.t.Fatal(err)
	}
	return made["secret"].(string)
}

func gateAnswer(out string) string {
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.Unmarshal([]byte(out), &body)
	if slices.Contains(gateCodes, body.Error.Code) {
		return body.Error.Code
	}
	return ""
}

var pathParam = regexp.MustCompile(`\{[^}]+\}`)

// gateTokens are the tokens the walk over the route table uses, each of its own person where
// the limits per person would otherwise count them together.
type gateTokens struct {
	exact, allBut, words map[string]string
	limited              string
	notAdmin             []string
}

func (e *env) gateTokens() gateTokens {
	e.t.Helper()
	perms := []string{identity.PermUseProduct, identity.PermCreateSpace}
	exactOwner, otherOwner, limitedOwner := e.user("exact@example.com", perms...), e.user("other@example.com", perms...),
		e.user("limited@example.com", perms...)
	g := gateTokens{exact: map[string]string{}, allBut: map[string]string{}, words: map[string]string{}}
	for _, scope := range allScopes {
		g.exact[scope] = e.tokenWith(exactOwner, []string{scope}, "")
		g.allBut[scope] = e.tokenWith(otherOwner, slices.DeleteFunc(slices.Clone(allScopes), func(s string) bool { return s == scope }), "")
		if !strings.HasPrefix(scope, "admin:") {
			g.notAdmin = append(g.notAdmin, scope)
		}
	}
	space, _ := limitedOwner.space("LIM")
	g.limited = e.tokenWith(limitedOwner, g.notAdmin, space)
	for word := range oldWords {
		g.words[word] = e.tokenWith(e.user(word+"@example.com", perms...), []string{word}, "")
	}
	return g
}

// gateRoute is one route of the walk, with a way to ask it as a token.
type gateRoute struct {
	e           *env
	pattern     string
	scope       string
	sessionOnly bool
	method      string
	path        string
}

func (r gateRoute) answer(token string) string {
	body := ""
	if r.method != "GET" && r.method != "HEAD" {
		body = "{}"
	}
	_, out := r.e.bearer(r.method, r.path, token, body)
	return gateAnswer(out)
}

// expect checks one answer: a session-only route refuses every token; any other passes or
// is refused by the token check as pass says.
func (r gateRoute) expect(who, got string, pass bool) {
	r.e.t.Helper()
	switch {
	case r.sessionOnly && got != "session_only":
		r.e.t.Errorf("%s with %s: %q, want session_only", r.pattern, who, got)
	case !r.sessionOnly && pass && got != "":
		r.e.t.Errorf("%s with %s: refused with %q", r.pattern, who, got)
	case !r.sessionOnly && !pass && got == "":
		r.e.t.Errorf("%s with %s: passed the token check", r.pattern, who)
	}
}

func (r gateRoute) check(g gateTokens) {
	r.e.t.Helper()
	if r.scope != "none" {
		r.expect("exactly "+r.scope, r.answer(g.exact[r.scope]), true)
		r.expect("every scope but "+r.scope, r.answer(g.allBut[r.scope]), false)
	}
	outside := outsideEverySpace.MatchString(r.pattern)
	got := r.answer(g.limited)
	r.expect("a token limited to a space", got, slices.Contains(g.notAdmin, r.scope) && !outside)
	if outside && !r.sessionOnly && got != "token_spaces" {
		r.e.t.Errorf("%s with a token limited to a space: %q, want token_spaces", r.pattern, got)
	}
	for word, token := range g.words {
		r.expect("the old word "+word, r.answer(token), slices.Contains(oldWords[word], r.scope))
	}
}

// TestATokenReachesOnlyWhatItsScopesAndSpacesAllow walks the real route table (AC-1, AC-3,
// AC-15): for every route, a token with exactly its scope passes the token check, a token with
// every other scope does not, a token limited to a space does not reach a route outside every
// space or below Administration, and a token of each old word reaches what that word reached.
// A route added later is covered the moment it exists.
func TestATokenReachesOnlyWhatItsScopesAndSpacesAllow(t *testing.T) {
	e := newEnv(t)
	g := e.gateTokens()
	checked := 0
	for _, r := range e.app.Routes() {
		method, path, found := strings.Cut(r.Pattern, " ")
		if !found || r.Access.Scope() == "" {
			continue
		}
		checked++
		rule := r.Access.String()
		gateRoute{e: e, pattern: r.Pattern, scope: r.Access.Scope(), method: method,
			path:        pathParam.ReplaceAllString(path, ids.New().String()),
			sessionOnly: strings.HasPrefix(rule, "session-only") || strings.HasPrefix(rule, "sensitive")}.check(g)
	}
	if checked < 500 {
		t.Fatalf("only %d routes checked", checked)
	}
}

// TestTheScopeTableHoldsOnlyRealRoutes refuses a line of the table that outlived its route.
func TestTheScopeTableHoldsOnlyRealRoutes(t *testing.T) {
	e := newEnv(t)
	registered := map[string]bool{}
	for _, r := range e.app.Routes() {
		registered[r.Pattern] = true
	}
	for _, pattern := range httpapi.ScopedPatterns() {
		if !registered[pattern] {
			t.Errorf("the scope table names %s, which is no route", pattern)
		}
	}
}

// scopesThatMustHold are scopes the table must keep: sharing out, public links, sites, guests,
// grants, restrictions, webhooks, deleting a space and emptying the trash each need a scope of
// their own, never content:write.
var scopesThatMustHold = map[string]string{
	"POST /api/v1/pages/{id}/share":            "content:share",
	"PUT /api/v1/pages/{id}/public-link":       "content:share",
	"DELETE /api/v1/pages/{id}/public-link":    "content:share",
	"POST /api/v1/spaces/{id}/sites":           "content:share",
	"POST /api/v1/sites/{id}/publish":          "content:share",
	"POST /api/v1/spaces/{id}/guests":          "content:share",
	"PUT /api/v1/pages/{id}/restrictions":      "content:share",
	"POST /api/v1/access-requests/{id}/allow":  "content:share",
	"PUT /api/v1/groups/{id}/members/{user}":   "content:share",
	"PUT /api/v1/spaces/{id}/grants":           "spaces:manage",
	"PUT /api/v1/spaces/{id}/role-assignments": "spaces:manage",
	"PUT /api/v1/spaces/{id}/owners":           "spaces:manage",
	"POST /api/v1/spaces/{id}/webhooks":        "spaces:manage",
	"PATCH /api/v1/webhooks/{id}":              "spaces:manage",
	"DELETE /api/v1/spaces/{id}":               "spaces:manage",
	"DELETE /api/v1/trash/{id}":                "spaces:manage",
	"POST /api/v1/spaces/{id}/trash/bulk":      "spaces:manage",
	"POST /api/v1/spaces/{id}/files/delete":    "spaces:manage",
	"POST /api/v1/spaces":                      "spaces:manage",
	"PATCH /api/v1/pages/{id}":                 "content:write",
	"DELETE /api/v1/pages/{id}":                "content:delete",
	"GET /api/v1/pages/{id}":                   "content:read",
	"GET /api/v1/spaces/{id}/export.zip":       "content:export",
	"GET /api/v1/admin/features":               "admin:read",
	"GET /api/v1/admin/audit-events":           "admin:audit",
	"GET /api/v1/admin/system":                 "admin:system",
	"PUT /api/v1/admin/features":               "admin:write",
	"POST /api/v1/me/password":                 "none",
	"POST /api/v1/pages/{id}/signing":          "none",
}

// TestTheWriteScopeNoLongerCoversWhatReachesOutside holds scopesThatMustHold.
func TestTheWriteScopeNoLongerCoversWhatReachesOutside(t *testing.T) {
	e := newEnv(t)
	scopes := map[string]string{}
	for _, r := range e.app.Routes() {
		scopes[r.Pattern] = r.Access.Scope()
	}
	for pattern, scope := range scopesThatMustHold {
		if scopes[pattern] != scope {
			t.Errorf("%s: scope %q, want %q", pattern, scopes[pattern], scope)
		}
	}
}

// TestEveryRouteBelowAdministrationNeedsAnAdministrationScope keeps content scopes out of
// Administration and the other way round.
func TestEveryRouteBelowAdministrationNeedsAnAdministrationScope(t *testing.T) {
	e := newEnv(t)
	for _, r := range e.app.Routes() {
		_, path, _ := strings.Cut(r.Pattern, " ")
		scope := r.Access.Scope()
		if scope == "" || scope == "none" {
			continue
		}
		if strings.HasPrefix(path, "/api/v1/admin/") != strings.HasPrefix(scope, "admin:") {
			t.Errorf("%s has scope %s", r.Pattern, scope)
		}
	}
}

// twoSpaces is one person with a page in each of two spaces.
type twoSpaces struct {
	owner                            *user
	inside, outside, pageIn, pageOut string
}

func (e *env) twoSpaces() twoSpaces {
	e.t.Helper()
	w := twoSpaces{owner: e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)}
	w.inside, _ = w.owner.space("IN")
	w.outside, _ = w.owner.space("OUT")
	w.pageIn, w.pageOut = w.owner.page(w.inside, nil, "Inside page", "findme"), w.owner.page(w.outside, nil, "Outside page", "findme")
	return w
}

// TestATokenMadeWithoutSpacesReachesEverySpace: the limit is an explicit choice (decided by the
// product owner on 2026-11-22).
func TestATokenMadeWithoutSpacesReachesEverySpace(t *testing.T) {
	e := newEnv(t)
	w := e.twoSpaces()
	open := w.owner.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "open", "scopes": []string{"read"}})
	if spaces := open["token"].(map[string]any)["spaces"].([]any); len(spaces) != 0 {
		t.Fatalf("a token made without spaces is limited to %v", spaces)
	}
	for _, page := range []string{w.pageIn, w.pageOut} {
		if status, out := e.bearer("GET", "/api/v1/pages/"+page, open["secret"].(string), ""); status != 200 {
			t.Fatalf("a token without a limit reads every space: %d %s", status, out)
		}
	}
}

// TestALimitedTokenFindsNothingOutsideItsSpaces (AC-3): 404 for what lies outside, nothing of
// it in lists and search, and no new space.
func TestALimitedTokenFindsNothingOutsideItsSpaces(t *testing.T) {
	e := newEnv(t)
	w := e.twoSpaces()
	limited := w.owner.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "one space",
		"scopes": []string{"read", "write", "spaces:manage"}, "spaces": []string{w.inside}})["secret"].(string)
	if status, _ := e.bearer("GET", "/api/v1/pages/"+w.pageIn, limited, ""); status != 200 {
		t.Fatalf("a limited token reads its own space: %d", status)
	}
	for _, path := range []string{"/api/v1/pages/" + w.pageOut, "/api/v1/spaces/" + w.outside, "/api/v1/spaces/" + w.outside + "/tree",
		"/api/v1/pages/" + w.pageOut + "/comments", "/api/v1/pages/" + w.pageOut + "/attachments"} {
		if status, out := e.bearer("GET", path, limited, ""); status != 404 {
			t.Errorf("%s with a token of another space: %d %s, want 404", path, status, out)
		}
	}
	if status, _ := e.bearer("PATCH", "/api/v1/pages/"+w.pageOut, limited, `{"title":"x"}`); status != 404 {
		t.Errorf("a limited token changes a page outside: %d, want 404", status)
	}
	if _, list := e.bearer("GET", "/api/v1/spaces", limited, ""); !strings.Contains(list, w.inside) || strings.Contains(list, w.outside) {
		t.Errorf("the spaces of a limited token: %s", list)
	}
	if _, found := e.bearer("GET", "/api/v1/search?q=findme", limited, ""); strings.Contains(found, w.pageOut) {
		t.Errorf("search found a page outside the limit: %s", found)
	}
	if status, out := e.bearer("POST", "/api/v1/spaces", limited, `{"key":"NEW","name":"New"}`); status != 403 || !strings.Contains(out, "token_spaces") {
		t.Errorf("a limited token made a space: %d %s", status, out)
	}
}

func TestATokenIsLimitedOnlyToSpacesItsPersonSeesAndNeverToAdministration(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace, identity.PermAdministrator)
	stranger := e.user("stranger@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	mine, _ := owner.space("MINE")
	theirs, _ := stranger.space("THEIRS")
	many := make([]string, identity.MaxTokenSpaces+1)
	for i := range many {
		many[i] = ids.New().String()
	}
	for why, body := range map[string]map[string]any{
		"a limit to a space one cannot see": {"scopes": []string{"read"}, "spaces": []string{theirs}},
		"a limited token with admin":        {"scopes": []string{"read", "admin"}, "spaces": []string{mine}},
		"a token limited to 51 spaces":      {"scopes": []string{"read"}, "spaces": many},
		"a space named twice":               {"scopes": []string{"read"}, "spaces": []string{mine, mine}},
		"a scope nobody may choose yet":     {"scopes": []string{"admin:write"}},
	} {
		body["name"] = "x"
		if status, out := owner.do("POST", "/api/v1/me/tokens", body); status != 400 {
			t.Errorf("%s: %d %s", why, status, out)
		}
	}
	// 51 spaces nobody sees are refused for their number, before anyone asks who sees them.
	_, out := owner.do("POST", "/api/v1/me/tokens", map[string]any{"name": "x", "scopes": []string{"read"}, "spaces": many})
	if !strings.Contains(out, "at most 50") {
		t.Errorf("a token limited to 51 spaces is not refused for their number: %s", out)
	}
}

// shareWorld is a page in a space of its owner, and a reader to share it with.
type shareWorld struct {
	owner, reader *user
	space, page   string
}

func (e *env) shareWorld() shareWorld {
	e.t.Helper()
	w := shareWorld{owner: e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace),
		reader: e.user("reader@example.com", identity.PermUseProduct)}
	w.space, _ = w.owner.space("SHR")
	w.page = w.owner.page(w.space, nil, "Shared", "x")
	return w
}

// TestANewWriteTokenNeitherSharesNorChangesAccess: a new token names content:share and
// spaces:manage itself (decided on the product owner's behalf on 2026-11-22).
func TestANewWriteTokenNeitherSharesNorChangesAccess(t *testing.T) {
	e := newEnv(t)
	w := e.shareWorld()
	made := w.owner.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "new", "scopes": []string{"read", "write"}})
	held := made["token"].(map[string]any)["scopes"].([]any)
	if slices.Contains(held, any("content:share")) || slices.Contains(held, any("spaces:manage")) {
		t.Fatalf("a new write token holds %v", held)
	}
	share := `{"subjects":[{"type":"user","id":"` + w.reader.id + `"}],"permission":"view"}`
	if status, out := e.bearer("POST", "/api/v1/pages/"+w.page+"/share", made["secret"].(string), share); status != 403 || !strings.Contains(out, "token_scope") {
		t.Fatalf("a new write token shares: %d %s", status, out)
	}
	if status, out := e.bearer("PUT", "/api/v1/spaces/"+w.space+"/grants", made["secret"].(string), `{}`); status != 403 || !strings.Contains(out, "token_scope") {
		t.Fatalf("a new write token changes access: %d %s", status, out)
	}
}

// TestAnOldWriteTokenKeepsItsRightsAndSaysSo: a token made with write before spec 096 keeps
// sharing and looking after spaces, and the audit log says so on each such action.
func TestAnOldWriteTokenKeepsItsRightsAndSaysSo(t *testing.T) {
	e := newEnv(t)
	w := e.shareWorld()
	old := e.tokenWith(w.owner, []string{"read", "write"}, "")
	if _, out := e.bearer("PATCH", "/api/v1/pages/"+w.page, old, `{"title":"Renamed"}`); gateAnswer(out) != "" {
		t.Fatalf("an old write token writes: %s", out)
	}
	grant := `{"subject":{"type":"user","id":"` + w.reader.id + `"},"permissions":["space.view"]}`
	if status, out := e.bearer("PUT", "/api/v1/spaces/"+w.space+"/grants", old, grant); status/100 != 2 {
		t.Fatalf("an old write token keeps changing access: %d %s", status, out)
	}
	events, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{SpaceID: w.space, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(events, func(ev audit.Stored) bool { return ev.Via != nil && ev.Via.OldWrite }) {
		t.Fatalf("a change through the old word write is not noted: %+v", events)
	}
}

// viaCounts counts the events made through the token and through a session, and reports any
// that names another credential.
func viaCounts(t *testing.T, events []audit.Stored, tokenID any) (byToken, bySession int) {
	t.Helper()
	for _, ev := range events {
		switch {
		case ev.Via == nil:
			bySession++
		case ev.Via.Kind == audit.ViaToken && ev.Via.TokenID == tokenID && ev.Via.Assistant:
			byToken++
		default:
			t.Errorf("an event names the wrong credential: %+v", ev.Via)
		}
	}
	return byToken, bySession
}

// TestEveryEventOfATokenNamesTheToken (AC-10): what a token changes says which token, and
// whether it is an assistant's; what a browser session changes has no via; the chain verifies.
func TestEveryEventOfATokenNamesTheToken(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	space, _ := owner.space("VIA")
	page := owner.page(space, nil, "Page", "x")
	made := owner.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "assistant", "scopes": []string{"read", "write"}, "assistant": true})
	token := made["token"].(map[string]any)
	if token["assistant"] != true {
		t.Fatalf("the token is not marked for an assistant: %v", token)
	}
	if status, out := e.bearer("PATCH", "/api/v1/pages/"+page, made["secret"].(string), `{"title":"By the assistant"}`); status != 200 {
		t.Fatalf("the assistant edits: %d %s", status, out)
	}
	events, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{ObjectID: page, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if byToken, bySession := viaCounts(t, events, token["id"]); byToken == 0 || bySession == 0 {
		t.Fatalf("events through the token %d, through the session %d", byToken, bySession)
	}
	e.usedNamesTokenAndChainHolds(token["id"])
}

// usedNamesTokenAndChainHolds checks that token.used names the token and that the audit chain
// with via in it verifies.
func (e *env) usedNamesTokenAndChainHolds(tokenID any) {
	e.t.Helper()
	used, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{Action: "token.used", Limit: 10})
	if err != nil || len(used) == 0 || used[0].Via == nil || used[0].Via.TokenID != tokenID {
		e.t.Fatalf("token.used names no token: %v %+v", err, used)
	}
	if result, err := audit.Verify(context.Background(), e.app.Pool()); err != nil || !result.OK {
		e.t.Fatalf("the chain with via does not verify: %v %+v", err, result)
	}
}

// TestATokenWithEveryScopeIsStillOnlyItsPerson (AC-2): scopes never add a right, and a person
// who loses administration loses it through every token at the next request.
func TestATokenWithEveryScopeIsStillOnlyItsPerson(t *testing.T) {
	e := newEnv(t)
	root := e.user("root@example.com", identity.AllGlobalPermissions...)
	plain := e.user("plain@example.com", identity.PermUseProduct)
	plainToken := e.tokenWith(plain, allScopes, "")
	if status, _ := e.bearer("GET", "/api/v1/admin/features", plainToken, ""); status != 403 {
		t.Fatalf("a token of someone who is no administrator read Administration: %d", status)
	}
	admin := e.user("admin@example.com", identity.PermUseProduct, identity.PermAdministrator)
	adminToken := e.tokenWith(admin, []string{"read", "admin"}, "")
	if status, out := e.bearer("GET", "/api/v1/admin/features", adminToken, ""); status != 200 {
		t.Fatalf("an administrator's token reads Administration: %d %s", status, out)
	}
	root.ok("PUT", "/api/v1/admin/users/"+admin.id+"/permissions", map[string]any{"permissions": []string{identity.PermUseProduct}})
	if status, _ := e.bearer("GET", "/api/v1/admin/features", adminToken, ""); status != 403 {
		t.Fatalf("a token kept Administration after its person lost it: %d", status)
	}
}

func TestATokenPastItsLimitIsToldWhenToTryAgain(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	token := owner.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "assistant", "scopes": []string{"read", "write"}, "assistant": true})["secret"].(string)
	missing := "/api/v1/comments/" + ids.New().String()
	for range 20 {
		if resp, _ := e.do(e.client(), "DELETE", missing, "", "Authorization", "Bearer "+token); resp.StatusCode == 429 {
			t.Fatal("refused before the limit")
		}
	}
	resp, out := e.do(e.client(), "DELETE", missing, "", "Authorization", "Bearer "+token)
	if resp.StatusCode != 429 || resp.Header.Get("Retry-After") == "" {
		t.Fatalf("the 21st delete of an assistant: %d %q %s", resp.StatusCode, resp.Header.Get("Retry-After"), out)
	}
	if e.auditActions("token.rate_limited") != 1 {
		t.Fatal("the refusal is not audited once")
	}
	e.do(e.client(), "DELETE", missing, "", "Authorization", "Bearer "+token)
	if e.auditActions("token.rate_limited") != 1 {
		t.Fatal("every refusal of a minute is audited, not one")
	}
}
