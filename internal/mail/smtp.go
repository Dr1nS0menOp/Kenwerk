// SPDX-License-Identifier: Apache-2.0

package mail

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"time"

	"github.com/kenwerk/kenwerk/internal/config"
)

const smtpTimeout = 30 * time.Second

// Sender delivers one message.
type Sender interface {
	Send(ctx context.Context, m Message) error
}

// Step is the part of an SMTP conversation where a delivery failed.
type Step string

// The steps of one delivery, in their order.
const (
	StepCompose   Step = "compose"
	StepConnect   Step = "connect"
	StepTLS       Step = "tls"
	StepLogin     Step = "login"
	StepSender    Step = "sender"
	StepRecipient Step = "recipient"
	StepMessage   Step = "message"
)

// StepError is a failed delivery with the step it failed at. Its cause is what the network or
// the server said, such as "535 5.7.8 Authentication credentials invalid".
type StepError struct {
	Step Step
	Err  error
}

func (e *StepError) Error() string { return string(e.Step) + ": " + e.Err.Error() }

func (e *StepError) Unwrap() error { return e.Err }

func failedAt(step Step, err error) error {
	if err == nil {
		return nil
	}
	return &StepError{Step: step, Err: err}
}

// SMTP delivers through a mail server. net/smtp's SendMail only moves to TLS "if
// possible", so this drives the client by hand: with STARTTLS configured, a server
// that does not offer it gets nothing (spec 010, D13).
type SMTP struct {
	Config    config.SMTP
	ListID    string
	TLSConfig *tls.Config // tests set this. Empty means the system's trust store.
	// Dialer makes the connection. Nil means any address; a server set in the administration
	// gets one that reaches only the addresses outgoing calls may reach (spec 098, D4).
	Dialer *net.Dialer
}

func (s SMTP) tlsConfig() *tls.Config {
	if s.TLSConfig != nil {
		return s.TLSConfig
	}
	return &tls.Config{ServerName: s.Config.Host, MinVersion: tls.VersionTLS12}
}

func (s SMTP) dial(ctx context.Context) (net.Conn, error) {
	address := net.JoinHostPort(s.Config.Host, strconv.Itoa(s.Config.Port))
	dialer := s.Dialer
	if dialer == nil {
		dialer = &net.Dialer{Timeout: smtpTimeout}
	}
	if s.Config.TLS == config.SMTPTLSImplicit {
		return (&tls.Dialer{NetDialer: dialer, Config: s.tlsConfig()}).DialContext(ctx, "tcp", address)
	}
	return dialer.DialContext(ctx, "tcp", address)
}

func (s SMTP) authenticate(c *smtp.Client) error {
	if s.Config.Username == "" {
		return nil
	}
	return c.Auth(smtp.PlainAuth("", s.Config.Username, s.Config.Password, s.Config.Host))
}

func (s SMTP) secure(c *smtp.Client) error {
	if s.Config.TLS != config.SMTPTLSStart {
		return nil
	}
	if ok, _ := c.Extension("STARTTLS"); !ok {
		return errors.New("mail: the server does not offer STARTTLS")
	}
	return c.StartTLS(s.tlsConfig())
}

// Send delivers one message. A failure is a *StepError.
func (s SMTP) Send(ctx context.Context, m Message) error {
	body, err := Compose(s.Config.From, s.Config.ReplyTo, s.ListID, m, time.Now())
	if err != nil {
		return failedAt(StepCompose, err)
	}
	from, err := mail.ParseAddress(s.Config.From)
	if err != nil {
		return failedAt(StepCompose, err)
	}
	to, err := mail.ParseAddress(oneLine(m.To))
	if err != nil {
		return failedAt(StepCompose, errors.New("mail: the address of a person is not valid"))
	}
	conn, err := s.dial(ctx)
	if err != nil {
		return failedAt(StepConnect, err)
	}
	if err := conn.SetDeadline(time.Now().Add(smtpTimeout)); err != nil {
		_ = conn.Close()
		return failedAt(StepConnect, err)
	}
	c, err := smtp.NewClient(conn, s.Config.Host)
	if err != nil {
		_ = conn.Close()
		return failedAt(StepConnect, err)
	}
	defer func() { _ = c.Close() }()
	if err := s.secure(c); err != nil {
		return failedAt(StepTLS, err)
	}
	if err := s.authenticate(c); err != nil {
		return failedAt(StepLogin, err)
	}
	if err := c.Mail(from.Address); err != nil {
		return failedAt(StepSender, err)
	}
	if err := c.Rcpt(to.Address); err != nil {
		return failedAt(StepRecipient, err)
	}
	return failedAt(StepMessage, s.write(c, body))
}

func (s SMTP) write(c *smtp.Client, body []byte) error {
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(body); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}

// safeError says what went wrong without an address or a word of the mail, because
// it ends up in the admin console and in logs.
func safeError(err error) string {
	var netErr net.Error
	if errors.As(err, &netErr) {
		return "The mail server could not be reached."
	}
	var proto interface{ Temporary() bool }
	if errors.As(err, &proto) {
		return fmt.Sprintf("The mail server answered with an error (temporary: %t).", proto.Temporary())
	}
	return "The mail could not be delivered."
}
