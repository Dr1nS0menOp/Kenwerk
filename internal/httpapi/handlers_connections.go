// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/kenwerk/kenwerk/internal/connections"
	"github.com/kenwerk/kenwerk/internal/identity"
)

// The outside services of the installation and its name, set in the administration (spec 101).

func (s *Server) registerConnectionRoutes() {
	r := s.router
	admin := Permission(identity.PermAdministrator)
	r.HandleFunc("GET /api/v1/admin/connections", admin, s.handleConnections)
	r.HandleFunc("GET /api/v1/admin/instance-name", admin, s.handleInstanceName)
	// A wrong identity provider is a way in for everyone, and a helper or the drawing service
	// sees what it is sent, so every change is a system administrator's, with a fresh login
	// and, in the handler, a second factor (spec 101, D3).
	system := Sensitive(Permission(identity.PermSystemAdministrator))
	r.HandleFunc("PUT /api/v1/admin/connections/identity-provider", system, s.handleIdentityProviderSet)
	r.HandleFunc("PUT /api/v1/admin/connections/pdf", system, s.handlePDFHelperSet)
	r.HandleFunc("PUT /api/v1/admin/connections/office", system, s.handleOfficeSet)
	r.HandleFunc("PUT /api/v1/admin/connections/drawing", system, s.handleDrawingSet)
	r.HandleFunc("PUT /api/v1/admin/connections/metrics", system, s.handleMetricsTokenSet)
}

// drawingOrigin is the drawing service in force, which the browser may frame.
func (s *Server) drawingOrigin() string { return s.deps.Connections.InForce().DrawingOrigin }

// handleConnections shows every connection in force, never a secret.
func (s *Server) handleConnections(w http.ResponseWriter, r *http.Request) {
	v, err := s.deps.Connections.View(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// handleInstanceName shows the name in force and what locks it, for the field of Look.
func (s *Server) handleInstanceName(w http.ResponseWriter, r *http.Request) {
	v, err := s.deps.Settings.InstanceNameView(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// confirmed is a change of one part with the second factor that confirms it.
type confirmed[T any] struct {
	Change T
	Code   string
}

// decodeConfirmed reads a change whose fields sit beside "code", as those of the mail server
// do (spec 098), and refuses a field the change does not know, as decodeJSON does.
func decodeConfirmed[T any](w http.ResponseWriter, r *http.Request, in *confirmed[T]) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return errBadJSON
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxSmallBody))
	if err != nil {
		return errBadJSON
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) != nil {
		return errBadJSON
	}
	if code, ok := fields["code"]; ok {
		if json.Unmarshal(code, &in.Code) != nil {
			return errBadJSON
		}
		delete(fields, "code")
	}
	rest, err := json.Marshal(fields)
	if err != nil {
		return errBadJSON
	}
	dec := json.NewDecoder(bytes.NewReader(rest))
	dec.DisallowUnknownFields()
	if dec.Decode(&in.Change) != nil {
		return errBadJSON
	}
	return nil
}

// setConnection stores one part for a system administrator who logged in again (route rule)
// and gives a second factor now. A locked part is refused first, so it costs no code.
func setConnection[T any](s *Server, w http.ResponseWriter, r *http.Request, part string,
	store func(identity.Caller, T) (connections.View, error)) {
	var in confirmed[T]
	if decodeConfirmed(w, r, &in) != nil {
		badBody(w)
		return
	}
	if err := s.deps.Connections.Changeable(part); err != nil {
		s.fail(w, r, err)
		return
	}
	if !s.confirmSecondFactor(w, r, in.Code) {
		return
	}
	v, err := store(s.caller(r), in.Change)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) handleIdentityProviderSet(w http.ResponseWriter, r *http.Request) {
	setConnection(s, w, r, connections.PartIdentityProvider,
		func(c identity.Caller, ch connections.IdentityProviderChange) (connections.View, error) {
			return s.deps.Connections.SetIdentityProvider(r.Context(), c, ch)
		})
}

func (s *Server) handlePDFHelperSet(w http.ResponseWriter, r *http.Request) {
	setConnection(s, w, r, connections.PartPDF, func(c identity.Caller, ch connections.PDFChange) (connections.View, error) {
		return s.deps.Connections.SetPDF(r.Context(), c, ch)
	})
}

func (s *Server) handleOfficeSet(w http.ResponseWriter, r *http.Request) {
	setConnection(s, w, r, connections.PartOffice, func(c identity.Caller, ch connections.AddressChange) (connections.View, error) {
		return s.deps.Connections.SetOffice(r.Context(), c, ch)
	})
}

func (s *Server) handleDrawingSet(w http.ResponseWriter, r *http.Request) {
	setConnection(s, w, r, connections.PartDrawing, func(c identity.Caller, ch connections.AddressChange) (connections.View, error) {
		return s.deps.Connections.SetDrawing(r.Context(), c, ch)
	})
}

func (s *Server) handleMetricsTokenSet(w http.ResponseWriter, r *http.Request) {
	setConnection(s, w, r, connections.PartMetrics, func(c identity.Caller, ch connections.MetricsChange) (connections.View, error) {
		return s.deps.Connections.SetMetrics(r.Context(), c, ch)
	})
}
