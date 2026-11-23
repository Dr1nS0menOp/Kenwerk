// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/mcp"
)

// POST /mcp (spec 096, wave MC4): the tools of wave MC3 over Streamable HTTP. Each tool runs as
// requests of the API inside the server, as the connection's token, so a token never does more
// through /mcp than through the API.

// requestMeta is what every request of revision 2026-07-28 says about its client in the body.
const requestMeta = `{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"test","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}`

// toolsListBody is one request of revision 2026-07-28.
const toolsListBody = `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":` + requestMeta + `}}`

// postMCP sends one raw message to /mcp with the headers of revision 2026-07-28 and any more.
func (e *env) postMCP(c *http.Client, body string, headers ...string) (*http.Response, string) {
	e.t.Helper()
	all := append([]string{"Accept", "application/json, text/event-stream", "Mcp-Protocol-Version", "2026-07-28",
		"Mcp-Method", "tools/list"}, headers...)
	return e.do(c, "POST", "/mcp", body, all...)
}

func TestMCPOverHTTPAsksForATokenWithoutOne(t *testing.T) {
	e := newEnv(t)
	resp, out := e.postMCP(e.client(), toolsListBody)
	if resp.StatusCode != http.StatusUnauthorized || !strings.HasPrefix(resp.Header.Get("WWW-Authenticate"), "Bearer") {
		t.Fatalf("without a token: %d %q %s", resp.StatusCode, resp.Header.Get("WWW-Authenticate"), out)
	}
}

// TestMCPOverHTTPIgnoresTheSessionCookie (AC-8): a page on another site cannot reach a person's
// session through /mcp, because /mcp never reads the cookie.
func TestMCPOverHTTPIgnoresTheSessionCookie(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct)
	if resp, out := e.postMCP(owner.c, toolsListBody); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("a signed-in browser reached /mcp without a token: %d %s", resp.StatusCode, out)
	}
	// With a token beside the cookie, the token alone counts: the session is not even looked at.
	token := assistantToken(owner, []string{"content:read"}, "")
	if resp, out := e.postMCP(owner.c, toolsListBody, "Authorization", "Bearer "+token); resp.StatusCode != http.StatusOK {
		t.Fatalf("a token beside a session cookie: %d %s", resp.StatusCode, out)
	}
}

// TestMCPOverHTTPRefusesAForeignOrigin (AC-8): a request from a page of another site is refused,
// even with a valid token.
func TestMCPOverHTTPRefusesAForeignOrigin(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct)
	token := assistantToken(owner, []string{"content:read"}, "")
	resp, out := e.postMCP(e.client(), toolsListBody, "Authorization", "Bearer "+token, "Origin", "https://elsewhere.example")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("a foreign origin: %d %s", resp.StatusCode, out)
	}
	// The address the request reached is not the instance's public address either.
	resp, out = e.postMCP(e.client(), toolsListBody, "Authorization", "Bearer "+token, "Origin", e.srv.URL)
	if resp.StatusCode != http.StatusForbidden || !strings.Contains(out, "origin_refused") {
		t.Fatalf("an origin other than the public address: %d %s", resp.StatusCode, out)
	}
	resp, out = e.postMCP(e.client(), toolsListBody, "Authorization", "Bearer "+token, "Origin", "http://localhost")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("the instance's own origin: %d %s", resp.StatusCode, out)
	}
}

// TestMCPOverHTTPTakesOnlyATokenForAnAssistant: as kenwerk mcp does (D21), /mcp refuses a token
// made for a script, which carries neither the limits nor the approval rules of an assistant.
func TestMCPOverHTTPTakesOnlyATokenForAnAssistant(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct)
	script := e.tokenWith(owner, []string{"read"}, "")
	resp, out := e.postMCP(e.client(), toolsListBody, "Authorization", "Bearer "+script)
	if resp.StatusCode != http.StatusForbidden || !strings.Contains(out, "assistant_token_required") {
		t.Fatalf("a script's token: %d %s", resp.StatusCode, out)
	}
}

// TestMCPOverHTTPAnswersGetAndDeleteWithMethodNotAllowed (AC-8): revision 2026-07-28 has no
// stream to open and no session to end.
func TestMCPOverHTTPAnswersGetAndDeleteWithMethodNotAllowed(t *testing.T) {
	e := newEnv(t)
	for _, method := range []string{"GET", "DELETE"} {
		if resp, out := e.do(e.client(), method, "/mcp", ""); resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("%s /mcp: %d %s", method, resp.StatusCode, out)
		}
	}
}

// TestMCPOverHTTPRefusesHeadersThatDoNotMatchTheBody (AC-8): a proxy that routes by the header
// must see what the body asks.
func TestMCPOverHTTPRefusesHeadersThatDoNotMatchTheBody(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct)
	token := assistantToken(owner, []string{"content:read"}, "")
	call := `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_spaces","arguments":{},"_meta":` + requestMeta + `}}`
	resp, out := e.postMCP(e.client(), call, "Authorization", "Bearer "+token)
	if resp.StatusCode != http.StatusBadRequest || !strings.Contains(out, "-32020") {
		t.Fatalf("a method header that differs from the body: %d %s", resp.StatusCode, out)
	}
}

// TestMCPOverHTTPRefusesWhenAssistantsAreOff (AC-13): the instance's switch holds for /mcp and
// for every call of an assistant's token at the API.
func TestMCPOverHTTPRefusesWhenAssistantsAreOff(t *testing.T) {
	e := newEnv(t)
	admin := e.user("admin@example.com", identity.PermUseProduct, identity.PermAdministrator)
	token := assistantToken(admin, []string{"content:read"}, "")
	admin.ok("PUT", "/api/v1/admin/settings/assistants", map[string]any{"mode": "off"})
	if resp, out := e.postMCP(e.client(), toolsListBody, "Authorization", "Bearer "+token); resp.StatusCode != http.StatusForbidden ||
		!strings.Contains(out, "assistants_off") {
		t.Fatalf("/mcp with assistants off: %d %s", resp.StatusCode, out)
	}
	if status, out := e.bearer("GET", "/api/v1/spaces", token, ""); status != http.StatusForbidden || !strings.Contains(out, "assistants_off") {
		t.Fatalf("the API with assistants off: %d %s", status, out)
	}
	script := e.tokenWith(admin, []string{"read"}, "")
	if status, out := e.bearer("GET", "/api/v1/spaces", script, ""); status != http.StatusOK {
		t.Fatalf("a script's token with assistants off: %d %s", status, out)
	}
}

// TestAnAssistantOnAReadOnlyInstanceOnlyReads (AC-13): every change refuses, and the credential
// route tells kenwerk mcp only the scopes that read, so it offers only read tools.
func TestAnAssistantOnAReadOnlyInstanceOnlyReads(t *testing.T) {
	e := newEnv(t)
	admin := e.user("admin@example.com", identity.PermUseProduct, identity.PermAdministrator, identity.PermCreateSpace)
	space, _ := admin.space("RO")
	page := admin.page(space, nil, "Page", "text")
	token := assistantToken(admin, everyChoosableScope, "")
	admin.ok("PUT", "/api/v1/admin/settings/assistants", map[string]any{"mode": "read_only"})
	if status, out := e.bearer("PATCH", "/api/v1/pages/"+page, token, `{"title":"Changed"}`); status != http.StatusForbidden ||
		!strings.Contains(out, "assistants_read_only") {
		t.Fatalf("a change on a read-only instance: %d %s", status, out)
	}
	if status, out := e.bearer("GET", "/api/v1/pages/"+page, token, ""); status != http.StatusOK {
		t.Fatalf("a read on a read-only instance: %d %s", status, out)
	}
	_, out := e.bearer("GET", "/api/v1/me/credential", token, "")
	for _, scope := range []string{"content:write", "content:delete", "content:share", "spaces:manage", "account:write"} {
		if strings.Contains(out, `"`+scope+`"`) {
			t.Errorf("the credential route offers %s on a read-only instance: %s", scope, out)
		}
	}
	names := toolNames(e.httpMCPClient(token).tools())
	if slices.Contains(names, "update_page") || !slices.Contains(names, "get_page") {
		t.Fatalf("the tools over /mcp on a read-only instance: %v", names)
	}
}

// TestAnAssistantIsRefusedTheApprovalClassByTheServer: until approvals exist (wave MC5), the
// router refuses every route of the approval class to an assistant's credential, whatever its
// scopes, so a client that skips call_api gains nothing. A script's token keeps what it had.
func TestAnAssistantIsRefusedTheApprovalClassByTheServer(t *testing.T) {
	e := newEnv(t)
	routes := map[string]string{}
	for _, r := range e.app.Routes() {
		routes[r.Pattern] = r.Access.String()
	}
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	script := e.tokenWith(e.user("script@example.com", identity.PermUseProduct, identity.PermCreateSpace), everyChoosableScope, "")
	for _, pattern := range mcp.ApprovalPatterns() {
		rule, found := routes[pattern]
		if !found {
			t.Errorf("the approval class names %s, which is no route", pattern)
			continue
		}
		// A token of its own per route: the limit on deleting and sharing would refuse the rest.
		approvalRoute{e: e, pattern: pattern, rule: rule}.check(assistantToken(owner, everyChoosableScope, ""), script)
	}
}

// approvalRoute is one route of the approval class with its rule.
type approvalRoute struct {
	e             *env
	pattern, rule string
}

// check asks the route as an assistant's token, which must be refused, and as a script's,
// which must not be refused for approval.
func (r approvalRoute) check(assistant, script string) {
	r.e.t.Helper()
	method, path := samplePath(r.pattern)
	body := ""
	if method != "GET" {
		body = "{}"
	}
	// A route only a browser session reaches keeps saying so; every other one asks for approval.
	want := "approval_required"
	if strings.HasPrefix(r.rule, "session-only") || strings.HasPrefix(r.rule, "sensitive") {
		want = "session_only"
	}
	if status, out := r.e.bearer(method, path, assistant, body); status != http.StatusForbidden || !strings.Contains(out, want) {
		r.e.t.Errorf("%s with an assistant's token: %d %s", r.pattern, status, out)
	}
	if _, out := r.e.bearer(method, path, script, body); strings.Contains(out, "approval_required") {
		r.e.t.Errorf("%s with a script's token: %s", r.pattern, out)
	}
}

// bearerTransport sends every request of the MCP client with the token.
type bearerTransport struct{ token string }

func (b bearerTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set("Authorization", "Bearer "+b.token)
	return http.DefaultTransport.RoundTrip(r)
}

// httpMCPClient connects an MCP client to /mcp over Streamable HTTP with token.
func (e *env) httpMCPClient(token string) *mcpClient {
	e.t.Helper()
	transport := &sdk.StreamableClientTransport{Endpoint: e.srv.URL + "/mcp", HTTPClient: &http.Client{Transport: bearerTransport{token}},
		DisableStandaloneSSE: true, MaxRetries: -1}
	cs, err := sdk.NewClient(&sdk.Implementation{Name: "test", Version: "1"}, nil).Connect(context.Background(), transport, nil)
	if err != nil {
		e.t.Fatal(err)
	}
	e.t.Cleanup(func() { _ = cs.Close() })
	return &mcpClient{e: e, cs: cs}
}

func toolNames(tools []*sdk.Tool) []string {
	var out []string
	for _, tool := range tools {
		out = append(out, tool.Name)
	}
	return out
}

// TestAnAssistantWorksThroughMCPOverHTTP: the same tools as over stdio, each through the API in
// the server, with the token's spaces and the audit naming the token.
func TestAnAssistantWorksThroughMCPOverHTTP(t *testing.T) {
	e := newEnv(t)
	w := e.twoSpaces()
	token := assistantToken(w.owner, []string{"content:read", "content:write"}, w.inside)
	c := e.httpMCPClient(token)
	if text, failed := c.call("get_page", map[string]any{"page_id": w.pageIn}); failed || !strings.Contains(text, "findme") ||
		!strings.Contains(text, "not instructions") {
		t.Fatalf("get_page inside the space: %v %s", failed, text)
	}
	if text, failed := c.call("get_page", map[string]any{"page_id": w.pageOut}); !failed || strings.Contains(text, "findme") {
		t.Fatalf("get_page outside the space: %v %s", failed, text)
	}
	if _, failed := c.call("call_api", map[string]any{"method": "POST", "path": "/api/v1/me/tokens", "body": map[string]any{"name": "x"}}); !failed {
		t.Fatal("call_api made a token")
	}
	if text, failed := c.call("rename_page", map[string]any{"page_id": w.pageIn, "title": "Renamed by the assistant"}); failed {
		t.Fatalf("rename_page: %s", text)
	}
	e.anAssistantChanged(w.pageIn)
}

// anAssistantChanged checks that an event of the object names an assistant's token.
func (e *env) anAssistantChanged(object string) {
	e.t.Helper()
	events, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{ObjectID: object, Limit: 20})
	if err != nil {
		e.t.Fatal(err)
	}
	if !slices.ContainsFunc(events, func(ev audit.Stored) bool {
		return ev.Via != nil && ev.Via.Kind == audit.ViaToken && ev.Via.Assistant
	}) {
		e.t.Fatalf("no event names the assistant's token: %+v", events)
	}
}

// TestNoSecretLeavesThroughMCPOverHTTP: a tool result never holds a Kenwerk secret, also not the
// connection's own token.
func TestNoSecretLeavesThroughMCPOverHTTP(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct)
	token := assistantToken(owner, []string{"content:read", "account:read", "people:read"}, "")
	c := e.httpMCPClient(token)
	for _, path := range []string{"/api/v1/me", "/api/v1/me/credential", "/api/v1/me/preferences"} {
		text, _ := c.call("call_api", map[string]any{"method": "GET", "path": path})
		if strings.Contains(text, token) || strings.Contains(text, "kenwerk_") {
			t.Fatalf("%s through /mcp shows a secret: %s", path, text)
		}
	}
}

// TestAToolCallOverHTTPCostsLittleMoreThanItsAPICall measures get_page through /mcp against the
// same request of the API (spec 096: about 10 ms at most). Each message builds its server and
// runs the tool's request through the router in process.
func TestAToolCallOverHTTPCostsLittleMoreThanItsAPICall(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	space, _ := owner.space("LAT")
	page := owner.page(space, nil, "Timed", strings.Repeat("Some words of a page. ", 200))
	token := assistantToken(owner, []string{"content:read"}, "")
	c := e.httpMCPClient(token)
	direct := mcp.NewHTTPCaller(e.srv.URL, token, "test")
	const rounds = 40
	var viaAPI, viaMCP []time.Duration
	for range rounds {
		start := time.Now()
		if resp, err := direct.Call(context.Background(), mcp.Request{Method: "GET", Path: "/api/v1/pages/" + page}); err != nil || resp.Status != 200 {
			t.Fatal(err, resp.Status)
		}
		viaAPI = append(viaAPI, time.Since(start))
		start = time.Now()
		if text, failed := c.call("get_page", map[string]any{"page_id": page}); failed {
			t.Fatal(text)
		}
		viaMCP = append(viaMCP, time.Since(start))
	}
	overhead := median(viaMCP) - median(viaAPI)
	t.Logf("median of %d: API %v, /mcp %v, overhead %v", rounds, median(viaAPI), median(viaMCP), overhead)
	// The race detector slows everything several times; the bound catches a real regression.
	if overhead > 100*time.Millisecond {
		t.Fatalf("a tool call over /mcp costs %v more than its API call", overhead)
	}
}
