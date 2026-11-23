// SPDX-License-Identifier: Apache-2.0

package mail

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"net/netip"
	"net/textproto"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/outbox"
	"github.com/kenwerk/kenwerk/internal/outward"
	"github.com/kenwerk/kenwerk/internal/settings"
)

// The mail server a system administrator sets in the administration (spec 098). It is one
// row of mail_server, with the password sealed; the environment's server, when it names one,
// wins over it as a whole (D1).

// PasswordContext binds the sealed password of the mail server to its column.
const PasswordContext = "mail server password"

// ActionServerChanged and ActionServerTested are the audit events of the section.
const (
	ActionServerChanged = "mail.server_changed"
	ActionServerTested  = "mail.server_tested"
)

// Where the server in force comes from.
const (
	SourceDatabase    = "database"
	SourceEnvironment = "environment"
	SourceNone        = "none"
)

const (
	maxHostLength     = 253
	maxLineRunes      = 200
	maxPasswordRunes  = 1024
	defaultSubmission = 587
	maxPort           = 65535
)

// hostName is a DNS name in lower case, with an optional final dot.
var hostName = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.?$`)

// serverSafeFields keep their values in the audit row: what an investigation of a phishing mail
// needs, naming a system rather than a person. The user name and the password do not (D10).
var serverSafeFields = settings.SafeFields{"host", "port", "tls", "from_address", "from_name", "reply_to"}

// Sealer seals and opens the password; the keyring of the installation does it.
type Sealer = settings.Sealer

// Server is the mail server as the administration shows it. It never holds the password,
// only whether one is set.
type Server struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	TLS         string `json:"tls"`
	Username    string `json:"username"`
	PasswordSet bool   `json:"password_set"`
	FromAddress string `json:"from_address"`
	FromName    string `json:"from_name"`
	ReplyTo     string `json:"reply_to"`
}

// Lock names the setting of the environment that holds the server, and where it is written.
// The other parts the environment may hold share it (spec 101).
type Lock = settings.Lock

// ServerView is the server in force, where it comes from, and what locks it.
type ServerView struct {
	Server
	Source    string     `json:"source"`
	Locked    *Lock      `json:"locked"`
	UpdatedAt *time.Time `json:"updated_at"`
}

// PasswordAction says what a change does with the stored password.
type PasswordAction = settings.SecretAction

// The ways a change treats the password.
const (
	PasswordKeep   = settings.SecretKeep
	PasswordSet    = settings.SecretSet
	PasswordRemove = settings.SecretRemove
)

// PasswordChange is the password part of a change: Value only with PasswordSet.
type PasswordChange = settings.SecretChange

// ServerChange is what a system administrator saves.
type ServerChange struct {
	Host        string         `json:"host"`
	Port        int            `json:"port"`
	TLS         string         `json:"tls"`
	Username    string         `json:"username"`
	Password    PasswordChange `json:"password"`
	FromAddress string         `json:"from_address"`
	FromName    string         `json:"from_name"`
	ReplyTo     string         `json:"reply_to"`
}

// StoredOptions connect the queue to the server of the administration.
type StoredOptions struct {
	Sealer Sealer
	ListID string
	// Outward decides which addresses a stored server may reach (D4).
	Outward outward.Options
	// Environment is the server of the environment, and Lock what sets it; Lock is nil when
	// the environment names no server.
	Environment config.SMTP
	Lock        *Lock
}

// serverRow is the stored row, the password still sealed.
type serverRow struct {
	found     bool
	server    Server
	sealed    []byte
	updatedAt time.Time
}

// The row is read with its queries written out, so no SQL is put together at run time.
const (
	selectServer = `SELECT host, port, tls, username, password_sealed, from_address, from_name, reply_to, updated_at
		FROM mail_server WHERE id`
	selectServerLocked = selectServer + ` FOR UPDATE`
)

func readServer(ctx context.Context, q db.Querier, query string) (serverRow, error) {
	var r serverRow
	err := q.QueryRow(ctx, query).Scan(&r.server.Host, &r.server.Port, &r.server.TLS, &r.server.Username, &r.sealed,
		&r.server.FromAddress, &r.server.FromName, &r.server.ReplyTo, &r.updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return serverRow{server: Server{Port: defaultSubmission, TLS: config.SMTPTLSStart}}, nil
	}
	if err != nil {
		return serverRow{}, err
	}
	r.found = true
	r.server.PasswordSet = r.sealed != nil
	return r, nil
}

// auditFields are the fields a change compares. The password is its sealed form, so it shows
// as changed exactly when a new one was sealed or it was removed, and never with a value.
func (r serverRow) auditFields() map[string]any {
	if !r.found {
		return nil
	}
	return map[string]any{"host": r.server.Host, "port": r.server.Port, "tls": r.server.TLS,
		"username": r.server.Username, "password": r.sealed, "from_address": r.server.FromAddress,
		"from_name": r.server.FromName, "reply_to": r.server.ReplyTo}
}

// UseStoredServer connects the queue to the server of the administration. Without a server
// from the environment, the queue sends through the stored one from the next Reload on.
func (s *Service) UseStoredServer(o StoredOptions) { s.stored = &o }

// Locked reports whether the environment holds the server, so the administration cannot.
func (s *Service) Locked() bool { return s.stored != nil && s.stored.Lock != nil }

// Server shows the server in force. It never holds the password.
func (s *Service) Server(ctx context.Context) (ServerView, error) {
	if s.stored == nil {
		return ServerView{Source: SourceNone}, nil
	}
	if s.Locked() {
		return environmentView(s.stored.Environment, s.stored.Lock), nil
	}
	r, err := readServer(ctx, s.pool, selectServer)
	if err != nil {
		return ServerView{}, err
	}
	v := ServerView{Server: r.server, Source: SourceNone}
	if r.found {
		v.UpdatedAt = &r.updatedAt
	}
	if r.server.Host != "" {
		v.Source = SourceDatabase
	}
	return v, nil
}

// environmentView shows the environment's server as the section shows a stored one. Its
// SMTP_FROM may hold a name as well as the address.
func environmentView(c config.SMTP, lock *Lock) ServerView {
	v := ServerView{Source: SourceEnvironment, Locked: lock, Server: Server{Host: c.Host, Port: c.Port, TLS: c.TLS,
		Username: c.Username, PasswordSet: c.Password != "", FromAddress: c.From, ReplyTo: c.ReplyTo}}
	if a, err := mail.ParseAddress(c.From); err == nil {
		v.FromAddress, v.FromName = a.Address, a.Name
	}
	return v
}

// Changeable refuses a change while the environment holds the server (D1).
func (s *Service) Changeable() error {
	if s.stored == nil {
		return errors.New("mail: no store for the mail server")
	}
	if s.Locked() {
		return apperr.Conflict("mail_server_locked",
			"The mail server is set by "+s.stored.Lock.Setting+". Change it there, or remove it there to set the server here.")
	}
	return nil
}

// SetServer stores the server a system administrator saved; the route and its handler check
// who, the fresh login and the second factor (D3). It records what changed in the same
// transaction, the user name and the password without their values, and this node sends
// through it at once.
func (s *Service) SetServer(ctx context.Context, c identity.Caller, ch ServerChange) (ServerView, error) {
	if err := s.Changeable(); err != nil {
		return ServerView{}, err
	}
	clean, err := s.check(ch)
	if err != nil {
		return ServerView{}, err
	}
	if err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return s.store(ctx, tx, c, clean) }); err != nil {
		return ServerView{}, err
	}
	if err := s.Reload(ctx); err != nil {
		return ServerView{}, err
	}
	return s.Server(ctx)
}

// store writes a checked change inside tx, with its audit and outbox events.
func (s *Service) store(ctx context.Context, tx pgx.Tx, c identity.Caller, clean ServerChange) error {
	before, err := readServer(ctx, tx, selectServerLocked)
	if err != nil {
		return err
	}
	sealed, err := s.newPassword(before.sealed, clean.Password)
	if err != nil {
		return err
	}
	if clean.TLS == config.SMTPTLSNone && sealed != nil {
		return errPlainLogin
	}
	after := serverRow{found: true, sealed: sealed, server: Server{Host: clean.Host, Port: clean.Port, TLS: clean.TLS,
		Username: clean.Username, FromAddress: clean.FromAddress, FromName: clean.FromName, ReplyTo: clean.ReplyTo}}
	if err := writeServer(ctx, tx, after); err != nil {
		return err
	}
	changes, err := settings.Changes(before.auditFields(), after.auditFields(), serverSafeFields)
	if err != nil {
		return err
	}
	if _, err := audit.Record(ctx, tx, c.Event(ActionServerChanged, "mail_server", "", "",
		map[string]any{"changes": changes})); err != nil {
		return err
	}
	_, err = outbox.Enqueue(ctx, tx, ActionServerChanged, map[string]any{"host_set": clean.Host != ""})
	return err
}

// writeServer stores the one row.
func writeServer(ctx context.Context, tx pgx.Tx, r serverRow) error {
	v := r.server
	_, err := tx.Exec(ctx, `INSERT INTO mail_server (id, host, port, tls, username, password_sealed, from_address,
		from_name, reply_to, updated_at) VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, now())
		ON CONFLICT (id) DO UPDATE SET host = EXCLUDED.host, port = EXCLUDED.port, tls = EXCLUDED.tls,
		username = EXCLUDED.username, password_sealed = EXCLUDED.password_sealed, from_address = EXCLUDED.from_address,
		from_name = EXCLUDED.from_name, reply_to = EXCLUDED.reply_to, updated_at = EXCLUDED.updated_at`,
		v.Host, v.Port, v.TLS, v.Username, r.sealed, v.FromAddress, v.FromName, v.ReplyTo)
	return err
}

var errPlainLogin = apperr.Invalid("A user name and password are only sent over an encrypted connection: choose STARTTLS or TLS from the start.")

// newPassword is the sealed password after a change: the one stored, a new one, or none.
func (s *Service) newPassword(stored []byte, p PasswordChange) ([]byte, error) {
	switch p.Action {
	case PasswordKeep:
		return stored, nil
	case PasswordRemove:
		return nil, nil
	}
	return s.stored.Sealer.Seal([]byte(p.Value), PasswordContext)
}

// check refuses a change that breaks a limit of the section, and returns it cleaned.
func (s *Service) check(ch ServerChange) (ServerChange, error) {
	ch.Host = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(ch.Host)), ".")
	ch.FromAddress, ch.ReplyTo = strings.TrimSpace(ch.FromAddress), strings.TrimSpace(ch.ReplyTo)
	ch.FromName, ch.Username = strings.TrimSpace(ch.FromName), strings.TrimSpace(ch.Username)
	if err := s.checkHost(ch.Host); err != nil {
		return ch, err
	}
	if err := checkConnection(ch); err != nil {
		return ch, err
	}
	if err := checkPassword(ch.Password); err != nil {
		return ch, err
	}
	return ch, checkSender(ch)
}

// checkConnection checks the port, the encryption and the login that goes over it.
func checkConnection(ch ServerChange) error {
	if ch.Port < 1 || ch.Port > maxPort {
		return apperr.Invalid("The port is a number from 1 to 65535.")
	}
	switch ch.TLS {
	case config.SMTPTLSStart, config.SMTPTLSImplicit, config.SMTPTLSNone:
	default:
		return apperr.Invalid("The encryption is STARTTLS, TLS from the start, or none.")
	}
	if !oneLineOf(ch.Username, maxLineRunes) {
		return apperr.Invalid("The user name is one line of at most 200 characters.")
	}
	if ch.TLS == config.SMTPTLSNone && ch.Username != "" {
		return errPlainLogin
	}
	return nil
}

// checkSender checks what a mail says it comes from.
func checkSender(ch ServerChange) error {
	if !oneLineOf(ch.FromName, maxLineRunes) {
		return apperr.Invalid("The sender name is one line of at most 200 characters.")
	}
	if ch.Host != "" && ch.FromAddress == "" {
		return apperr.Invalid("A mail server needs a sender address.")
	}
	if !bareAddress(ch.FromAddress) || !bareAddress(ch.ReplyTo) {
		return apperr.Invalid("The sender and reply-to addresses look like wiki@example.com, without a name.")
	}
	return nil
}
func checkPassword(p PasswordChange) error {
	switch p.Action {
	case PasswordKeep, PasswordRemove:
		return nil
	case PasswordSet:
		if p.Value == "" || !oneLineOf(p.Value, maxPasswordRunes) {
			return apperr.Invalid("A new password is one line of at most 1024 characters.")
		}
		return nil
	}
	return apperr.Invalid("Say whether to keep, set or remove the password.")
}

// checkHost accepts a name or an address, or nothing for mail off. An address of this machine
// or of a private network is refused unless outgoing calls may reach one (D4); a name that
// resolves to one is refused when connecting.
func (s *Service) checkHost(host string) error {
	if host == "" {
		return nil
	}
	if len(host) > maxHostLength {
		return apperr.Invalid("The host is a name such as smtp.example.com, without a scheme or a port.")
	}
	inside := false
	if a, err := netip.ParseAddr(host); err == nil {
		inside = !s.stored.Outward.Allows(a)
	} else if !hostName.MatchString(host) {
		return apperr.Invalid("The host is a name such as smtp.example.com, without a scheme or a port.")
	} else {
		inside = !s.stored.Outward.AllowPrivate && (host == "localhost" || strings.HasSuffix(host, ".localhost"))
	}
	if inside {
		return apperr.Invalid("The mail server is on this machine or a private network, which outgoing connections may not reach. " +
			"Set KENWERK_OUTWARD_ALLOW_PRIVATE, or set the server in the environment.")
	}
	return nil
}

func oneLineOf(text string, limit int) bool {
	return utf8.RuneCountInString(text) <= limit && !strings.ContainsAny(text, "\r\n\x00")
}

// bareAddress accepts nothing, or one address without a name or anything around it.
func bareAddress(text string) bool {
	if text == "" {
		return true
	}
	a, err := mail.ParseAddress(text)
	return err == nil && a.Name == "" && a.Address == text
}

// storedState is the stored server this node sends through, as it last read it.
type storedState struct {
	sender    Sender // nil while no host is stored: mail off
	updatedAt time.Time
}

// Reload reads the stored server again and sends through it from now on. It opens the
// password only when the row changed. Every node calls it every few seconds (D5).
func (s *Service) Reload(ctx context.Context) error {
	if s.stored == nil || s.Locked() {
		return nil
	}
	r, err := readServer(ctx, s.pool, selectServer)
	if err != nil {
		return err
	}
	if current := s.state.Load(); current != nil && current.updatedAt.Equal(r.updatedAt) {
		return nil
	}
	if r.server.Host == "" {
		s.state.Store(&storedState{updatedAt: r.updatedAt})
		return nil
	}
	cfg := config.SMTP{Host: r.server.Host, Port: r.server.Port, TLS: r.server.TLS, Username: r.server.Username,
		From: fromHeader(r.server), ReplyTo: r.server.ReplyTo}
	if r.sealed != nil {
		plain, err := s.stored.Sealer.Open(r.sealed, PasswordContext)
		if err != nil {
			return err
		}
		cfg.Password = string(plain)
	}
	sender := SMTP{Config: cfg, ListID: s.stored.ListID, Dialer: s.stored.Outward.Dialer(smtpTimeout)}
	s.state.Store(&storedState{sender: sender, updatedAt: r.updatedAt})
	return nil
}

// fromHeader is the sender as the From line writes it.
func fromHeader(v Server) string {
	if v.FromName == "" {
		return v.FromAddress
	}
	return (&mail.Address{Name: v.FromName, Address: v.FromAddress}).String()
}

// TestResult is the outcome of a test mail: delivered, or the step that failed with what the
// server or the network said.
type TestResult struct {
	Delivered bool   `json:"delivered"`
	To        string `json:"to"`
	Step      Step   `json:"step,omitempty"`
	Error     string `json:"error,omitempty"`
}

// SendTest sends one mail now through the server in force to the person who asked, and
// records the outcome without the server's answer (D6). It goes past the queue.
func (s *Service) SendTest(ctx context.Context, c identity.Caller, to, instance string) (TestResult, error) {
	sender := s.current()
	if sender == nil {
		return TestResult{}, apperr.Conflict("mail_off", "No mail server is set.")
	}
	m := Message{To: to, Subject: "Test mail from " + instance, Reason: KindTest,
		Text: "This mail shows that " + instance + " can send mail through its mail server.",
		HTML: "<p>This mail shows that " + htmlEscaper.Replace(instance) + " can send mail through its mail server.</p>"}
	result := TestResult{Delivered: true, To: to}
	if err := sender.Send(ctx, m); err != nil {
		result = TestResult{To: to, Step: StepConnect, Error: testError(err)}
		var step *StepError
		if errors.As(err, &step) {
			result.Step = step.Step
		}
	}
	details := map[string]any{"delivered": result.Delivered}
	if !result.Delivered {
		details["step"] = result.Step
	}
	if err := audit.RecordStandalone(ctx, s.pool, c.Event(ActionServerTested, "mail_server", "", "", details)); err != nil {
		return TestResult{}, err
	}
	return result, nil
}

var htmlEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")

// testError is the cause of a failed test as the administrator reads it: the server's own
// answer, or what the network said, with a refused address put in words.
func testError(err error) string {
	if errors.Is(err, outward.ErrRefused) {
		return "The address of the mail server is on this machine or a private network, which outgoing connections may not reach."
	}
	// textproto quotes the text of the answer; the administrator reads it as the server wrote it.
	var answer *textproto.Error
	if errors.As(err, &answer) {
		return fmt.Sprintf("%03d %s", answer.Code, strings.ReplaceAll(answer.Msg, "\n", " "))
	}
	var step *StepError
	if errors.As(err, &step) {
		return step.Err.Error()
	}
	return err.Error()
}
