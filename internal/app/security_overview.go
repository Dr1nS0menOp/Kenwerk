// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"fmt"
	"time"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/hardening"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/instance"
	"github.com/kenwerk/kenwerk/internal/settings"
	"github.com/kenwerk/kenwerk/internal/sites"
)

// The audit actions the security overview reads the newest of.
const (
	actionAuditVerified    = "audit.verified"
	actionExportRulesSaved = "export.policy_changed"
	actionKeyPromoted      = "keys.promoted"
	auditWorkerActor       = "worker"
)

// SecurityOverview judges the steps that make this installation safer (spec 088). It reads,
// never writes. Only an administrator may see it: the route says so, and this checks it again,
// so no other caller reaches it. One answer is kept per node for half a minute, the time the
// health facts it rests on are kept, so System health and the overview agree.
func (a *App) SecurityOverview(ctx context.Context, c identity.Caller) (hardening.Overview, error) {
	allowed, err := a.identity.HasGlobalPermission(ctx, c.UserID, identity.PermAdministrator)
	if err != nil {
		return hardening.Overview{}, err
	}
	if !allowed {
		return hardening.Overview{}, apperr.Forbidden()
	}
	return a.security.Get(ctx, a.readSecurityOverview)
}

// ReadFreshSecurityOverview reads the overview past its half minute, for tests that change the
// installation and look again at once. The health facts keep their own half minute.
func (a *App) ReadFreshSecurityOverview(ctx context.Context) (hardening.Overview, error) {
	return a.readSecurityOverview(ctx, time.Now())
}

func (a *App) readSecurityOverview(ctx context.Context, now time.Time) (hardening.Overview, error) {
	f, err := a.securityFacts(ctx, now)
	if err != nil {
		return hardening.Overview{}, err
	}
	return hardening.Evaluate(f), nil
}

// securityFacts reads what the steps judge. Each module answers through its own Go API; the
// health facts come from their cache.
func (a *App) securityFacts(ctx context.Context, now time.Time) (hardening.Facts, error) {
	f := hardening.Facts{Now: now, ProviderSet: a.sso.Provider() != nil, HTTPS: a.cfg.SecureCookies(),
		PlainToOthers: a.cfg.PlainToOthers(), OwnerAddressHere: a.cfg.MigrateDatabaseURL != "", KeysLoaded: len(a.keyring.KeyIDs())}
	if err := a.readPeopleFacts(ctx, &f); err != nil {
		return f, err
	}
	if err := a.readSharingFacts(ctx, &f); err != nil {
		return f, err
	}
	if err := a.readInstallationFacts(ctx, &f); err != nil {
		return f, err
	}
	return f, a.readBackupAndAuditFacts(ctx, &f)
}

// readPeopleFacts reads who holds what way in: administrators, second factors, guests and tokens.
func (a *App) readPeopleFacts(ctx context.Context, f *hardening.Facts) error {
	c, err := a.identity.SecurityCounts(ctx, hardening.TokenUnusedAfter)
	if err != nil {
		return err
	}
	f.Administrators, f.LocalAdminsWithoutPasskey, f.LocalAdminsWithoutFactor = c.Administrators, c.LocalAdminsWithoutPasskey, c.LocalAdminsWithoutFactor
	f.LocalWithoutFactor, f.Guests, f.GuestsWithoutEnd = c.LocalWithoutFactor, c.Guests, c.GuestsWithoutEnd
	f.Tokens = hardening.TokenCounts{Active: c.Tokens, Administration: c.TokensAdministration, Writing: c.TokensWriting,
		Assistant: c.TokensAssistant, SpacesLimited: c.TokensSpacesLimited, Unused: c.TokensUnused,
		UnusedAdministration: c.TokensUnusedAdministration}
	access := settings.DefaultAccess
	if err := a.settings.ReadSection(ctx, settings.SectionAccess, &access); err != nil {
		return err
	}
	f.SecondFactorRule, f.IdleMinutes = access.SecondFactor, access.IdleMinutes
	provisioning, err := a.scim.Tokens(ctx)
	if err != nil {
		return err
	}
	for _, t := range provisioning {
		if t.RevokedAt == nil && t.ExpiresAt.After(f.Now) {
			f.ProvisioningTokens++
		}
	}
	return nil
}

// readSharingFacts reads the ways out to the public and when the export rules were last saved.
func (a *App) readSharingFacts(ctx context.Context, f *hardening.Facts) error {
	limits, err := a.exchange.Limits(ctx)
	if err != nil {
		return err
	}
	f.PublicSitesAllowed, f.PublicLinksAllowed = limits.PublicSites, limits.PublicLinks
	if f.LiveSites, f.LiveLinks, err = sites.LiveEverywhere(ctx, a.pool); err != nil {
		return fmt.Errorf("app: count what is public: %w", err)
	}
	saved, err := newestAudit(ctx, a.pool, actionExportRulesSaved, "")
	if err != nil {
		return err
	}
	if saved != nil {
		f.ExportRulesSaved = saved.OccurredAt
	}
	return nil
}

// readInstallationFacts reads the database role, the age of the installation and when a key was
// last made the one that seals.
func (a *App) readInstallationFacts(ctx context.Context, f *hardening.Facts) error {
	role, err := db.CurrentRole(ctx, a.pool)
	if err != nil {
		return err
	}
	f.RoleSuperuser, f.RoleOwnsTables = role.Superuser, role.OwnsTable
	if f.InstanceCreated, err = instance.CreatedAt(ctx, a.pool); err != nil {
		return fmt.Errorf("app: read the age of the installation: %w", err)
	}
	promoted, err := newestAudit(ctx, a.pool, actionKeyPromoted, "")
	if err != nil {
		return err
	}
	if promoted != nil {
		f.KeyPromoted = promoted.OccurredAt
	}
	return nil
}

// readBackupAndAuditFacts reads the backups as System health judges them, the backup service's
// key, the newest restore check, the daily check of the chain and the newest witness report.
func (a *App) readBackupAndAuditFacts(ctx context.Context, f *hardening.Facts) error {
	h, err := a.HealthFacts(ctx)
	if err != nil {
		return err
	}
	f.ProxyNotTrusted = h.OneLoginAddress != ""
	f.LastBackup, f.BackupFailed, f.BackupInterval = h.LastBackup, h.BackupFailed, h.BackupInterval
	if h.WitnessReported {
		f.WitnessAt, f.WitnessOK = h.WitnessAt, h.WitnessOK
	}
	b, err := a.backups.Overview(ctx)
	if err != nil {
		return err
	}
	if b.Worker != nil {
		f.BackupServiceSeen, f.BackupKeyPresent = true, b.Worker.KeyPresent
	}
	if b.RestoreCheck != nil {
		f.RestoreCheckAt, f.RestoreCheckOK = b.RestoreCheck.CheckedAt, b.RestoreCheck.OK
	}
	checked, err := newestAudit(ctx, a.pool, actionAuditVerified, auditWorkerActor)
	if err != nil {
		return err
	}
	if checked != nil {
		f.AuditCheckAt, f.AuditCheckOK = checked.OccurredAt, checked.Result == audit.ResultSuccess
	}
	return nil
}

// newestAudit is the newest kept event of an action, by actor when one is named, or nil.
func newestAudit(ctx context.Context, q db.Querier, action, actor string) (*audit.Event, error) {
	list, err := audit.List(ctx, q, audit.Filter{Action: action, ActorID: actor, Limit: 1})
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0].Event, nil
}
