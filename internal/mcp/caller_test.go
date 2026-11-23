// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestTheTokenNeverFollowsARedirect(t *testing.T) {
	var reached atomic.Bool
	elsewhere := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached.Store(true) }))
	defer elsewhere.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, elsewhere.URL+"/steal", http.StatusFound)
	}))
	defer server.Close()
	resp, err := NewHTTPCaller(server.URL, "kenwerk_secret", "test").Call(context.Background(), Request{Method: "GET", Path: "/api/v1/me"})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Status != http.StatusFound || reached.Load() {
		t.Fatalf("the redirect was followed: %d, reached elsewhere %v", resp.Status, reached.Load())
	}
}

func TestTheCallerSendsTheTokenAndTheBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer kenwerk_x" || r.Header.Get("Content-Type") != "application/json" || r.URL.Query().Get("q") != "a b" {
			w.WriteHeader(http.StatusTeapot)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	resp, err := NewHTTPCaller(server.URL+"/", "kenwerk_x", "test").Call(context.Background(),
		Request{Method: "POST", Path: "/api/v1/x", Query: map[string][]string{"q": {"a b"}}, Body: []byte(`{}`)})
	if err != nil || resp.Status != http.StatusOK || string(resp.Body) != `{"ok":true}` {
		t.Fatalf("%v %d %s", err, resp.Status, resp.Body)
	}
}
