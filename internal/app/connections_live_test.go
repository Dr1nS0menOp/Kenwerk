// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// A change of a connection is used without a restart, and what the administration sets
// reaches only addresses outgoing calls may reach (spec 101).

// loginButton is the name of the identity provider's button on the login page, or empty.
func loginButton(t *testing.T, e *env) string {
	t.Helper()
	resp, body := e.do(e.client(), "GET", "/api/v1/auth/providers", "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("providers: %d %s", resp.StatusCode, body)
	}
	if !strings.Contains(body, `"oidc"`) {
		return ""
	}
	return strings.Split(strings.Split(body, `"oidc":{"name":"`)[1], `"`)[0]
}

// metricsStatus is how /metrics answers a scraper that sends the stored token.
func metricsStatus(e *env) int {
	e.t.Helper()
	resp, _ := e.do(e.client(), "GET", "/metrics", "", "Authorization", "Bearer "+metricsSecret)
	return resp.StatusCode
}

func TestAChangedIdentityProviderIsUsedWithoutARestart(t *testing.T) {
	e, cfg := privateEnv(t)
	other := otherNode(t, cfg)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	p := newIDP(t)
	if loginButton(t, e) != "" {
		t.Fatal("a login button without a provider")
	}
	change := providerChange(p.srv.URL, secretSet("secret"), recovery[0])
	root.ok("PUT", providerRoute, change)
	if loginButton(t, e) != "Company login" {
		t.Fatal("the node that saved shows no button at once")
	}
	if other.Connections().InForce().OIDC.Issuer != "" {
		t.Fatal("the other node knew before it read again")
	}
	reread(t, other)
	if other.Connections().InForce().OIDC.ClientSecret != "secret" {
		t.Fatal("the other node does not use the provider after reading again")
	}
	where := e.oidcLogin(p, noRedirect(), map[string]any{"sub": "anna", "email": "anna@example.com", "email_verified": true,
		"name": "Anna"})
	if strings.Contains(where, "error") {
		t.Fatalf("a login through the stored provider ended at %s", where)
	}
	root.ok("PUT", providerRoute, providerChange("", secretRemove(), recovery[1]))
	if loginButton(t, e) != "" {
		t.Fatal("the button stays after the provider was removed")
	}
}

func TestChangedHelpersAndTheTokenAreUsedWithoutARestart(t *testing.T) {
	e, cfg := privateEnv(t)
	other := otherNode(t, cfg)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	if status := metricsStatus(e); status != http.StatusNotFound {
		t.Fatalf("/metrics without a token: %d", status)
	}
	root.ok("PUT", metricsRoute, metricsChange(secretSet(metricsSecret), recovery[0]))
	root.ok("PUT", drawingRoute, addressChange("https://draw.example.com", recovery[1]))
	root.ok("PUT", pdfRoute, pdfChange("http://127.0.0.1:3000", secretKeep(), recovery[2]))
	if status := metricsStatus(e); status != http.StatusOK {
		t.Fatalf("/metrics with the stored token: %d", status)
	}
	resp, _ := e.do(e.client(), "GET", "/", "")
	if !strings.Contains(resp.Header.Get("Content-Security-Policy"), "https://draw.example.com") ||
		root.ok("GET", "/api/v1/me", nil)["drawing_origin"] != "https://draw.example.com" {
		t.Fatal("the stored drawing service is not framed")
	}
	reread(t, other)
	if !other.Exchange().PDFAvailable() || other.Connections().InForce().MetricsToken != metricsSecret {
		t.Fatal("the other node does not use the helpers and the token after reading again")
	}
	root.ok("PUT", metricsRoute, metricsChange(secretRemove(), recovery[3]))
	if status := metricsStatus(e); status != http.StatusNotFound {
		t.Fatalf("/metrics after the token was removed: %d", status)
	}
}

// A name can resolve to an inside address after it was saved; the connection is refused then
// (D4). The row is written straight into the table, as such a name would leave it.
func TestAStoredHelperReachesOnlyAllowedAddresses(t *testing.T) {
	e := newEnv(t)
	var asked atomic.Int32
	helper := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { asked.Add(1) }))
	t.Cleanup(helper.Close)
	e.sql("INSERT INTO connections (id, pdf_url, collabora_url) VALUES (true, $1, $1)", helper.URL)
	if err := e.app.ApplyRuntime(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	for _, check := range e.app.Exchange().CheckHelpers(context.Background()) {
		if check.OK {
			t.Fatalf("a stored helper on this machine answered: %+v", check)
		}
	}
	err := e.app.Exchange().OfficeToPDF(context.Background(), "a.docx", strings.NewReader("x"), func(io.Reader) error { return nil })
	if err == nil || asked.Load() != 0 {
		t.Fatalf("a stored helper on this machine was reached: %v, %d calls", err, asked.Load())
	}
}

// A stored identity provider on this machine is not reached without the switch of outgoing
// calls: the login does not start, and the provider is never asked.
func TestAStoredProviderReachesOnlyAllowedAddresses(t *testing.T) {
	e := newEnv(t)
	p := newIDP(t)
	e.sql("INSERT INTO connections (id, oidc_issuer, oidc_client_id) VALUES (true, $1, 'client')", p.srv.URL)
	if err := e.app.ApplyRuntime(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	resp, _ := e.do(noRedirect(), "GET", "/api/v1/auth/oidc/start", "")
	if where := resp.Header.Get("Location"); !strings.Contains(where, "oidc_unavailable") {
		t.Fatalf("a login through a provider on this machine started: %d %s", resp.StatusCode, where)
	}
}
