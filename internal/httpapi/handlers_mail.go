// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"net/http"
	"time"

	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/mail"
)

// A test mail is one SMTP conversation of up to 30 seconds; five per person in ten minutes
// is enough to try a fix and short of a way to send mail in bulk (spec 098, D6).
const (
	mailTestsPerPerson = 5
	mailTestWindow     = 10 * time.Minute
)

func (s *Server) registerMailRoutes() {
	r := s.router
	admin := Permission(identity.PermAdministrator)
	r.HandleFunc("GET /api/v1/admin/mail/server", admin, s.handleMailServer)
	// Mail can carry a phishing message to everyone or leak password resets, so every change
	// of the server is a system administrator's, with a fresh login and, in the handler, a
	// second factor (spec 098, D3).
	r.HandleFunc("PUT /api/v1/admin/mail/server", Sensitive(Permission(identity.PermSystemAdministrator)), s.handleMailServerSet)
	r.HandleFunc("POST /api/v1/admin/mail/test", admin, s.handleMailTest)
}

// handleMailServer shows the server in force, never its password.
func (s *Server) handleMailServer(w http.ResponseWriter, r *http.Request) {
	v, err := s.deps.Mail.Server(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// handleMailServerSet stores the server for a system administrator who logged in again (route
// rule) and gives a second factor now. A locked server is refused first, so it costs no code.
func (s *Server) handleMailServerSet(w http.ResponseWriter, r *http.Request) {
	var in struct {
		mail.ServerChange
		Code string `json:"code"`
	}
	if decodeJSON(w, r, maxSmallBody, &in) != nil {
		badBody(w)
		return
	}
	if err := s.deps.Mail.Changeable(); err != nil {
		s.fail(w, r, err)
		return
	}
	if !s.confirmSecondFactor(w, r, in.Code) {
		return
	}
	v, err := s.deps.Mail.SetServer(r.Context(), s.caller(r), in.ServerChange)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// handleMailTest sends a test mail now to the person who asks, and says what the server
// answered when it failed.
func (s *Server) handleMailTest(w http.ResponseWriter, r *http.Request) {
	c := s.caller(r)
	if !s.mailTests.allow("mail-test:" + c.UserID.String()) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "Too many test mails. Try again later.")
		return
	}
	me, err := s.deps.Identity.GetUser(r.Context(), s.deps.Pool, c.UserID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	result, err := s.deps.Mail.SendTest(r.Context(), c, me.Email, s.deps.Config.InstanceName)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
