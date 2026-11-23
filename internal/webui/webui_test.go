// SPDX-License-Identifier: Apache-2.0

package webui

import (
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
)

const testOrigin = "https://wiki.example.com"

func TestVideoAndAudioFromOurOwnOriginMayPlay(t *testing.T) {
	if got := contentPolicy("", testOrigin); !strings.Contains(got, "media-src 'self'") {
		t.Fatalf("media-src: %s", got)
	}
}

func TestOnlyOurViewersAndTheDrawingServiceMayBeFramed(t *testing.T) {
	if got := contentPolicy("", testOrigin); !strings.Contains(got, "; frame-src "+testOrigin+"/vendor/;") {
		t.Fatalf("only the viewers: %s", got)
	}
	got := contentPolicy("https://draw.example.com", testOrigin)
	if !strings.Contains(got, "; frame-src "+testOrigin+"/vendor/ https://draw.example.com;") {
		t.Fatalf("frame-src: %s", got)
	}
	if !strings.Contains(got, "frame-ancestors 'none'") {
		t.Fatalf("our own page must stay unframeable: %s", got)
	}
}

func TestANewFrontendGetsANewBuildId(t *testing.T) {
	if got := buildOf(fstest.MapFS{}); got != "" {
		t.Fatalf("a binary without a frontend must say nothing: %q", got)
	}
	first := buildOf(fstest.MapFS{"index.html": {Data: []byte(`<script src="/assets/index-a1.js">`)}})
	same := buildOf(fstest.MapFS{"index.html": {Data: []byte(`<script src="/assets/index-a1.js">`)}})
	next := buildOf(fstest.MapFS{"index.html": {Data: []byte(`<script src="/assets/index-b2.js">`)}})
	if first == "" || first != same {
		t.Fatalf("the same build must keep its id: %q %q", first, same)
	}
	if first == next {
		t.Fatal("a new build must get a new id")
	}
	if len(first) != 16 {
		t.Fatalf("the id stays short: %q", first)
	}
}

// noDrawing is an installation without a drawing service.
func noDrawing() string { return "" }

// The administration can set the drawing service while the process runs (spec 101), so the
// policy of the next answer names the service in force.
func TestThePolicyFollowsTheDrawingServiceInForce(t *testing.T) {
	drawing := ""
	handler := newHandler(fstest.MapFS{"index.html": {Data: []byte("<html>")}}, http.NotFound,
		func() string { return drawing }, testOrigin)
	policy := func() string {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
		return rec.Header().Get("Content-Security-Policy")
	}
	if strings.Contains(policy(), "draw.example.com") {
		t.Fatal("a service that is off is framed")
	}
	drawing = "https://draw.example.com"
	if !strings.Contains(policy(), " https://draw.example.com;") {
		t.Fatalf("the service set later is not framed: %s", policy())
	}
}

func serve(t *testing.T, name string) *httptest.ResponseRecorder {
	t.Helper()
	files := fstest.MapFS{
		"index.html":                  {Data: []byte("<html>")},
		"vendor/pdfcraft/host.html":   {Data: []byte("<html>host")},
		"vendor/pdfcraft/app.js":      {Data: []byte("code")},
		"vendor/pdfcraft/app.wasm.gz": {Data: []byte("packed")},
	}
	handler := newHandler(files, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNotFound) }, noDrawing, testOrigin)
	rec := httptest.NewRecorder()
	// The response starts with the headers the server sets on everything.
	rec.Header().Set("X-Frame-Options", "DENY")
	rec.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, name, nil))
	return rec
}

func TestAViewerRunsInASandboxThatCannotReachTheSession(t *testing.T) {
	rec := serve(t, "/vendor/pdfcraft/host.html")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	policy := rec.Header().Get("Content-Security-Policy")
	for _, want := range []string{"sandbox allow-scripts allow-downloads", "'wasm-unsafe-eval'", "default-src 'none'", "frame-ancestors 'self'"} {
		if !strings.Contains(policy, want) {
			t.Errorf("the policy lacks %q: %s", want, policy)
		}
	}
	for _, never := range []string{"allow-same-origin", "allow-top-navigation", "allow-popups", "allow-forms", "'unsafe-eval'"} {
		if strings.Contains(strings.ReplaceAll(policy, "'wasm-unsafe-eval'", ""), never) {
			t.Errorf("the policy must not hold %q: %s", never, policy)
		}
	}
	if rec.Header().Get("X-Frame-Options") != "" {
		t.Fatal("our own page must be able to frame a viewer")
	}
}

func TestOnlyTheViewersGetTheLoosePolicy(t *testing.T) {
	policy := serve(t, "/index.html").Header().Get("Content-Security-Policy")
	if strings.Contains(policy, "wasm-unsafe-eval") || strings.Contains(policy, "sandbox") {
		t.Fatalf("the app itself must stay strict: %s", policy)
	}
}

func TestALargeProgramFileIsSentPacked(t *testing.T) {
	rec := serve(t, "/vendor/pdfcraft/app.wasm")
	if rec.Code != http.StatusOK || rec.Body.String() != "packed" {
		t.Fatalf("%d %q", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Encoding") != "gzip" || rec.Header().Get("Content-Type") != "application/wasm" {
		t.Fatalf("headers: %v", rec.Header())
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("a sandboxed frame has no origin of its own, so it needs this to load the file")
	}
}

// appHandler serves files as the app, answering 404 for what it does not own.
func appHandler(files fstest.MapFS) http.Handler {
	return newHandler(files, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNotFound) }, "", testOrigin)
}

func TestTheAppAnswersOnlyReadsOutsideTheAPI(t *testing.T) {
	handler := appHandler(fstest.MapFS{"index.html": {Data: []byte("<html>")}})
	for _, c := range []struct{ method, path string }{
		{http.MethodPost, "/spaces"}, {http.MethodGet, "/api/v1/pages"}, {http.MethodGet, "/scim/v2/Users"},
	} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(c.method, c.path, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s %s: status %d", c.method, c.path, rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodHead, "/spaces", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("HEAD of a route of the app: status %d", rec.Code)
	}
}

func TestAnAssetIsServedAndAMissingOneIsNotTheAppPage(t *testing.T) {
	files := fstest.MapFS{
		"index.html":        {Data: []byte("<html>")},
		"assets/index-a.js": {Data: []byte("code")},
		"robots.txt":        {Data: []byte("robots")},
	}
	handler := appHandler(files)
	get := func(name string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, name, nil))
		return rec
	}
	if rec := get("/assets/index-a.js"); rec.Body.String() != "code" || rec.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatalf("asset: %q, cache %q", rec.Body.String(), rec.Header().Get("Cache-Control"))
	}
	if rec := get("/robots.txt"); rec.Body.String() != "robots" || rec.Header().Get("Cache-Control") != "" {
		t.Fatalf("a file outside assets: %q, cache %q", rec.Body.String(), rec.Header().Get("Cache-Control"))
	}
	if rec := get("/assets/gone.js"); rec.Code != http.StatusNotFound {
		t.Fatalf("a missing asset: status %d", rec.Code)
	}
	for _, route := range []string{"/", "/spaces/ab/pages/1", "/assets"} {
		rec := get(route)
		if rec.Body.String() != "<html>" || rec.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("%s: %q, cache %q", route, rec.Body.String(), rec.Header().Get("Cache-Control"))
		}
	}
}

func TestAnAppWithoutItsFrontendSaysSo(t *testing.T) {
	handler := appHandler(fstest.MapFS{})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestAMissingViewerFileIsNotTheAppPage(t *testing.T) {
	if rec := serve(t, "/vendor/pdfcraft/none.js"); rec.Code != http.StatusNotFound {
		t.Fatalf("status %d", rec.Code)
	}
	if rec := serve(t, "/vendor/../index.html"); strings.Contains(rec.Header().Get("Content-Security-Policy"), "wasm") {
		t.Fatal("a path that leaves the folder must not get the viewer's policy")
	}
}

// The builds are someone else's code, pinned by hash: a change must be a new release.
func TestTheViewerFilesAreThePinnedOnes(t *testing.T) {
	list, err := os.ReadFile("../../scripts/craft-checksums.sha256")
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(list)), "\n")
	if len(lines) < 2 {
		t.Fatalf("too few files: %d", len(lines))
	}
	vendor := os.DirFS("../../web/public/vendor")
	for _, line := range lines {
		want, name, found := strings.Cut(line, "  ")
		if !found {
			t.Fatalf("bad line: %q", line)
		}
		data, err := fs.ReadFile(vendor, name)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(data)
		if hex.EncodeToString(sum[:]) != want {
			t.Errorf("%s is not the pinned file", name)
		}
	}
}
