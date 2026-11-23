// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"net/http"

	"github.com/google/uuid"
)

// credentialView is what a credential learns about itself: never its secret, and nothing it
// does not hold already.
type credentialView struct {
	// Kind is "token" for a personal access token and "session" for a browser session.
	Kind   string   `json:"kind"`
	Scopes []string `json:"scopes"`
	// Spaces limits the token to these spaces; null is every space its person may see.
	Spaces    []uuid.UUID `json:"spaces"`
	Assistant bool        `json:"assistant"`
}

// handleMyCredential tells a credential what it holds, so a client such as kenwerk mcp offers
// only the tools it can use (spec 096, AC-13). Every credential reaches it (scope:any); it
// reads nothing from the database, because the principal holds it all.
func handleMyCredential(w http.ResponseWriter, r *http.Request) {
	p := PrincipalFrom(r.Context())
	if !p.ViaToken {
		writeJSON(w, http.StatusOK, credentialView{Kind: "session", Scopes: []string{}})
		return
	}
	scopes := p.Scopes
	if scopes == nil {
		scopes = []string{}
	}
	writeJSON(w, http.StatusOK, credentialView{Kind: "token", Scopes: scopes, Spaces: p.Spaces, Assistant: p.Assistant})
}
