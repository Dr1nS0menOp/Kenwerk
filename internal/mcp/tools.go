// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/identity"
)

// argKind is the type of a tool's argument.
type argKind int

const (
	argID argKind = iota
	argText
	argNumber
	argFlag
	argObject
	argAny
)

// argPlace is where an argument goes in the request of the tool's route.
type argPlace int

const (
	inPath argPlace = iota
	inQuery
	inBody
	// inTool is an argument the tool itself reads, such as Markdown it turns into a document.
	inTool
)

// arg is one argument of a tool: its name for the model, its type, where it goes and under
// which name the route knows it (field; the name itself when empty).
type arg struct {
	name     string
	kind     argKind
	place    argPlace
	field    string
	required bool
	about    string
	// most is the largest number a number may be, or 0 for no limit.
	most float64
}

// runFunc runs a tool that is more than one request of one route.
type runFunc func(ctx context.Context, s *session, a args) (any, error)

// toolSpec is one tool of the catalogue. Name, description and schema are fixed in code and
// never hold content (spec 096, D15).
type toolSpec struct {
	name        string
	description string
	// routes are the route patterns the tool calls; scopes are the scopes they need, held
	// against the route table by a test.
	routes []string
	scopes []string
	// methods are set instead of routes for call_api, which reaches any route it may send with
	// one of them.
	methods []string
	args    []arg
	// run is nil for a tool that is one request of its one route.
	run runFunc
	// plain marks a result that holds no content written by people, such as describe_api's.
	plain bool
}

// The descriptions of arguments that recur.
const (
	aboutPage    = "The id of the page."
	aboutSpace   = "The id of the space."
	aboutComment = "The id of the comment."
	aboutLimit   = "At most this many, up to 100."
)

// maxListLimit is the largest page of a list a tool asks for (spec 096: lists in pages of at
// most 100).
const maxListLimit = 100

// ToolInfo describes one tool, for tests and documentation.
type ToolInfo struct {
	Name        string
	Description string
	Routes      []string
	Scopes      []string
	ReadOnly    bool
	Destructive bool
	OpenWorld   bool
}

// riskyScopes are the scopes of what deletes, reaches outside or changes access: a tool that
// needs one says it is destructive.
var riskyScopes = []string{identity.ScopeContentDelete, identity.ScopeContentShare, identity.ScopeSpacesManage}

// info describes the tool, with annotations that follow its routes: a tool is read-only when it
// only reads, and destructive when it may delete, reach outside or change access. call_api may
// reach any route it sends, so it is destructive unless it sends GET alone.
func (t toolSpec) info() ToolInfo {
	out := ToolInfo{Name: t.name, Description: t.description, Routes: t.routes, Scopes: t.scopes}
	if t.methods != nil {
		out.ReadOnly = slices.Equal(t.methods, readMethods)
		out.Destructive, out.OpenWorld = !out.ReadOnly, !out.ReadOnly
		return out
	}
	out.ReadOnly = !slices.ContainsFunc(t.routes, func(pattern string) bool {
		method, _, _ := strings.Cut(pattern, " ")
		return method != http.MethodGet
	})
	out.Destructive = !out.ReadOnly && slices.ContainsFunc(t.scopes, func(s string) bool { return slices.Contains(riskyScopes, s) })
	out.OpenWorld = slices.Contains(t.scopes, identity.ScopeContentShare)
	return out
}

// schema is the input schema of the tool, made from its arguments. Arguments the schema does
// not name are refused.
func (t toolSpec) schema() *jsonschema.Schema {
	s := &jsonschema.Schema{Type: "object", Properties: map[string]*jsonschema.Schema{}, AdditionalProperties: &jsonschema.Schema{Not: &jsonschema.Schema{}}}
	for _, a := range t.args {
		s.Properties[a.name] = a.schema()
		if a.required {
			s.Required = append(s.Required, a.name)
		}
	}
	return s
}

func (a arg) schema() *jsonschema.Schema {
	s := &jsonschema.Schema{Description: a.about}
	switch a.kind {
	case argID:
		s.Type, s.Format = "string", "uuid"
	case argText:
		s.Type = "string"
	case argNumber:
		least := 0.0
		s.Type, s.Minimum = "integer", &least
		if a.most > 0 {
			most := a.most
			s.Maximum = &most
		}
	case argFlag:
		s.Type = "boolean"
	case argObject:
		s.Type = "object"
	}
	return s
}

// args are the validated arguments of one call.
type args map[string]any

func (a args) text(name string) string {
	s, _ := a[name].(string)
	return s
}

func (a args) number(name string) int {
	f, _ := a[name].(float64)
	return int(f)
}

var errNotAnID = errors.New("an id is not valid")

// pathValue is an argument as a segment of a path: an id must be one, and no text may climb out
// of its place.
func pathValue(kind argKind, v any) (string, error) {
	s := fmt.Sprint(v)
	if kind == argID {
		if _, err := uuid.Parse(s); err != nil {
			return "", fmt.Errorf("%w: %q", errNotAnID, s)
		}
	}
	if s == "" || s == "." || s == ".." {
		return "", fmt.Errorf("%q cannot be part of an address", s)
	}
	return url.PathEscape(s), nil
}

// request builds the one request of a tool's route from the arguments.
func (t toolSpec) request(a args) (Request, error) {
	method, path, _ := strings.Cut(t.routes[0], " ")
	req, body := Request{Method: method, Query: url.Values{}}, map[string]any{}
	for _, def := range t.args {
		v, ok := a[def.name]
		if !ok {
			continue
		}
		field := cmpOr(def.field, def.name)
		switch def.place {
		case inPath:
			segment, err := pathValue(def.kind, v)
			if err != nil {
				return Request{}, err
			}
			path = strings.Replace(path, "{"+field+"}", segment, 1)
		case inQuery:
			req.Query.Set(field, queryValue(v))
		case inBody:
			body[field] = v
		}
	}
	req.Path = path
	if method != http.MethodGet && method != http.MethodDelete {
		raw, err := json.Marshal(body)
		if err != nil {
			return Request{}, err
		}
		req.Body = raw
	}
	return req, nil
}

func cmpOr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func queryValue(v any) string {
	if f, ok := v.(float64); ok {
		return strconv.Itoa(int(f))
	}
	return fmt.Sprint(v)
}
