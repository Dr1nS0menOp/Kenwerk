// SPDX-License-Identifier: Apache-2.0

package identity

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/ids"
)

const (
	// tokenPrefix lets secret scanners find a leaked token.
	tokenPrefix  = "kenwerk_"
	maxTokenLife = 366 * 24 * time.Hour
	// A token always ends, also when nobody chose a date (SEC-156).
	defaultTokenLife = 365 * 24 * time.Hour
	maxTokenName     = 100
	maxTokenLength   = 128
	// MaxTokenSpaces is how many spaces a credential may be limited to (spec 096).
	MaxTokenSpaces = 50
)

// Token is a personal access token. The secret is shown once and never stored.
type Token struct {
	ID       uuid.UUID `json:"id"`
	Name     string    `json:"name"`
	CanWrite bool      `json:"can_write"`
	// Scopes are what the token holds, with the words of an older token as their bundles.
	Scopes []string `json:"scopes"`
	// Spaces limits the token to these spaces; empty means every space its person reaches.
	Spaces []uuid.UUID `json:"spaces"`
	// Assistant marks a token made for an assistant (spec 096).
	Assistant  bool       `json:"assistant"`
	ExpiresAt  time.Time  `json:"expires_at"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
}

// NewToken is what a person asks for.
type NewToken struct {
	Name     string
	CanWrite bool
	// Scopes says what the token may do: scopes, or the words read, write, export and admin.
	// Left out, CanWrite decides as it always did.
	Scopes []string
	// Spaces limits the token to some spaces. Left out, the token reaches every space its
	// person reaches (decided by the product owner on 2026-11-22).
	Spaces    []uuid.UUID
	Assistant bool
	ExpiresAt time.Time
}

func (in NewToken) scopes() ([]string, error) {
	asked := in.Scopes
	if len(asked) == 0 {
		asked = []string{ScopeRead}
		if in.CanWrite {
			asked = []string{ScopeRead, ScopeWrite, ScopeExport}
		}
	}
	var held []string
	for _, scope := range asked {
		switch {
		case newTokenWords[scope] != nil:
			held = append(held, newTokenWords[scope]...)
		case slices.Contains(ChoosableScopes, scope):
			held = append(held, scope)
		default:
			return nil, apperr.Invalid("A scope is one of " + strings.Join(ChoosableScopes, ", ") + ", or read, write, export or admin.")
		}
	}
	var out []string
	for _, scope := range allHeldScopes {
		if slices.Contains(held, scope) {
			out = append(out, scope)
		}
	}
	if len(in.Spaces) > 0 && slices.ContainsFunc(out, IsAdminScope) {
		return nil, apperr.Invalid("A token limited to some spaces cannot reach Administration.")
	}
	return out, nil
}

func (s *Service) validToken(in NewToken) (NewToken, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || utf8.RuneCountInString(in.Name) > maxTokenName || strings.ContainsAny(in.Name, "\r\n\x00") {
		return in, apperr.Invalid("A token needs a name of at most 100 characters.")
	}
	now := s.now()
	if in.ExpiresAt.IsZero() {
		in.ExpiresAt = now.Add(defaultTokenLife)
	}
	if !in.ExpiresAt.After(now) || in.ExpiresAt.After(now.Add(maxTokenLife)) {
		return in, apperr.Invalid("A token ends within a year.")
	}
	return in, validSpaces(in.Spaces)
}

// validSpaces checks the space limit asked for: at most MaxTokenSpaces, each named once.
func validSpaces(spaces []uuid.UUID) error {
	if len(spaces) > MaxTokenSpaces {
		return apperr.Invalid("A token can be limited to at most 50 spaces.")
	}
	named := make(map[uuid.UUID]bool, len(spaces))
	for _, id := range spaces {
		if id == uuid.Nil || named[id] {
			return apperr.Invalid("Name each space once.")
		}
		named[id] = true
	}
	return nil
}

// CreateToken makes a token for the caller, and returns its secret once.
func (s *Service) CreateToken(ctx context.Context, c Caller, in NewToken) (Token, string, error) {
	return s.createTokenFor(ctx, c, c.UserID, in)
}

func (s *Service) createTokenFor(ctx context.Context, c Caller, userID uuid.UUID, in NewToken) (Token, string, error) {
	in, err := s.validToken(in)
	if err != nil {
		return Token{}, "", err
	}
	scopes, err := in.scopes()
	if err != nil {
		return Token{}, "", err
	}
	secret := tokenPrefix + randomToken()
	t := Token{ID: ids.New(), Name: in.Name, CanWrite: slices.Contains(scopes, ScopeContentWrite), Scopes: scopes,
		Spaces: in.Spaces, Assistant: in.Assistant, ExpiresAt: in.ExpiresAt, CreatedAt: s.now()}
	if t.Spaces == nil {
		t.Spaces = []uuid.UUID{}
	}
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if err := spacesSeenBy(ctx, tx, userID, in.Spaces); err != nil {
			return err
		}
		var limit []uuid.UUID // NULL in the table: every space
		if len(in.Spaces) > 0 {
			limit = in.Spaces
		}
		_, err := tx.Exec(ctx, `INSERT INTO api_tokens (id, user_id, name, token_hash, can_write, scopes, space_ids, assistant, expires_at, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, t.ID, userID, t.Name, hashToken(secret), t.CanWrite, t.Scopes,
			limit, t.Assistant, t.ExpiresAt, t.CreatedAt)
		if err != nil {
			return err
		}
		return s.record(ctx, tx, c, "token.created", "user", userID.String(), map[string]any{"token_id": t.ID,
			"can_write": t.CanWrite, "scopes": t.Scopes, "space_ids": t.Spaces, "assistant": t.Assistant})
	})
	if err != nil {
		return Token{}, "", err
	}
	return t, secret, nil
}

// spacesSeenBy refuses a space the person cannot see, as if it did not exist: a limit names
// only spaces the token's person reaches.
func spacesSeenBy(ctx context.Context, tx pgx.Tx, userID uuid.UUID, spaces []uuid.UUID) error {
	if len(spaces) == 0 {
		return nil
	}
	var seen int
	err := tx.QueryRow(ctx, `SELECT count(*) FROM perm_spaces($1, 'space.view', $2) ps`, userID, spaces).Scan(&seen)
	if err != nil {
		return err
	}
	if seen != len(spaces) {
		return apperr.Invalid("A token can be limited only to spaces you can see.")
	}
	return nil
}

// Tokens lists a person's tokens that still work.
func (s *Service) Tokens(ctx context.Context, userID uuid.UUID) ([]Token, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name, can_write, scopes, COALESCE(space_ids, '{}'), assistant, expires_at, created_at, last_used_at
		FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Token, error) {
		var t Token
		var stored []string
		err := r.Scan(&t.ID, &t.Name, &t.CanWrite, &stored, &t.Spaces, &t.Assistant, &t.ExpiresAt, &t.CreatedAt, &t.LastUsedAt)
		t.Scopes = ExpandScopes(stored)
		return t, err
	})
	if out == nil {
		out = []Token{}
	}
	return out, err
}

// RevokeToken ends one of the caller's own tokens.
func (s *Service) RevokeToken(ctx context.Context, c Caller, id uuid.UUID) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, "UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL", id, c.UserID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return apperr.NotFound()
		}
		return s.record(ctx, tx, c, "token.revoked", "user", c.UserID.String(), map[string]any{"token_id": id})
	})
}

// IsToken says whether a bearer value looks like one of our tokens.
func IsToken(secret string) bool {
	return strings.HasPrefix(secret, tokenPrefix) && len(secret) <= maxTokenLength
}

// AuthenticateToken resolves a token to the person it acts for. Every permission
// check stays the same: a token is that person, within its scopes and spaces.
func (s *Service) AuthenticateToken(ctx context.Context, secret string) (Principal, error) {
	if !IsToken(secret) {
		return Principal{}, ErrNoSession
	}
	var p Principal
	var id uuid.UUID
	var lastUsed *time.Time
	err := s.pool.QueryRow(ctx, `SELECT t.id, t.can_write, t.scopes, t.space_ids, t.assistant, t.last_used_at,
		       u.id, u.type, u.status, u.email, u.display_name, u.created_at
		FROM api_tokens t JOIN users u ON u.id = t.user_id
		WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
		  AND u.status = 'active' AND (u.expires_at IS NULL OR u.expires_at > now())`, hashToken(secret)).
		Scan(&id, &p.CanWrite, &p.storedScopes, &p.Spaces, &p.Assistant, &lastUsed,
			&p.User.ID, &p.User.Type, &p.User.Status, &p.User.Email, &p.User.DisplayName, &p.User.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Principal{}, ErrNoSession
	}
	if err != nil {
		return Principal{}, err
	}
	p.ViaToken, p.TokenID, p.Scopes = true, id, ExpandScopes(p.storedScopes)
	// At most once a minute, like a session: a script must not write on each call. The
	// audit log shows when a token was in use (SEC-807), and a token that cannot be
	// recorded does not get used.
	if now := s.now(); lastUsed == nil || now.Sub(*lastUsed) > time.Minute {
		c := Caller{UserID: p.User.ID, Meta: RequestMeta{Via: p.Via()}}
		err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, "UPDATE api_tokens SET last_used_at = $2 WHERE id = $1", id, now); err != nil {
				return err
			}
			return s.record(ctx, tx, c, "token.used", "user", p.User.ID.String(), map[string]any{"token_id": id})
		})
		if err != nil {
			return Principal{}, err
		}
	}
	return p, nil
}

// Via names the credential of a principal for the audit log, or nil for a browser session.
func (p Principal) Via() *audit.Via {
	if !p.ViaToken {
		return nil
	}
	return &audit.Via{Kind: audit.ViaToken, TokenID: p.TokenID.String(), Assistant: p.Assistant, OldWrite: p.UsesOldWrite}
}

// HeldThroughOldWrite says the token reaches scope only because it was made with the word
// write before spec 096. It still does, and the audit log says so on each such action.
func (p Principal) HeldThroughOldWrite(scope string) bool {
	return p.ViaToken && heldThroughOldWrite(p.storedScopes, scope)
}

// RecordTokenRateLimited notes in the audit log that a token went past one of its limits.
func (s *Service) RecordTokenRateLimited(ctx context.Context, c Caller, tokenID uuid.UUID, limit string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		return s.record(ctx, tx, c, "token.rate_limited", "user", c.UserID.String(), map[string]any{"token_id": tokenID, "limit": limit})
	})
}

// RecordTokenRefused notes in the audit log that a token tried what it may not.
func (s *Service) RecordTokenRefused(ctx context.Context, c Caller, tokenID uuid.UUID, scope string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		return s.record(ctx, tx, c, "token.refused", "user", c.UserID.String(), map[string]any{"token_id": tokenID, "scope": scope})
	})
}

// ReauthWindow is how long confirming who you are lasts for sensitive actions.
const ReauthWindow = 10 * time.Minute

// Reauthenticate confirms who is behind a session, with their password.
func (s *Service) Reauthenticate(ctx context.Context, c Caller, sessionID uuid.UUID, password string) error {
	if err := s.checkPassword(ctx, c, password); err != nil {
		return err
	}
	return s.confirmSession(ctx, c, sessionID, ConfirmedByPassword)
}

// How a person last proved who they are in a session.
const (
	ConfirmedByPassword = "password"
	ConfirmedByPasskey  = "passkey"
)

// confirmSession notes that the person just proved who they are, and how.
func (s *Service) confirmSession(ctx context.Context, c Caller, sessionID uuid.UUID, method string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "UPDATE sessions SET reauth_at = $2, reauth_method = $3 WHERE id = $1", sessionID, s.now(), method); err != nil {
			return err
		}
		return s.record(ctx, tx, c, "auth.reauthenticated", "session", sessionID.String(), map[string]any{"method": method})
	})
}

// ConfirmSecondFactor asks for more than a password, for the most dangerous actions such as
// a restore over the live installation (spec 059): a code from the authenticator app or a
// recovery code given now, or a passkey confirmed in this session within ReauthWindow.
func (s *Service) ConfirmSecondFactor(ctx context.Context, c Caller, sessionID uuid.UUID, code string) error {
	if code != "" {
		wrong := false
		err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
			on, err := s.hasTOTP(ctx, tx, c.UserID)
			if err != nil {
				return err
			}
			if !on {
				return secondFactorRequired("Set up an authenticator app or a passkey first.")
			}
			method, err := s.useSecondFactor(ctx, tx, c.UserID, code)
			if err != nil {
				return err
			}
			if method == "" {
				wrong = true
				return secondFactorRequired("The code is wrong or was used already.")
			}
			return s.record(ctx, tx, c, "auth.second_factor_confirmed", "session", sessionID.String(), map[string]any{"method": method})
		})
		if wrong {
			// The refusal rolled its transaction back, so the trace of a wrong code gets
			// one of its own: a run of them is how a guessed code shows in the audit log.
			if rerr := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
				return s.record(ctx, tx, c, "auth.second_factor_failed", "session", sessionID.String(), nil)
			}); rerr != nil {
				return rerr
			}
		}
		return err
	}
	var method *string
	var at *time.Time
	if err := s.pool.QueryRow(ctx, "SELECT reauth_method, reauth_at FROM sessions WHERE id = $1", sessionID).Scan(&method, &at); err != nil {
		return err
	}
	if method != nil && *method == ConfirmedByPasskey && at != nil && s.now().Sub(*at) <= ReauthWindow {
		return nil
	}
	return secondFactorRequired("Confirm with a code from your authenticator app, a recovery code or a passkey.")
}

func secondFactorRequired(message string) *apperr.Error {
	return &apperr.Error{Kind: apperr.KindForbidden, Code: "second_factor_required", Message: message}
}
