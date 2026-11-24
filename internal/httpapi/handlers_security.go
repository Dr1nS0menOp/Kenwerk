// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"net/http"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/console"
	"github.com/kenwerk/kenwerk/internal/features"
	"github.com/kenwerk/kenwerk/internal/identity"
)

// registerSecurityRoutes is the security overview (spec 088), an experimental part that starts
// off. It is a read of Administration, so a token with admin:read reaches it too, and through
// it an assistant (spec 096); the part is checked before anything of the overview is read.
func (s *Server) registerSecurityRoutes() {
	s.router.HandleFunc("GET /api/v1/admin/security-overview", Permission(identity.PermAdministrator),
		s.experimental(features.ExperimentalSecurityOverview, s.handleSecurityOverview))
}

func (s *Server) handleSecurityOverview(w http.ResponseWriter, r *http.Request) {
	if s.deps.SecurityOverview == nil {
		s.fail(w, r, apperr.NotFound())
		return
	}
	overview, err := s.deps.SecurityOverview(r.Context(), s.caller(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

// withSecuritySteps adds how many steps of the security overview need attention to the things
// that need attention, while that part is on (ADM-127). While it is off, nothing of the
// overview is read.
func (s *Server) withSecuritySteps(r *http.Request, list []console.Item) ([]console.Item, error) {
	if s.deps.SecurityOverview == nil {
		return list, nil
	}
	on, err := s.deps.Features.ExperimentalOn(r.Context(), s.deps.Pool, features.ExperimentalSecurityOverview)
	if err != nil || !on {
		return list, err
	}
	overview, err := s.deps.SecurityOverview(r.Context(), s.caller(r))
	if err != nil || overview.Attention == 0 {
		return list, err
	}
	return append(list, console.Item{Kind: "security_steps", Count: overview.Attention}), nil
}
