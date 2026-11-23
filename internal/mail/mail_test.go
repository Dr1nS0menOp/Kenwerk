// SPDX-License-Identifier: Apache-2.0

package mail

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"fmt"
	"math/big"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kenwerk/kenwerk/internal/config"
)

// fakeServer is a small SMTP server, enough to see what a client really does.
type fakeServer struct {
	t         *testing.T
	listener  net.Listener
	certs     *tls.Config
	mu        sync.Mutex
	secured   bool
	authWhile []bool // whether each AUTH came over TLS
	password  string
	data      string
	// refuse answers a command that starts with a key with its line, as a server that says no.
	refuse map[string]string
}

func testCertificate(t *testing.T) (*tls.Config, *x509.CertPool) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "localhost"},
		DNSNames: []string{"localhost"}, IPAddresses: []net.IP{net.ParseIP("127.0.0.1")},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(cert)
	return &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}}, pool
}

func startServer(t *testing.T, offerTLS bool) (*fakeServer, *tls.Config) {
	t.Helper()
	return startRefusingServer(t, offerTLS, nil)
}

// startRefusingServer is startServer whose answers to the commands in refuse are refusals.
func startRefusingServer(t *testing.T, offerTLS bool, refuse map[string]string) (*fakeServer, *tls.Config) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	serverTLS, pool := testCertificate(t)
	s := &fakeServer{t: t, listener: ln, certs: serverTLS, refuse: refuse}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go s.serve(conn, offerTLS)
		}
	}()
	return s, &tls.Config{RootCAs: pool, ServerName: "127.0.0.1", MinVersion: tls.VersionTLS12}
}

// fakeSession is one connection to the fake server, which may move to TLS halfway.
type fakeSession struct {
	server   *fakeServer
	conn     net.Conn
	reader   *bufio.Reader
	offerTLS bool
	secured  bool
}

func (s *fakeServer) serve(conn net.Conn, offerTLS bool) {
	session := &fakeSession{server: s, conn: conn, reader: bufio.NewReader(conn), offerTLS: offerTLS}
	defer func() { _ = session.conn.Close() }()
	session.say("220 fake")
	for {
		line, err := session.reader.ReadString('\n')
		if err != nil {
			return
		}
		if !session.answer(line) {
			return
		}
	}
}

func (f *fakeSession) say(line string) { fmt.Fprintf(f.conn, "%s\r\n", line) }

// answer answers one command line, and reports whether the conversation goes on.
func (f *fakeSession) answer(line string) bool {
	command := strings.ToUpper(strings.TrimSpace(line))
	if answer, refused := f.server.refusal(command); refused {
		f.say(answer)
		return true
	}
	switch {
	case strings.HasPrefix(command, "EHLO"):
		f.hello()
	case command == "STARTTLS":
		return f.startTLS()
	case strings.HasPrefix(command, "AUTH PLAIN"):
		f.login(line)
	case command == "DATA":
		f.data()
	case command == "QUIT":
		f.say("221 bye")
		return false
	default:
		f.say("250 ok")
	}
	return true
}

func (f *fakeSession) hello() {
	f.say("250-fake")
	if f.offerTLS && !f.secured {
		f.say("250 STARTTLS")
		return
	}
	f.say("250 AUTH PLAIN")
}

func (f *fakeSession) startTLS() bool {
	f.say("220 go")
	secure := tls.Server(f.conn, f.server.certs)
	if err := secure.Handshake(); err != nil {
		return false
	}
	f.conn, f.reader, f.secured = secure, bufio.NewReader(secure), true
	f.server.mu.Lock()
	f.server.secured = true
	f.server.mu.Unlock()
	return true
}

func (f *fakeSession) login(line string) {
	parts := strings.Fields(strings.TrimSpace(line))
	raw, _ := base64.StdEncoding.DecodeString(parts[len(parts)-1])
	f.server.mu.Lock()
	f.server.authWhile = append(f.server.authWhile, f.secured)
	f.server.password = string(raw)
	f.server.mu.Unlock()
	f.say("235 ok")
}

func (f *fakeSession) data() {
	f.say("354 go")
	var body strings.Builder
	for {
		part, err := f.reader.ReadString('\n')
		if err != nil || part == ".\r\n" {
			break
		}
		body.WriteString(part)
	}
	f.server.mu.Lock()
	f.server.data = body.String()
	f.server.mu.Unlock()
	f.say("250 ok")
}

func (s *fakeServer) port() int { return s.listener.Addr().(*net.TCPAddr).Port }

func (s *fakeServer) refusal(command string) (string, bool) {
	for prefix, answer := range s.refuse {
		if strings.HasPrefix(command, prefix) {
			return answer, true
		}
	}
	return "", false
}

func message() Message {
	return Message{To: "anna@example.com", Subject: "Hello", Text: "plain", HTML: "<p>html</p>", Reason: "mentioned",
		Unsubscribe: "https://wiki.example.com/api/v1/mail/unsubscribe/token"}
}

func TestPasswordsOnlyTravelOverTLS(t *testing.T) {
	server, clientTLS := startServer(t, true)
	sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), Username: "u", Password: "secret",
		From: "wiki@example.com", TLS: config.SMTPTLSStart}, ListID: "wiki", TLSConfig: clientTLS}
	if err := sender.Send(context.Background(), message()); err != nil {
		t.Fatal(err)
	}
	server.mu.Lock()
	defer server.mu.Unlock()
	if !server.secured || len(server.authWhile) != 1 || !server.authWhile[0] {
		t.Fatalf("secured=%v auth=%v", server.secured, server.authWhile)
	}
	for _, want := range []string{"Auto-Submitted: auto-generated", "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
		"List-Unsubscribe: <https://wiki.example.com/api/v1/mail/unsubscribe/token>", "List-Id: wiki", "X-Kenwerk-Reason: mentioned"} {
		if !strings.Contains(server.data, want) {
			t.Fatalf("missing %q in\n%s", want, server.data)
		}
	}
}

func TestAServerWithoutTLSGetsNothing(t *testing.T) {
	server, clientTLS := startServer(t, false)
	sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), Username: "u", Password: "secret",
		From: "wiki@example.com", TLS: config.SMTPTLSStart}, TLSConfig: clientTLS}
	if err := sender.Send(context.Background(), message()); err == nil {
		t.Fatal("a mail went out without encryption")
	}
	server.mu.Lock()
	defer server.mu.Unlock()
	if len(server.authWhile) != 0 || server.data != "" {
		t.Fatal("something left without TLS")
	}
}

func assertNothingArrived(t *testing.T, server *fakeServer) {
	t.Helper()
	server.mu.Lock()
	defer server.mu.Unlock()
	if len(server.authWhile) != 0 || server.data != "" {
		t.Fatal("something reached a server with a wrong certificate")
	}
}

// The sender here has no test trust: this is the real default, which has never heard of
// the certificate of the fake server.
func TestAServerWithAWrongCertificateGetsNothing(t *testing.T) {
	server, _ := startServer(t, true)
	sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), Username: "u", Password: "secret",
		From: "wiki@example.com", TLS: config.SMTPTLSStart}}
	if err := sender.Send(context.Background(), message()); err == nil {
		t.Fatal("a mail went to a server nobody vouches for")
	}
	assertNothingArrived(t, server)
}

func TestACertificateForAnotherNameIsRefused(t *testing.T) {
	server, trust := startServer(t, true)
	sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), Username: "u", Password: "secret",
		From: "wiki@example.com", TLS: config.SMTPTLSStart},
		TLSConfig: &tls.Config{RootCAs: trust.RootCAs, ServerName: "mail.example.com", MinVersion: tls.VersionTLS12}}
	if err := sender.Send(context.Background(), message()); err == nil {
		t.Fatal("a mail went to a server with the certificate of another name")
	}
	assertNothingArrived(t, server)
}

func TestImplicitTLSChecksTheCertificateToo(t *testing.T) {
	serverTLS, _ := testCertificate(t)
	ln, err := tls.Listen("tcp", "127.0.0.1:0", serverTLS)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	server := &fakeServer{t: t, listener: ln, certs: serverTLS}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go server.serve(conn, false)
		}
	}()
	sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), Username: "u", Password: "secret",
		From: "wiki@example.com", TLS: config.SMTPTLSImplicit}}
	if err := sender.Send(context.Background(), message()); err == nil {
		t.Fatal("a mail went to a server nobody vouches for")
	}
	assertNothingArrived(t, server)
}

func TestPlainDeliveryIsOnlyForALocalRelayThatWasChosen(t *testing.T) {
	server, _ := startServer(t, false)
	port := strconv.Itoa(server.port())
	sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), From: "wiki@example.com", TLS: config.SMTPTLSNone}}
	if err := sender.Send(context.Background(), message()); err != nil {
		t.Fatalf("port %s: %v", port, err)
	}
	server.mu.Lock()
	defer server.mu.Unlock()
	if server.data == "" {
		t.Fatal("nothing arrived")
	}
}

func TestALineBreakCannotAddAHeader(t *testing.T) {
	m := message()
	m.Subject = "Title\r\nBcc: everyone@example.com"
	raw, err := Compose("Wiki <wiki@example.com>", "reply@example.com\r\nX-Evil: 1", "wiki\nX-Evil: 2", m, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	head, _, _ := strings.Cut(string(raw), "\r\n\r\n")
	for _, line := range strings.Split(head, "\r\n") {
		if strings.HasPrefix(line, "Bcc:") || strings.HasPrefix(line, "X-Evil:") {
			t.Fatalf("a header got in: %q", line)
		}
	}
	m = message()
	m.To = "a@example.com\r\nBcc: x@example.com"
	if _, err := Compose("wiki@example.com", "", "wiki", m, time.Now()); err == nil {
		if raw, _ := Compose("wiki@example.com", "", "wiki", m, time.Now()); strings.Contains(string(raw), "\r\nBcc:") {
			t.Fatal("a header got in through the address")
		}
	}
}

func TestAnErrorSaysNothingAboutAPerson(t *testing.T) {
	message := safeError(fmt.Errorf("550 no such user anna@example.com"))
	if strings.Contains(message, "@") {
		t.Fatalf("message: %s", message)
	}
}
