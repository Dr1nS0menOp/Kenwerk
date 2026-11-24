// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/features"
	"github.com/kenwerk/kenwerk/internal/hardening"
	"github.com/kenwerk/kenwerk/internal/identity"
)

const securityOverviewRoute = "/api/v1/admin/security-overview"

// The load budget of spec 088: a cold read costs at least this many statements more than a
// warm one, and a warm read costs the session, the route's rule, the part's switch and the
// module's own check of administration.
const (
	coldReadAtLeast = 10
	warmReadBudget  = 6
)

func overviewOf(t *testing.T, u *user) hardening.Overview {
	t.Helper()
	var o hardening.Overview
	if err := json.Unmarshal([]byte(u.want(http.StatusOK, "GET", securityOverviewRoute, nil)), &o); err != nil {
		t.Fatal(err)
	}
	return o
}

func overviewStep(t *testing.T, o hardening.Overview, id string) hardening.Step {
	t.Helper()
	for _, g := range o.Groups {
		for _, s := range g.Steps {
			if s.ID == id {
				return s
			}
		}
	}
	t.Fatalf("the overview has no step %s", id)
	return hardening.Step{}
}

// queriesOnce counts the statements of one request.
func queriesOnce(t *testing.T, e *env, u *user, path string) int64 {
	t.Helper()
	before := db.Queries(e.app.Pool())
	if status, out := u.do("GET", path, nil); status >= 500 {
		t.Fatalf("%s: %d %s", path, status, out)
	}
	return db.Queries(e.app.Pool()) - before
}

// ADM-067, D1: a new installation and an upgraded one have the overview off. The route says
// so, the summary has no item for it, and the browser is told it is off.
func TestTheSecurityOverviewIsOffOnANewInstallation(t *testing.T) {
	e := newInstalledEnv(t, func(*config.Config) {})
	root := admin(e)
	if out := root.want(http.StatusNotFound, "GET", securityOverviewRoute, nil); !strings.Contains(out, "experimental_off") {
		t.Fatalf("the overview while it is off: %s", out)
	}
	if out := root.want(http.StatusOK, "GET", "/api/v1/admin/attention", nil); strings.Contains(out, "security_steps") {
		t.Fatalf("the summary counts steps of a part that is off: %s", out)
	}
	if on := root.ok("GET", "/api/v1/system/capabilities", nil)["security_overview"]; on != false {
		t.Fatalf("the browser is told the part is %v", on)
	}
}

// While the part is off nothing of the overview is read, not even for the summary: the first
// read after turning it on is a full one.
func TestNothingOfTheOverviewIsReadWhileItIsOff(t *testing.T) {
	e := newInstalledEnv(t, func(*config.Config) {})
	root := admin(e)
	root.want(http.StatusOK, "GET", "/api/v1/admin/attention", nil)
	root.want(http.StatusNotFound, "GET", securityOverviewRoute, nil)
	setParts(root, []string{features.ExperimentalSecurityOverview})
	cold := queriesOnce(t, e, root, securityOverviewRoute)
	warm := queriesOnce(t, e, root, securityOverviewRoute)
	if cold-warm < coldReadAtLeast {
		t.Fatalf("the first read after turning the part on cost %d statements and the next %d: it was read while off", cold, warm)
	}
}

// The load budget: one read of the facts per half minute and node, and a warm read costs only
// what every read of Administration costs.
func TestTheSecurityOverviewIsKeptForHalfAMinute(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	cold := queriesOnce(t, e, root, securityOverviewRoute)
	warm := queriesOnce(t, e, root, securityOverviewRoute)
	t.Logf("a cold read costs %d statements, a warm one %d", cold, warm)
	if cold-warm < coldReadAtLeast || warm > warmReadBudget {
		t.Fatalf("a cold read cost %d statements and a warm one %d, over the budget of %d", cold, warm, warmReadBudget)
	}
}

// Only an administrator reads the overview: through a session, through a token with admin:read,
// and nobody else, not even by calling the module directly.
func TestOnlyAnAdministratorSeesTheSecurityOverview(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	member := e.user("member@example.com", identity.PermUseProduct)
	guest := e.userOfType("guest@example.com", identity.TypeGuest, identity.PermUseProduct)
	member.want(http.StatusForbidden, "GET", securityOverviewRoute, nil)
	guest.want(http.StatusForbidden, "GET", securityOverviewRoute, nil)
	if resp, _ := e.do(http.DefaultClient, "GET", securityOverviewRoute, ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("without a login: %d", resp.StatusCode)
	}
	readToken := member.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "t", "scopes": []string{"read"}})["secret"].(string)
	if status, out := e.bearer("GET", securityOverviewRoute, readToken, ""); status != http.StatusForbidden {
		t.Fatalf("a member's token: %d %s", status, out)
	}
	if status, out := e.bearer("GET", securityOverviewRoute, adminToken(root), ""); status != http.StatusOK {
		t.Fatalf("an administrator's token with admin:read: %d %s", status, out)
	}
	plain := e.user("plain-admin@example.com", identity.PermUseProduct, identity.PermAdministrator)
	if got, want := overviewOf(t, plain).Attention, overviewOf(t, root).Attention; got != want {
		t.Fatalf("an administrator sees %d steps that need attention, a system administrator %d", got, want)
	}
	_, err := e.app.SecurityOverview(context.Background(), identity.Caller{UserID: uuid.MustParse(member.id)})
	var refused *apperr.Error
	if !errors.As(err, &refused) || refused.Kind != apperr.KindForbidden {
		t.Fatalf("the module answered a member: %v", err)
	}
}

// The overview shows counts and states, never a name, an address, an id or a token (SEC-601).
func TestTheSecurityOverviewNamesNobody(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	people := []*user{root, e.user("quintijn.zwartvlies@example.com", identity.PermUseProduct, identity.PermAdministrator),
		e.userOfType("ottoline.vreemdeling@example.org", identity.TypeGuest, identity.PermUseProduct)}
	secret := adminToken(root)
	out := root.want(http.StatusOK, "GET", securityOverviewRoute, nil)
	for _, p := range people {
		for _, trace := range []string{p.email, p.id, "Test " + p.email} {
			if strings.Contains(out, trace) {
				t.Errorf("the overview names %q", trace)
			}
		}
	}
	if strings.Contains(out, secret) || strings.Contains(out, "kenwerk_") {
		t.Fatalf("the overview holds a token: %s", out)
	}
}

// Each change of the installation moves its step: a second administrator, a guest and the
// end of the guest's account, a token, and the rules for logging in.
func TestTheSecurityOverviewFollowsTheInstallation(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	fresh := func() hardening.Overview {
		t.Helper()
		o, err := e.app.ReadFreshSecurityOverview(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		return o
	}
	if s := overviewStep(t, fresh(), "two_administrators"); s.State != hardening.NotStarted {
		t.Fatalf("one administrator: %+v", s)
	}
	e.user("second-admin@example.com", identity.PermUseProduct, identity.PermAdministrator)
	guest := e.userOfType("guest@example.com", identity.TypeGuest, identity.PermUseProduct)
	adminToken(root)
	o := fresh()
	if s := overviewStep(t, o, "two_administrators"); s.State != hardening.Done || *s.Count.Value != 2 {
		t.Fatalf("two administrators: %+v", s)
	}
	if s := overviewStep(t, o, "guests"); s.State != hardening.NotStarted || *s.Count.Value != 1 {
		t.Fatalf("a guest without an end date: %+v", s)
	}
	if s := overviewStep(t, o, "tokens"); *s.Count.Value != 1 || s.Figures["administration"] != 1 {
		t.Fatalf("a token that reaches Administration: %+v", s)
	}
	root.want(http.StatusNoContent, "PUT", "/api/v1/admin/users/"+guest.id+"/expiry",
		map[string]any{"expires_at": time.Now().Add(30 * 24 * time.Hour)})
	followsTheLoginRules(t, root, fresh)
	if s := overviewStep(t, fresh(), "guests"); s.State != hardening.Done {
		t.Fatalf("every guest has an end date: %+v", s)
	}
}

// followsTheLoginRules asks every member for a second factor and sets an idle time.
func followsTheLoginRules(t *testing.T, root *user, fresh func() hardening.Overview) {
	t.Helper()
	root.ok("PUT", "/api/v1/admin/settings/access", map[string]any{"second_factor": "members", "idle_minutes": 60,
		"signup_domains": []string{}, "guest_invites": true})
	o := fresh()
	if s := overviewStep(t, o, "second_factor"); s.State != hardening.Done {
		t.Fatalf("a second factor for every member: %+v", s)
	}
	for _, x := range overviewStep(t, o, "login_rules").Substeps {
		if x.ID == "idle_limit" && x.State != hardening.Done {
			t.Fatalf("sessions that end when idle: %+v", x)
		}
	}
}

// ADM-127, D5: while the part is on, the summary counts the steps that need attention, as one
// item; with the part off the item is gone.
func TestTheSummaryCountsTheStepsThatNeedAttention(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	o := overviewOf(t, root)
	if o.Attention == 0 {
		t.Fatal("a test installation has an administrator without a passkey, which needs attention")
	}
	want := fmt.Sprintf(`"kind":"security_steps","count":%d`, o.Attention)
	if out := root.want(http.StatusOK, "GET", "/api/v1/admin/attention", nil); !strings.Contains(out, want) {
		t.Fatalf("the summary does not count the steps: %s", out)
	}
	setParts(root, partsBut(features.ExperimentalSecurityOverview))
	if out := root.want(http.StatusOK, "GET", "/api/v1/admin/attention", nil); strings.Contains(out, "security_steps") {
		t.Fatalf("the summary counts steps of a part that is off: %s", out)
	}
}
