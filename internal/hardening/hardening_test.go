// SPDX-License-Identifier: Apache-2.0

package hardening

import (
	"encoding/json"
	"maps"
	"os"
	"regexp"
	"slices"
	"testing"
	"time"

	"github.com/kenwerk/kenwerk/internal/health"
	"github.com/kenwerk/kenwerk/internal/settings"
)

var now = time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)

// safe is an installation where every step is done, so a test changes one fact and sees one
// step move.
func safe() Facts {
	return Facts{
		Now:            now,
		Administrators: 2, SecondFactorRule: settings.FactorMembers, InstanceCreated: now.Add(-400 * 24 * time.Hour),
		IdleMinutes: 60, ProviderSet: true, ProvisioningTokens: 1,
		PublicSitesAllowed: true, PublicLinksAllowed: true, LiveSites: 1, LiveLinks: 2, ExportRulesSaved: now.Add(-24 * time.Hour),
		HTTPS: true, KeysLoaded: 1, KeyPromoted: now.Add(-30 * 24 * time.Hour),
		BackupServiceSeen: true, BackupKeyPresent: true, LastBackup: now.Add(-time.Hour), BackupInterval: 24 * time.Hour,
		RestoreCheckAt: now.Add(-24 * time.Hour), RestoreCheckOK: true,
		AuditCheckAt: now.Add(-time.Hour), AuditCheckOK: true,
		WitnessAt: now.Add(-24 * time.Hour), WitnessOK: true,
	}
}

func stepOf(t *testing.T, o Overview, id string) Step {
	t.Helper()
	for _, g := range o.Groups {
		for _, s := range g.Steps {
			if s.ID == id {
				return s
			}
		}
	}
	t.Fatalf("no step %s", id)
	return Step{}
}

func subOf(t *testing.T, s Step, id string) State {
	t.Helper()
	for _, x := range s.Substeps {
		if x.ID == id {
			return x.State
		}
	}
	t.Fatalf("step %s has no sub-step %s", s.ID, id)
	return ""
}

// judge changes the safe facts and gives the state of one step.
func judge(t *testing.T, id string, change func(*Facts)) Step {
	t.Helper()
	f := safe()
	change(&f)
	return stepOf(t, Evaluate(f), id)
}

func wantState(t *testing.T, s Step, want State) {
	t.Helper()
	if s.State != want {
		t.Fatalf("step %s is %s, want %s: %+v", s.ID, s.State, want, s.Substeps)
	}
}

func TestASafeInstallationHasEveryStepDoneAndNothingForTheSummary(t *testing.T) {
	o := Evaluate(safe())
	for _, g := range o.Groups {
		for _, s := range g.Steps {
			if s.State != Done {
				t.Errorf("step %s is %s: %+v", s.ID, s.State, s.Substeps)
			}
		}
	}
	if o.Attention != 0 || !o.AsOf.Equal(now) {
		t.Fatalf("attention %d, as of %v", o.Attention, o.AsOf)
	}
}

// The order of ADM-126 never changes with the states, and every id is used once.
func TestTheStepsKeepTheirOrderAndEachIdIsUsedOnce(t *testing.T) {
	want := map[string][]string{
		"sign_in":       {"identity_provider", "second_factor", "two_administrators", "administrator_factors", "login_rules"},
		"access":        {"tokens", "guests", "public_sharing"},
		"installation":  {"https", "database_roles", "key_rotation"},
		"backups_audit": {"backups_encrypted", "backup_recent", "restore_tested", "audit_checked", "witness_outside"},
	}
	for _, f := range []Facts{safe(), {Now: now}} {
		o := Evaluate(f)
		groups := []string{}
		seen := map[string]bool{}
		for _, g := range o.Groups {
			groups = append(groups, g.ID)
			var steps []string
			for _, s := range g.Steps {
				if seen[s.ID] {
					t.Fatalf("step %s twice", s.ID)
				}
				seen[s.ID] = true
				steps = append(steps, s.ID)
			}
			if !slices.Equal(steps, want[g.ID]) {
				t.Fatalf("group %s: %v, want %v", g.ID, steps, want[g.ID])
			}
		}
		if !slices.Equal(groups, []string{"sign_in", "access", "installation", "backups_audit"}) {
			t.Fatalf("groups %v", groups)
		}
	}
}

// A step not started is a step to take, not news: only steps that need attention count.
func TestTheAttentionNumberCountsOnlyStepsThatNeedAttention(t *testing.T) {
	f := safe()
	// Two steps not started: one administrator, and plain http on this machine alone.
	f.Administrators = 1
	f.HTTPS = false
	// Two that need attention.
	f.ProxyNotTrusted = true
	f.LocalAdminsWithoutPasskey = 1
	o := Evaluate(f)
	if o.Attention != 2 {
		t.Fatalf("attention %d, want 2", o.Attention)
	}
	if got := AttentionCount([]Group{{Steps: []Step{{State: NotStarted}, {State: Done}}}}); got != 0 {
		t.Fatalf("steps not started counted: %d", got)
	}
}

// An installation that knows nothing yet has no step done that needs a fact to be done.
func TestNothingKnownMakesNoStepDone(t *testing.T) {
	o := Evaluate(Facts{Now: now})
	for _, id := range []string{"identity_provider", "second_factor", "two_administrators", "administrator_factors",
		"backups_encrypted", "backup_recent", "restore_tested", "audit_checked", "witness_outside", "https", "key_rotation"} {
		if s := stepOf(t, o, id); s.State == Done {
			t.Errorf("step %s is done on facts that say nothing: %+v", id, s.Substeps)
		}
	}
	for _, id := range []string{"backup_recent", "restore_tested", "witness_outside"} {
		if c := stepOf(t, o, id).Count; c == nil || c.Value != nil {
			t.Errorf("step %s shows a number for something that never happened: %+v", id, c)
		}
	}
}

func TestOneAdministratorIsAStepNotTakenAndTwoAreDone(t *testing.T) {
	s := judge(t, "two_administrators", func(f *Facts) { f.Administrators = 1 })
	wantState(t, s, NotStarted)
	if s.Count == nil || *s.Count.Value != 1 || s.Count.Unit != "administrators" {
		t.Fatalf("count %+v", s.Count)
	}
	wantState(t, judge(t, "two_administrators", func(f *Facts) { f.Administrators = 2 }), Done)
}

func TestAnAdministratorWithoutAPasskeyOrSecondFactorNeedsAttention(t *testing.T) {
	s := judge(t, "administrator_factors", func(f *Facts) { f.LocalAdminsWithoutPasskey = 1 })
	wantState(t, s, Attention)
	if subOf(t, s, "admin_passkey") != Attention || subOf(t, s, "admin_second_factor") != Done || *s.Count.Value != 1 {
		t.Fatalf("one administrator without a passkey: %+v %+v", s.Substeps, s.Count)
	}
	s = judge(t, "administrator_factors", func(f *Facts) { f.LocalAdminsWithoutFactor = 1 })
	if subOf(t, s, "admin_second_factor") != Attention {
		t.Fatalf("one administrator without any factor: %+v", s.Substeps)
	}
}

func TestNoAdministratorAtAllIsNotStartedNeverDone(t *testing.T) {
	s := judge(t, "administrator_factors", func(f *Facts) { f.Administrators = 0 })
	wantState(t, s, NotStarted)
}

func TestTheSecondFactorFollowsTheRuleInForce(t *testing.T) {
	cases := []struct {
		name      string
		rule      string
		age       time.Duration
		state     State
		admins    State
		everybody State
	}{
		{"none set on purpose", settings.FactorNone, 400 * 24 * time.Hour, Attention, Attention, NotStarted},
		{"the grace of a new installation", settings.FactorAfterGrace, settings.SecondFactorGrace - time.Second, NotStarted, NotStarted, NotStarted},
		{"right after the grace", settings.FactorAfterGrace, settings.SecondFactorGrace, NotStarted, Done, NotStarted},
		{"administrators", settings.FactorAdministrators, time.Hour, NotStarted, Done, NotStarted},
		{"members", settings.FactorMembers, time.Hour, Done, Done, Done},
		{"a rule not known", "", time.Hour, Attention, Attention, NotStarted},
	}
	for _, c := range cases {
		s := judge(t, "second_factor", func(f *Facts) { f.SecondFactorRule, f.InstanceCreated = c.rule, now.Add(-c.age) })
		if s.State != c.state || subOf(t, s, "rule_administrators") != c.admins || subOf(t, s, "rule_members") != c.everybody {
			t.Errorf("%s: %s %+v", c.name, s.State, s.Substeps)
		}
	}
	s := judge(t, "second_factor", func(f *Facts) { f.LocalWithoutFactor = 3 })
	if s.Count == nil || *s.Count.Value != 3 || s.Count.Unit != "accounts" {
		t.Fatalf("count %+v", s.Count)
	}
}

func TestTheLoginRules(t *testing.T) {
	wantState(t, judge(t, "login_rules", func(f *Facts) { f.ProxyNotTrusted = true }), Attention)
	wantState(t, judge(t, "login_rules", func(f *Facts) { f.IdleMinutes = 0 }), NotStarted)
}

func TestTheIdentityProviderIsAStepNotTakenAndDescribesTheNode(t *testing.T) {
	s := judge(t, "identity_provider", func(f *Facts) { f.ProviderSet = false })
	wantState(t, s, NotStarted)
	if !s.NodeFact {
		t.Fatal("the provider is the answering node's configuration")
	}
	wantState(t, judge(t, "identity_provider", func(f *Facts) { f.ProvisioningTokens = 0 }), NotStarted)
}

func TestTokensShowWhatTheyReachAndAskForThoseNotInUse(t *testing.T) {
	counts := TokenCounts{Active: 5, Administration: 2, Writing: 3, Assistant: 1, SpacesLimited: 1}
	s := judge(t, "tokens", func(f *Facts) { f.Tokens = counts })
	wantState(t, s, Done)
	want := map[string]int{"administration": 2, "writing": 3, "assistant": 1, "spaces_limited": 1, "unused": 0}
	if *s.Count.Value != 5 || !maps.Equal(s.Figures, want) {
		t.Fatalf("count %+v, figures %v", s.Count, s.Figures)
	}
	counts.Unused = 1
	s = judge(t, "tokens", func(f *Facts) { f.Tokens = counts })
	if s.State != NotStarted || subOf(t, s, "tokens_in_use") != NotStarted || subOf(t, s, "admin_tokens_in_use") != Done {
		t.Fatalf("a token nobody uses: %s %+v", s.State, s.Substeps)
	}
	counts.UnusedAdministration = 1
	if s := judge(t, "tokens", func(f *Facts) { f.Tokens = counts }); subOf(t, s, "admin_tokens_in_use") != NotStarted {
		t.Fatalf("a token of Administration nobody uses: %+v", s.Substeps)
	}
}

func TestGuestsWithoutAnEndDate(t *testing.T) {
	wantState(t, judge(t, "guests", func(f *Facts) {}), Done)
	s := judge(t, "guests", func(f *Facts) { f.Guests, f.GuestsWithoutEnd = 3, 1 })
	wantState(t, s, NotStarted)
	if *s.Count.Value != 1 {
		t.Fatalf("count %+v", s.Count)
	}
}

func TestPublicSharingIsDoneWhenClosedOrLookedAtLately(t *testing.T) {
	old := func(f *Facts) { f.ExportRulesSaved = now.Add(-SharingReviewWithin - time.Second) }
	s := judge(t, "public_sharing", old)
	wantState(t, s, NotStarted)
	if *s.Count.Value != 3 || s.Figures["sites"] != 1 || s.Figures["links"] != 2 {
		t.Fatalf("count %+v figures %v", s.Count, s.Figures)
	}
	wantState(t, judge(t, "public_sharing", func(f *Facts) { f.ExportRulesSaved = now.Add(-SharingReviewWithin) }), Done)
	wantState(t, judge(t, "public_sharing", func(f *Facts) { old(f); f.PublicSitesAllowed, f.PublicLinksAllowed = false, false }), Done)
	wantState(t, judge(t, "public_sharing", func(f *Facts) { old(f); f.PublicSitesAllowed = false }), NotStarted)
}

func TestHTTPS(t *testing.T) {
	wantState(t, judge(t, "https", func(f *Facts) { f.HTTPS, f.PlainToOthers = false, true }), Attention)
	wantState(t, judge(t, "https", func(f *Facts) { f.HTTPS = false }), NotStarted)
}

func TestTheDatabaseRoles(t *testing.T) {
	wantState(t, judge(t, "database_roles", func(f *Facts) { f.RoleOwnsTables = true }), Attention)
	wantState(t, judge(t, "database_roles", func(f *Facts) { f.RoleSuperuser = true }), Attention)
	s := judge(t, "database_roles", func(f *Facts) { f.OwnerAddressHere = true })
	wantState(t, s, NotStarted)
	if !s.NodeFact {
		t.Fatal("the owner's address is the answering node's configuration")
	}
}

func TestTheKeyRotation(t *testing.T) {
	wantState(t, judge(t, "key_rotation", func(f *Facts) { f.KeysLoaded = 2 }), NotStarted)
	s := judge(t, "key_rotation", func(f *Facts) { f.KeyPromoted = now.Add(-KeyAgeWithin - time.Second) })
	if s.State != NotStarted || subOf(t, s, "key_recent") != NotStarted || *s.Count.Value != 365 {
		t.Fatalf("a key older than a year: %s %+v %+v", s.State, s.Substeps, s.Count)
	}
	wantState(t, judge(t, "key_rotation", func(f *Facts) { f.KeyPromoted = now.Add(-KeyAgeWithin) }), Done)
	// Never replaced: the first key is as old as the installation.
	s = judge(t, "key_rotation", func(f *Facts) { f.KeyPromoted, f.InstanceCreated = time.Time{}, now.Add(-10*24*time.Hour) })
	if s.State != Done || *s.Count.Value != 10 {
		t.Fatalf("the first key of a young installation: %s %+v", s.State, s.Count)
	}
}

func TestBackupsAreEncrypted(t *testing.T) {
	wantState(t, judge(t, "backups_encrypted", func(f *Facts) { f.BackupServiceSeen, f.BackupKeyPresent = false, false }), NotStarted)
	wantState(t, judge(t, "backups_encrypted", func(f *Facts) { f.BackupKeyPresent = false }), Attention)
}

func TestABackupFollowsTheAgeOfSystemHealth(t *testing.T) {
	limit := health.BackupDueWithin(24 * time.Hour)
	wantState(t, judge(t, "backup_recent", func(f *Facts) { f.LastBackup = time.Time{} }), Attention)
	wantState(t, judge(t, "backup_recent", func(f *Facts) { f.LastBackup = now.Add(-limit) }), Done)
	wantState(t, judge(t, "backup_recent", func(f *Facts) { f.LastBackup = now.Add(-limit - time.Second) }), Attention)
	wantState(t, judge(t, "backup_recent", func(f *Facts) { f.BackupFailed = true }), Attention)
	if s := judge(t, "backup_recent", func(f *Facts) { f.LastBackup = now.Add(-5 * time.Hour) }); *s.Count.Value != 5 {
		t.Fatalf("hours since the last backup: %+v", s.Count)
	}
}

func TestARestoreCheck(t *testing.T) {
	wantState(t, judge(t, "restore_tested", func(f *Facts) { f.RestoreCheckAt = time.Time{} }), NotStarted)
	wantState(t, judge(t, "restore_tested", func(f *Facts) { f.RestoreCheckOK = false }), Attention)
	wantState(t, judge(t, "restore_tested", func(f *Facts) { f.RestoreCheckAt = now.Add(-RestoreCheckWithin) }), Done)
	wantState(t, judge(t, "restore_tested", func(f *Facts) { f.RestoreCheckAt = now.Add(-RestoreCheckWithin - time.Second) }), Attention)
}

func TestTheDailyCheckOfTheAuditChain(t *testing.T) {
	wantState(t, judge(t, "audit_checked", func(f *Facts) { f.AuditCheckAt = time.Time{} }), NotStarted)
	wantState(t, judge(t, "audit_checked", func(f *Facts) { f.AuditCheckOK = false }), Attention)
	wantState(t, judge(t, "audit_checked", func(f *Facts) { f.AuditCheckAt = now.Add(-AuditCheckWithin) }), Done)
	wantState(t, judge(t, "audit_checked", func(f *Facts) { f.AuditCheckAt = now.Add(-AuditCheckWithin - time.Second) }), Attention)
}

func TestTheWitnessReport(t *testing.T) {
	wantState(t, judge(t, "witness_outside", func(f *Facts) { f.WitnessAt = time.Time{} }), NotStarted)
	wantState(t, judge(t, "witness_outside", func(f *Facts) { f.WitnessOK = false }), Attention)
	wantState(t, judge(t, "witness_outside", func(f *Facts) { f.WitnessAt = now.Add(-WitnessWithin) }), Done)
	wantState(t, judge(t, "witness_outside", func(f *Facts) { f.WitnessAt = now.Add(-WitnessWithin - time.Second) }), Attention)
}

// Every id the server sends has its words in the browser, and every link names a section of
// the administration's registry (D15), so a renamed section cannot leave a step pointing nowhere.
func TestEveryStepHasItsWordsAndLinksToASectionThatExists(t *testing.T) {
	words, sections := overviewWords(t), registrySections(t)
	has := func(key string) {
		if words[key] == "" {
			t.Errorf("en.json has no securityOverview.%s", key)
		}
	}
	for _, g := range Evaluate(safe()).Groups {
		has("group_" + g.ID)
		for _, s := range g.Steps {
			if !sections[s.Link.Section] {
				t.Errorf("step %s links to %q, which is no section of admin-sections.ts", s.ID, s.Link.Section)
			}
			for _, key := range wordsOf(s) {
				has(key)
			}
		}
	}
	if !sections["security-overview"] {
		t.Error("the overview itself is no section of admin-sections.ts")
	}
}

// wordsOf lists the keys of en.json a step needs.
func wordsOf(s Step) []string {
	keys := []string{"step_" + s.ID, "why_" + s.ID}
	for _, x := range s.Substeps {
		keys = append(keys, "sub_"+x.ID)
	}
	if s.Count != nil {
		keys = append(keys, "unit_"+s.Count.Unit+"_one", "unit_"+s.Count.Unit+"_other")
	}
	for name := range s.Figures {
		keys = append(keys, "figure_"+name+"_one", "figure_"+name+"_other")
	}
	return keys
}

// overviewWords reads the words of the overview from the browser's translation file.
func overviewWords(t *testing.T) map[string]string {
	t.Helper()
	raw, err := os.ReadFile("../../web/src/locales/en.json")
	if err != nil {
		t.Fatal(err)
	}
	var words struct {
		SecurityOverview map[string]string `json:"securityOverview"`
	}
	if err := json.Unmarshal(raw, &words); err != nil {
		t.Fatal(err)
	}
	return words.SecurityOverview
}

// registrySections reads the ids of the administration's sections from the browser's registry.
func registrySections(t *testing.T) map[string]bool {
	t.Helper()
	registry, err := os.ReadFile("../../web/src/views/admin-sections.ts")
	if err != nil {
		t.Fatal(err)
	}
	sections := map[string]bool{}
	for _, m := range regexp.MustCompile(`id: '([a-z-]+)'`).FindAllStringSubmatch(string(registry), -1) {
		sections[m[1]] = true
	}
	return sections
}
