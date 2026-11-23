// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/connections"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/settings"
)

// The connections and the name, set in the administration (spec 101). Refusals first: who may
// not, what no read and no log shows, what is refused, what the environment locks; then what a
// change stores.

const (
	connectionsRoute = "/api/v1/admin/connections"
	providerRoute    = connectionsRoute + "/identity-provider"
	pdfRoute         = connectionsRoute + "/pdf"
	officeRoute      = connectionsRoute + "/office"
	drawingRoute     = connectionsRoute + "/drawing"
	metricsRoute     = connectionsRoute + "/metrics"
	clientSecret     = "a-Client-secret-only-the-provider-knows"
	pdfPassword      = "a-Password-only-the-pdf-helper-knows"
	metricsSecret    = "aMetricsTokenOfMoreThanThirtyTwoCharacters0123"
)

var connectionParts = []string{connections.PartIdentityProvider, connections.PartPDF, connections.PartOffice,
	connections.PartDrawing, connections.PartMetrics}

func secretSet(value string) map[string]any { return map[string]any{"action": "set", "value": value} }

func secretKeep() map[string]any { return map[string]any{"action": "keep"} }

func secretRemove() map[string]any { return map[string]any{"action": "remove"} }

func providerChange(issuer string, secret map[string]any, code string) map[string]any {
	return map[string]any{"issuer": issuer, "client_id": "client", "client_secret": secret, "display_name": "Company login",
		"auto_create": true, "allow_unverified_email": false, "groups_claim": "", "code": code}
}

func pdfChange(address string, password map[string]any, code string) map[string]any {
	return map[string]any{"url": address, "password": password, "code": code}
}

func addressChange(address, code string) map[string]any {
	return map[string]any{"url": address, "code": code}
}

func metricsChange(token map[string]any, code string) map[string]any {
	return map[string]any{"token": token, "code": code}
}

// everyChange is one change for each change route, each with a secret where the part has one.
func everyChange(code string) map[string]map[string]any {
	return map[string]map[string]any{
		providerRoute: providerChange("https://auth.example.com", secretSet(clientSecret), code),
		pdfRoute:      pdfChange("https://pdf.example.com", secretSet(pdfPassword), code),
		officeRoute:   addressChange("https://office.example.com", code),
		drawingRoute:  addressChange("https://draw.example.com", code),
		metricsRoute:  metricsChange(secretSet(metricsSecret), code),
	}
}

// partOf is one part of the read of the connections.
func partOf(t *testing.T, u *user, part string) map[string]any {
	t.Helper()
	return u.ok("GET", connectionsRoute, nil)[part].(map[string]any)
}

// assertNoConnectionStored fails when a change was stored or audited.
func assertNoConnectionStored(t *testing.T, e *env, u *user) {
	t.Helper()
	for _, part := range connectionParts {
		if got := partOf(t, u, part); got["source"] != connections.SourceNone {
			t.Fatalf("a refused change of %s was stored: %v", part, got)
		}
	}
	if e.auditActions(connections.ActionChanged) != 0 || e.app.Connections().InForce() != (connections.Values{}) {
		t.Fatal("a refused change left an audit event or a connection in force")
	}
}

func TestNobodyButASystemAdministratorChangesAConnection(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	clerk := e.user("clerk@example.com", identity.PermUseProduct, identity.PermAdministrator)
	member := e.user("member@example.com", identity.PermUseProduct)
	_, recovery := root.enrolTOTP()
	_, clerkRecovery := clerk.enrolTOTP()
	member.want(http.StatusForbidden, "GET", connectionsRoute, nil)
	token := adminToken(root)
	for route, change := range everyChange(recovery[0]) {
		member.want(http.StatusForbidden, "PUT", route, change)
		clerk.want(http.StatusForbidden, "PUT", route, map[string]any{"code": clerkRecovery[0]})
		body, _ := json.Marshal(change)
		if status, out := e.bearer("PUT", route, token, string(body)); status != http.StatusForbidden || !strings.Contains(out, "session_only") {
			t.Fatalf("a token changed %s: %d %s", route, status, out)
		}
	}
	assertNoConnectionStored(t, e, clerk)
}

func TestAConnectionChangesOnlyWithAFreshLoginAndASecondFactor(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	clerk := e.user("clerk@example.com", identity.PermUseProduct, identity.PermAdministrator)
	_, recovery := root.enrolTOTP()
	change := pdfChange("https://pdf.example.com", secretSet(pdfPassword), "")
	mailRefusal(t, root, http.StatusForbidden, "PUT", pdfRoute, change, "second_factor_required")
	e.sql("UPDATE sessions SET created_at = now() - interval '11 minutes', reauth_at = NULL WHERE user_id = $1", root.id)
	change["code"] = recovery[0]
	mailRefusal(t, root, http.StatusForbidden, "PUT", pdfRoute, change, "reauth_required")
	assertNoConnectionStored(t, e, clerk)

	root.ok("POST", "/api/v1/auth/reauth", map[string]any{"password": adminPassword})
	pdf := root.ok("PUT", pdfRoute, change)["pdf"].(map[string]any)
	if pdf["source"] != connections.SourceDatabase || pdf["password_set"] != true || pdf["url"] != "https://pdf.example.com" {
		t.Fatalf("a confirmed change: %v", pdf)
	}
	if e.auditActions(connections.ActionChanged) != 1 || e.outboxCount(connections.ActionChanged) != 1 {
		t.Fatal("a confirmed change left no audit and outbox event")
	}
	if !e.app.Exchange().PDFAvailable() || partOf(t, clerk, connections.PartPDF)["url"] != "https://pdf.example.com" {
		t.Fatal("the change is not in force, or an administrator does not read it")
	}
}

// storeEveryConnection saves every part, each with a code of its own.
func storeEveryConnection(t *testing.T, root *user, recovery []string) {
	t.Helper()
	i := 0
	for route, change := range everyChange("") {
		change["code"] = recovery[i]
		i++
		root.ok("PUT", route, change)
	}
}

// assertHoldsNoSecret fails when text holds a secret of the connections or one of the sealed
// forms in the table.
func assertHoldsNoSecret(t *testing.T, e *env, what, text string) {
	t.Helper()
	var sealed [3][]byte
	// Written as three subqueries, so an installation without the row reads three nulls.
	if err := e.app.Pool().QueryRow(context.Background(), `SELECT (SELECT oidc_client_secret_sealed FROM connections),
		(SELECT pdf_password_sealed FROM connections), (SELECT metrics_token_sealed FROM connections)`).
		Scan(&sealed[0], &sealed[1], &sealed[2]); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{clientSecret, pdfPassword, metricsSecret, base64.StdEncoding.EncodeToString(sealed[0]),
		base64.StdEncoding.EncodeToString(sealed[1]), base64.StdEncoding.EncodeToString(sealed[2])} {
		if secret != "" && strings.Contains(text, secret) {
			t.Fatalf("%s holds a secret: %s", what, text)
		}
	}
}

func TestNoReadNoAuditAndNoLogOfTheConnectionsHoldsASecret(t *testing.T) {
	logs := &lockedBuffer{}
	e := newEnvLogging(t, func(*config.Config) {}, slog.New(slog.NewJSONHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	root := admin(e)
	_, recovery := root.enrolTOTP()
	storeEveryConnection(t, root, recovery)
	token := root.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "reader",
		"scopes": []string{identity.ScopeRead, identity.ScopeAdmin}})["secret"].(string)
	status, byToken := e.bearer("GET", connectionsRoute, token, "")
	if status != http.StatusOK {
		t.Fatalf("a token with the admin scope reads the connections: %d %s", status, byToken)
	}
	_, bySession := root.do("GET", connectionsRoute, nil)
	evs, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{Action: connections.ActionChanged, Limit: 10})
	if err != nil || len(evs) != len(connectionParts) {
		t.Fatalf("one audit event per part: %d %v", len(evs), err)
	}
	rows, _ := json.Marshal(evs)
	for what, text := range map[string]string{"the read through a token": byToken, "the read through a session": bySession,
		"the audit": string(rows), "the log": logs.String()} {
		assertHoldsNoSecret(t, e, what, text)
	}
	for _, mark := range []string{`"client_secret_set":true`, `"password_set":true`, `"token_set":true`} {
		if !strings.Contains(bySession, mark) {
			t.Fatalf("the read lacks %s: %s", mark, bySession)
		}
	}
}

func TestAnInvalidAddressIsRefused(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	clerk := e.user("clerk@example.com", identity.PermUseProduct, identity.PermAdministrator)
	_, recovery := root.enrolTOTP()
	refused := []struct {
		route  string
		change map[string]any
	}{
		{providerRoute, providerChange("auth.example.com", secretSet(clientSecret), "")},
		{providerRoute, providerChange("https://auth.example.com/?tenant=1", secretSet(clientSecret), "")},
		{providerRoute, providerChange("http://auth.example.com", secretSet(clientSecret), "")},
		{providerRoute, providerChange("https://127.0.0.1/realm", secretSet(clientSecret), "")},
		{providerRoute, providerChange("https://auth.example.com", secretKeep(), "")},
		{pdfRoute, pdfChange("https://localhost:3000", secretKeep(), "")},
		{officeRoute, addressChange("https://user:pw@office.example.com", "")},
		{drawingRoute, addressChange("https://draw.example.com/path", "")},
		{metricsRoute, metricsChange(secretSet("too-short"), "")},
	}
	for i, r := range refused {
		r.change["code"] = recovery[i%len(recovery)]
		if out := root.want(http.StatusBadRequest, "PUT", r.route, r.change); !strings.Contains(out, "invalid") {
			t.Fatalf("%s %v: %s", r.route, r.change, out)
		}
	}
	assertNoConnectionStored(t, e, clerk)
}

// The environment's settings that lock the identity provider and the PDF helper.
func lockedEnv(t *testing.T) *env {
	return newEnvWith(t, func(c *config.Config) {
		c.OIDC = config.OIDC{Issuer: "https://auth.example.com", ClientID: "client", ClientSecret: clientSecret,
			DisplayName: "Company login"}
		c.PDFURL, c.PDFPassword = "http://pdf:3000", pdfPassword
	})
}

func TestTheEnvironmentLocksItsConnections(t *testing.T) {
	e := lockedEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	_, out := root.do("GET", connectionsRoute, nil)
	locked := func(setting string) connections.Origin {
		return connections.Origin{Source: connections.SourceEnvironment, Locked: &settings.Lock{Setting: setting, Source: "environment"}}
	}
	none := connections.Origin{Source: connections.SourceNone}
	want := connections.View{
		IdentityProvider: connections.IdentityProviderView{Origin: locked("KENWERK_OIDC_ISSUER"), IdentityProvider: connections.IdentityProvider{
			Issuer: "https://auth.example.com", ClientID: "client", ClientSecretSet: true, DisplayName: "Company login"}},
		PDF:    connections.PDFView{Origin: locked("KENWERK_PDF_URL"), PDFHelper: connections.PDFHelper{URL: "http://pdf:3000", PasswordSet: true}},
		Office: connections.AddressView{Origin: none}, Drawing: connections.AddressView{Origin: none},
		Metrics: connections.MetricsView{Origin: none},
	}
	if wanted, _ := json.Marshal(want); string(wanted) != strings.TrimSpace(out) {
		t.Fatalf("the environment's connections:\n got %s\nwant %s", out, wanted)
	}
	assertHoldsNoSecret(t, e, "the environment's connections", out)
	mailRefusal(t, root, http.StatusConflict, "PUT", providerRoute,
		providerChange("https://other.example.com", secretSet("x"), recovery[0]), "connection_locked")
	mailRefusal(t, root, http.StatusConflict, "PUT", pdfRoute, pdfChange("", secretRemove(), recovery[0]), "connection_locked")
	if e.auditActions(connections.ActionChanged) != 0 || e.app.Connections().InForce().PDFURL != "http://pdf:3000" {
		t.Fatal("a locked change was stored")
	}
	// The code was not spent on the changes that could not be made, and an open part changes.
	root.ok("PUT", officeRoute, addressChange("https://office.example.com", recovery[0]))
}

func TestTheEnvironmentLocksTheName(t *testing.T) {
	t.Setenv("KENWERK_INSTANCE_NAME", "Acme wiki")
	e := newEnvWith(t, func(c *config.Config) { c.InstanceName = "Acme wiki" })
	root := admin(e)
	name := root.ok("GET", "/api/v1/admin/instance-name", nil)
	if name["name"] != "Acme wiki" || name["source"] != "environment" || name["locked"] == nil {
		t.Fatalf("the locked name: %v", name)
	}
	mailRefusal(t, root, http.StatusConflict, "PUT", "/api/v1/admin/settings/look",
		map[string]any{"instance_name": "Other wiki"}, "instance_name_locked")
	root.ok("PUT", "/api/v1/admin/settings/look", map[string]any{"instance_name": "Acme wiki", "organisation_name": "Acme"})
	if got := root.ok("GET", "/api/v1/admin/settings/look", nil); got["instance_name"] != "Acme wiki" || got["organisation_name"] != "Acme" {
		t.Fatalf("the rest of Look saves while the name is locked: %v", got)
	}
}

func TestTheNameOfLookIsTheNameInForce(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	if got := root.ok("GET", "/api/v1/admin/instance-name", nil); got["source"] != "default" || got["locked"] != nil {
		t.Fatalf("without a name in Look: %v", got)
	}
	root.ok("PUT", "/api/v1/admin/settings/look", map[string]any{"instance_name": "Acme wiki"})
	if got := root.ok("GET", "/api/v1/system/info", nil); got["name"] != "Acme wiki" {
		t.Fatalf("the name of Look is not in force: %v", got)
	}
	if got := root.ok("GET", "/api/v1/admin/instance-name", nil); got["source"] != "look" {
		t.Fatalf("the source of the name: %v", got)
	}
}

// sealedPDFPassword is the PDF password as the table keeps it.
func sealedPDFPassword(t *testing.T, e *env) []byte {
	t.Helper()
	var sealed []byte
	if err := e.app.Pool().QueryRow(context.Background(), "SELECT pdf_password_sealed FROM connections").Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	return sealed
}

// lastConnectionChange is how the newest change of a connection records field.
func lastConnectionChange(t *testing.T, e *env, field string) string {
	t.Helper()
	changes := auditOf(t, e, connections.ActionChanged)["changes"].(map[string]any)
	if change, listed := changes[field]; listed {
		return fmt.Sprint(change)
	}
	return "unchanged"
}

func TestSecretsAreSealedAndAuditedWithoutTheirValues(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	root.ok("PUT", pdfRoute, pdfChange("https://pdf.example.com", secretSet(pdfPassword), recovery[0]))
	first := sealedPDFPassword(t, e)
	if len(first) == 0 || strings.Contains(string(first), pdfPassword) {
		t.Fatal("the password is not sealed")
	}
	assertConnectionChange(t, e, "password", redacted)
	assertConnectionChange(t, e, "url", "map[after:https://pdf.example.com before:]")
	root.ok("PUT", pdfRoute, pdfChange("https://pdf2.example.com", secretKeep(), recovery[1]))
	assertConnectionChange(t, e, "password", "unchanged")
	if string(sealedPDFPassword(t, e)) != string(first) || e.app.Connections().InForce().PDFPassword != pdfPassword {
		t.Fatal("keeping the password sealed it again, or left it out of force")
	}
	root.ok("PUT", pdfRoute, pdfChange("https://pdf2.example.com", secretRemove(), recovery[2]))
	assertConnectionChange(t, e, "password", redacted)
	if sealedPDFPassword(t, e) != nil || partOf(t, root, connections.PartPDF)["password_set"] != false ||
		auditOf(t, e, connections.ActionChanged)["part"] != connections.PartPDF {
		t.Fatal("a removed password stayed, or its removal is not audited as a change of the PDF helper")
	}
}

// redacted is how the audit records a secret that changed.
const redacted = "map[redacted:true]"

// assertConnectionChange fails unless the newest change of a connection records field as want.
func assertConnectionChange(t *testing.T, e *env, field, want string) {
	t.Helper()
	if got := lastConnectionChange(t, e, field); got != want {
		t.Fatalf("%s: recorded %s, want %s", field, got, want)
	}
}
