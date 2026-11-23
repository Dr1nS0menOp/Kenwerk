// SPDX-License-Identifier: Apache-2.0

package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// assistantAPI answers what kenwerk mcp asks: the credential, and one page.
func assistantAPI(t *testing.T, assistant bool) func(string) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer kenwerk_good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/api/v1/me/credential":
			mark := "false"
			if assistant {
				mark = "true"
			}
			_, _ = io.WriteString(w, `{"kind":"token","scopes":["content:read"],"spaces":null,"assistant":`+mark+`}`)
		case "/api/v1/pages/0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b":
			_, _ = io.WriteString(w, `{"id":"0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b","title":"T","document":{"type":"doc","content":[]}}`)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return func(name string) string {
		return map[string]string{"KENWERK_URL": srv.URL, "KENWERK_TOKEN": "kenwerk_good"}[name]
	}
}

func TestKenwerkMCPRefusesATokenThatIsNotForAnAssistant(t *testing.T) {
	var errs bytes.Buffer
	in, out := io.NopCloser(strings.NewReader("")), nopWriter{io.Discard}
	if code := cmdMCP(context.Background(), nil, assistantAPI(t, false), in, out, &errs); code != exitRefused || !strings.Contains(errs.String(), "For an assistant") {
		t.Fatalf("%d %s", code, errs.String())
	}
}

func TestKenwerkMCPNeedsItsAddressAndToken(t *testing.T) {
	var errs bytes.Buffer
	in, out := io.NopCloser(strings.NewReader("")), nopWriter{io.Discard}
	if code := cmdMCP(context.Background(), nil, func(string) string { return "" }, in, out, &errs); code != exitUsage {
		t.Fatalf("%d %s", code, errs.String())
	}
}

type nopWriter struct{ io.Writer }

func (nopWriter) Close() error { return nil }

func TestKenwerkMCPServesItsToolsOnStandardInputAndOutput(t *testing.T) {
	toServerR, toServerW := io.Pipe()
	fromServerR, fromServerW := io.Pipe()
	done := make(chan int, 1)
	var errs bytes.Buffer
	go func() {
		done <- cmdMCP(context.Background(), nil, assistantAPI(t, true), toServerR, fromServerW, &errs)
		_ = fromServerW.Close()
	}()
	cs, err := sdk.NewClient(&sdk.Implementation{Name: "test", Version: "1"}, nil).
		Connect(context.Background(), &sdk.IOTransport{Reader: fromServerR, Writer: toServerW}, nil)
	if err != nil {
		t.Fatal(err)
	}
	res, err := cs.CallTool(context.Background(), &sdk.CallToolParams{Name: "get_page",
		Arguments: map[string]any{"page_id": "0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"}})
	if err != nil || res.IsError {
		t.Fatalf("%v %+v", err, res)
	}
	_ = cs.Close()
	select {
	case code := <-done:
		if code != exitDone {
			t.Fatalf("exit %d: %s", code, errs.String())
		}
	case <-time.After(10 * time.Second):
		t.Fatal("kenwerk mcp did not end when the assistant closed its input")
	}
}
