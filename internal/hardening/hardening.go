// SPDX-License-Identifier: Apache-2.0

// Package hardening holds the rules of the security overview (spec 088): from facts an
// installation knows about its own configuration to the steps that make it safer, each done,
// needing attention or not started. Like internal/health it reads nothing itself, so every
// rule and threshold can be tested on its own, and the overview can only report, never change.
package hardening

import (
	"time"

	"github.com/kenwerk/kenwerk/internal/health"
	"github.com/kenwerk/kenwerk/internal/settings"
)

// State is how a step or a sub-step stands.
type State string

// The states, from good to bad (ADM-125).
const (
	Done       State = "done"
	NotStarted State = "not_started"
	Attention  State = "attention"
)

// The thresholds of the steps. Those of backups and the witness are the ones System health
// warns at, so the two screens never disagree.
const (
	// RestoreCheckWithin is how old the newest restore check may be: the backup service runs
	// one a week, and a day more is late.
	RestoreCheckWithin = 8 * 24 * time.Hour
	// AuditCheckWithin is how old the newest daily check of the audit chain may be.
	AuditCheckWithin = 48 * time.Hour
	// WitnessWithin is how old the newest witness report may be.
	WitnessWithin = health.WitnessWarnAfter
	// SharingReviewWithin is how long a save of the export rules counts as a look at the ways
	// out of the installation (D10).
	SharingReviewWithin = 180 * 24 * time.Hour
	// KeyAgeWithin is how long one key that seals secrets is used before replacing it is
	// advised (D17).
	KeyAgeWithin = 365 * 24 * time.Hour
	// TokenUnusedAfter is when a token that still works counts as not in use.
	TokenUnusedAfter = 90 * 24 * time.Hour
)

// Substep is one condition of a step, with its own state.
type Substep struct {
	ID    string `json:"id"`
	State State  `json:"state"`
}

// Count is the number a step shows, with the word for what it counts. A nil value is not known
// yet, which the screen shows as a dash (ADM-124).
type Count struct {
	Value *int   `json:"value"`
	Unit  string `json:"unit"`
}

// Link names the section of the administration where a step is done, by its id in the
// browser's registry, and the filters that section opens with. The server never builds a
// browser address (D15).
type Link struct {
	Section string            `json:"section"`
	Query   map[string]string `json:"query,omitempty"`
}

// Step is one step of the overview.
type Step struct {
	ID       string    `json:"id"`
	State    State     `json:"state"`
	Substeps []Substep `json:"substeps"`
	Count    *Count    `json:"count,omitempty"`
	// Figures are further counts the step shows in words, such as how many tokens reach
	// Administration. Never a name, an address or a secret.
	Figures map[string]int `json:"figures,omitempty"`
	Link    Link           `json:"link"`
	// NodeFact says the step reads the configuration of the node that answered (D12).
	NodeFact bool `json:"node_fact"`
}

// Group is a heading of the overview and its steps.
type Group struct {
	ID    string `json:"id"`
	Steps []Step `json:"steps"`
}

// Overview is the whole answer: the groups in a fixed order, and how many steps need
// attention, which the summary of the administration shows (ADM-127).
type Overview struct {
	AsOf      time.Time `json:"as_of"`
	Groups    []Group   `json:"groups"`
	Attention int       `json:"attention"`
}

// TokenCounts are the personal and service tokens that still work, of people who are active.
type TokenCounts struct {
	Active int
	// Administration counts tokens that reach Administration; Writing those that may change
	// content; Assistant those made for an assistant (spec 096); SpacesLimited those limited to
	// some spaces.
	Administration int
	Writing        int
	Assistant      int
	SpacesLimited  int
	// Unused counts tokens not used, or never used, for TokenUnusedAfter;
	// UnusedAdministration those of them that reach Administration.
	Unused               int
	UnusedAdministration int
}

// Facts is what the installation knows about its own configuration. A zero time is never.
type Facts struct {
	Now time.Time

	// Administrators counts active members holding administration, directly or through a
	// group. Service accounts and guests do not count.
	Administrators int
	// LocalAdminsWithoutPasskey and LocalAdminsWithoutFactor count administrators who log in
	// with a password here and hold no passkey, or no second factor at all. People of an
	// identity provider sign in there and are left out (D14).
	LocalAdminsWithoutPasskey int
	LocalAdminsWithoutFactor  int
	// LocalWithoutFactor counts active people who log in with a password here and hold no
	// second factor. Service accounts are left out.
	LocalWithoutFactor int
	// SecondFactorRule is the rule as stored; InstanceCreated starts the grace of
	// settings.FactorAfterGrace.
	SecondFactorRule string
	InstanceCreated  time.Time
	IdleMinutes      int
	// ProxyNotTrusted is the trace of a reverse proxy the node does not trust: every login of
	// the last day came from one private address (health).
	ProxyNotTrusted bool
	// ProviderSet says the answering node signs people in through an identity provider.
	ProviderSet bool
	// ProvisioningTokens counts provisioning tokens that still work.
	ProvisioningTokens int

	Tokens           TokenCounts
	Guests           int
	GuestsWithoutEnd int

	PublicSitesAllowed bool
	PublicLinksAllowed bool
	LiveSites          int
	LiveLinks          int
	// ExportRulesSaved is when the export rules were last saved.
	ExportRulesSaved time.Time

	// HTTPS says the public address of the answering node uses https; PlainToOthers that it is
	// plain http on a host other than this machine (SEC-257).
	HTTPS         bool
	PlainToOthers bool
	// RoleSuperuser and RoleOwnsTables are of the database role the application connects as.
	RoleSuperuser  bool
	RoleOwnsTables bool
	// OwnerAddressHere says the answering node holds the address of the owner of the tables.
	OwnerAddressHere bool
	// KeysLoaded counts the keys that seal secrets on the answering node: more than one while
	// a key is being brought in or taken out. KeyPromoted is when a key was last made the one
	// that seals; zero means the first key still seals, made when the installation was.
	KeysLoaded  int
	KeyPromoted time.Time

	// BackupServiceSeen says a backup service ever asked what to do; BackupKeyPresent that it
	// reported a backup key.
	BackupServiceSeen bool
	BackupKeyPresent  bool
	LastBackup        time.Time
	BackupFailed      bool
	BackupInterval    time.Duration
	RestoreCheckAt    time.Time
	RestoreCheckOK    bool
	AuditCheckAt      time.Time
	AuditCheckOK      bool
	WitnessAt         time.Time
	WitnessOK         bool
}

// weight says what a sub-step that does not hold means: critical needs a person now,
// advisory is a step not taken yet (D3).
type weight bool

const (
	advisory weight = false
	critical weight = true
)

// sub judges one sub-step.
func sub(id string, holds bool, w weight) Substep {
	switch {
	case holds:
		return Substep{ID: id, State: Done}
	case w == critical:
		return Substep{ID: id, State: Attention}
	default:
		return Substep{ID: id, State: NotStarted}
	}
}

// step gives a step the state of its worst sub-step.
func step(id string, link Link, subs ...Substep) Step {
	s := Step{ID: id, State: Done, Substeps: subs, Link: link}
	for _, x := range subs {
		switch {
		case x.State == Attention:
			s.State = Attention
		case x.State == NotStarted && s.State == Done:
			s.State = NotStarted
		}
	}
	return s
}

// counted gives a step its count.
func (s Step) counted(value *int, unit string) Step {
	s.Count = &Count{Value: value, Unit: unit}
	return s
}

func (s Step) onNode() Step {
	s.NodeFact = true
	return s
}

func known(n int) *int { return &n }

func to(section string) Link { return Link{Section: section} }

// within says whether at happened and is at most limit old.
func within(now, at time.Time, limit time.Duration) bool {
	return !at.IsZero() && now.Sub(at) <= limit
}

// ageIn is the whole number of units since at, or nil when at never happened.
func ageIn(now, at time.Time, unit time.Duration) *int {
	if at.IsZero() {
		return nil
	}
	return known(int(now.Sub(at) / unit))
}

// Evaluate judges the facts. The groups and steps keep one order, whatever their states, so a
// person finds a step where it was last time.
func Evaluate(f Facts) Overview {
	o := Overview{AsOf: f.Now, Groups: []Group{
		{ID: "sign_in", Steps: []Step{identityProvider(f), secondFactor(f), twoAdministrators(f), administratorFactors(f), loginRules(f)}},
		{ID: "access", Steps: []Step{tokens(f), guests(f), publicSharing(f)}},
		{ID: "installation", Steps: []Step{https(f), databaseRoles(f), keyRotation(f)}},
		{ID: "backups_audit", Steps: []Step{backupsEncrypted(f), backupRecent(f), restoreTested(f), auditChecked(f), witnessOutside(f)}},
	}}
	o.Attention = AttentionCount(o.Groups)
	return o
}

// AttentionCount counts the steps that need attention. A step not started is a step to take,
// not news, so it never counts (D5).
func AttentionCount(groups []Group) int {
	n := 0
	for _, g := range groups {
		for _, s := range g.Steps {
			if s.State == Attention {
				n++
			}
		}
	}
	return n
}

func identityProvider(f Facts) Step {
	return step("identity_provider", to("login"),
		sub("provider", f.ProviderSet, advisory),
		sub("provisioning", f.ProvisioningTokens > 0, advisory)).onNode()
}

// secondFactor follows the rule in force. The rule of a new installation asks nothing of
// administrators during its grace, which is a step not taken yet; a rule set to none is a
// choice that needs a person (SEC-164).
func secondFactor(f Facts) Step {
	rule := f.SecondFactorRule
	inGrace := rule == settings.FactorAfterGrace && f.Now.Sub(f.InstanceCreated) < settings.SecondFactorGrace
	admins := rule == settings.FactorAdministrators || rule == settings.FactorMembers ||
		(rule == settings.FactorAfterGrace && !inGrace)
	w := critical
	if inGrace {
		w = advisory
	}
	return step("second_factor", to("login"),
		sub("rule_administrators", admins, w),
		sub("rule_members", rule == settings.FactorMembers, advisory)).
		counted(known(f.LocalWithoutFactor), "accounts")
}

// twoAdministrators is advisory: a small team often has one, and the risk is being locked
// out, which the command line undoes (D4).
func twoAdministrators(f Facts) Step {
	return step("two_administrators", to("instance-permissions"),
		sub("two_active", f.Administrators >= 2, advisory)).
		counted(known(f.Administrators), "administrators")
}

// administratorFactors asks a passkey of every administrator who logs in here (SEC-162). An
// installation without an administrator is not started, never done.
func administratorFactors(f Facts) Step {
	link := Link{Section: "users", Query: map[string]string{"role": "administrator"}}
	if f.Administrators == 0 {
		return step("administrator_factors", link,
			sub("admin_second_factor", false, advisory), sub("admin_passkey", false, advisory)).
			counted(known(0), "administrators")
	}
	return step("administrator_factors", link,
		sub("admin_second_factor", f.LocalAdminsWithoutFactor == 0, critical),
		sub("admin_passkey", f.LocalAdminsWithoutPasskey == 0, critical)).
		counted(known(f.LocalAdminsWithoutPasskey), "administrators_without_passkey")
}

func loginRules(f Facts) Step {
	return step("login_rules", to("login"),
		sub("proxy_trusted", !f.ProxyNotTrusted, critical),
		sub("idle_limit", f.IdleMinutes > 0, advisory))
}

// tokens shows what the tokens that still work may reach; a token nobody uses is one to
// revoke.
func tokens(f Facts) Step {
	t := f.Tokens
	s := step("tokens", to("service-accounts"),
		sub("admin_tokens_in_use", t.UnusedAdministration == 0, advisory),
		sub("tokens_in_use", t.Unused == 0, advisory)).
		counted(known(t.Active), "tokens")
	s.Figures = map[string]int{"administration": t.Administration, "writing": t.Writing, "assistant": t.Assistant,
		"spaces_limited": t.SpacesLimited, "unused": t.Unused}
	return s
}

func guests(f Facts) Step {
	return step("guests", Link{Section: "users", Query: map[string]string{"type": "guest"}},
		sub("guests_end", f.GuestsWithoutEnd == 0, advisory)).
		counted(known(f.GuestsWithoutEnd), "guests_without_end")
}

// publicSharing holds when every way out to the public is closed, or when someone looked at
// the export rules lately (D10).
func publicSharing(f Facts) Step {
	closed := !f.PublicSitesAllowed && !f.PublicLinksAllowed
	s := step("public_sharing", to("export"),
		sub("sharing_reviewed", closed || within(f.Now, f.ExportRulesSaved, SharingReviewWithin), advisory)).
		counted(known(f.LiveSites+f.LiveLinks), "published")
	s.Figures = map[string]int{"sites": f.LiveSites, "links": f.LiveLinks}
	return s
}

// https needs a person when others reach a plain address; on this machine alone it is a
// trial (SEC-257).
func https(f Facts) Step {
	w := advisory
	if f.PlainToOthers {
		w = critical
	}
	return step("https", to("configuration"), sub("https", f.HTTPS, w)).onNode()
}

// databaseRoles asks for two roles (ADR-019): the application must not own the tables, and a
// node that serves people is better without the owner's address (ADR-044).
func databaseRoles(f Facts) Step {
	return step("database_roles", to("configuration"),
		sub("role_owns_nothing", !f.RoleSuperuser && !f.RoleOwnsTables, critical),
		sub("owner_address_apart", !f.OwnerAddressHere, advisory)).onNode()
}

// keyRotation says whether a replacement of the key that seals secrets was left half done on
// this node, and how long the key in force has sealed (SEC-713).
func keyRotation(f Facts) Step {
	since := f.KeyPromoted
	if since.IsZero() {
		since = f.InstanceCreated
	}
	return step("key_rotation", to("configuration"),
		sub("rotation_finished", f.KeysLoaded == 1, advisory),
		sub("key_recent", within(f.Now, since, KeyAgeWithin), advisory)).
		counted(ageIn(f.Now, since, 24*time.Hour), "days").onNode()
}

// backupsEncrypted needs a person once a backup service was seen without a key.
func backupsEncrypted(f Facts) Step {
	w := advisory
	if f.BackupServiceSeen {
		w = critical
	}
	return step("backups_encrypted", to("backups"), sub("backup_key", f.BackupServiceSeen && f.BackupKeyPresent, w))
}

// backupRecent follows the backup line of System health: a backup within its interval and
// health.BackupLateBy, and the newest one did not fail (ADM-049).
func backupRecent(f Facts) Step {
	fine := within(f.Now, f.LastBackup, health.BackupDueWithin(f.BackupInterval)) && !f.BackupFailed
	return step("backup_recent", to("backups"), sub("backup_recent", fine, critical)).
		counted(ageIn(f.Now, f.LastBackup, time.Hour), "hours")
}

// lapsed judges a check that runs again and again: never run is a step to take; once it ran,
// a failure or an old result needs a person.
func lapsed(id string, at time.Time, ok bool, now time.Time, limit time.Duration) Substep {
	w := advisory
	if !at.IsZero() {
		w = critical
	}
	return sub(id, ok && within(now, at, limit), w)
}

func restoreTested(f Facts) Step {
	return step("restore_tested", to("backups"),
		lapsed("restore_tested", f.RestoreCheckAt, f.RestoreCheckOK, f.Now, RestoreCheckWithin)).
		counted(ageIn(f.Now, f.RestoreCheckAt, 24*time.Hour), "days")
}

func auditChecked(f Facts) Step {
	return step("audit_checked", to("audit"),
		lapsed("audit_checked", f.AuditCheckAt, f.AuditCheckOK, f.Now, AuditCheckWithin))
}

// witnessOutside rests on a recent report by the owner of the tables: the installation cannot
// see where its witness lines are kept (D6).
func witnessOutside(f Facts) Step {
	return step("witness_outside", to("audit"),
		lapsed("witness_outside", f.WitnessAt, f.WitnessOK, f.Now, WitnessWithin)).
		counted(ageIn(f.Now, f.WitnessAt, 24*time.Hour), "days")
}
