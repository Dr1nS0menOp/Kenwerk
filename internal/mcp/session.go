// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"context"
	"encoding/json"
	"net/url"
)

// session is what every tool of one connection calls the API through.
type session struct {
	caller Caller
	// scopes are what the connection's credential holds.
	scopes []string
}

// do runs one request and reads a success as data; a refusal or failure becomes an *apiError.
func (s *session) do(ctx context.Context, req Request) (Response, error) {
	resp, err := s.caller.Call(ctx, req)
	if err != nil {
		return Response{}, err
	}
	if resp.Status < 200 || resp.Status > 299 {
		return Response{}, errorOf(resp)
	}
	return resp, nil
}

// get reads a route as JSON.
func (s *session) get(ctx context.Context, path string, query url.Values) (any, error) {
	resp, err := s.do(ctx, Request{Method: "GET", Path: path, Query: query})
	if err != nil {
		return nil, err
	}
	return decoded(resp)
}

// send changes something through a route with a JSON body, and reads its answer.
func (s *session) send(ctx context.Context, method, path string, body any) (any, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	resp, err := s.do(ctx, Request{Method: method, Path: path, Body: raw})
	if err != nil {
		return nil, err
	}
	return decoded(resp)
}

// getInto reads a route as JSON into v.
func (s *session) getInto(ctx context.Context, path string, v any) error {
	resp, err := s.do(ctx, Request{Method: "GET", Path: path})
	if err != nil {
		return err
	}
	return json.Unmarshal(resp.Body, v)
}

// runSimple runs a tool that is one request of its one route.
func runSimple(ctx context.Context, s *session, t toolSpec, a args) (any, error) {
	req, err := t.request(a)
	if err != nil {
		return nil, err
	}
	resp, err := s.do(ctx, req)
	if err != nil {
		return nil, err
	}
	return decoded(resp)
}
