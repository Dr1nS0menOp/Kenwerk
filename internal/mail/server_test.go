// SPDX-License-Identifier: Apache-2.0

package mail

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/outward"
)

// The rules of the mail server a system administrator sets (spec 098). Refusals first.

func checker(allowPrivate bool) *Service {
	return &Service{stored: &StoredOptions{Outward: outward.Options{AllowPrivate: allowPrivate}}}
}

func goodChange() ServerChange {
	return ServerChange{Host: "smtp.example.com", Port: 587, TLS: config.SMTPTLSStart, Username: "wiki",
		Password: PasswordChange{Action: PasswordSet, Value: "a password"}, FromAddress: "wiki@example.com",
		FromName: "The wiki", ReplyTo: "help@example.com"}
}

func TestAMailServerOnAnInsideAddressIsRefused(t *testing.T) {
	for _, host := range []string{"localhost", "mail.localhost", "127.0.0.1", "::1", "10.0.0.5", "192.168.1.20",
		"169.254.169.254", "100.64.0.1", "0.0.0.0"} {
		ch := goodChange()
		ch.Host = host
		if _, err := checker(false).check(ch); err == nil {
			t.Errorf("%s was accepted while outgoing connections may not reach it", host)
		}
	}
	ch := goodChange()
	ch.Host = "10.0.0.5"
	if _, err := checker(true).check(ch); err != nil {
		t.Fatalf("with KENWERK_OUTWARD_ALLOW_PRIVATE a private relay is allowed: %v", err)
	}
	ch.Host = "localhost"
	if _, err := checker(true).check(ch); err != nil {
		t.Fatalf("with KENWERK_OUTWARD_ALLOW_PRIVATE a local relay is allowed: %v", err)
	}
}

func TestTheLimitsOfTheMailServerAreChecked(t *testing.T) {
	for name, change := range map[string]func(*ServerChange){
		"a scheme":                       func(c *ServerChange) { c.Host = "smtp://smtp.example.com" },
		"a port in the host":             func(c *ServerChange) { c.Host = "smtp.example.com:25" },
		"a user in the host":             func(c *ServerChange) { c.Host = "me@smtp.example.com" },
		"a space in the host":            func(c *ServerChange) { c.Host = "smtp example.com" },
		"a host too long":                func(c *ServerChange) { c.Host = strings.Repeat("a.", 127) + "com" },
		"port 0":                         func(c *ServerChange) { c.Port = 0 },
		"port 65536":                     func(c *ServerChange) { c.Port = 65536 },
		"an unknown encryption":          func(c *ServerChange) { c.TLS = "ssl" },
		"a login without encryption":     func(c *ServerChange) { c.TLS = config.SMTPTLSNone },
		"a user name over two lines":     func(c *ServerChange) { c.Username = "wiki\r\nRCPT TO:<x@example.com>" },
		"a sender name over two lines":   func(c *ServerChange) { c.FromName = "Wiki\nBcc: x@example.com" },
		"a sender name too long":         func(c *ServerChange) { c.FromName = strings.Repeat("n", 201) },
		"an empty new password":          func(c *ServerChange) { c.Password = PasswordChange{Action: PasswordSet} },
		"a password over two lines":      func(c *ServerChange) { c.Password.Value = "a\r\nb" },
		"a password too long":            func(c *ServerChange) { c.Password.Value = strings.Repeat("p", 1025) },
		"no word on the password":        func(c *ServerChange) { c.Password = PasswordChange{} },
		"no sender address":              func(c *ServerChange) { c.FromAddress = "" },
		"a sender address with a name":   func(c *ServerChange) { c.FromAddress = "Wiki <wiki@example.com>" },
		"a sender that is no address":    func(c *ServerChange) { c.FromAddress = "wiki" },
		"a reply-to address with a name": func(c *ServerChange) { c.ReplyTo = "Help <help@example.com>" },
	} {
		c := goodChange()
		change(&c)
		_, err := checker(true).check(c)
		if _, expected := apperr.As(err); !expected {
			t.Errorf("%s: %v, want a refusal of the input", name, err)
		}
	}
	clean, err := checker(false).check(ServerChange{Host: " SMTP.Example.COM. ", Port: 465, TLS: config.SMTPTLSImplicit,
		Password: PasswordChange{Action: PasswordKeep}, FromAddress: "wiki@example.com"})
	if err != nil || clean.Host != "smtp.example.com" {
		t.Fatalf("a name is cleaned, not refused: %q %v", clean.Host, err)
	}
	if _, err := checker(false).check(ServerChange{Port: 587, TLS: config.SMTPTLSStart, Password: PasswordChange{Action: PasswordRemove}}); err != nil {
		t.Fatalf("an empty host turns mail off: %v", err)
	}
}

func TestTheSenderNamesTheStepAndTheAnswerOfTheServer(t *testing.T) {
	for prefix, step := range map[string]Step{"MAIL FROM": StepSender, "RCPT TO": StepRecipient, "DATA": StepMessage} {
		server, _ := startRefusingServer(t, false, map[string]string{prefix: "550 5.7.1 Relaying denied"})
		sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), From: "wiki@example.com", TLS: config.SMTPTLSNone}}
		err := sender.Send(context.Background(), message())
		var failed *StepError
		if !errors.As(err, &failed) || failed.Step != step || testError(err) != "550 5.7.1 Relaying denied" {
			t.Errorf("%s refused: %v, want step %s with the answer of the server", prefix, err, step)
		}
		if safe := safeError(err); strings.Contains(safe, "Relaying") {
			t.Errorf("the queue's message quotes the server: %s", safe)
		}
	}
	server, clientTLS := startRefusingServer(t, true, map[string]string{"AUTH": "535 5.7.8 Authentication credentials invalid"})
	sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), Username: "u", Password: "wrong",
		From: "wiki@example.com", TLS: config.SMTPTLSStart}, TLSConfig: clientTLS}
	err := sender.Send(context.Background(), message())
	var failed *StepError
	if !errors.As(err, &failed) || failed.Step != StepLogin || !strings.Contains(testError(err), "535 5.7.8") {
		t.Fatalf("a wrong password: %v", err)
	}
	if strings.Contains(err.Error(), "wrong") {
		t.Fatalf("the error holds the password: %v", err)
	}
}

func TestAStoredServerConnectsOnlyToAllowedAddresses(t *testing.T) {
	server, _ := startServer(t, false)
	sender := SMTP{Config: config.SMTP{Host: "127.0.0.1", Port: server.port(), From: "wiki@example.com", TLS: config.SMTPTLSNone},
		Dialer: outward.Options{}.Dialer(time.Second)}
	err := sender.Send(context.Background(), message())
	var failed *StepError
	if !errors.Is(err, outward.ErrRefused) || !errors.As(err, &failed) || failed.Step != StepConnect {
		t.Fatalf("a stored server reached this machine: %v", err)
	}
	if words := testError(err); !strings.Contains(words, "private network") {
		t.Fatalf("a refused address is not put in words: %s", words)
	}
	server.mu.Lock()
	arrived := server.data
	server.mu.Unlock()
	if arrived != "" {
		t.Fatal("a mail reached a refused address")
	}
	sender.Dialer = outward.Options{AllowPrivate: true}.Dialer(time.Second)
	if err := sender.Send(context.Background(), message()); err != nil {
		t.Fatalf("with private addresses allowed: %v", err)
	}
}

func TestTheEnvironmentsSenderShowsItsNameApart(t *testing.T) {
	v := environmentView(config.SMTP{Host: "mail.example.com", Port: 25, From: "The wiki <wiki@example.com>",
		Password: "hunter2", TLS: config.SMTPTLSStart}, &Lock{Setting: "KENWERK_SMTP_HOST", Source: "environment"})
	if v.FromAddress != "wiki@example.com" || v.FromName != "The wiki" || !v.PasswordSet || v.Source != SourceEnvironment || v.Locked == nil {
		t.Fatalf("view: %+v", v)
	}
	if fromHeader(Server{FromAddress: "wiki@example.com", FromName: "The wiki"}) != `"The wiki" <wiki@example.com>` {
		t.Fatalf("from: %s", fromHeader(Server{FromAddress: "wiki@example.com", FromName: "The wiki"}))
	}
}
