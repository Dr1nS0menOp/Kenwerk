// SPDX-License-Identifier: Apache-2.0

package connections

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/outbox"
	"github.com/kenwerk/kenwerk/internal/settings"
)

// safeFields keep their values in the audit row: addresses and names of systems. The secrets
// are recorded only as changed (spec 101).
var safeFields = settings.SafeFields{"issuer", "client_id", "display_name", "auto_create", "allow_unverified_email",
	"groups_claim", "url"}

// row is the stored row, the secrets still sealed.
type row struct {
	found        bool
	provider     IdentityProvider
	clientSecret []byte
	pdf          PDFHelper
	pdfPassword  []byte
	office       Address
	drawing      Address
	metrics      Metrics
	metricsToken []byte
	updatedAt    time.Time
}

// The row is read with its queries written out, so no SQL is put together at run time.
const (
	selectRow = `SELECT oidc_issuer, oidc_client_id, oidc_client_secret_sealed, oidc_display_name, oidc_auto_create,
		oidc_allow_unverified_email, oidc_groups_claim, pdf_url, pdf_password_sealed, collabora_url, drawing_url,
		metrics_token_sealed, updated_at FROM connections WHERE id`
	selectRowLocked = selectRow + ` FOR UPDATE`
)

func readRow(ctx context.Context, q db.Querier, query string) (row, error) {
	var r row
	p := &r.provider
	err := q.QueryRow(ctx, query).Scan(&p.Issuer, &p.ClientID, &r.clientSecret, &p.DisplayName, &p.AutoCreate,
		&p.AllowUnverifiedEmail, &p.GroupsClaim, &r.pdf.URL, &r.pdfPassword, &r.office.URL, &r.drawing.URL,
		&r.metricsToken, &r.updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return row{}, nil
	}
	if err != nil {
		return row{}, err
	}
	r.found = true
	p.ClientSecretSet, r.pdf.PasswordSet, r.metrics.TokenSet = r.clientSecret != nil, r.pdfPassword != nil, r.metricsToken != nil
	return r, nil
}

// writeRow stores the one row, which store made sure exists.
func writeRow(ctx context.Context, tx pgx.Tx, r row) error {
	p := r.provider
	_, err := tx.Exec(ctx, `UPDATE connections SET oidc_issuer = $1, oidc_client_id = $2, oidc_client_secret_sealed = $3,
		oidc_display_name = $4, oidc_auto_create = $5, oidc_allow_unverified_email = $6, oidc_groups_claim = $7,
		pdf_url = $8, pdf_password_sealed = $9, collabora_url = $10, drawing_url = $11, metrics_token_sealed = $12,
		updated_at = now() WHERE id`,
		p.Issuer, p.ClientID, r.clientSecret, p.DisplayName, p.AutoCreate, p.AllowUnverifiedEmail, p.GroupsClaim,
		r.pdf.URL, r.pdfPassword, r.office.URL, r.drawing.URL, r.metricsToken)
	return err
}

// auditFields are the fields of one part a change compares. A secret is its sealed form, so it
// shows as changed exactly when a new one was sealed or it was removed, never with a value.
func (r row) auditFields(part string) map[string]any {
	switch part {
	case PartIdentityProvider:
		p := r.provider
		return map[string]any{"issuer": p.Issuer, "client_id": p.ClientID, "client_secret": r.clientSecret,
			"display_name": p.DisplayName, "auto_create": p.AutoCreate, "allow_unverified_email": p.AllowUnverifiedEmail,
			"groups_claim": p.GroupsClaim}
	case PartPDF:
		return map[string]any{"url": r.pdf.URL, "password": r.pdfPassword}
	case PartOffice:
		return map[string]any{"url": r.office.URL}
	case PartDrawing:
		return map[string]any{"url": r.drawing.URL}
	}
	return map[string]any{"token": r.metricsToken}
}

// change stores one part, which edit makes from the row as it is, and puts it in force on
// this node at once. The route and its handler check who, the fresh login and the second
// factor (spec 101, D3).
func (s *Service) change(ctx context.Context, c identity.Caller, part string, edit func(r *row) error) (View, error) {
	if err := s.Changeable(part); err != nil {
		return View{}, err
	}
	if err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return s.store(ctx, tx, c, part, edit) }); err != nil {
		return View{}, err
	}
	if err := s.Reload(ctx); err != nil {
		return View{}, err
	}
	return s.View(ctx)
}

// store writes one part inside tx, with what changed in the audit and an outbox event.
func (s *Service) store(ctx context.Context, tx pgx.Tx, c identity.Caller, part string, edit func(r *row) error) error {
	if _, err := tx.Exec(ctx, `INSERT INTO connections (id) VALUES (true) ON CONFLICT (id) DO NOTHING`); err != nil {
		return err
	}
	before, err := readRow(ctx, tx, selectRowLocked)
	if err != nil {
		return err
	}
	after := before
	if err := edit(&after); err != nil {
		return err
	}
	if err := writeRow(ctx, tx, after); err != nil {
		return err
	}
	changes, err := settings.Changes(before.auditFields(part), after.auditFields(part), safeFields)
	if err != nil {
		return err
	}
	details := map[string]any{"part": part, "changes": changes}
	if _, err := audit.Record(ctx, tx, c.Event(ActionChanged, "connection", part, "", details)); err != nil {
		return err
	}
	_, err = outbox.Enqueue(ctx, tx, ActionChanged, map[string]any{"part": part})
	return err
}

var errNoClientSecret = apperr.Invalid("An identity provider needs a client secret.")

// SetIdentityProvider stores the identity provider. An empty issuer turns login through a
// provider off; a provider needs a client ID and a client secret, set now or kept.
func (s *Service) SetIdentityProvider(ctx context.Context, c identity.Caller, ch IdentityProviderChange) (View, error) {
	clean, err := s.checkProvider(ch)
	if err != nil {
		return View{}, err
	}
	return s.change(ctx, c, PartIdentityProvider, func(r *row) error {
		sealed, err := settings.NewSealed(s.o.Sealer, r.clientSecret, clean.ClientSecret, ClientSecretContext)
		if err != nil {
			return err
		}
		if clean.Issuer != "" && sealed == nil {
			return errNoClientSecret
		}
		r.clientSecret = sealed
		r.provider = IdentityProvider{Issuer: clean.Issuer, ClientID: clean.ClientID, DisplayName: clean.DisplayName,
			AutoCreate: clean.AutoCreate, AllowUnverifiedEmail: clean.AllowUnverifiedEmail, GroupsClaim: clean.GroupsClaim,
			ClientSecretSet: sealed != nil}
		return nil
	})
}

// SetPDF stores the PDF helper and its password. An empty address turns PDF off.
func (s *Service) SetPDF(ctx context.Context, c identity.Caller, ch PDFChange) (View, error) {
	address, err := s.checkHelper(ch.URL)
	if err != nil {
		return View{}, err
	}
	if err := settings.CheckSecret(ch.Password, "password"); err != nil {
		return View{}, err
	}
	return s.change(ctx, c, PartPDF, func(r *row) error {
		sealed, err := settings.NewSealed(s.o.Sealer, r.pdfPassword, ch.Password, PDFPasswordContext)
		r.pdfPassword, r.pdf = sealed, PDFHelper{URL: address, PasswordSet: sealed != nil}
		return err
	})
}

// SetOffice stores the office service. An empty address leaves office files to the PDF helper.
func (s *Service) SetOffice(ctx context.Context, c identity.Caller, ch AddressChange) (View, error) {
	address, err := s.checkHelper(ch.URL)
	if err != nil {
		return View{}, err
	}
	return s.change(ctx, c, PartOffice, func(r *row) error {
		r.office = Address{URL: address}
		return nil
	})
}

// SetDrawing stores the drawing service. An empty address turns drawing off.
func (s *Service) SetDrawing(ctx context.Context, c identity.Caller, ch AddressChange) (View, error) {
	origin, err := s.checkDrawing(ch.URL)
	if err != nil {
		return View{}, err
	}
	return s.change(ctx, c, PartDrawing, func(r *row) error {
		r.drawing = Address{URL: origin}
		return nil
	})
}

// SetMetrics stores the metrics token. Without one there is no /metrics at all.
func (s *Service) SetMetrics(ctx context.Context, c identity.Caller, ch MetricsChange) (View, error) {
	if err := checkToken(ch.Token); err != nil {
		return View{}, err
	}
	return s.change(ctx, c, PartMetrics, func(r *row) error {
		sealed, err := settings.NewSealed(s.o.Sealer, r.metricsToken, ch.Token, MetricsTokenContext)
		r.metricsToken, r.metrics = sealed, Metrics{TokenSet: sealed != nil}
		return err
	})
}
