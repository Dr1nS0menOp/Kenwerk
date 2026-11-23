// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"slices"
	"sort"
	"strings"

	"github.com/kenwerk/kenwerk/internal/identity"
)

// maxCallBody is the largest body call_api sends, as large as the largest document.
const maxCallBody = 6 << 20

// describeAPI lists the routes the connection may reach. It reads the description the server
// makes from its own route table, so it is never behind the server it talks to.
var describeAPI = toolSpec{name: "describe_api",
	description: "List the routes of the Kenwerk API this connection may reach with call_api, with the scope and rule of each. Without a tag it lists the tags and how many routes each has; with a tag, the routes of that tag.",
	routes:      []string{"GET /api/v1/openapi.json"}, scopes: []string{identity.ScopeContentRead}, run: runDescribe, plain: true,
	args: []arg{{name: "tag", kind: argText, place: inTool, about: "The first part of the path after /api/v1/, such as pages or spaces."}}}

// callAPI runs any route of the API as an inner request, under its rules (spec 096). The
// approval class and the never list are refused before anything is sent.
var callAPI = toolSpec{name: "call_api",
	description: "Call any route of the Kenwerk API that describe_api lists, as the person, under every rule the API has. Use a task tool where one exists. Sharing, access changes, deleting for good, exports and changes to the Administration need the person's approval and are refused for now; signing, read confirmations and the person's own sign-in and credentials are never done by an assistant.",
	methods:     callMethods, run: runCallAPI, args: callArgs(callMethods)}

// callAPIReadOnly is call_api for a connection that can only read: it sends GET alone.
var callAPIReadOnly = toolSpec{name: "call_api",
	description: "Read any route of the Kenwerk API that describe_api lists, as the person, under every rule the API has. This connection can only read, so only GET is sent. Use a task tool where one exists.",
	methods:     readMethods, run: runCallAPIReadOnly, args: callArgs(readMethods)}

var (
	callMethods = []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete}
	readMethods = []string{http.MethodGet}
)

func callArgs(methods []string) []arg {
	return []arg{
		{name: "method", kind: argText, place: inTool, required: true, about: "One of " + strings.Join(methods, ", ") + "."},
		{name: "path", kind: argText, place: inTool, required: true, about: "The path, such as /api/v1/pages/<id>, with the ids filled in and without a query."},
		{name: "query", kind: argObject, place: inTool, about: "The query parameters, each a string."},
		{name: "body", kind: argAny, place: inTool, about: "The JSON body, for POST, PUT and PATCH."},
	}
}

var errBadPath = errors.New("the path must start with /api/v1/, be clean, and hold no query, %, # or space")

// cleanAPIPath refuses a path that is not one plain route address, so what is classified is
// what the server routes.
func cleanAPIPath(p string) error {
	if !strings.HasPrefix(p, apiPrefix) || path.Clean(p) != p || strings.ContainsAny(p, "?#%\\ \t\r\n") {
		return errBadPath
	}
	return nil
}

// callRequest checks one call of call_api and builds its request.
func callRequest(a args, methods []string) (Request, error) {
	method, p := strings.ToUpper(a.text("method")), a.text("path")
	if !slices.Contains(methods, method) {
		return Request{}, fmt.Errorf("the method must be one of %s", strings.Join(methods, ", "))
	}
	if err := cleanAPIPath(p); err != nil {
		return Request{}, err
	}
	if reach := Classify(method, p); reach.Class != ClassCallAPI {
		return Request{}, errors.New(reach.Reason)
	}
	req := Request{Method: method, Path: p, Query: url.Values{}}
	query, _ := a["query"].(map[string]any)
	for key, value := range query {
		req.Query.Set(key, queryValue(value))
	}
	if body, ok := a["body"]; ok && method != http.MethodGet {
		raw, err := json.Marshal(body)
		if err != nil {
			return Request{}, err
		}
		if len(raw) > maxCallBody {
			return Request{}, errors.New("the body is larger than 6 MB")
		}
		req.Body = raw
	}
	return req, nil
}

func runCall(ctx context.Context, s *session, a args, methods []string) (any, error) {
	req, err := callRequest(a, methods)
	if err != nil {
		return nil, err
	}
	resp, err := s.do(ctx, req)
	if err != nil {
		return nil, err
	}
	return answerOf(resp)
}

func runCallAPI(ctx context.Context, s *session, a args) (any, error) {
	return runCall(ctx, s, a, callMethods)
}

func runCallAPIReadOnly(ctx context.Context, s *session, a args) (any, error) {
	return runCall(ctx, s, a, readMethods)
}

// apiRoute is one route as describe_api lists it.
type apiRoute struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Scope  string `json:"scope"`
	Rule   string `json:"rule"`
}

// reachableRoutes reads the server's description and keeps the routes this connection may
// call: its scopes hold the route's, a token may reach it, and call_api sends it.
func reachableRoutes(ctx context.Context, s *session, held []string) ([]apiRoute, error) {
	var description struct {
		Paths map[string]map[string]struct {
			Scope  string `json:"x-scope"`
			Access string `json:"x-access"`
		} `json:"paths"`
	}
	if err := s.getInto(ctx, "/api/v1/openapi.json", &description); err != nil {
		return nil, err
	}
	var out []apiRoute
	for p, methods := range description.Paths {
		for method, op := range methods {
			r := apiRoute{Method: strings.ToUpper(method), Path: p, Scope: op.Scope, Rule: op.Access}
			if r.reachable(held) {
				out = append(out, r)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path+out[i].Method < out[j].Path+out[j].Method })
	return out, nil
}

func (r apiRoute) reachable(held []string) bool {
	tokenMay := !strings.HasPrefix(r.Rule, "session-only") && !strings.HasPrefix(r.Rule, "sensitive")
	scopeHeld := r.Scope == identity.ScopeAny || slices.Contains(held, r.Scope)
	return tokenMay && scopeHeld && Classify(r.Method, r.Path).Class == ClassCallAPI
}

func tagOf(p string) string {
	tag, _, _ := strings.Cut(strings.TrimPrefix(p, apiPrefix), "/")
	return tag
}

func runDescribe(ctx context.Context, s *session, a args) (any, error) {
	routes, err := reachableRoutes(ctx, s, s.scopes)
	if err != nil {
		return nil, err
	}
	tag := a.text("tag")
	if tag == "" {
		tags := map[string]int{}
		for _, r := range routes {
			tags[tagOf(r.Path)]++
		}
		return map[string]any{"tags": tags, "next": "Call describe_api with one of these tags to see its routes."}, nil
	}
	var mine []apiRoute
	for _, r := range routes {
		if tagOf(r.Path) == tag {
			mine = append(mine, r)
		}
	}
	return map[string]any{"tag": tag, "routes": mine}, nil
}
