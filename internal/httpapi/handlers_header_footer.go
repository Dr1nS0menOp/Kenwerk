// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"net/http"

	"github.com/kenwerk/kenwerk/internal/headerfooter"
	"github.com/kenwerk/kenwerk/internal/identity"
)

// The installation's header and footer (spec 089), an experimental part: the service answers
// experimental_off while it is off, after the access rule of the route.
func (s *Server) registerHeaderFooterRoutes() {
	r := s.router
	// Everyone who may use the product reads the band on the pages they read, guests included,
	// as they read the capabilities; it is never public, so the login page cannot show it (D8).
	r.HandleFunc("GET /api/v1/header-footer", Permission(identity.PermUseProduct), s.handleHeaderFooter)
	admin := Permission(identity.PermAdministrator)
	// A token of an administrator may read the administration, never change it (spec 085, D19).
	r.HandleFunc("GET /api/v1/admin/header-footer", admin, s.handleHeaderFooterAdmin)
	// A channel to every reader: the login must be fresh, and no token may change it (D9).
	r.HandleFunc("PUT /api/v1/admin/header-footer", Sensitive(admin), s.handleHeaderFooterSet)
}

func (s *Server) handleHeaderFooter(w http.ResponseWriter, r *http.Request) {
	v, err := s.deps.HeaderFooter.ForReaders(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	// Who changed it and when stay in the administration; readers get the words alone.
	writeJSON(w, http.StatusOK, map[string]any{"header": v.Header, "footer": v.Footer, "version": v.Version})
}

func (s *Server) handleHeaderFooterAdmin(w http.ResponseWriter, r *http.Request) {
	view, err := s.deps.HeaderFooter.ForAdministration(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleHeaderFooterSet(w http.ResponseWriter, r *http.Request) {
	var in headerfooter.Input
	if !body(w, r, &in) {
		return
	}
	view, err := s.deps.HeaderFooter.Set(r.Context(), s.caller(r), in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}
