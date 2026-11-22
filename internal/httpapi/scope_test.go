// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"net/http"
	"slices"
	"testing"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/ids"
)

func TestARouteWithoutAScopeDoesNotStart(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("a route a token can reach must name its scope, or the server must not start")
		}
	}()
	newRouter(passThrough, map[string]string{}).Handle("GET /api/v1/new", Authenticated(), http.NotFoundHandler())
}

func TestPublicAndSCIMRoutesNeedNoScope(t *testing.T) {
	r := newRouter(passThrough, map[string]string{})
	r.Handle("GET /api/v1/open", Public, http.NotFoundHandler())
	r.Handle("GET /scim/v2/Users", ScimToken(), http.NotFoundHandler())
	for _, route := range r.Routes() {
		if route.Access.Scope() != "" {
			t.Errorf("%s got scope %s", route.Pattern, route.Access.Scope())
		}
	}
}

func TestScopeNoneIsOnlyForRoutesNoTokenReaches(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("scope:none on a route a token reaches must not start")
		}
	}()
	newRouter(passThrough, map[string]string{"POST /api/v1/x": identity.ScopeNone}).
		Handle("POST /api/v1/x", Authenticated(), http.NotFoundHandler())
}

func limitsServer() *Server {
	return &Server{tokenCalls: newLimiter(tokenCallsPerMinute, 60e9), credentialLimits: newCredentialLimits()}
}

func tokenOf(person uuid.UUID, assistant bool) *identity.Principal {
	return &identity.Principal{User: identity.User{ID: person}, ViaToken: true, TokenID: ids.New(), Assistant: assistant}
}

func callsUntilRefused(s *Server, method string, a Access, p *identity.Principal, most int) (int, string) {
	r := &http.Request{Method: method}
	for n := 1; n <= most; n++ {
		if limit := s.overLimit(r, a, p); limit != "" {
			return n, limit
		}
	}
	return 0, ""
}

func TestEveryTokenOfAPersonCountsTowardsOneLimit(t *testing.T) {
	s, person := limitsServer(), ids.New()
	read := Access{scope: identity.ScopeContentRead}
	first, second := tokenOf(person, false), tokenOf(person, false)
	if n, _ := callsUntilRefused(s, http.MethodGet, read, first, tokenCallsPerMinute); n != 0 {
		t.Fatalf("the first token was refused at call %d", n)
	}
	if n, _ := callsUntilRefused(s, http.MethodGet, read, second, tokenCallsPerMinute); n != 0 {
		t.Fatalf("the second token was refused at call %d", n)
	}
	if limit := s.overLimit(&http.Request{Method: http.MethodGet}, read, tokenOf(person, false)); limit != limitPerson {
		t.Fatalf("call %d of one person: limit %q, want %q", personCallsPerMinute+1, limit, limitPerson)
	}
	if limit := s.overLimit(&http.Request{Method: http.MethodGet}, read, tokenOf(ids.New(), false)); limit != "" {
		t.Fatalf("another person was limited too: %q", limit)
	}
}

func TestOneTokenStopsAtItsOwnLimit(t *testing.T) {
	n, limit := callsUntilRefused(limitsServer(), http.MethodGet, Access{scope: identity.ScopeContentRead}, tokenOf(ids.New(), false), tokenCallsPerMinute+1)
	if n != tokenCallsPerMinute+1 || limit != limitCredential {
		t.Fatalf("refused at %d by %q, want %d by %q", n, limit, tokenCallsPerMinute+1, limitCredential)
	}
}

func TestAnAssistantChangesAtMost120TimesAMinute(t *testing.T) {
	n, limit := callsUntilRefused(limitsServer(), http.MethodPatch, Access{scope: identity.ScopeContentWrite}, tokenOf(ids.New(), true), 200)
	if n != assistantChangesPerMinute+1 || limit != limitChanges {
		t.Fatalf("refused at %d by %q, want %d by %q", n, limit, assistantChangesPerMinute+1, limitChanges)
	}
}

func TestAnAssistantDeletesOrSharesAtMost20TimesAMinute(t *testing.T) {
	for _, scope := range riskyScopes {
		n, limit := callsUntilRefused(limitsServer(), http.MethodPost, Access{scope: scope}, tokenOf(ids.New(), true), 50)
		if n != assistantRiskyPerMinute+1 || limit != limitRisky {
			t.Errorf("%s: refused at %d by %q, want %d by %q", scope, n, limit, assistantRiskyPerMinute+1, limitRisky)
		}
	}
}

func TestTheLimitsOfAnAssistantLeaveScriptsAndReadsAlone(t *testing.T) {
	share := Access{scope: identity.ScopeContentShare}
	if n, limit := callsUntilRefused(limitsServer(), http.MethodPost, share, tokenOf(ids.New(), false), 200); n != 0 {
		t.Fatalf("an ordinary token was refused at %d by %q", n, limit)
	}
	if n, limit := callsUntilRefused(limitsServer(), http.MethodGet, Access{scope: identity.ScopeContentRead}, tokenOf(ids.New(), true), 200); n != 0 {
		t.Fatalf("an assistant's reads were refused at %d by %q", n, limit)
	}
}

func TestRiskyScopesAreTheOnesThatDeleteShareOrChangeAccess(t *testing.T) {
	for _, scope := range []string{identity.ScopeContentWrite, identity.ScopeAccountWrite, identity.ScopeContentRead} {
		if slices.Contains(riskyScopes, scope) {
			t.Errorf("%s counts as deleting or sharing", scope)
		}
	}
}
