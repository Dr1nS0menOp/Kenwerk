// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"net/http"
	"time"

	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/connections"
	"github.com/kenwerk/kenwerk/internal/exchange"
	"github.com/kenwerk/kenwerk/internal/outward"
	"github.com/kenwerk/kenwerk/internal/settings"
	"github.com/kenwerk/kenwerk/internal/sso"
)

// The outside services set in the administration (spec 101): the environment's settings that
// hold them, and how the values in force reach the modules that connect.

// useConnections builds the connections of the installation and puts in force what the
// environment and the row hold. A row that cannot be read, such as a secret sealed with a key
// this node lacks, leaves the stored parts off rather than the node down; the reread of
// runRuntime tries again and logs it, as for mail.
func (a *App) useConnections(ctx context.Context) {
	cfg := a.cfg
	a.connections = connections.NewService(a.pool, connections.Options{Sealer: a.keyring,
		Outward: outward.Options{AllowPrivate: cfg.OutwardAllowPrivate}, PublicURL: cfg.PublicURL,
		Environment: cfg, Locks: connectionLocks(cfg, a.startedWith), Apply: a.applyConnections})
	if err := a.connections.Reload(ctx); err != nil {
		a.log.Warn("reading the connections of the administration failed; the stored ones wait", "error", err)
	}
}

// applyConnections hands the values in force to the identity provider and the helpers. The
// drawing service and the metrics token are read where they are used.
func (a *App) applyConnections(v connections.Values) {
	fence := outward.Options{AllowPrivate: a.cfg.OutwardAllowPrivate}
	a.sso.Use(sso.Config{Issuer: v.OIDC.Issuer, ClientID: v.OIDC.ClientID, ClientSecret: v.OIDC.ClientSecret,
		RedirectURL: a.cfg.PublicOrigin() + "/api/v1/auth/oidc/callback", DisplayName: v.OIDC.DisplayName,
		AutoCreate: v.OIDC.AutoCreate, AllowUnverifiedEmail: v.OIDC.AllowUnverifiedEmail, GroupsClaim: v.OIDC.GroupsClaim},
		fencedClient(v.OIDCStored, fence, sso.RequestTimeout))
	a.exchange.UseHelpers(exchange.Helpers{PDFURL: v.PDFURL, PDFPassword: v.PDFPassword, CollaboraURL: v.CollaboraURL,
		PDFClient:    fencedClient(v.PDFStored, fence, exchange.HelperTimeout),
		OfficeClient: fencedClient(v.OfficeStored, fence, exchange.HelperTimeout)})
}

// fencedClient is the client that reaches an address set in the administration, which only
// goes where outgoing calls may go (spec 101, D4); nil keeps the client of the environment.
func fencedClient(stored bool, fence outward.Options, timeout time.Duration) *http.Client {
	if !stored {
		return nil
	}
	return fence.Client(timeout)
}

// connectionLocks names per part the setting of the environment that holds it. A part locks on
// its key setting only: a password or a client ID without its address locks nothing.
func connectionLocks(cfg config.Config, started []config.Setting) map[string]*settings.Lock {
	held := map[string]struct {
		setting string
		set     bool
	}{
		connections.PartIdentityProvider: {"OIDC_ISSUER", cfg.OIDC.Issuer != ""},
		connections.PartPDF:              {"PDF_URL", cfg.PDFURL != ""},
		connections.PartOffice:           {"COLLABORA_URL", cfg.CollaboraURL != ""},
		connections.PartDrawing:          {"DRAWING_URL", cfg.DrawingURL != nil},
		connections.PartMetrics:          {"METRICS_TOKEN", cfg.MetricsToken != ""},
	}
	locks := map[string]*settings.Lock{}
	for part, h := range held {
		if h.set {
			locks[part] = environmentLock(h.setting, started)
		}
	}
	return locks
}

// instanceNameSetting is the setting that, when set on purpose, holds the name of the instance.
const instanceNameSetting = "INSTANCE_NAME"

// instanceNameLock is the lock of the name: only when the environment or the configuration
// file sets it, since the configuration always has a name, its default (spec 101, D7).
func instanceNameLock(started []config.Setting) *settings.Lock {
	for _, s := range started {
		if s.Name == instanceNameSetting && s.Source != "default" {
			return environmentLock(instanceNameSetting, started)
		}
	}
	return nil
}

// environmentLock names a setting and where it is written: the environment, or the line of
// the configuration file, as the process read it at its start.
func environmentLock(setting string, started []config.Setting) *settings.Lock {
	lock := &settings.Lock{Setting: "KENWERK_" + setting, Source: connections.SourceEnvironment}
	for _, s := range started {
		if s.Name == setting && s.Source != "default" {
			lock.Source = s.Source
		}
	}
	return lock
}
