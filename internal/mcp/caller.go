// SPDX-License-Identifier: Apache-2.0

// Package mcp is Kenwerk's server for the Model Context Protocol (spec 096): a fixed catalogue
// of tools for assistants, each of which runs as requests of the public API with the
// connection's own credential. The API's access rules, scopes, space limits, rate limits and
// audit apply to every call unchanged; this package adds no right and decides no access.
package mcp

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Request is one request of the API: a method, a path below /api/v1/ with its parameters
// already escaped, a query and a JSON body, or none.
type Request struct {
	Method string
	Path   string
	Query  url.Values
	Body   []byte
}

// Response is the answer of the API.
type Response struct {
	Status      int
	ContentType string
	Body        []byte
}

// Caller runs one request of the API as the connection's credential. Every tool goes through
// it, so whatever the API refuses a tool cannot do.
type Caller interface {
	Call(ctx context.Context, req Request) (Response, error)
}

// maxAnswerBytes is the largest answer a tool reads. A larger answer is refused, never cut
// silently: half a list read as a whole one misleads.
const maxAnswerBytes = 16 << 20

// callTimeout bounds one request, so a stuck server does not hold an assistant forever.
const callTimeout = 2 * time.Minute

var errAnswerTooLarge = errors.New("the answer of the server is larger than 16 MB")

// HTTPCaller calls the API of a Kenwerk server over HTTP with a token, as kenwerk mcp does.
type HTTPCaller struct {
	base      string
	token     string
	userAgent string
	client    *http.Client
}

// NewHTTPCaller calls the server at base (such as https://kenwerk.example.org) with token. It
// follows no redirect, so the token never travels to another address.
func NewHTTPCaller(base, token, userAgent string) *HTTPCaller {
	return &HTTPCaller{base: strings.TrimRight(base, "/"), token: token, userAgent: userAgent, client: &http.Client{
		Timeout:       callTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

// Call runs req against the server.
func (c *HTTPCaller) Call(ctx context.Context, req Request) (Response, error) {
	address := c.base + req.Path
	if len(req.Query) > 0 {
		address += "?" + req.Query.Encode()
	}
	var body io.Reader
	if req.Body != nil {
		body = bytes.NewReader(req.Body)
	}
	r, err := http.NewRequestWithContext(ctx, req.Method, address, body)
	if err != nil {
		return Response{}, err
	}
	r.Header.Set("Authorization", "Bearer "+c.token)
	r.Header.Set("Accept", "application/json")
	r.Header.Set("User-Agent", c.userAgent)
	if req.Body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.client.Do(r)
	if err != nil {
		// The error names the address, never the token, which travels in a header.
		return Response{}, fmt.Errorf("call the server: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxAnswerBytes+1))
	if err != nil {
		return Response{}, fmt.Errorf("read the answer: %w", err)
	}
	if len(raw) > maxAnswerBytes {
		return Response{}, errAnswerTooLarge
	}
	return Response{Status: resp.StatusCode, ContentType: resp.Header.Get("Content-Type"), Body: raw}, nil
}
