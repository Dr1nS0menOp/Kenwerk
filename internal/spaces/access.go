// SPDX-License-Identifier: Apache-2.0

package spaces

import (
	"context"
	"errors"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/features"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/permissions"
)

// What a person without access to a space, or to a page in it, is told (spec 094, section 5).
const (
	// AnswerNotFound keeps the space hidden: the same answer as for an address that never existed.
	AnswerNotFound = "not_found"
	// AnswerNoAccess says the person has no access, and nothing more.
	AnswerNoAccess = "no_access"
	// AnswerNoAccessAsk says so and offers to ask for access to a page.
	AnswerNoAccessAsk = "no_access_ask"
)

var answers = []string{AnswerNotFound, AnswerNoAccess, AnswerNoAccessAsk}

// NoAccess is the refusal of a space or page whose space chose to say so. It names nothing of
// what was refused (rule 25).
func NoAccess() *apperr.Error {
	return &apperr.Error{Kind: apperr.KindForbidden, Code: AnswerNoAccess, Message: "You do not have access to this."}
}

// NoAccessAsk is NoAccess with the offer to ask for access.
func NoAccessAsk() *apperr.Error {
	return &apperr.Error{Kind: apperr.KindForbidden, Code: AnswerNoAccessAsk, Message: "You do not have access to this. You can ask for it."}
}

// Refusal is what a person without access is told about something of a space that exists in a
// form a reader could be given (rule 26), from the answer the space chose, as decided by
// AnswerFor. The caller passes the refusal it would give otherwise, which is "not found".
func Refusal(answer string, notFound error) error {
	switch answer {
	case AnswerNoAccess:
		return NoAccess()
	case AnswerNoAccessAsk:
		return NoAccessAsk()
	}
	return notFound
}

// AnswerFor reads, through q, what a person without access to a space is told. A space that is
// in the trash, the system space and the draft space of a pair always stay hidden (rules 26 and
// 28); asking is offered only while the instance allows requests for access (D12).
func (s *Service) AnswerFor(ctx context.Context, q db.Querier, id uuid.UUID) (string, error) {
	var answer, status, pairRole string
	var system bool
	err := q.QueryRow(ctx, "SELECT access_answer, status, COALESCE(pair_role, ''), system FROM spaces WHERE id = $1", id).
		Scan(&answer, &status, &pairRole, &system)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnswerNotFound, nil
	}
	if err != nil {
		return "", err
	}
	if status == StatusTrashed || system || pairRole == permissions.PairDraft {
		return AnswerNotFound, nil
	}
	if answer != AnswerNoAccessAsk {
		return answer, nil
	}
	inst, err := s.features.InstanceIn(ctx, q)
	if err != nil {
		return "", err
	}
	if slices.Contains(inst.Off, features.AccessRequests) {
		return AnswerNoAccess, nil
	}
	return answer, nil
}

// fillAccessAnswer shows the setting to those who may administer the space: the draft space of a
// pair as it answers, which is not found (rule 28).
func (s *Service) fillAccessAnswer(ctx context.Context, sp *Space) error {
	sp.AccessAnswer = sp.accessAnswer
	if sp.PairRole == permissions.PairDraft {
		sp.AccessAnswer = AnswerNotFound
	}
	inst, err := s.features.InstanceIn(ctx, s.pool)
	if err != nil {
		return err
	}
	sp.AccessAskOff = slices.Contains(inst.Off, features.AccessRequests)
	return nil
}

// SetAccessAnswer chooses what a person without access sees. It needs space administer, is
// refused for the draft space of a pair, which always stays hidden (rule 28), and keeps the
// feature access_requests in step for a node of the previous release.
func (s *Service) SetAccessAnswer(ctx context.Context, c identity.Caller, id uuid.UUID, answer string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		// The rights come first, so a stranger learns nothing from the shape of the input.
		sp, err := s.requireAdmin(ctx, tx, c, id)
		if err != nil {
			return err
		}
		if !slices.Contains(answers, answer) {
			return apperr.Invalid("Choose not_found, no_access or no_access_ask.")
		}
		if sp.PairRole == permissions.PairDraft {
			return apperr.Conflict("managed_space", "The draft space of a pair always stays hidden from readers.")
		}
		var from string
		if err := tx.QueryRow(ctx, "SELECT access_answer FROM spaces WHERE id = $1 FOR UPDATE", id).Scan(&from); err != nil {
			return err
		}
		if err := s.writeAnswer(ctx, tx, id, answer); err != nil {
			return err
		}
		return record(ctx, tx, c, "space.access_answer_changed", sp, map[string]any{"from": from, "to": answer})
	})
}

// writeAnswer stores an answer and the feature the previous release reads in its place.
func (s *Service) writeAnswer(ctx context.Context, tx pgx.Tx, id uuid.UUID, answer string) error {
	if _, err := tx.Exec(ctx, "UPDATE spaces SET access_answer = $2 WHERE id = $1", id, answer); err != nil {
		return err
	}
	return s.features.Set(ctx, tx, id, map[string]bool{features.AccessRequests: answer == AnswerNoAccessAsk})
}

// startAnswer gives a new space its first answer: No access, and ask for it (D11), or No access
// where an administrator chose that requests start off in new spaces.
func (s *Service) startAnswer(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	inst, err := s.features.InstanceIn(ctx, tx)
	if err != nil {
		return err
	}
	answer := AnswerNoAccessAsk
	if slices.Contains(inst.NewOff, features.AccessRequests) {
		answer = AnswerNoAccess
	}
	return s.writeAnswer(ctx, tx, id, answer)
}

// OwnerIDsIn lists, through q, who owns a space, in the order its owners list shows them.
func OwnerIDsIn(ctx context.Context, q db.Querier, id uuid.UUID) ([]uuid.UUID, error) {
	people, err := ownersIn(ctx, q, id)
	if err != nil {
		return nil, err
	}
	out := make([]uuid.UUID, len(people))
	for i, p := range people {
		out[i] = p.ID
	}
	return out, nil
}

// OldKeysIn lists, through q, the keys a space had before, for a module that checked already.
func OldKeysIn(ctx context.Context, q db.Querier, id uuid.UUID) ([]string, error) {
	rows, err := q.Query(ctx, "SELECT alias FROM space_key_aliases WHERE space_id = $1 ORDER BY alias", id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
