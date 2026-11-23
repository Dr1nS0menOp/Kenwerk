// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"net/http"
	"net/url"
	"strings"
	"sync"
)

// Class says what call_api does with a route (spec 096, "Routes no token reaches today").
type Class string

const (
	// ClassCallAPI routes run as an inner request of the API, under its rules.
	ClassCallAPI Class = "call_api"
	// ClassApproval routes need the person's approval in Kenwerk, which arrives in a later
	// release (wave MC5); until then call_api refuses them.
	ClassApproval Class = "approval"
	// ClassNever routes no assistant ever reaches, whoever approves.
	ClassNever Class = "never"
	// ClassOutside routes are not part of the API below /api/v1/.
	ClassOutside Class = "outside"
)

// Reach is what call_api does with one route, and why.
type Reach struct {
	Class  Class
	Reason string
}

const apiPrefix = "/api/v1/"

const adminPrefix = "/api/v1/admin/"

// The reasons call_api gives. They are fixed text, so a refusal never carries content.
const (
	reasonApproval = "This needs the person's approval in Kenwerk. Approvals for assistants arrive in a later release; until then the person does this in the browser."
	reasonAdmin    = "Changes to the Administration need the person's approval in Kenwerk, with a fresh login and a second factor. Approvals for assistants arrive in a later release; until then an administrator does this in the browser."
	reasonOutside  = "call_api reaches only the API below /api/v1/."
)

// neverGroup is a set of routes an assistant never reaches, with the one reason for all of them.
type neverGroup struct {
	reason   string
	patterns []string
}

// neverRoutes is the "never" list of spec 096, decided by the product owner on 2026-11-22. It is
// data. A test holds it against the route table: every route of scope:none is here.
var neverRoutes = []neverGroup{
	{"Your own sign-in and credentials are yours alone: a credential that could change them could outlive its own end.", []string{
		"DELETE /api/v1/me/passkeys/{id}", "DELETE /api/v1/me/sessions/{id}", "DELETE /api/v1/me/tokens/{id}",
		"GET /api/v1/me/logins", "GET /api/v1/me/passkeys", "GET /api/v1/me/security", "GET /api/v1/me/sessions", "GET /api/v1/me/tokens",
		"POST /api/v1/me/passkeys/begin", "POST /api/v1/me/passkeys/finish", "POST /api/v1/me/password",
		"POST /api/v1/me/sessions/end-others", "POST /api/v1/me/sign-in-prompt/later", "POST /api/v1/me/tokens",
		"POST /api/v1/me/totp/begin", "POST /api/v1/me/totp/confirm", "POST /api/v1/me/totp/disable",
	}},
	{"Confirming who you are is something only you can do, in the browser.", []string{
		"POST /api/v1/auth/reauth", "POST /api/v1/auth/reauth/passkey/begin", "POST /api/v1/auth/reauth/passkey/finish",
	}},
	{"A signature says that this person signed; an assistant cannot say that for them.", []string{
		"POST /api/v1/pages/{id}/signing", "POST /api/v1/signing/confirm", "POST /api/v1/signing/passkey", "GET /api/v1/auth/oidc/sign",
	}},
	{"A read confirmation says that this person read the page; an assistant cannot say that for them.", []string{
		"POST /api/v1/pages/{id}/read-confirmation",
	}},
	{"Asking for one's own account to be removed is the person's own step.", []string{
		"POST /api/v1/me/removal-request",
	}},
	{"The code from the backup service's log proves a person at the host.", []string{
		"POST /api/v1/admin/backups/restore/code", "POST /api/v1/admin/backups/schedule/code",
	}},
	{"Signing in, signing up and setting up Kenwerk happen in the browser, without a credential.", []string{
		"GET /api/v1/auth/invitation", "GET /api/v1/auth/oidc/callback", "GET /api/v1/auth/oidc/start", "GET /api/v1/auth/providers",
		"GET /api/v1/setup", "POST /api/v1/setup", "POST /api/v1/auth/forgot", "POST /api/v1/auth/invitation", "POST /api/v1/auth/login",
		"POST /api/v1/auth/login/passkey/begin", "POST /api/v1/auth/login/passkey/finish", "POST /api/v1/auth/login/totp",
		"POST /api/v1/auth/passkey/begin", "POST /api/v1/auth/passkey/finish", "POST /api/v1/auth/reset", "POST /api/v1/auth/signup",
		"POST /api/v1/auth/signup/confirm", "POST /api/v1/mail/unsubscribe/{token}",
	}},
	{"Editing together runs in the browser; an assistant changes a page with update_page.", []string{
		"GET /api/v1/pages/{id}/collab",
	}},
}

// approvalRoutes reach outside a space or cannot be undone, so for an assistant they need the
// person's approval (spec 096, the approval class, D7). Every change below /api/v1/admin/ needs
// it too, by its path. A test holds the list against the route table.
var approvalRoutes = []string{
	"POST /api/v1/pages/{id}/share", "POST /api/v1/spaces/{id}/guests",
	"PUT /api/v1/pages/{id}/public-link", "DELETE /api/v1/pages/{id}/public-link", "PUT /api/v1/pages/{id}/restrictions",
	"POST /api/v1/access-requests/{id}/allow", "PUT /api/v1/spaces/{id}/grants", "PUT /api/v1/spaces/{id}/role-assignments",
	"PUT /api/v1/spaces/{id}/owners", "POST /api/v1/spaces/{id}/sites", "PATCH /api/v1/sites/{id}", "DELETE /api/v1/sites/{id}",
	"POST /api/v1/sites/{id}/publish", "POST /api/v1/sites/{id}/withdraw", "POST /api/v1/sites/{id}/rollback",
	"PUT /api/v1/sites/{id}/pages", "POST /api/v1/spaces/{id}/webhooks", "PATCH /api/v1/webhooks/{id}",
	"POST /api/v1/webhooks/{id}/rotate", "POST /api/v1/rules/{id}/hook", "DELETE /api/v1/spaces/{id}", "DELETE /api/v1/trash/{id}",
	"POST /api/v1/spaces/{id}/trash/bulk", "DELETE /api/v1/attachments/{id}/versions/{number}",
	"POST /api/v1/spaces/{id}/files/delete", "POST /api/v1/exports", "GET /api/v1/spaces/{id}/export.zip",
	"GET /api/v1/spaces/{id}/auditor-export", "POST /api/v1/me/export",
	"POST /api/v1/invitation-requests/{id}/approve", "POST /api/v1/invitation-requests/{id}/refuse",
}

// reachHandler carries the reach of a pattern in the matcher. It is never served.
type reachHandler struct{ reach Reach }

func (reachHandler) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNotFound)
}

// matcher finds the pattern of the never list or the approval class a request falls under,
// with the same rules as the router. It is built once and only read: logically constant data.
var matcher = sync.OnceValue(func() *http.ServeMux {
	mux := http.NewServeMux()
	for _, group := range neverRoutes {
		for _, pattern := range group.patterns {
			mux.Handle(pattern, reachHandler{Reach{Class: ClassNever, Reason: group.reason}})
		}
	}
	for _, pattern := range approvalRoutes {
		mux.Handle(pattern, reachHandler{Reach{Class: ClassApproval, Reason: reasonApproval}})
	}
	return mux
})

// Classify says what call_api does with a request of method to path, a clean path without a
// query. A path that is no route is ClassCallAPI: the API itself then answers 404.
func Classify(method, path string) Reach {
	if !strings.HasPrefix(path, apiPrefix) {
		return Reach{Class: ClassOutside, Reason: reasonOutside}
	}
	h, pattern := matcher().Handler(&http.Request{Method: method, URL: &url.URL{Path: path}})
	if found, ok := h.(reachHandler); ok && pattern != "" {
		return found.reach
	}
	if strings.HasPrefix(path, adminPrefix) && method != http.MethodGet && method != http.MethodHead {
		return Reach{Class: ClassApproval, Reason: reasonAdmin}
	}
	return Reach{Class: ClassCallAPI}
}

// NeverPatterns lists every route of the never list with its reason, for tests and describe_api.
func NeverPatterns() map[string]string {
	out := map[string]string{}
	for _, group := range neverRoutes {
		for _, pattern := range group.patterns {
			out[pattern] = group.reason
		}
	}
	return out
}

// ApprovalPatterns lists the routes of the approval class that are not below /api/v1/admin/.
func ApprovalPatterns() []string { return append([]string(nil), approvalRoutes...) }
