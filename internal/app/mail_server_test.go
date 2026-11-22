// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kenwerk/kenwerk/internal/app"
	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/mail"
)

// The mail server, set in the administration (spec 098). Refusals first: who may not, what no
// read shows, what the environment locks; then what a change does.

const (
	mailPassword    = "a-Password-only-the-mail-server-knows"
	mailServerRoute = "/api/v1/admin/mail/server"
	mailTestRoute   = "/api/v1/admin/mail/test"
)

// relay is a small SMTP server on this machine that keeps who each mail went to.
type relay struct {
	ln     net.Listener
	refuse string // an answer to RCPT TO, such as "550 5.7.1 Relaying denied"; empty takes the mail
	mu     sync.Mutex
	to     []string
}

func startRelay(t *testing.T, refuse string) *relay {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	r := &relay{ln: ln, refuse: refuse}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go r.serve(conn)
		}
	}()
	return r
}

func (r *relay) port() int { return r.ln.Addr().(*net.TCPAddr).Port }

func (r *relay) serve(conn net.Conn) {
	defer func() { _ = conn.Close() }()
	reader := bufio.NewReader(conn)
	say := func(line string) { fmt.Fprintf(conn, "%s\r\n", line) }
	say("220 relay")
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		command := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(command, "RCPT TO:"):
			say(r.recipient(line))
		case command == "DATA":
			say("354 go")
			skipMessage(reader)
			say("250 ok")
		case command == "QUIT":
			say("221 bye")
			return
		default:
			say("250 ok")
		}
	}
}

// recipient takes or refuses one RCPT TO, and gives the answer to it.
func (r *relay) recipient(line string) string {
	if r.refuse != "" {
		return r.refuse
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.to = append(r.to, strings.Trim(strings.TrimSpace(line)[len("RCPT TO:"):], "<>"))
	return "250 ok"
}

// skipMessage reads a message up to its final dot.
func skipMessage(reader *bufio.Reader) {
	for {
		part, err := reader.ReadString('\n')
		if err != nil || part == ".\r\n" {
			return
		}
	}
}

func (r *relay) received() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.to...)
}

// mailServer is a body for the change route.
func mailServer(host string, port int, tls string, password map[string]any, code string) map[string]any {
	return map[string]any{"host": host, "port": port, "tls": tls, "username": "", "password": password,
		"from_address": "wiki@example.com", "from_name": "The wiki", "reply_to": "", "code": code}
}

func keepPassword() map[string]any { return map[string]any{"action": "keep"} }

func removePassword() map[string]any { return map[string]any{"action": "remove"} }

func newPassword(value string) map[string]any { return map[string]any{"action": "set", "value": value} }

// privateEnv may reach this machine, where the relay of a test listens.
func privateEnv(t *testing.T) (*env, config.Config) {
	t.Helper()
	var cfg config.Config
	e := newEnvWith(t, func(c *config.Config) {
		c.OutwardAllowPrivate = true
		cfg = *c
	})
	return e, cfg
}

func mailServerView(t *testing.T, u *user) map[string]any {
	t.Helper()
	return u.ok("GET", mailServerRoute, nil)
}

// mailRefusal calls a route that must answer status with code in its body.
func mailRefusal(t *testing.T, u *user, status int, method, path string, body any, code string) {
	t.Helper()
	if out := u.want(status, method, path, body); !strings.Contains(out, code) {
		t.Fatalf("%s %s: want %s, got %s", method, path, code, out)
	}
}

// adminToken is a token with every scope, owned by u.
func adminToken(u *user) string {
	return u.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "script",
		"scopes": []string{identity.ScopeRead, identity.ScopeWrite, identity.ScopeExport, identity.ScopeAdmin}})["secret"].(string)
}

// assertNoMailServerStored fails when a change was stored or put in force.
func assertNoMailServerStored(t *testing.T, e *env, u *user) {
	t.Helper()
	if got := mailServerView(t, u); got["host"] != "" || got["source"] != mail.SourceNone {
		t.Fatalf("a refused change was stored: %v", got)
	}
	if e.auditActions(mail.ActionServerChanged) != 0 || e.app.Mail().Configured() {
		t.Fatal("a refused change left an audit event or a mail server in force")
	}
}

func TestNobodyButASystemAdministratorChangesTheMailServer(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	clerk := e.user("clerk@example.com", identity.PermUseProduct, identity.PermAdministrator)
	member := e.user("member@example.com", identity.PermUseProduct)
	_, recovery := root.enrolTOTP()
	_, clerkRecovery := clerk.enrolTOTP()
	member.want(http.StatusForbidden, "GET", mailServerRoute, nil)
	member.want(http.StatusForbidden, "PUT", mailServerRoute, mailServer("smtp.example.com", 587, "starttls", keepPassword(), recovery[0]))
	clerk.want(http.StatusForbidden, "PUT", mailServerRoute, mailServer("smtp.example.com", 587, "starttls", keepPassword(), clerkRecovery[0]))
	body, _ := json.Marshal(mailServer("smtp.example.com", 587, "starttls", newPassword(mailPassword), recovery[0]))
	if status, out := e.bearer("PUT", mailServerRoute, adminToken(root), string(body)); status != http.StatusForbidden || !strings.Contains(out, "session_only") {
		t.Fatalf("a token changed the mail server: %d %s", status, out)
	}
	assertNoMailServerStored(t, e, clerk)
}

func TestOnlyASystemAdministratorWithASecondFactorChangesTheMailServer(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	clerk := e.user("clerk@example.com", identity.PermUseProduct, identity.PermAdministrator)
	_, recovery := root.enrolTOTP()
	change := mailServer("smtp.example.com", 587, "starttls", newPassword(mailPassword), "")
	mailRefusal(t, root, http.StatusForbidden, "PUT", mailServerRoute, change, "second_factor_required")
	e.sql("UPDATE sessions SET created_at = now() - interval '11 minutes', reauth_at = NULL WHERE user_id = $1", root.id)
	change["code"] = recovery[0]
	mailRefusal(t, root, http.StatusForbidden, "PUT", mailServerRoute, change, "reauth_required")
	assertNoMailServerStored(t, e, clerk)

	root.ok("POST", "/api/v1/auth/reauth", map[string]any{"password": adminPassword})
	if got := root.ok("PUT", mailServerRoute, change); got["source"] != mail.SourceDatabase || got["password_set"] != true {
		t.Fatalf("a confirmed change: %v", got)
	}
	if !e.app.Mail().Configured() || e.auditActions(mail.ActionServerChanged) != 1 || e.outboxCount(mail.ActionServerChanged) != 1 {
		t.Fatal("a confirmed change is not in force, or left no audit and outbox event")
	}
	if got := mailServerView(t, clerk); got["host"] != "smtp.example.com" {
		t.Fatalf("an administrator reads what holds: %v", got)
	}
}

// sealedMailPassword is the password as the table keeps it.
func sealedMailPassword(t *testing.T, e *env) []byte {
	t.Helper()
	var sealed []byte
	if err := e.app.Pool().QueryRow(context.Background(), "SELECT password_sealed FROM mail_server").Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	return sealed
}

// assertHoldsNoPassword fails when text holds the password or its sealed form.
func assertHoldsNoPassword(t *testing.T, what, text string, sealed []byte) {
	t.Helper()
	if strings.Contains(text, mailPassword) || len(sealed) > 0 && strings.Contains(text, base64.StdEncoding.EncodeToString(sealed)) {
		t.Fatalf("%s holds the password: %s", what, text)
	}
}

func TestNoReadOfTheMailServerHoldsThePassword(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	root.ok("PUT", mailServerRoute, mailServer("smtp.example.com", 587, "starttls", newPassword(mailPassword), recovery[0]))
	sealed := sealedMailPassword(t, e)
	token := root.ok("POST", "/api/v1/me/tokens", map[string]any{"name": "reader", "scopes": []string{identity.ScopeRead, identity.ScopeAdmin}})["secret"].(string)
	status, byToken := e.bearer("GET", mailServerRoute, token, "")
	if status != http.StatusOK {
		t.Fatalf("a token with the admin scope reads the server: %d %s", status, byToken)
	}
	_, bySession := root.do("GET", mailServerRoute, nil)
	_, queue := root.do("GET", "/api/v1/admin/mail", nil)
	assertHoldsNoPassword(t, "the read through a token", byToken, sealed)
	assertHoldsNoPassword(t, "the read through a session", bySession, sealed)
	assertHoldsNoPassword(t, "the queue", queue, sealed)
	if !strings.Contains(bySession, `"password_set":true`) {
		t.Fatalf("the read says nothing about the password: %s", bySession)
	}
}

// auditOf is the details of the newest event of action.
func auditOf(t *testing.T, e *env, action string) map[string]any {
	t.Helper()
	evs, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{Action: action, Limit: 1})
	if err != nil || len(evs) == 0 {
		t.Fatalf("no %s: %v", action, err)
	}
	return evs[0].Details
}

// lastChange is how the newest change of the mail server records field.
func lastChange(t *testing.T, e *env, field string) string {
	t.Helper()
	changes := auditOf(t, e, mail.ActionServerChanged)["changes"].(map[string]any)
	if change, listed := changes[field]; listed {
		return fmt.Sprint(change)
	}
	return "unchanged"
}

// assertChange fails unless the newest change of the mail server records field as want.
func assertChange(t *testing.T, e *env, field, want string) {
	t.Helper()
	if got := lastChange(t, e, field); got != want {
		t.Fatalf("%s: recorded %s, want %s", field, got, want)
	}
}

// assertAuditHoldsNoPassword fails when any change of the mail server holds the password.
func assertAuditHoldsNoPassword(t *testing.T, e *env, sealed []byte) {
	t.Helper()
	evs, err := audit.List(context.Background(), e.app.Pool(), audit.Filter{Action: mail.ActionServerChanged, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	rows, err := json.Marshal(evs)
	if err != nil {
		t.Fatal(err)
	}
	assertHoldsNoPassword(t, "an audit row", string(rows), sealed)
}

func TestThePasswordIsSealedAndAuditedWithoutItsValue(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	root.ok("PUT", mailServerRoute, mailServer("smtp.example.com", 587, "starttls", newPassword(mailPassword), recovery[0]))
	first := sealedMailPassword(t, e)
	if len(first) == 0 || strings.Contains(string(first), mailPassword) {
		t.Fatal("the password is not sealed")
	}
	assertChange(t, e, "password", "map[redacted:true]")
	assertChange(t, e, "host", "map[after:smtp.example.com before:<nil>]")

	root.ok("PUT", mailServerRoute, mailServer("smtp2.example.com", 587, "starttls", keepPassword(), recovery[1]))
	if string(sealedMailPassword(t, e)) != string(first) {
		t.Fatal("keeping the password sealed it again")
	}
	assertChange(t, e, "password", "unchanged")
	assertChange(t, e, "host", "map[after:smtp2.example.com before:smtp.example.com]")

	root.ok("PUT", mailServerRoute, mailServer("smtp2.example.com", 587, "starttls", removePassword(), recovery[2]))
	if sealedMailPassword(t, e) != nil || mailServerView(t, root)["password_set"] != false {
		t.Fatal("a removed password stayed")
	}
	assertChange(t, e, "password", "map[redacted:true]")
	assertAuditHoldsNoPassword(t, e, first)
}

// A stored password never travels over a connection without TLS (D7).
func TestAStoredPasswordIsNeverSentWithoutEncryption(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	root.ok("PUT", mailServerRoute, mailServer("smtp.example.com", 587, "starttls", newPassword(mailPassword), recovery[0]))
	mailRefusal(t, root, http.StatusBadRequest, "PUT", mailServerRoute,
		mailServer("smtp.example.com", 25, "none", keepPassword(), recovery[1]), "encrypted connection")
	if got := mailServerView(t, root); got["tls"] != "starttls" {
		t.Fatalf("a refused change was stored: %v", got)
	}
	root.ok("PUT", mailServerRoute, mailServer("smtp.example.com", 25, "none", removePassword(), recovery[2]))
}

func TestTheEnvironmentLocksTheMailServer(t *testing.T) {
	e := newEnvWith(t, func(c *config.Config) {
		c.SMTP = config.SMTP{Host: "mail.example.com", Port: 25, From: "The wiki <wiki@example.com>", Password: mailPassword,
			TLS: config.SMTPTLSStart}
	})
	root := admin(e)
	_, recovery := root.enrolTOTP()
	_, out := root.do("GET", mailServerRoute, nil)
	var got mail.ServerView
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	want := mail.ServerView{Source: mail.SourceEnvironment, Locked: &mail.Lock{Setting: "KENWERK_SMTP_HOST", Source: "environment"},
		Server: mail.Server{Host: "mail.example.com", Port: 25, TLS: config.SMTPTLSStart, PasswordSet: true,
			FromAddress: "wiki@example.com", FromName: "The wiki"}}
	if fmt.Sprint(got.Server, got.Source, *got.Locked) != fmt.Sprint(want.Server, want.Source, *want.Locked) {
		t.Fatalf("the environment's server: %+v", got)
	}
	assertHoldsNoPassword(t, "the environment's server", out, nil)
	mailRefusal(t, root, http.StatusConflict, "PUT", mailServerRoute,
		mailServer("smtp.example.com", 587, "starttls", keepPassword(), recovery[0]), "mail_server_locked")
	if e.auditActions(mail.ActionServerChanged) != 0 {
		t.Fatal("a locked change was stored")
	}
	// The code was not spent on a change that could not be made.
	root.ok("PUT", "/api/v1/admin/settings/access/confirmed", confirmed(map[string]any{"second_factor": "administrators",
		"idle_minutes": 0, "signup_domains": []string{}, "guest_invites": true}, recovery[0], ""))
}

func TestAMailServerOnAnInsideAddressIsRefusedBySaving(t *testing.T) {
	e := newEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	for i, host := range []string{"127.0.0.1", "localhost", "10.1.2.3"} {
		mailRefusal(t, root, http.StatusBadRequest, "PUT", mailServerRoute, mailServer(host, 25, "none", keepPassword(), recovery[i]), "private network")
	}
	if e.auditActions(mail.ActionServerChanged) != 0 {
		t.Fatal("an inside address was stored")
	}
}

// A name can resolve to an inside address after it was saved; the connection is refused then
// (D4). The row is written straight into the table, as such a name would leave it.
func TestAStoredServerReachesOnlyAllowedAddresses(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	relay := startRelay(t, "")
	e.sql("INSERT INTO mail_server (id, host, port, tls, from_address) VALUES (true, '127.0.0.1', $1, 'none', 'wiki@example.com')", relay.port())
	if err := e.app.ApplyRuntime(ctx, time.Now()); err != nil {
		t.Fatal(err)
	}
	res, err := e.app.Mail().SendTest(ctx, identity.SystemCaller("test"), "anna@example.com", "Test")
	if err != nil || res.Delivered || res.Step != mail.StepConnect || !strings.Contains(res.Error, "private network") {
		t.Fatalf("a stored server reached this machine: %+v %v", res, err)
	}
	if len(relay.received()) != 0 {
		t.Fatal("a mail arrived at an inside address")
	}
}

// otherNode is a second app on the same database and key, as another node of the installation.
func otherNode(t *testing.T, cfg config.Config) *app.App {
	t.Helper()
	other, err := app.New(context.Background(), cfg, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(other.Close)
	return other
}

// reread has a node read the settings again, as it does every few seconds.
func reread(t *testing.T, a *app.App) {
	t.Helper()
	if err := a.ApplyRuntime(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
}

// testMailFrom sends a test mail through a node and fails unless it was delivered.
func testMailFrom(t *testing.T, a *app.App, to string) {
	t.Helper()
	if res, err := a.Mail().SendTest(context.Background(), identity.SystemCaller("test"), to, "Test"); err != nil || !res.Delivered {
		t.Fatalf("a test from the other node: %+v %v", res, err)
	}
}

func TestAChangedMailServerIsUsedWithoutARestart(t *testing.T) {
	e, cfg := privateEnv(t)
	other := otherNode(t, cfg)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	first := startRelay(t, "")
	root.ok("PUT", mailServerRoute, mailServer("127.0.0.1", first.port(), "none", keepPassword(), recovery[0]))
	if !e.app.Mail().Configured() || !e.app.Identity().MailReady() {
		t.Fatal("the node that saved does not send at once")
	}
	if other.Mail().Configured() {
		t.Fatal("the other node knew before it read again")
	}
	reread(t, other)
	if !other.Mail().Configured() || !other.Identity().MailReady() {
		t.Fatal("the other node does not send after reading again")
	}
	testMailFrom(t, other, "anna@example.com")
	second := startRelay(t, "")
	root.ok("PUT", mailServerRoute, mailServer("127.0.0.1", second.port(), "none", keepPassword(), recovery[1]))
	reread(t, other)
	testMailFrom(t, other, "bo@example.com")
	if got := second.received(); len(got) != 1 || got[0] != "bo@example.com" || len(first.received()) != 1 {
		t.Fatalf("after the change the other node still sends to the old server: first %v, second %v", first.received(), got)
	}
}

func TestAnEmptyHostTurnsMailOffOnEveryNode(t *testing.T) {
	e, cfg := privateEnv(t)
	other := otherNode(t, cfg)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	relay := startRelay(t, "")
	root.ok("PUT", mailServerRoute, mailServer("127.0.0.1", relay.port(), "none", keepPassword(), recovery[0]))
	reread(t, other)
	root.ok("PUT", mailServerRoute, mailServer("", 587, "none", keepPassword(), recovery[1]))
	if e.app.Mail().Configured() || e.app.Identity().MailReady() {
		t.Fatal("mail stays on after the host was emptied")
	}
	reread(t, other)
	if other.Mail().Configured() || other.Identity().MailReady() {
		t.Fatal("the other node keeps sending after mail was turned off")
	}
}

func TestTheTestMailGoesToThePersonWhoAsks(t *testing.T) {
	e, _ := privateEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	mailRefusal(t, root, http.StatusConflict, "POST", mailTestRoute, nil, "mail_off")
	good := startRelay(t, "")
	root.ok("PUT", mailServerRoute, mailServer("127.0.0.1", good.port(), "none", keepPassword(), recovery[0]))
	if got := root.ok("POST", mailTestRoute, nil); got["delivered"] != true || got["to"] != root.email {
		t.Fatalf("a test: %v", got)
	}
	if got := good.received(); len(got) != 1 || got[0] != root.email {
		t.Fatalf("the test went to %v, want the person who asked", got)
	}
	var queued int
	if err := e.app.Pool().QueryRow(context.Background(), "SELECT count(*) FROM mail_queue").Scan(&queued); err != nil || queued != 0 {
		t.Fatalf("a test went through the queue: %d %v", queued, err)
	}
}

func TestTheTestMailReportsTheExactAnswerOfTheServer(t *testing.T) {
	e, _ := privateEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	refusing := startRelay(t, "550 5.7.1 Relaying denied")
	root.ok("PUT", mailServerRoute, mailServer("127.0.0.1", refusing.port(), "none", keepPassword(), recovery[0]))
	got := root.ok("POST", mailTestRoute, nil)
	if got["delivered"] != false || got["step"] != string(mail.StepRecipient) || got["error"] != "550 5.7.1 Relaying denied" {
		t.Fatalf("a refused test: %v", got)
	}
	details := auditOf(t, e, mail.ActionServerTested)
	if details["delivered"] != false || details["step"] != string(mail.StepRecipient) || strings.Contains(fmt.Sprint(details), "Relaying") {
		t.Fatalf("the audit of a test: %v", details)
	}
}

func TestTestMailsAreLimited(t *testing.T) {
	e, _ := privateEnv(t)
	root := admin(e)
	_, recovery := root.enrolTOTP()
	relay := startRelay(t, "")
	root.ok("PUT", mailServerRoute, mailServer("127.0.0.1", relay.port(), "none", keepPassword(), recovery[0]))
	for range 5 {
		root.ok("POST", mailTestRoute, nil)
	}
	root.want(http.StatusTooManyRequests, "POST", mailTestRoute, nil)
	if len(relay.received()) != 5 {
		t.Fatalf("%d test mails left", len(relay.received()))
	}
}
