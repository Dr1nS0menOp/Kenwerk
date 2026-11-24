// SPDX-License-Identifier: Apache-2.0

package identity

import (
	"context"
	"fmt"
	"slices"
	"time"
)

// SecurityCounts are the counts of the security overview that people and their credentials
// give (spec 088). Only numbers: never a name, an address or a token.
type SecurityCounts struct {
	// Administrators counts active members who hold administration, directly or through a group.
	Administrators int
	// LocalAdminsWithoutPasskey and LocalAdminsWithoutFactor are those of them who log in with a
	// password here, without a passkey, or without any second factor.
	LocalAdminsWithoutPasskey int
	LocalAdminsWithoutFactor  int
	// LocalWithoutFactor counts active people, not service accounts, who log in with a password
	// here and hold no second factor.
	LocalWithoutFactor int
	Guests             int
	GuestsWithoutEnd   int

	// The tokens that still work, of people who are active.
	Tokens                     int
	TokensAdministration       int
	TokensWriting              int
	TokensAssistant            int
	TokensSpacesLimited        int
	TokensUnused               int
	TokensUnusedAdministration int
}

// securityCountsSQL counts in one statement. Every part is an aggregate: over active accounts,
// with lookups on the primary keys of the credentials, and over the tokens that still work.
const securityCountsSQL = `WITH admins AS (
		SELECT g.subject_id AS user_id FROM global_grants g WHERE g.permission = $1 AND g.subject_type = 'user'
		UNION
		SELECT gm.user_id FROM global_grants g JOIN group_members gm ON gm.group_id = g.subject_id
		WHERE g.permission = $1 AND g.subject_type = 'group'
	), people AS (
		SELECT u.type, u.source = 'local' AS local, u.expires_at,
			u.id IN (SELECT user_id FROM admins) AS admin,
			EXISTS (SELECT 1 FROM webauthn_credentials w WHERE w.user_id = u.id) AS passkey,
			EXISTS (SELECT 1 FROM totp_credentials t WHERE t.user_id = u.id AND t.confirmed_at IS NOT NULL) AS code
		FROM users u
		WHERE u.status = 'active' AND (u.expires_at IS NULL OR u.expires_at > now()) AND u.type <> 'service'
	), tokens AS (
		SELECT t.scopes && $2::text[] AS administration, t.scopes && $3::text[] AS writing, t.assistant,
			t.space_ids IS NOT NULL AS limited, COALESCE(t.last_used_at, t.created_at) < $4 AS unused
		FROM api_tokens t JOIN users o ON o.id = t.user_id
		WHERE t.revoked_at IS NULL AND t.expires_at > now()
			AND o.status = 'active' AND (o.expires_at IS NULL OR o.expires_at > now())
	)
	SELECT
		(SELECT count(*) FROM people WHERE admin AND type = 'member'),
		(SELECT count(*) FROM people WHERE admin AND type = 'member' AND local AND NOT passkey),
		(SELECT count(*) FROM people WHERE admin AND type = 'member' AND local AND NOT passkey AND NOT code),
		(SELECT count(*) FROM people WHERE local AND NOT passkey AND NOT code),
		(SELECT count(*) FROM people WHERE type = 'guest'),
		(SELECT count(*) FROM people WHERE type = 'guest' AND expires_at IS NULL),
		(SELECT count(*) FROM tokens),
		(SELECT count(*) FROM tokens WHERE administration),
		(SELECT count(*) FROM tokens WHERE writing),
		(SELECT count(*) FROM tokens WHERE assistant),
		(SELECT count(*) FROM tokens WHERE limited),
		(SELECT count(*) FROM tokens WHERE unused),
		(SELECT count(*) FROM tokens WHERE unused AND administration)`

// storedReaching lists what a token may have stored that holds a scope for which reaches is
// true: the scope itself, or a word of a token made before spec 096 whose bundle holds one.
func storedReaching(reaches func(string) bool) []string {
	var out []string
	for _, scope := range allHeldScopes {
		if reaches(scope) {
			out = append(out, scope)
		}
	}
	for word, bundle := range legacyBundles {
		if slices.ContainsFunc(bundle, reaches) {
			out = append(out, word)
		}
	}
	slices.Sort(out)
	return out
}

// SecurityCounts reads the counts of the security overview. unusedAfter is how long a token
// may go unused before it counts as not in use. The route requires administrator.
func (s *Service) SecurityCounts(ctx context.Context, unusedAfter time.Duration) (SecurityCounts, error) {
	var c SecurityCounts
	writes := func(scope string) bool { return scope == ScopeContentWrite }
	err := s.pool.QueryRow(ctx, securityCountsSQL, PermAdministrator, storedReaching(IsAdminScope), storedReaching(writes),
		s.now().Add(-unusedAfter)).Scan(
		&c.Administrators, &c.LocalAdminsWithoutPasskey, &c.LocalAdminsWithoutFactor, &c.LocalWithoutFactor,
		&c.Guests, &c.GuestsWithoutEnd,
		&c.Tokens, &c.TokensAdministration, &c.TokensWriting, &c.TokensAssistant, &c.TokensSpacesLimited,
		&c.TokensUnused, &c.TokensUnusedAdministration)
	if err != nil {
		return c, fmt.Errorf("identity: count for the security overview: %w", err)
	}
	return c, nil
}
