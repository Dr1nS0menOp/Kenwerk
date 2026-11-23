// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"net/http"
	"slices"
	"strconv"
	"time"

	"github.com/kenwerk/kenwerk/internal/identity"
)

// The limits of a credential on top of tokenCallsPerMinute (spec 096, "Rate limits"). Like
// every limiter here they count per node.
const (
	// personCallsPerMinute counts every token of one person together, so ten tokens are not
	// ten times the room of one.
	personCallsPerMinute = 1200
	// assistantChangesPerMinute and assistantRiskyPerMinute hold back an assistant that a page
	// may have steered: a change, and more so a delete, a share or a change to a space's
	// access, comes at most this often from one assistant token. Scripts with ordinary tokens
	// keep the limit they had (spec 096, D7).
	assistantChangesPerMinute = 120
	assistantRiskyPerMinute   = 20
	// rateLimitedRetrySeconds is what Retry-After says: every window is a minute.
	rateLimitedRetrySeconds = 60
)

// Names of the limits, as the audit log and the error code give them.
const (
	limitCredential = "credential"
	limitPerson     = "person"
	limitChanges    = "changes"
	limitRisky      = "deletes_and_sharing"
)

// riskyScopes are the scopes of what deletes, shares or changes access, which the strictest
// limit of an assistant counts.
var riskyScopes = []string{identity.ScopeContentDelete, identity.ScopeContentShare, identity.ScopeSpacesManage}

// credentialLimits are the counters of spec 096.
type credentialLimits struct {
	person  *limiter
	changes *limiter
	risky   *limiter
	// refusalNotes lets one refusal a minute per token into the audit log.
	refusalNotes *limiter
}

func newCredentialLimits() credentialLimits {
	return credentialLimits{
		person:       newLimiter(personCallsPerMinute, time.Minute),
		changes:      newLimiter(assistantChangesPerMinute, time.Minute),
		risky:        newLimiter(assistantRiskyPerMinute, time.Minute),
		refusalNotes: newLimiter(1, time.Minute),
	}
}

// overLimit counts one call of a token against its limits and names the first it is past,
// or "" when it may go on.
func (s *Server) overLimit(r *http.Request, a Access, p *identity.Principal) string {
	token := p.TokenID.String()
	switch {
	case !s.tokenCalls.allow(token):
		return limitCredential
	case !s.credentialLimits.person.allow(p.User.ID.String()):
		return limitPerson
	case !p.Assistant || isRead(r):
		return ""
	case !s.credentialLimits.changes.allow(token):
		return limitChanges
	case slices.Contains(riskyScopes, a.scope) && !s.credentialLimits.risky.allow(token):
		return limitRisky
	}
	return ""
}

// tokenMayGoOn applies the limits, the scope and the space limit of a token, and answers the
// request when it refuses. A refusal is audited: a script has gone wrong, an assistant was
// steered, or someone is trying a stolen token.
func (s *Server) tokenMayGoOn(w http.ResponseWriter, r *http.Request, a Access, p *identity.Principal) bool {
	if limit := s.overLimit(r, a, p); limit != "" {
		s.refuseRate(w, r, p, limit)
		return false
	}
	if a.scope != identity.ScopeAny && !slices.Contains(p.Scopes, a.scope) {
		return s.refuseToken(w, r, p, a.scope, "token_scope", "This token does not have the scope "+a.scope+".")
	}
	if p.Spaces != nil && (spaceBoundless[r.Pattern] || identity.IsAdminScope(a.scope)) {
		return s.refuseToken(w, r, p, a.scope, "token_spaces", "This token is limited to some spaces, and this is not in one.")
	}
	p.UsesOldWrite = p.HeldThroughOldWrite(a.scope)
	return true
}

// refuseToken audits and answers a refusal for scope or spaces, and reports false.
func (s *Server) refuseToken(w http.ResponseWriter, r *http.Request, p *identity.Principal, scope, code, message string) bool {
	if err := s.deps.Identity.RecordTokenRefused(r.Context(), s.caller(r), p.TokenID, scope); err != nil {
		s.fail(w, r, err)
		return false
	}
	if changes(scope) && !slices.ContainsFunc(p.Scopes, changes) {
		// A token that changes nothing says so in the words it always used.
		code, message = "token_read_only", "This token can only read."
	}
	writeError(w, http.StatusForbidden, code, message)
	return false
}

// changes says whether a scope lets a token change anything.
func changes(scope string) bool {
	return scope != identity.ScopeContentRead && scope != identity.ScopePeopleRead && scope != identity.ScopeAccountRead &&
		scope != identity.ScopeContentExport && !identity.IsAdminScope(scope)
}

// refuseRate answers 429 with when to try again, and notes it in the audit log once a minute
// per token, so a runaway client does not fill the log.
func (s *Server) refuseRate(w http.ResponseWriter, r *http.Request, p *identity.Principal, limit string) {
	if s.credentialLimits.refusalNotes.allow(p.TokenID.String()) {
		if err := s.deps.Identity.RecordTokenRateLimited(r.Context(), s.caller(r), p.TokenID, limit); err != nil {
			s.fail(w, r, err)
			return
		}
	}
	w.Header().Set("Retry-After", strconv.Itoa(rateLimitedRetrySeconds))
	writeError(w, http.StatusTooManyRequests, "too_many_requests", "This token made too many calls. Wait a minute.")
}
