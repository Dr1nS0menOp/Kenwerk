# 098: The mail server, set in the administration

Status: built
Phase: before 1.0 (wave ML1)

## Problem

Kenwerk is a product run from its screens and its API. On 22 November 2026 the product owner asked for one gap to close: the mail server can only be set in the environment or the configuration file (`KENWERK_SMTP_*`), so whoever installs Kenwerk without a shell at hand cannot turn mail on, and whoever runs it cannot see why a test mail failed. This spec lets a system administrator set the mail server in Administration, Mail, and through the API, test it with a mail whose failure names the exact answer of the server, and keeps every installation that sets the server in its environment working as before. Its appendix sorts every other setting that is still environment-only, for the waves after this one.

## Study

### How mail is set today

| Part | Where | What it does |
|---|---|---|
| Settings | `internal/config`, `SMTP` | `KENWERK_SMTP_HOST`, `_PORT` (587), `_USERNAME`, `_PASSWORD`, `_FROM`, `_REPLY_TO`, `_TLS` (`starttls`, `implicit`, `none`), each also as `_FILE` and in the configuration file (spec 056). A host without `SMTP_FROM` refuses the start. An empty host means mail is off and waits in the queue. |
| Sender | `internal/mail`, `SMTP` | Drives `net/smtp` by hand, so STARTTLS is required when chosen (spec 010, D13). `PlainAuth` of the standard library refuses to send a password over a connection without TLS, except to `localhost`. |
| Queue | `internal/mail`, `Service` | Built once at start with the sender or nothing. `Configured()` is fixed for the life of the process; so is whether account mail (resets, invitations, sign-up) is sent at all: `identity.SetMailer` is only called when mail was set at start. |
| Test | `POST /api/v1/admin/mail/test` | Puts a test mail in the queue. A failure shows in the queue as one of three safe sentences ("could not be reached", "answered with an error", "could not be delivered"), never the server's answer. |
| Section | spec 081, `mail` in `views/admin-sections.ts` | Instance, Mail: a warning while no server is set, the four mail switches (`PUT /admin/settings`), the test button and the queue. |
| Sorting | spec 058, 1.2 | `SMTP_*` is "show only, secrets hidden", because "storing them in the database would put them in every backup and every database copy". |
| Guard | spec 076 | A change that lets more through is a system administrator's, with a login at most 10 minutes old (`Sensitive`) and a second factor checked in the handler (`confirmSecondFactor`). |
| Audit | spec 090 | `settings.updated` records each changed field before and after; a field not listed as safe is recorded `{"redacted": true}`. Spec 090 also says no runtime setting holds a secret. |
| Keys | `internal/keys`, ADR-011 | Envelope encryption: every value its own AES-256-GCM data key, wrapped by the key-encryption key from `master.key`, bound to a purpose. `app/keyrotation.go` lists every column that holds a sealed value, so a new master key reaches it (spec 034). |
| Outgoing | `internal/outward` | Every address an outgoing call reaches is checked at the moment of connecting: public addresses only, unless `KENWERK_OUTWARD_ALLOW_PRIVATE` (spec 015, D15). |
| Reread | `app/runtime.go` | Every node rereads the log level for a while and the disk thresholds every 5 seconds (spec 075). |

### What changes the old reason

Spec 058 kept the password out of the database because a database copy would carry it. Sealed with the envelope keys, a copy carries only ciphertext: the key file is not in the database and is backed up apart from it (blueprint 07). A copy of the database without the key file opens nothing, which is also how TOTP secrets and webhook secrets are kept.

### Options

**Where the server is stored.**

| Option | For | Against |
|---|---|---|
| A. A section in `settings`, the password a base64 field | No migration | The key rotation walks columns of sealed values; a field inside JSON needs SQL that rebuilds base64 by hand. Spec 090 keeps the settings table free of secrets. |
| **B. A table `mail_server` of one row, owned by `internal/mail`** | The sealed password is a column like every other sealed value; the rotation, the key check and the module boundary treat it as such | One migration |

**Choice: B.**

**When the environment also names a server.**

| Option | For | Against |
|---|---|---|
| **A. The environment wins, and the section shows the server read-only, with which setting locks it** | Every installation of today sends as before; nobody can take over mail from a browser where an operator chose otherwise | To use the section, the operator removes `KENWERK_SMTP_HOST` once |
| B. The section wins | One place | An upgrade changes nothing, but a later save in the browser silently overrules the operator |
| C. Field by field | Fine-grained | A server made of two sources is hard to reason about and to test |

**Choice: A.**

## Behaviour

### The section

1. Administration, Instance, Mail, gets a first part **Mail server** above the mail switches: host, port, encryption (STARTTLS, TLS from the start, none), user name, password, sender address, sender name and reply-to address, then **Save** and **Reset changes** (`SaveReset`), and a part **Test mail** with **Send a test mail**.
2. The password field never shows a password. It says "set" or "not set". The choice beside it is **Keep**, **Change** (shows an empty field) or **Remove**.
3. Saving asks for a second factor in the same form (`ConfirmFields`), and the login must be at most 10 minutes old; the dialog to log in again answers that by itself. Only a system administrator sees the form enabled; an administrator sees the values, and a line that only a system administrator changes them.
4. A host left empty turns mail off: account mail and notifications wait in the queue, as without a server today.
5. **Locked.** When the environment or the configuration file names `KENWERK_SMTP_HOST`, the section shows the server in force read-only, with a notice: "The mail server is set by KENWERK_SMTP_HOST in the environment (or: in the configuration file, line 5). Change it there, or remove it there to set the server here." The test button stays.
6. **Test mail.** Sends one mail at once, with the server in force, to the address of the person who presses it. The answer says either "Sent to you@example.com" or the step that failed and what the server said, such as "Logging in: 535 5.7.8 Authentication credentials invalid" or "Connecting: the address of the mail server is on a private network". Unsaved changes are not tested: the button is inactive while the form differs from what is stored, so the test proves what mail uses.
7. The test mail does not go through the queue and does not show in it.

### The server in use

8. A saved change is used by the node that saved it at once, and by every other node within 5 seconds, without a restart; the queue, account mail, backup failure mails and the "mail off" lines of the console follow it.
9. With the server from the section, a connection goes only to an address that `internal/outward` allows: never to a loopback, private, link-local or reserved address, unless `KENWERK_OUTWARD_ALLOW_PRIVATE` is on. Saving already refuses `localhost`, a name under `.localhost`, and such an address written as a number; a name that resolves to one is refused when connecting, so a name that changes between saving and sending gains nothing. A server from the environment is not limited, as before.
10. Encryption "none" takes no user name or password: they would cross the network in plain text, and `net/smtp` refuses to send them anyway.

### Limits

| Field | Rule |
|---|---|
| Host | a name or an address, at most 253 characters, no scheme, path, space or `@`; empty = off |
| Port | 1 to 65535 |
| Encryption | `starttls`, `implicit` or `none` |
| User name | one line, at most 200 characters; empty = no login; not with `none` |
| Password | one line, at most 1024 characters; not with `none` |
| Sender address | one address without a name, required with a host |
| Sender name | one line, at most 200 characters, may be empty |
| Reply-to | one address without a name, may be empty |

## Permissions and audit

- **Read** (`GET /api/v1/admin/mail/server`): an administrator, also through a token with the `admin` scope (spec 085, D2). The answer never holds the password, its sealed form or its length: only `password_set`.
- **Change** (`PUT /api/v1/admin/mail/server`): a system administrator, in a signed-in session (spec 085), logged in within 10 minutes (`Sensitive`), with a second factor checked in the handler as for spec 076. No grant means no access: an administrator, a member, a token and a session without a second factor are refused before the body is read.
- **Test** (`POST /api/v1/admin/mail/test`): an administrator in a signed-in session; at most 5 tests per person in 10 minutes on a node, then `429 rate_limited`.
- **Audit.** A change records `mail.server_changed` in the same transaction, with `changes` as spec 090 writes them: host, port, encryption, sender address, sender name and reply-to before and after; the user name and the password only as `{"redacted": true}` when they changed. A test records `mail.server_tested` with whether it was delivered and the step that failed, never the server's answer or an address. An outbox event `mail.server_changed` goes with the change.
- **Logs.** Neither the password nor the server's answer to a test is logged.

## Data

Migration 0077 (expand) adds `mail_server`: one row (`id boolean PRIMARY KEY CHECK (id)`) with host, port, encryption, user name, `password_sealed bytea`, sender address, sender name, reply-to, `updated_at` and `updated_by`. The previous release reads nothing of it, so both run side by side. The password is sealed with the purpose `mail server password` and joins `sealedColumns`, so `kenwerk key reseal` and `kenwerk key check` reach it.

Wave UR1 took 0076 first, so this one is 0077.

## Through the API

| Route | Rule | What it does |
|---|---|---|
| `GET /api/v1/admin/mail/server` | `permission:administrator` (a token with the `admin` scope reads it) | The server in force: `host`, `port`, `tls`, `username`, `password_set`, `from_address`, `from_name`, `reply_to`, `source` (`database`, `environment` or `none`), `locked` (`{"setting", "source"}` or null), `updated_at` |
| `PUT /api/v1/admin/mail/server` | `sensitive permission:system_administrator`, a second factor in the body | Body: the fields above, `"password": {"action": "keep" \| "set" \| "remove", "value": "..."}` and `"code"`. `409 mail_server_locked` while the environment sets the server |
| `POST /api/v1/admin/mail/test` | `session-only permission:administrator` | Sends a test mail now: `{"delivered": true, "to": ...}` or `{"delivered": false, "step": ..., "error": ...}`. `409 mail_off` without a server |
| `GET /api/v1/admin/mail` | `permission:administrator` | As before: `configured` and the queue |
| `GET`/`PUT /api/v1/admin/settings` | as before | The four mail switches |

A token reads the server; changing it stays a session's, as every change of the administration (spec 085), until the MCP spec decides otherwise.

## Load budget

- **Every node:** one primary-key read of one row every 5 seconds, beside the reread of spec 075; the password is opened only when `updated_at` changed. Negligible against ARC-233.
- **Saving:** one locked read and one write of one row, one audit row and one outbox row; a few a year.
- **Test:** one SMTP conversation, at most 5 per person per 10 minutes per node, bounded by the 30-second timeout of the sender.
- Nothing on saving pages, reading or search.

## Acceptance criteria

- [x] Without a grant nothing changes: a member, an administrator and a token with every scope are refused on the change route; the server stays as it was (`TestNobodyButASystemAdministratorChangesTheMailServer`).
- [x] A system administrator without a second factor, or with an old login, is refused (same test).
- [x] No read route returns the password: the answer of the read route through a session and through a token holds neither the password nor its sealed form (`TestNoReadOfTheMailServerHoldsThePassword`).
- [x] The password is stored sealed, kept when the form says keep, removed when it says remove; the audit row says it changed without a value; encryption none is refused while a password is stored (`TestThePasswordIsSealedAndAuditedWithoutItsValue`, `TestAStoredPasswordIsNeverSentWithoutEncryption`).
- [x] With `KENWERK_SMTP_HOST` set, the section shows the server of the environment as locked and a change is refused with `mail_server_locked` (`TestTheEnvironmentLocksTheMailServer`).
- [x] A change is used without a restart, at once on the saving node and on another node after its reread, also when mail is turned off (`TestAChangedMailServerIsUsedWithoutARestart`, `TestAnEmptyHostTurnsMailOffOnEveryNode`).
- [x] The test mail goes to the person who asks, through a local fake mail server, and a refusal of that server comes back with its step and its exact answer; past 5 tests the route answers 429 (`TestTheTestMailGoesToThePersonWhoAsks`, `TestTheTestMailReportsTheExactAnswerOfTheServer`, `TestTestMailsAreLimited`).
- [x] Saving refuses a loopback or private address, `localhost`, and a user name with encryption none; with `KENWERK_OUTWARD_ALLOW_PRIVATE` a private address is allowed (`TestAMailServerOnAnInsideAddressIsRefused`, `internal/mail`).
- [x] A stored server connects only to an address `internal/outward` allows (`TestAStoredServerConnectsOnlyToAllowedAddresses`).
- [x] The sealed password is reached by the key check and the reseal (`TestEverySealedColumnIsKnown`, `TestResealReachesTheMailServerPassword`).
- [x] The section: the form, the locked notice, the guard and the test (`web/e2e/admin-mail.spec.ts`, design pictures `admin-mail-server`, `admin-mail-locked`).

## How the product owner tests it

1. Log in as a system administrator with an authenticator app. Open Administration, Mail.
2. Fill in host, port, STARTTLS, user name, password and sender address of a real mail server. Press Save: the form asks for a code. Enter it. The page shows the password as set.
3. Press Send a test mail: the page says it was sent to you, and it arrives.
4. Change the password to a wrong one, save, and test again: the page says "Logging in:" and what the server answered.
5. Open Administration, Audit: `mail.server_changed` lists the fields that changed, and the password as redacted.
6. On an installation with `KENWERK_SMTP_HOST` in its environment, open Mail: the server shows read-only with the notice naming the setting.

## Upgrade notes

- An installation that sets `KENWERK_SMTP_HOST` behaves exactly as before; the section shows its server as locked.
- To move to the section: remove the `KENWERK_SMTP_*` variables, restart, and fill in the section.
- During a rolling upgrade a node of the previous release keeps the mail server it started with, and its test button still queues a test mail.

## Decided on the product owner's behalf on 2026-11-22, may be overruled

- **D1. The environment wins.** When `KENWERK_SMTP_HOST` is set, in the environment or the configuration file, its server is in force as a whole and the section shows it locked, with the setting and where it is written. Existing installations behave the same, and an operator's choice is never overruled from a browser. Other `KENWERK_SMTP_*` variables without a host lock nothing.
- **D2. The password is sealed, never read back.** Sealed with the envelope keys (purpose `mail server password`); no read route returns it, only `password_set`; the audit row records that it changed, without a value. It joins the key rotation.
- **D3. Every change is guarded, and is a system administrator's.** Mail can carry a phishing message to every person or leak password resets, so every change, not only a weaker one, needs system administration, a login at most 10 minutes old and a second factor (spec 076). Reading stays an administrator's.
- **D4. Outgoing-host rules.** A server set in the section reaches only the addresses `internal/outward` allows; private networks need `KENWERK_OUTWARD_ALLOW_PRIVATE`, as for webhooks. It needs no entry under Outgoing calls: that list is for addresses that people with less power choose, while only a confirmed system administrator sets the mail server. An operator whose mail relay sits on the internal network sets `KENWERK_OUTWARD_ALLOW_PRIVATE` or keeps the server in the environment.
- **D5. Reread on every node within 5 seconds.** Through the reread of spec 075, which already runs on every node; the saving node uses the change at once. No event is needed between nodes.
- **D6. The test sends at once, with what is saved.** A test of unsaved values would take a password and an address from a request and connect there, a second door around the guard of D3. The test reports the step and the server's answer, to the administrator only, and never to the log or the audit. Five tests per person per 10 minutes per node. The test through the queue goes: a test that cannot say why it failed was the reason for this wave.
- **D7. No password over a connection without TLS.** Encryption "none" refuses a user name and a password at saving, instead of failing at every mail.
- **D8. A table of its own** (option B above), so the sealed password is a column like the others and the settings table keeps holding no secret, as spec 090 says.
- **D9. Sender address and name apart.** The section asks for the address and the name separately; the environment's `SMTP_FROM` may still hold both. The reply-to address is in the section too, so nothing of the environment's server is missing.
- **D10. What the audit keeps.** Host, port, encryption, sender address, sender name and reply-to keep their values: they are what an investigation of a phishing mail needs, and they name a system, not a person. The user name may be a person's address and is redacted; the password always is.
- **D11. The rest of the environment's settings stays where it is for now.** The appendix sorts them; none moves in this wave.

## Supersedes

- Spec 058, 1.2, the row `SMTP_*`: SMTP moves to the console, sealed; `OIDC_*` stays as it was until its own wave.
- Spec 090, behaviour 3, the sentence that the SMTP password stays in the environment: it may now also be stored sealed in `mail_server`, which is not a runtime setting.
- Spec 081, the Mail row of "Through the API": the routes above.

## Appendix: every other setting that is environment-only today

The settings `config.FromEnvironment` reads, the backup service's own, and the trace exporter's, each sorted for the follow-up waves. "GUI + API" means it should move to the administration and the API in a later wave, with the guard and the environment-wins rule of this spec; "bootstrap" means it must stay in the environment or the configuration file. Nothing here is built in this wave.

| Setting | Sorting | Reason |
|---|---|---|
| `CONFIG_FILE` | bootstrap | It says where the other settings are. |
| `ROLE` | bootstrap | Decides what the process runs before the database is reached; per node. |
| `HTTP_ADDR` | bootstrap | The socket the console itself is served on; a wrong value makes the console unreachable to correct it. |
| `PUBLIC_URL` | bootstrap | Cookies, passkeys and every link are bound to it; a wrong value locks everyone out, the console included (spec 050). |
| `TRUSTED_PROXIES` | bootstrap | Decides which address a request comes from, and so the login limits; a wrong value from the browser could hide an attacker or lock out the administrator. |
| `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `LISTEN_DATABASE_URL` | bootstrap | The server cannot read from the database where the database is. |
| `NATS_URL`, `NATS_REPLICAS` | bootstrap | The event path must be in place before the first event; per cluster. |
| `DATA_DIR`, `MASTER_KEY_FILE`, `PUBLISH_DIR` | bootstrap | Folders of each node's disk; the key opens what the database holds, so it can never live there. `PUBLISH_DIR` must not be a value a person in a browser can point anywhere (spec 058). |
| `MIGRATE_ON_START`, `CONTRACT_GRACE`, `UPGRADE_BACKUP_MAX_AGE` | bootstrap | They decide what a start does to the database before the console exists. |
| `SHUTDOWN_DELAY` | bootstrap | Read by the process at its start and at its end, outside any request. |
| `SESSION_IDLE_TIMEOUT`, `SESSION_MAX_AGE` | bootstrap | The ceiling the console's Access section works within; a ceiling set from the console would be no ceiling. |
| `PASSWORD_BLOCKLIST_FILE` | bootstrap | A file of the node's disk; a list in the console would be a new feature of its own. |
| `EXAMPLE_SPACE` | bootstrap | Read once, when a new instance is made; General already offers to remove the example space. |
| `OUTWARD_ALLOW_PRIVATE` | bootstrap | It is the fence around what the console may make the server reach; a fence the console can open is none. |
| `LOG_LEVEL` | bootstrap, done | The level a process starts with; the console already sets a level for a while (spec 075). |
| `TRACING`, `TRACING_SAMPLE`, `OTEL_EXPORTER_OTLP_*` | bootstrap | The exporter is made at the start, before any request; its headers hold secrets for a collector the operator runs. |
| `INSTANCE_NAME` | GUI + API | Look already has an instance name for the screens; the environment's name still names mail and the list header. One name in Look, with this spec's environment-wins rule. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_DISPLAY_NAME`, `OIDC_GROUPS_CLAIM` | GUI + API | The same case as mail: an installation without a shell cannot connect its identity provider. The client secret is sealed as the mail password is; every change guarded as D3, because a wrong provider is a way in for everyone. |
| `OIDC_AUTO_CREATE`, `OIDC_ALLOW_UNVERIFIED_EMAIL` | GUI + API | With the provider; turning either on lets more through, so a guarded change. |
| `COLLAB_URL`, `COLLAB_TOKEN` | bootstrap | The token is shared with the collaboration service, which reads it from its own environment; one side in the console would split one secret over two places. |
| `METRICS_TOKEN` | GUI + API | A token the console could make and show once, as for service accounts; the scraper's configuration takes it. |
| `PDF_URL`, `PDF_PASSWORD`, `COLLABORA_URL` | GUI + API | Addresses of helper services and a password like the mail server's, sealed, guarded, connected through `internal/outward` with the same rule for private addresses. A later wave, together. |
| `DRAWING_URL` | GUI + API | An address the browser frames; the console can check it as config does (another origin than the public address). Not guarded beyond an administrator: it reaches only the browser. |
| `KENWERK_BACKUP_INTERVAL`, `KENWERK_BACKUP_KEEP` | done | The console's Backups section already sets both; the variables are the backup service's defaults (spec 058, 076). |
| `KENWERK_BACKUP_DIR`, `KENWERK_BACKUP_KEY_DIR` | bootstrap | Folders of the backup service's machine, which the server never reaches (spec 076, D1). |
| `KENWERK_BACKUP_IMAGE`, `KENWERK_IMAGE`, `KENWERK_BIND`, `KENWERK_PORT` | bootstrap | Read by Compose before any process exists. |

## Provenance

Own design, on specs 010, 015, 034, 056, 058, 075, 076, 081, 085 and 090. Go standard library documentation of `net/smtp` (`PlainAuth` and its refusal without TLS), `net/textproto` (`Error`) and `net` (`Dialer.Control`) (pkg.go.dev, consulted 2026-11-22). RFC 5321, sections 4.2 and 4.3.2, on reply codes (rfc-editor.org, consulted 2026-11-22). RFC 3207 on STARTTLS and RFC 8314 on implicit TLS for submission (rfc-editor.org, consulted 2026-11-22).
