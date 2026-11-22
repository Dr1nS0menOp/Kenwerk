// SPDX-License-Identifier: Apache-2.0

package identity

import (
	"slices"
	"strings"
)

// The scopes of a credential (spec 096). A scope limits a credential and never adds a right:
// what a credential may do is what its person may do, within its scopes and its spaces. Each
// route of the API names the one scope it needs (internal/httpapi, routeScopes).
const (
	ScopeContentRead   = "content:read"
	ScopeContentWrite  = "content:write"
	ScopeContentDelete = "content:delete"
	// ScopeContentShare reaches outside: sharing a page, guests, public links, sites, page
	// restrictions, access requests and the members of a group.
	ScopeContentShare  = "content:share"
	ScopeContentExport = "content:export"
	// ScopeSpacesManage looks after a space: its access and roles, automation, webhooks,
	// templates, statuses, workflows, archiving and deleting it, and its trash.
	ScopeSpacesManage = "spaces:manage"
	ScopePeopleRead   = "people:read"
	ScopeAccountRead  = "account:read"
	ScopeAccountWrite = "account:write"
	ScopeAdminRead    = "admin:read"
	ScopeAdminAudit   = "admin:audit"
	ScopeAdminSystem  = "admin:system"
	ScopeAdminWrite   = "admin:write"
	// ScopeNone marks a route no credential ever reaches, such as one's own password or a
	// signature (class N of spec 096). It is never held.
	ScopeNone = "none"
)

// The words of tokens made before spec 096. They stay valid as bundles of the scopes above.
const (
	ScopeRead   = "read"
	ScopeWrite  = "write"
	ScopeExport = "export"
	ScopeAdmin  = "admin"
)

// legacyBundles is what a word of a token made before spec 096 holds, so that token keeps
// exactly what it reached (AC-15). write held sharing and looking after spaces as well; a
// token that has the word keeps them.
var legacyBundles = map[string][]string{
	ScopeRead:   {ScopeContentRead, ScopePeopleRead, ScopeAccountRead},
	ScopeWrite:  {ScopeContentWrite, ScopeContentDelete, ScopeContentShare, ScopeSpacesManage, ScopeAccountWrite},
	ScopeExport: {ScopeContentExport},
	ScopeAdmin:  {ScopeAdminRead},
}

// newTokenWords is what a word asked for when making a token means from spec 096 on. write no
// longer includes sharing out or looking after spaces: a new token names content:share and
// spaces:manage itself (decided on the product owner's behalf on 2026-11-22).
var newTokenWords = map[string][]string{
	ScopeRead:   {ScopeContentRead, ScopePeopleRead, ScopeAccountRead},
	ScopeWrite:  {ScopeContentWrite, ScopeContentDelete, ScopeAccountWrite},
	ScopeExport: {ScopeContentExport},
	ScopeAdmin:  {ScopeAdminRead},
}

// ChoosableScopes are the scopes a new token may hold, in the order the screen shows them.
// admin:audit, admin:system and admin:write name routes no token reaches yet, so nobody can
// choose them until a later wave opens those routes.
var ChoosableScopes = []string{
	ScopeContentRead, ScopeContentWrite, ScopeContentDelete, ScopeContentShare, ScopeContentExport,
	ScopeSpacesManage, ScopePeopleRead, ScopeAccountRead, ScopeAccountWrite, ScopeAdminRead,
}

// allHeldScopes are every scope a stored token can hold, in a fixed order.
var allHeldScopes = []string{
	ScopeContentRead, ScopeContentWrite, ScopeContentDelete, ScopeContentShare, ScopeContentExport,
	ScopeSpacesManage, ScopePeopleRead, ScopeAccountRead, ScopeAccountWrite,
	ScopeAdminRead, ScopeAdminAudit, ScopeAdminSystem, ScopeAdminWrite,
}

// ExpandScopes turns what a token has stored into the scopes it holds: an old word becomes
// its bundle, a scope stays itself, and anything unknown holds nothing.
func ExpandScopes(stored []string) []string {
	var out []string
	for _, scope := range allHeldScopes {
		if slices.Contains(stored, scope) || slices.ContainsFunc(stored, func(word string) bool {
			return slices.Contains(legacyBundles[word], scope)
		}) {
			out = append(out, scope)
		}
	}
	return out
}

// IsAdminScope says whether a scope reaches Administration.
func IsAdminScope(scope string) bool { return strings.HasPrefix(scope, "admin:") }

// heldThroughOldWrite says a token reaches scope only because it was made with the word write
// before spec 096, which held sharing and looking after spaces as well.
func heldThroughOldWrite(stored []string, scope string) bool {
	return (scope == ScopeContentShare || scope == ScopeSpacesManage) &&
		slices.Contains(stored, ScopeWrite) && !slices.Contains(stored, scope)
}
