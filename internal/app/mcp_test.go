// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"maps"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/httpapi"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/ids"
	"github.com/kenwerk/kenwerk/internal/mcp"
)

// The tools for assistants (spec 096, wave MC3): every tool is requests of the API with the
// connection's token, so a token never does more through MCP than through the API.

// recordingCaller passes every request of a tool to the API, and keeps it.
type recordingCaller struct {
	inner mcp.Caller
	mu    sync.Mutex
	sent  []mcp.Request
}

func (c *recordingCaller) Call(ctx context.Context, req mcp.Request) (mcp.Response, error) {
	c.mu.Lock()
	c.sent = append(c.sent, req)
	c.mu.Unlock()
	return c.inner.Call(ctx, req)
}

func (c *recordingCaller) take() []mcp.Request {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := c.sent
	c.sent = nil
	return out
}

// mcpClient is a client connected to the tools of a token, offered as if it held scopes.
type mcpClient struct {
	e      *env
	cs     *sdk.ClientSession
	caller *recordingCaller
}

func (e *env) mcpClient(token string, scopes []string) *mcpClient {
	e.t.Helper()
	caller := &recordingCaller{inner: mcp.NewHTTPCaller(e.srv.URL, token, "test")}
	srv, err := mcp.NewServer(mcp.Options{Caller: caller, Scopes: scopes, Version: "test"})
	if err != nil {
		e.t.Fatal(err)
	}
	serverSide, clientSide := sdk.NewInMemoryTransports()
	if _, err := srv.Connect(context.Background(), serverSide, nil); err != nil {
		e.t.Fatal(err)
	}
	cs, err := sdk.NewClient(&sdk.Implementation{Name: "test", Version: "1"}, nil).Connect(context.Background(), clientSide, nil)
	if err != nil {
		e.t.Fatal(err)
	}
	e.t.Cleanup(func() { _ = cs.Close() })
	return &mcpClient{e: e, cs: cs, caller: caller}
}

func (c *mcpClient) call(name string, arguments map[string]any) (string, bool) {
	c.e.t.Helper()
	res, err := c.cs.CallTool(context.Background(), &sdk.CallToolParams{Name: name, Arguments: arguments})
	if err != nil {
		c.e.t.Fatalf("%s: %v", name, err)
	}
	var text strings.Builder
	for _, content := range res.Content {
		if tc, ok := content.(*sdk.TextContent); ok {
			text.WriteString(tc.Text)
		}
	}
	return text.String(), res.IsError
}

func (c *mcpClient) tools() []*sdk.Tool {
	c.e.t.Helper()
	res, err := c.cs.ListTools(context.Background(), nil)
	if err != nil {
		c.e.t.Fatal(err)
	}
	return res.Tools
}

// assistantToken makes a token for an assistant of u with these scopes, limited to space when
// it is not empty.
func assistantToken(u *user, scopes []string, space string) string {
	u.e.t.Helper()
	body := map[string]any{"name": "assistant", "scopes": scopes, "assistant": true}
	if space != "" {
		body["spaces"] = []string{space}
	}
	return u.ok("POST", "/api/v1/me/tokens", body)["secret"].(string)
}

// everyChoosableScope is every scope a new token may hold.
var everyChoosableScope = []string{"content:read", "content:write", "content:delete", "content:share", "content:export",
	"spaces:manage", "people:read", "account:read", "account:write"}

// routeMatcher finds the route pattern a request of a tool reached, by the router's own rules.
type routeMatcher struct{ mux *http.ServeMux }

type patternHandler struct{}

func (patternHandler) ServeHTTP(http.ResponseWriter, *http.Request) {}

func newRouteMatcher(routes []httpapi.Route) routeMatcher {
	mux := http.NewServeMux()
	for _, r := range routes {
		mux.Handle(r.Pattern, patternHandler{})
	}
	return routeMatcher{mux: mux}
}

func (m routeMatcher) pattern(req mcp.Request) string {
	_, pattern := m.mux.Handler(&http.Request{Method: req.Method, URL: &url.URL{Path: req.Path}})
	return pattern
}

func samplePath(pattern string) (method, path string) {
	method, path, _ = strings.Cut(pattern, " ")
	return method, pathParam.ReplaceAllString(path, ids.New().String())
}

// TestTheCatalogueFollowsTheRouteTable (AC-12): every tool calls real routes, its scopes are
// exactly theirs, its annotations follow them, and every route of scope:none is on the never
// list. A route added later is checked the moment it exists.
func TestTheCatalogueFollowsTheRouteTable(t *testing.T) {
	e := newEnv(t)
	table := map[string]httpapi.Route{}
	for _, r := range e.app.Routes() {
		table[r.Pattern] = r
	}
	for _, tool := range mcp.Catalogue() {
		checkTool(t, tool, table)
	}
	never := mcp.NeverPatterns()
	for pattern, r := range table {
		method, path := samplePath(pattern)
		reach := mcp.Classify(method, path)
		if r.Access.Scope() == identity.ScopeNone && reach.Class != mcp.ClassNever {
			t.Errorf("%s has scope:none but call_api %s", pattern, reach.Class)
		}
		if _, listed := never[pattern]; listed != (reach.Class == mcp.ClassNever) {
			t.Errorf("%s: on the never list %v, reach %s", pattern, listed, reach.Class)
		}
	}
	for _, pattern := range append(slices.Collect(maps.Keys(never)), mcp.ApprovalPatterns()...) {
		if _, ok := table[pattern]; !ok {
			t.Errorf("the lists of call_api name %s, which is no route", pattern)
		}
	}
}

var riskyRouteScopes = []string{"content:delete", "content:share", "spaces:manage"}

// toolRoutes is what the routes of one tool say about it.
type toolRoutes struct {
	scopes                []string
	readOnly, destructive bool
}

// routesOf reads the real routes a tool names, and reports one that a token cannot reach or
// that call_api would refuse.
func routesOf(t *testing.T, tool mcp.ToolInfo, table map[string]httpapi.Route) toolRoutes {
	t.Helper()
	out := toolRoutes{readOnly: true}
	for _, pattern := range tool.Routes {
		r, ok := table[pattern]
		method, path := samplePath(pattern)
		rule := r.Access.String()
		switch {
		case !ok:
			t.Errorf("%s calls %s, which is no route", tool.Name, pattern)
		case strings.HasPrefix(rule, "session-only") || strings.HasPrefix(rule, "sensitive"):
			t.Errorf("%s calls %s, which no token reaches", tool.Name, pattern)
		case mcp.Classify(method, path).Class != mcp.ClassCallAPI:
			t.Errorf("%s calls %s, which needs approval or is never done", tool.Name, pattern)
		}
		out.scopes = append(out.scopes, r.Access.Scope())
		out.readOnly = out.readOnly && method == http.MethodGet
		out.destructive = out.destructive || slices.Contains(riskyRouteScopes, r.Access.Scope())
	}
	slices.Sort(out.scopes)
	out.scopes = slices.Compact(out.scopes)
	out.destructive = out.destructive && !out.readOnly
	return out
}

func checkTool(t *testing.T, tool mcp.ToolInfo, table map[string]httpapi.Route) {
	t.Helper()
	if tool.Name == "call_api" {
		return // it reaches every route call_api may send, checked route by route above
	}
	got := routesOf(t, tool, table)
	if want := slices.Sorted(slices.Values(tool.Scopes)); !slices.Equal(got.scopes, want) {
		t.Errorf("%s holds scopes %v, its routes need %v", tool.Name, want, got.scopes)
	}
	if tool.ReadOnly != got.readOnly || tool.Destructive != got.destructive {
		t.Errorf("%s: read-only %v destructive %v, its routes say %+v", tool.Name, tool.ReadOnly, tool.Destructive, got)
	}
}

// fill gives every argument a tool requires a value of its type.
func fill(tool *sdk.Tool, id string) map[string]any {
	schema, _ := tool.InputSchema.(map[string]any)
	properties, _ := schema["properties"].(map[string]any)
	required, _ := schema["required"].([]any)
	out := map[string]any{}
	for _, name := range required {
		property, _ := properties[name.(string)].(map[string]any)
		switch property["type"] {
		case "integer":
			out[name.(string)] = 1
		case "boolean":
			out[name.(string)] = true
		case "object":
			out[name.(string)] = map[string]any{}
		default:
			out[name.(string)] = "x"
			if property["format"] == "uuid" {
				out[name.(string)] = id
			}
		}
	}
	if tool.Name == "call_api" {
		out["method"], out["path"] = "DELETE", "/api/v1/pages/"+id
	}
	return out
}

// TestATokenDoesNoMoreThroughMCPThanThroughTheAPI (AC-1, AC-13): a token that can only read,
// offered every tool, is refused by the API on every tool that changes something, and nothing
// it reads lies outside its space.
func TestATokenDoesNoMoreThroughMCPThanThroughTheAPI(t *testing.T) {
	e := newEnv(t)
	w := e.twoSpaces()
	reader := e.mcpClient(assistantToken(w.owner, []string{"content:read"}, w.inside), everyChoosableScope)
	if changing := reader.changingToolsRefused(w.pageIn); changing < 15 {
		t.Fatalf("only %d tools change something", changing)
	}
	if status, _ := e.bearer("GET", "/api/v1/pages/"+w.pageOut, assistantToken(w.owner, []string{"content:read"}, w.inside), ""); status != 404 {
		t.Fatalf("the API itself gives a page outside the limit: %d", status)
	}
	if text, failed := reader.call("get_page", map[string]any{"page_id": w.pageOut}); !failed || !strings.Contains(text, "404") {
		t.Errorf("get_page outside the token's space: %v %s", failed, text)
	}
	if text, _ := reader.call("search", map[string]any{"query": "findme"}); strings.Contains(text, w.pageOut) || !strings.Contains(text, w.pageIn) {
		t.Errorf("search through MCP crosses the limit: %s", text)
	}
}

// changingToolsRefused calls every tool that changes something, and expects the API to refuse
// each, as the token can only read. It answers how many it called.
func (c *mcpClient) changingToolsRefused(page string) int {
	c.e.t.Helper()
	changing := 0
	for _, tool := range c.tools() {
		if tool.Annotations.ReadOnlyHint {
			continue
		}
		changing++
		if text, failed := c.call(tool.Name, fill(tool, page)); !failed || !strings.Contains(text, "token_read_only") {
			c.e.t.Errorf("%s with a token that only reads: %v %s", tool.Name, failed, text)
		}
	}
	return changing
}

// TestEveryRequestOfAToolIsOneOfItsRoutes: what a tool sends reaches only the routes it names.
func TestEveryRequestOfAToolIsOneOfItsRoutes(t *testing.T) {
	e := newEnv(t)
	w := e.twoSpaces()
	c := e.mcpClient(assistantToken(w.owner, everyChoosableScope, ""), everyChoosableScope)
	match, offered := newRouteMatcher(e.app.Routes()), c.tools()
	for _, tool := range mcp.Catalogue() {
		listed := slices.IndexFunc(offered, func(x *sdk.Tool) bool { return x.Name == tool.Name })
		if tool.Name == "call_api" || listed < 0 {
			continue
		}
		c.call(tool.Name, fill(offered[listed], w.pageIn))
		for _, req := range c.caller.take() {
			if pattern := match.pattern(req); !slices.Contains(tool.Routes, pattern) {
				t.Errorf("%s sent %s %s, route %q, which it does not name", tool.Name, req.Method, req.Path, pattern)
			}
		}
	}
}

// TestCallAPIReachesNoRouteOfTheNeverListOrTheApprovalClass (AC-4): with every scope, call_api
// sends nothing for any route of either, so the server never sees the request.
func TestCallAPIReachesNoRouteOfTheNeverListOrTheApprovalClass(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct)
	c := e.mcpClient(assistantToken(owner, everyChoosableScope, ""), everyChoosableScope)
	refused := 0
	for _, r := range e.app.Routes() {
		method, path := samplePath(r.Pattern)
		if path == "" || mcp.Classify(method, path).Class == mcp.ClassCallAPI || !strings.HasPrefix(path, "/api/v1/") {
			continue
		}
		refused++
		if text, failed := c.call("call_api", map[string]any{"method": method, "path": path}); !failed {
			t.Errorf("call_api ran %s: %s", r.Pattern, text)
		}
	}
	if sent := c.caller.take(); len(sent) != 0 {
		t.Fatalf("call_api sent %d requests of refused routes, the first %+v", len(sent), sent[0])
	}
	if refused < 150 {
		t.Fatalf("only %d routes refused", refused)
	}
}

// TestAnAssistantWritesPagesThroughMCPAndTheAuditNamesItsToken (AC-10): a page made, read,
// changed and deleted through the tools, each change recorded as the token's.
func TestAnAssistantWritesPagesThroughMCPAndTheAuditNamesItsToken(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	space, _ := owner.space("MCP")
	c := e.mcpClient(assistantToken(owner, []string{"content:read", "content:write", "content:delete"}, ""), []string{"content:read", "content:write", "content:delete"})
	made, failed := c.call("create_page", map[string]any{"space_id": space, "title": "Notes", "markdown": "# Plan\n\nFirst **draft**."})
	if failed {
		t.Fatal(made)
	}
	page := w3id(t, made)
	read, _ := c.call("get_page", map[string]any{"page_id": page})
	if !strings.HasPrefix(read, mcp.ContentNotice) || !strings.Contains(read, "First **draft**.") {
		t.Fatalf("get_page: %s", read)
	}
	if text, failed := c.call("update_page", map[string]any{"page_id": page, "base_version": 1, "markdown": "Second."}); failed {
		t.Fatal(text)
	}
	if text, failed := c.call("update_page", map[string]any{"page_id": page, "base_version": 1, "markdown": "Stale."}); !failed {
		t.Fatalf("a change from an old version overwrote a newer one: %s", text)
	}
	if text, failed := c.call("delete_page", map[string]any{"page_id": page}); failed {
		t.Fatal(text)
	}
	if byAssistant := e.assistantEvents(page); byAssistant < 3 {
		t.Fatalf("only %d events name the assistant's token", byAssistant)
	}
}

// assistantEvents counts the audit events of an object made through a token for an assistant,
// and reports one that names any other credential.
func (e *env) assistantEvents(object string) int {
	e.t.Helper()
	events, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{ObjectID: object, Limit: 50})
	if err != nil {
		e.t.Fatal(err)
	}
	byAssistant := 0
	for _, ev := range events {
		switch {
		case ev.Via == nil:
		case ev.Via.Kind == audit.ViaToken && ev.Via.Assistant:
			byAssistant++
		default:
			e.t.Errorf("%s names another credential: %+v", ev.Action, ev.Via)
		}
	}
	return byAssistant
}

// w3id reads the id of the page a tool answered with.
func w3id(t *testing.T, text string) string {
	t.Helper()
	at := strings.Index(text, `"id": "`)
	if at < 0 {
		t.Fatalf("no id in %s", text)
	}
	return text[at+7 : at+7+36]
}

func TestMyCredentialTellsATokenWhatItHoldsAndNoMore(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	space, _ := owner.space("CRD")
	token := assistantToken(owner, []string{"content:read"}, space)
	got, err := mcp.ReadCredential(context.Background(), mcp.NewHTTPCaller(e.srv.URL, token, "test"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Kind != "token" || !got.Assistant || !slices.Equal(got.Scopes, []string{"content:read"}) || !slices.Equal(got.Spaces, []string{space}) {
		t.Fatalf("the credential says %+v", got)
	}
	if _, out := e.bearer("GET", "/api/v1/me/credential", token, ""); strings.Contains(out, "kenwerk_") || strings.Contains(out, owner.email) {
		t.Fatalf("the credential tells more than itself: %s", out)
	}
	if got := owner.ok("GET", "/api/v1/me/credential", nil); got["kind"] != "session" {
		t.Fatalf("a session is told %v", got)
	}
}

// TestAToolCallCostsLittleMoreThanItsAPICall measures get_page through MCP against the same
// request of the API on the same connection (spec 096: about 10 ms at most).
func TestAToolCallCostsLittleMoreThanItsAPICall(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	space, _ := owner.space("LAT")
	page := owner.page(space, nil, "Timed", strings.Repeat("Some words of a page. ", 200))
	token := assistantToken(owner, []string{"content:read"}, "")
	c := e.mcpClient(token, []string{"content:read"})
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
	t.Logf("median of %d: API %v, MCP %v, overhead %v", rounds, median(viaAPI), median(viaMCP), overhead)
	// The race detector slows everything several times; the bound catches a real regression.
	if overhead > 100*time.Millisecond {
		t.Fatalf("a tool call costs %v more than its API call", overhead)
	}
}

func median(d []time.Duration) time.Duration {
	sorted := slices.Clone(d)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	return sorted[len(sorted)/2]
}
