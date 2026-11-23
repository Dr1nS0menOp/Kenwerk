// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/kenwerk/kenwerk/internal/identity"
)

func markdownArg(about string) arg {
	return arg{name: "markdown", kind: argText, place: inTool, required: true, about: about}
}

// pageTools read and write pages and comments as Markdown, which is more than one request or
// turns a document into Markdown and back. It is data.
var pageTools = []toolSpec{
	{name: "get_page", description: "Read a page as Markdown, with its title, space, version and who changed it last. A long page comes in parts of 200 kB; ask for the next part with part.",
		routes: []string{"GET /api/v1/pages/{id}"}, scopes: []string{identity.ScopeContentRead}, run: runGetPage, args: []arg{pageID(),
			{name: "part", kind: argNumber, place: inTool, about: "Which part of a long page, from 1."}}},
	{name: "get_page_version", description: "Read one published version of a page as Markdown.",
		routes: []string{"GET /api/v1/pages/{id}/versions/{number}"}, scopes: []string{identity.ScopeContentRead}, run: runGetVersion,
		args: []arg{pageID(), version()}},
	{name: "create_page", description: "Make a new page from Markdown and publish it.",
		routes: []string{"POST /api/v1/pages", "POST /api/v1/pages/{id}/publish"}, scopes: []string{identity.ScopeContentWrite}, run: runCreatePage,
		args: []arg{{name: "space_id", kind: argID, place: inTool, required: true, about: aboutSpace},
			{name: "parent_id", kind: argID, place: inTool, about: "The parent page; the top of the space when left out."},
			{name: "title", kind: argText, place: inTool, required: true, about: "The title."},
			markdownArg("The text of the page, as Markdown.")}},
	{name: "update_page", description: "Replace the text of a page with Markdown and publish it as a new version. Give the version you read: if someone changed the page since, nothing is changed and you are told to read it again.",
		routes: []string{"GET /api/v1/pages/{id}", "POST /api/v1/pages/{id}/publish"}, scopes: []string{identity.ScopeContentRead, identity.ScopeContentWrite},
		run: runUpdatePage, args: []arg{pageID(),
			{name: "base_version", kind: argNumber, place: inTool, required: true, about: "The version you read with get_page."},
			markdownArg("The whole new text of the page, as Markdown."),
			{name: "title", kind: argText, place: inTool, about: "A new title; the current one when left out."},
			{name: "summary", kind: argText, place: inTool, about: "A short note of what changed."}}},
	{name: "list_comments", description: "List the comments of a page, with their author, state and text as Markdown.",
		routes: []string{"GET /api/v1/pages/{id}/comments"}, scopes: []string{identity.ScopeContentRead}, run: runListComments,
		args: []arg{pageID(), listLimit(), listOffset()}},
	{name: "add_comment", description: "Add a comment to a page, or a reply to a comment, from Markdown.",
		routes: []string{"POST /api/v1/pages/{id}/comments"}, scopes: []string{identity.ScopeContentWrite}, run: runAddComment, args: []arg{pageID(),
			markdownArg("The text of the comment, as Markdown."),
			{name: "reply_to", kind: argID, place: inTool, about: "The comment this answers; a new thread when left out."}}},
}

// pageFacts are what get_page tells about a page beside its text.
type pageFacts struct {
	ID             string          `json:"id"`
	Title          string          `json:"title"`
	SpaceID        string          `json:"space_id"`
	SpaceKey       string          `json:"space_key"`
	CurrentVersion int             `json:"current_version"`
	UpdatedByName  string          `json:"updated_by_name"`
	UpdatedAt      string          `json:"updated_at"`
	Labels         []string        `json:"labels"`
	Address        string          `json:"address"`
	Document       json.RawMessage `json:"document,omitempty"`
}

func pagePath(a args) (string, error) {
	id, err := pathValue(argID, a["page_id"])
	return "/api/v1/pages/" + id, err
}

func readPage(ctx context.Context, s *session, a args) (pageFacts, error) {
	path, err := pagePath(a)
	if err != nil {
		return pageFacts{}, err
	}
	var page pageFacts
	return page, s.getInto(ctx, path, &page)
}

func runGetPage(ctx context.Context, s *session, a args) (any, error) {
	page, err := readPage(ctx, s, a)
	if err != nil {
		return nil, err
	}
	text, err := markdownOf(page.Document)
	if err != nil {
		return nil, err
	}
	page.Document = nil
	all, part := parts(text), max(1, a.number("part"))
	if part > len(all) {
		return nil, fmt.Errorf("the page has %d parts", len(all))
	}
	return map[string]any{"page": page, "part": part, "parts": len(all), "markdown": all[part-1]}, nil
}

func runGetVersion(ctx context.Context, s *session, a args) (any, error) {
	path, err := pagePath(a)
	if err != nil {
		return nil, err
	}
	var v map[string]any
	if err := s.getInto(ctx, fmt.Sprintf("%s/versions/%d", path, a.number("version")), &v); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(v["document"]) // it came from JSON, so it goes back to JSON
	text, err := markdownOf(raw)
	if err != nil {
		return nil, err
	}
	delete(v, "document")
	v["markdown"] = text
	return v, nil
}

// publish stores Markdown as the next version of a page.
func publish(ctx context.Context, s *session, id string, body map[string]any, markdown string) (any, error) {
	doc, warnings, err := documentOf(markdown)
	if err != nil {
		return nil, err
	}
	body["document"] = doc
	page, err := s.send(ctx, "POST", "/api/v1/pages/"+id+"/publish", body)
	if err != nil {
		return nil, err
	}
	return map[string]any{"page": page, "warnings": warnings}, nil
}

func runCreatePage(ctx context.Context, s *session, a args) (any, error) {
	made := map[string]any{"space_id": a["space_id"], "title": a.text("title")}
	if parent, ok := a["parent_id"]; ok {
		made["parent_id"] = parent
	}
	var page struct {
		ID string `json:"id"`
	}
	created, err := s.send(ctx, "POST", "/api/v1/pages", made)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(created) // it came from JSON
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, err
	}
	id, err := pathValue(argID, page.ID)
	if err != nil {
		return nil, err
	}
	return publish(ctx, s, id, map[string]any{"title": a.text("title"), "base_version": 0}, a.text("markdown"))
}

func runUpdatePage(ctx context.Context, s *session, a args) (any, error) {
	page, err := readPage(ctx, s, a)
	if err != nil {
		return nil, err
	}
	title := cmpOr(a.text("title"), page.Title)
	body := map[string]any{"title": title, "base_version": a.number("base_version"), "summary": a.text("summary")}
	return publish(ctx, s, url.PathEscape(page.ID), body, a.text("markdown"))
}

func runListComments(ctx context.Context, s *session, a args) (any, error) {
	path, err := pagePath(a)
	if err != nil {
		return nil, err
	}
	query := url.Values{}
	for _, name := range []string{"limit", "offset"} {
		if _, ok := a[name]; ok {
			query.Set(name, queryValue(a[name]))
		}
	}
	list, err := s.get(ctx, path+"/comments", query)
	if err != nil {
		return nil, err
	}
	return commentsAsMarkdown(list), nil
}

// commentsAsMarkdown writes the body of every comment in a list, and of its replies, as Markdown.
func commentsAsMarkdown(v any) any {
	switch t := v.(type) {
	case map[string]any:
		for key, value := range t {
			if key == "body" {
				raw, _ := json.Marshal(value) // it came from JSON
				if text, err := markdownOf(raw); err == nil {
					t[key] = text
				}
				continue
			}
			t[key] = commentsAsMarkdown(value)
		}
	case []any:
		for i, value := range t {
			t[i] = commentsAsMarkdown(value)
		}
	}
	return v
}

func runAddComment(ctx context.Context, s *session, a args) (any, error) {
	path, err := pagePath(a)
	if err != nil {
		return nil, err
	}
	doc, _, err := documentOf(a.text("markdown"))
	if err != nil {
		return nil, err
	}
	body := map[string]any{"body": doc}
	if reply, ok := a["reply_to"]; ok {
		body["parent_id"] = reply
	}
	return s.send(ctx, "POST", path+"/comments", body)
}
