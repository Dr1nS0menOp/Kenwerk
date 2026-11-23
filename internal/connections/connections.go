// SPDX-License-Identifier: Apache-2.0

// Package connections keeps the outside services an installation connects to, as a system
// administrator sets them in the administration (spec 101): the identity provider, the PDF
// helper, the office service, the drawing service and the token of the metrics scraper. It is
// one row of the table connections, with its secrets sealed and never read back. A part the
// environment sets wins over the row as a whole and shows locked (spec 098, D1). The modules
// that connect get the values in force from InForce, and never read the table.
package connections

import (
	"context"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/outward"
	"github.com/kenwerk/kenwerk/internal/settings"
)

// The parts of the row, each saved apart, each with its own lock.
const (
	PartIdentityProvider = "identity_provider"
	PartPDF              = "pdf"
	PartOffice           = "office"
	PartDrawing          = "drawing"
	PartMetrics          = "metrics"
)

// ActionChanged is the audit and outbox event of a change of one part (spec 101, D8).
const ActionChanged = "connection.changed"

// Where a part in force comes from.
const (
	SourceDatabase    = "database"
	SourceEnvironment = "environment"
	SourceNone        = "none"
)

// The purposes the three secrets are sealed for, which bind each to its column.
//
//nolint:gosec // G101: these name what a value is sealed for; they are no credentials.
const (
	ClientSecretContext = "identity provider client secret"
	PDFPasswordContext  = "pdf helper password"
	MetricsTokenContext = "metrics token"
)

// defaultButton is what the login button says when no name is given, as in the environment.
const defaultButton = "Single sign-on"

// IdentityProvider is the identity provider as the administration shows it: never the secret.
type IdentityProvider struct {
	Issuer               string `json:"issuer"`
	ClientID             string `json:"client_id"`
	ClientSecretSet      bool   `json:"client_secret_set"`
	DisplayName          string `json:"display_name"`
	AutoCreate           bool   `json:"auto_create"`
	AllowUnverifiedEmail bool   `json:"allow_unverified_email"`
	GroupsClaim          string `json:"groups_claim"`
}

// PDFHelper is the PDF helper as the administration shows it: never its password.
type PDFHelper struct {
	URL         string `json:"url"`
	PasswordSet bool   `json:"password_set"`
}

// Address is a service that is only an address: the office service and the drawing service.
type Address struct {
	URL string `json:"url"`
}

// Metrics says whether a scraper has a token: never the token.
type Metrics struct {
	TokenSet bool `json:"token_set"`
}

// Origin says where a part in force comes from, and what locks it.
type Origin struct {
	Source string         `json:"source"`
	Locked *settings.Lock `json:"locked"`
}

// IdentityProviderView is the identity provider in force.
type IdentityProviderView struct {
	IdentityProvider
	Origin
}

// PDFView is the PDF helper in force.
type PDFView struct {
	PDFHelper
	Origin
}

// AddressView is an address in force.
type AddressView struct {
	Address
	Origin
}

// MetricsView is the metrics token in force.
type MetricsView struct {
	Metrics
	Origin
}

// View is every part in force. It never holds a secret, its sealed form or its length.
type View struct {
	IdentityProvider IdentityProviderView `json:"identity_provider"`
	PDF              PDFView              `json:"pdf"`
	Office           AddressView          `json:"office"`
	Drawing          AddressView          `json:"drawing"`
	Metrics          MetricsView          `json:"metrics"`
	UpdatedAt        *time.Time           `json:"updated_at"`
}

// IdentityProviderChange is what a system administrator saves for the identity provider.
type IdentityProviderChange struct {
	Issuer               string                `json:"issuer"`
	ClientID             string                `json:"client_id"`
	ClientSecret         settings.SecretChange `json:"client_secret"`
	DisplayName          string                `json:"display_name"`
	AutoCreate           bool                  `json:"auto_create"`
	AllowUnverifiedEmail bool                  `json:"allow_unverified_email"`
	GroupsClaim          string                `json:"groups_claim"`
}

// PDFChange is what a system administrator saves for the PDF helper.
type PDFChange struct {
	URL      string                `json:"url"`
	Password settings.SecretChange `json:"password"`
}

// AddressChange is what a system administrator saves for the office or the drawing service.
type AddressChange struct {
	URL string `json:"url"`
}

// MetricsChange is what a system administrator saves for the metrics token.
type MetricsChange struct {
	Token settings.SecretChange `json:"token"`
}

// Values are the connections in force, with the secrets open. They are for the modules that
// connect, and never go into an answer, a log or the audit.
type Values struct {
	OIDC config.OIDC
	// OIDCStored, PDFStored and OfficeStored say the address came from the administration, so
	// the server reaches it only through internal/outward (spec 101, D4).
	OIDCStored    bool
	PDFURL        string
	PDFPassword   string
	PDFStored     bool
	CollaboraURL  string
	OfficeStored  bool
	DrawingOrigin string
	MetricsToken  string
}

// Options connect the service to the rest of the installation.
type Options struct {
	Sealer settings.Sealer
	// Outward decides which addresses a stored issuer or helper may reach (D4).
	Outward outward.Options
	// PublicURL is the address of the installation; the drawing service must be elsewhere.
	PublicURL *url.URL
	// Environment is the configuration the process started with, and Locks names per part
	// what of it holds that part. A part without a lock is the administration's.
	Environment config.Config
	Locks       map[string]*settings.Lock
	// Apply receives the values in force on this node each time they change.
	Apply func(Values)
}

// Service keeps the connections of the installation.
type Service struct {
	pool *pgxpool.Pool
	o    Options
	// reloading keeps two rereads from putting their values in force out of order.
	reloading sync.Mutex
	state     atomic.Pointer[state]
}

// state is what this node uses, as it last read it.
type state struct {
	values    Values
	updatedAt time.Time
	read      bool
}

// NewService builds the service and puts in force what the environment holds, so a part of the
// environment works also when the row cannot be read; Reload adds what the row holds.
func NewService(pool *pgxpool.Pool, o Options) *Service {
	s := &Service{pool: pool, o: o}
	s.publish(&state{values: s.merge(row{}, opened{})})
	return s
}

// InForce is what this node connects with now. A nil service connects to nothing.
func (s *Service) InForce() Values {
	if s == nil {
		return Values{}
	}
	return s.state.Load().values
}

// locked is the lock of a part, or nil when the administration holds it.
func (s *Service) locked(part string) *settings.Lock { return s.o.Locks[part] }

// Changeable refuses a change of a part the environment holds (spec 098, D1).
func (s *Service) Changeable(part string) error {
	lock := s.locked(part)
	if lock == nil {
		return nil
	}
	return apperr.Conflict("connection_locked",
		"This is set by "+lock.Setting+". Change it there, or remove it there to set it here.")
}

// origin says where a part comes from: the lock, the row when it holds the part, or nothing.
func (s *Service) origin(part string, stored bool) Origin {
	if lock := s.locked(part); lock != nil {
		return Origin{Source: SourceEnvironment, Locked: lock}
	}
	if stored {
		return Origin{Source: SourceDatabase}
	}
	return Origin{Source: SourceNone}
}

// View shows every part in force. It never holds a secret.
func (s *Service) View(ctx context.Context) (View, error) {
	r, err := readRow(ctx, s.pool, selectRow)
	if err != nil {
		return View{}, err
	}
	env := s.o.Environment
	v := View{
		IdentityProvider: s.providerView(r),
		PDF:              s.pdfView(r),
		Office:           s.addressView(PartOffice, r.office, env.CollaboraURL),
		Drawing:          s.addressView(PartDrawing, r.drawing, env.DrawingOrigin()),
		Metrics:          s.metricsView(r),
	}
	if r.found {
		v.UpdatedAt = &r.updatedAt
	}
	return v, nil
}

func (s *Service) providerView(r row) IdentityProviderView {
	if s.locked(PartIdentityProvider) == nil {
		return IdentityProviderView{IdentityProvider: r.provider, Origin: s.origin(PartIdentityProvider, r.provider.Issuer != "")}
	}
	e := s.o.Environment.OIDC
	return IdentityProviderView{Origin: s.origin(PartIdentityProvider, true), IdentityProvider: IdentityProvider{
		Issuer: e.Issuer, ClientID: e.ClientID, ClientSecretSet: e.ClientSecret != "", DisplayName: e.DisplayName,
		AutoCreate: e.AutoCreate, AllowUnverifiedEmail: e.AllowUnverifiedEmail, GroupsClaim: e.GroupsClaim}}
}

func (s *Service) pdfView(r row) PDFView {
	if s.locked(PartPDF) == nil {
		return PDFView{PDFHelper: r.pdf, Origin: s.origin(PartPDF, r.pdf.URL != "")}
	}
	e := s.o.Environment
	return PDFView{PDFHelper: PDFHelper{URL: e.PDFURL, PasswordSet: e.PDFPassword != ""}, Origin: s.origin(PartPDF, true)}
}

func (s *Service) addressView(part string, stored Address, environment string) AddressView {
	if s.locked(part) == nil {
		return AddressView{Address: stored, Origin: s.origin(part, stored.URL != "")}
	}
	return AddressView{Address: Address{URL: environment}, Origin: s.origin(part, true)}
}

func (s *Service) metricsView(r row) MetricsView {
	if s.locked(PartMetrics) == nil {
		return MetricsView{Metrics: r.metrics, Origin: s.origin(PartMetrics, r.metrics.TokenSet)}
	}
	return MetricsView{Metrics: Metrics{TokenSet: s.o.Environment.MetricsToken != ""}, Origin: s.origin(PartMetrics, true)}
}
