// SPDX-License-Identifier: Apache-2.0

// Package headerfooter keeps the installation's header and footer (spec 089): a few lines an
// administrator writes once, which every reader sees above and below each page and blog post.
// It is an experimental part, off until an administrator turns it on.
package headerfooter

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/document"
	"github.com/kenwerk/kenwerk/internal/features"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/ids"
	"github.com/kenwerk/kenwerk/internal/outbox"
	"github.com/kenwerk/kenwerk/internal/settings"
)

// settingKey is where the header and footer are stored; it is no section of the settings, so
// the generic route of the sections cannot reach it (D12).
const settingKey = "header_footer"

// freshFor is how long a node answers readers from its copy. A change on the node drops the copy
// at once; another node's change shows within this time (load budget).
const freshFor = 30 * time.Second

// The two fields, as the API and a refusal name them.
const (
	FieldHeader = "header"
	FieldFooter = "footer"
)

// Value is the stored header and footer. A field that is nil is empty.
type Value struct {
	Header    *document.Node `json:"header"`
	Footer    *document.Node `json:"footer"`
	ChangedAt *time.Time     `json:"changed_at"`
	ChangedBy *uuid.UUID     `json:"changed_by"`
	// Version changes with every save, so a browser can tell a new value from the one it has.
	Version string `json:"version"`
}

// Input is a change: each field a document, or null for an empty one.
type Input struct {
	Header json.RawMessage `json:"header"`
	Footer json.RawMessage `json:"footer"`
}

// Person is who changed the header and footer last, as the administration shows them.
type Person struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Active bool      `json:"active"`
}

// AdminView is what the administration reads: the content, who changed it last, and the limits.
type AdminView struct {
	Header    *document.Node              `json:"header"`
	Footer    *document.Node              `json:"footer"`
	ChangedAt *time.Time                  `json:"changed_at"`
	ChangedBy *Person                     `json:"changed_by"`
	Limits    document.HeaderFooterLimits `json:"limits"`
}

// readersCopy is this node's copy of the switch and the value. Its lock is held while it reads,
// so a change that drops it waits for a read in flight and never leaves an older copy behind.
type readersCopy struct {
	mu     sync.Mutex
	on     bool
	value  Value
	readAt time.Time
}

// Service reads and changes the header and footer.
type Service struct {
	pool     *pgxpool.Pool
	identity *identity.Service
	// now is the clock of the copy; a test moves it.
	now  func() time.Time
	copy readersCopy
}

// NewService creates the service.
func NewService(pool *pgxpool.Pool, id *identity.Service) *Service {
	return &Service{pool: pool, identity: id, now: time.Now}
}

// ForReaders gives the header and footer every reader sees, from this node's copy while it is
// fresh: no statement at all while warm, one when cold. It answers experimental_off while the
// part is off.
func (s *Service) ForReaders(ctx context.Context) (Value, error) {
	s.copy.mu.Lock()
	defer s.copy.mu.Unlock()
	if s.copy.readAt.IsZero() || s.now().Sub(s.copy.readAt) >= freshFor {
		on, v, err := s.read(ctx, s.pool)
		if err != nil {
			return Value{}, err
		}
		s.copy.on, s.copy.value, s.copy.readAt = on, v, s.now()
	}
	if !s.copy.on {
		return Value{}, features.PartOff()
	}
	return s.copy.value, nil
}

// Forget drops this node's copy, so the next reader reads anew. A save calls it, and so does a
// change of the experimental parts on this node.
func (s *Service) Forget() {
	s.copy.mu.Lock()
	defer s.copy.mu.Unlock()
	s.copy.readAt = time.Time{}
}

// read gives whether the part is on and the stored value, in one statement over both keys.
func (s *Service) read(ctx context.Context, q db.Querier) (bool, Value, error) {
	raw, err := settings.LoadEach(ctx, q, features.ExperimentalKey, settingKey)
	if err != nil {
		return false, Value{}, err
	}
	return decode(raw)
}

// decode reads the switch and the value from what LoadEach gave.
func decode(raw map[string][]byte) (bool, Value, error) {
	on, err := features.PartOnIn(raw[features.ExperimentalKey], features.ExperimentalHeaderFooter)
	if err != nil {
		return false, Value{}, err
	}
	var v Value
	if stored, ok := raw[settingKey]; ok {
		if err := json.Unmarshal(stored, &v); err != nil {
			return false, Value{}, err
		}
	}
	return on, v, nil
}

// ForAdministration reads the header and footer anew, with who changed them last and the
// limits. The route requires administrator.
func (s *Service) ForAdministration(ctx context.Context) (AdminView, error) {
	on, v, err := s.read(ctx, s.pool)
	if err != nil {
		return AdminView{}, err
	}
	if !on {
		return AdminView{}, features.PartOff()
	}
	return s.adminView(ctx, v)
}

func (s *Service) adminView(ctx context.Context, v Value) (AdminView, error) {
	view := AdminView{Header: v.Header, Footer: v.Footer, ChangedAt: v.ChangedAt, Limits: document.HeaderFooterLimitsInForce()}
	if v.ChangedBy == nil {
		return view, nil
	}
	person := Person{ID: *v.ChangedBy}
	u, err := s.identity.GetUser(ctx, s.pool, *v.ChangedBy)
	switch {
	case apperr.IsNotFound(err):
		// Removed since: the administration shows that the person is no longer active.
	case err != nil:
		return AdminView{}, err
	default:
		person.Name, person.Active = u.DisplayName, u.Status == identity.StatusActive
	}
	view.ChangedBy = &person
	return view, nil
}

// Set stores a new header and footer. It checks administration itself, so no caller can store
// without the check, and refuses anything outside the subset of the document format before it
// stores anything. A change is audited with each changed field before and after, in the same
// transaction (D10, D16); a save that changes nothing writes nothing.
func (s *Service) Set(ctx context.Context, c identity.Caller, in Input) (AdminView, error) {
	allowed, err := s.identity.HasGlobalPermission(ctx, c.UserID, identity.PermAdministrator)
	if err != nil {
		return AdminView{}, err
	}
	if !allowed {
		return AdminView{}, apperr.Forbidden()
	}
	header, err := content(FieldHeader, in.Header)
	if err != nil {
		return AdminView{}, err
	}
	footer, err := content(FieldFooter, in.Footer)
	if err != nil {
		return AdminView{}, err
	}
	var stored Value
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		stored, err = s.store(ctx, tx, c, header, footer)
		return err
	})
	if err != nil {
		return AdminView{}, err
	}
	s.Forget()
	return s.adminView(ctx, stored)
}

// store compares with what is stored under a row lock, and stores, audits and enqueues a change.
func (s *Service) store(ctx context.Context, tx pgx.Tx, c identity.Caller, header, footer *document.Node) (Value, error) {
	raw, err := settings.LoadEachLocked(ctx, tx, features.ExperimentalKey, settingKey)
	if err != nil {
		return Value{}, err
	}
	on, before, err := decode(raw)
	if err != nil {
		return Value{}, err
	}
	if !on {
		return Value{}, features.PartOff()
	}
	changes := map[string]any{}
	recordChange(changes, FieldHeader, before.Header, header)
	recordChange(changes, FieldFooter, before.Footer, footer)
	if len(changes) == 0 {
		return before, nil
	}
	now, by := s.now().UTC(), c.UserID
	after := Value{Header: header, Footer: footer, ChangedAt: &now, ChangedBy: &by, Version: ids.New().String()}
	if err := write(ctx, tx, after); err != nil {
		return Value{}, err
	}
	if _, err := audit.Record(ctx, tx, c.Event("settings.updated", "settings", settingKey, "",
		map[string]any{"key": settingKey, "changes": changes})); err != nil {
		return Value{}, err
	}
	_, err = outbox.Enqueue(ctx, tx, "settings.updated", map[string]any{"key": settingKey})
	return after, err
}

func write(ctx context.Context, tx pgx.Tx, v Value) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return settings.Store(ctx, tx, settingKey, raw)
}

// recordChange adds a field that changed to changes: the documents before and after, whole,
// because for this channel the content is what changed (D10), and removed when it was emptied.
func recordChange(changes map[string]any, field string, before, after *document.Node) {
	if sameContent(before, after) {
		return
	}
	change := map[string]any{"before": before, "after": after}
	if after == nil {
		change["removed"] = true
	}
	changes[field] = change
}

func sameContent(a, b *document.Node) bool {
	if a == nil || b == nil {
		return a == b
	}
	x, errA := document.Marshal(*a)
	y, errB := document.Marshal(*b)
	return errA == nil && errB == nil && bytes.Equal(x, y)
}

// content checks one field of a change; null and an empty document are nothing.
func content(field string, raw json.RawMessage) (*document.Node, error) {
	if len(bytes.TrimSpace(raw)) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	n, err := document.HeaderFooterContent(raw)
	var refusal *document.HeaderFooterRefusal
	if errors.As(err, &refusal) {
		return nil, apperr.InvalidFields("invalid", []apperr.FieldProblem{{Field: field, Problem: refusal.Problem,
			Message: fmt.Sprintf("The %s cannot be stored. %s", field, refusal.Reason)}})
	}
	return n, err
}
