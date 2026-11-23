// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/kenwerk/kenwerk/internal/mcp"
	"github.com/kenwerk/kenwerk/internal/settings"
	"github.com/kenwerk/kenwerk/internal/version"
)

// mcpPath is where assistants reach Kenwerk's tools over Streamable HTTP (spec 096).
const mcpPath = "/mcp"

const (
	// maxMCPMessage bounds one message to /mcp: call_api may carry a body of up to 6 MB.
	maxMCPMessage = 8 << 20
	// maxInnerAnswer is the largest answer of the API a tool reads, as over stdio.
	maxInnerAnswer = 16 << 20
)

var errInnerAnswerTooLarge = errors.New("the answer of the server is larger than 16 MB")

func (s *Server) registerMCPRoutes() {
	r := s.router
	// Public: the handler reads no session at all, only a bearer token for an assistant, and
	// answers 401 without one. Each tool then runs as requests of the API under that token's
	// scopes, spaces and limits (spec 096).
	r.HandleFunc("POST "+mcpPath, Public, s.handleMCP)
	// Public: revision 2026-07-28 of the protocol has no stream to open and no session to end.
	r.HandleFunc("GET "+mcpPath, Public, handleMCPMethodNotAllowed)
	r.HandleFunc("DELETE "+mcpPath, Public, handleMCPMethodNotAllowed)
}

func handleMCPMethodNotAllowed(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Allow", http.MethodPost)
	writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Send each message with POST.")
}

// handleMCP serves the catalogue of tools of internal/mcp to one message of an assistant. The
// server is built for the message from the token's scopes; every tool calls the API in process.
func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	// A browser always sends Origin; an assistant's program sends none or the instance's own.
	if origin := r.Header.Get("Origin"); origin != "" && origin != s.deps.Config.PublicOrigin() {
		writeError(w, http.StatusForbidden, "origin_refused", "Assistants call this address from a program, not from a page of another site.")
		return
	}
	p := PrincipalFrom(r.Context())
	if p == nil || !p.ViaToken {
		w.Header().Set("WWW-Authenticate", `Bearer realm="kenwerk"`)
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Send a token made For an assistant as a bearer token.")
		return
	}
	if !p.Assistant {
		writeError(w, http.StatusForbidden, "assistant_token_required",
			"Make a token For an assistant under Your account, Tokens, and connect with that one.")
		return
	}
	mode, err := s.assistantsMode(r.Context())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if mode == settings.AssistantsOff {
		writeError(w, http.StatusForbidden, "assistants_off", "An administrator turned assistants off.")
		return
	}
	srv, err := mcp.NewServer(mcp.Options{Caller: &innerCaller{s: s, outer: r}, Scopes: scopesInMode(p.Scopes, mode),
		Version: version.Version, ProtocolVersions: mcp.HTTPProtocolVersions()})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return srv }, &sdk.StreamableHTTPOptions{
		Stateless: true, JSONResponse: true, MaxRequestBodyBytes: maxMCPMessage, Logger: s.deps.Log,
		// The SDK would refuse every request a proxy on the same host passes on with the public
		// name. Rebinding a name gains a page nothing here: the Origin check above refuses it, and
		// /mcp needs a bearer token, which such a page does not hold.
		DisableLocalhostProtection: true,
	}).ServeHTTP(w, r)
}

// innerCaller runs a tool's request of the API inside this server, as the principal of the /mcp
// message: through the router and its access rules, scopes, space limits, rate limits and audit,
// exactly as the same request over HTTP would run (spec 096). Nothing the API refuses can be
// done through /mcp.
type innerCaller struct {
	s     *Server
	outer *http.Request
}

// Call runs req. Its context is the /mcp message's, which holds the principal, its space limit
// and the request's address and id; ctx of the tool only ends it early.
func (c *innerCaller) Call(ctx context.Context, req mcp.Request) (mcp.Response, error) {
	inner, cancel := context.WithCancel(c.outer.Context())
	defer cancel()
	stop := context.AfterFunc(ctx, cancel)
	defer stop()
	target := req.Path
	if len(req.Query) > 0 {
		target += "?" + req.Query.Encode()
	}
	var body io.Reader = http.NoBody
	if req.Body != nil {
		body = bytes.NewReader(req.Body)
	}
	r, err := http.NewRequestWithContext(inner, req.Method, target, body)
	if err != nil {
		return mcp.Response{}, err
	}
	r.RemoteAddr, r.Host = c.outer.RemoteAddr, c.outer.Host
	r.Header.Set("Accept", "application/json")
	r.Header.Set("User-Agent", c.outer.Header.Get("User-Agent"))
	if req.Body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	answer := &answerRecorder{header: http.Header{}}
	c.s.inner.ServeHTTP(answer, r)
	if answer.tooLarge {
		return mcp.Response{}, errInnerAnswerTooLarge
	}
	if answer.status == 0 {
		answer.status = http.StatusOK
	}
	return mcp.Response{Status: answer.status, ContentType: answer.header.Get("Content-Type"), Body: answer.body.Bytes()}, nil
}

// answerRecorder keeps the answer of an inner request, up to what a tool reads. A larger answer is
// refused, never cut silently.
type answerRecorder struct {
	header   http.Header
	status   int
	body     bytes.Buffer
	tooLarge bool
}

func (a *answerRecorder) Header() http.Header { return a.header }

func (a *answerRecorder) WriteHeader(status int) {
	if a.status == 0 {
		a.status = status
	}
}

func (a *answerRecorder) Write(p []byte) (int, error) {
	a.WriteHeader(http.StatusOK)
	if a.body.Len()+len(p) > maxInnerAnswer {
		a.tooLarge = true
		return 0, errInnerAnswerTooLarge
	}
	return a.body.Write(p)
}
