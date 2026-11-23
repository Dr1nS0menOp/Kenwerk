# 101: The identity provider, the helpers, the metrics token and the name, set in the administration

Status: built
Phase: before 1.0 (wave ST1)

## Problem

Kenwerk is a GUI and API first product. Spec 098 moved the mail server from the environment into the administration and its API, and sorted every other setting that was still environment-only. Six of those are settings an administrator needs while the installation runs, and that an installation without a shell cannot set today: the identity provider (`KENWERK_OIDC_*`), the PDF helper (`KENWERK_PDF_URL`, `KENWERK_PDF_PASSWORD`), the office service (`KENWERK_COLLABORA_URL`), the drawing service (`KENWERK_DRAWING_URL`), the metrics token (`KENWERK_METRICS_TOKEN`) and the instance name (`KENWERK_INSTANCE_NAME`). This spec moves them into the administration and the API with the pattern of spec 098, and lists what stays in the environment and why.

## Study

### How the six are set today

| Setting | Read where | Used how |
|---|---|---|
| `OIDC_ISSUER`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_DISPLAY_NAME`, `_AUTO_CREATE`, `_ALLOW_UNVERIFIED_EMAIL`, `_GROUPS_CLAIM` | `app.New` builds one `sso.Provider`, or none | Discovery on first use, cached; accounts are linked by issuer and subject (`user_identities`), so another issuer is another provider. The login page shows the button by `DisplayName`. |
| `PDF_URL`, `PDF_PASSWORD` | `exchange.Options`, fixed fields | PDF export, office previews through its LibreOffice, the helper check every minute. Plain `http.DefaultClient`, no `internal/outward`. |
| `COLLABORA_URL` | `exchange.Options` | Office previews in place of the PDF helper (ADR-026); no password, Collabora checks the caller's host. |
| `DRAWING_URL` | `config.parseDrawingURL`: another origin than `PUBLIC_URL`, no path | The browser frames it; the Content-Security-Policy names it in `frame-src`, built once at start. `/me` and `/system/capabilities` report it. |
| `METRICS_TOKEN` | `httpapi.handleMetrics` | Empty = no `/metrics` route at all (spec 021, D2); compared in constant time. |
| `INSTANCE_NAME` | many places, fixed at start | The subject of mail, the test mail, the authenticator label (TOTP issuer), `/system/info`, the passkey prompt, the `List-Id` header, the restore confirmation and the instance row made at the first start. Look (spec 013) already has a separate name for the screens, which falls back to "Kenwerk". |

### What spec 098 settled and this spec reuses

The environment wins as a whole and the administration shows it locked, with the setting and where it is written (D1). A secret is sealed with the envelope keys, never returned, recorded in the audit only as changed, and reached by the key rotation (D2). Every change is a system administrator's, with a login at most 10 minutes old and a second factor (D3). An address a system administrator types reaches only what `internal/outward` allows (D4). Every node rereads within 5 seconds through the reread of spec 075 (D5). The data lives in a table of its own, so the settings table keeps holding no secret (D8). The types `Lock` and the keep/set/remove secret change move from `internal/mail` to `internal/settings`, so both waves use one of each; `internal/mail` keeps its names as aliases.

### Options

**Where the five connections are stored.**

| Option | For | Against |
|---|---|---|
| A. A table per connection, each owned by the module that uses it (`sso`, `exchange`, ...) | Close to the user | Five tables, five copies of the same check, store and reread; the drawing service and the metrics token have no module of their own |
| **B. One table `connections` of one row, owned by a new module `internal/connections`, with one part per connection** | One check, one store, one reread, one view; the users (`sso`, `exchange`, `httpapi`) get the values in force and never read the table | One more module |
| C. Sections of the settings table | No migration | Three of them hold secrets, which spec 090 keeps out of that table |

**Choice: B.**

**The instance name.** Look already stores a name and the API sets it (`PUT /admin/settings/look`). A second store would be a second way, so the name stays in Look and becomes the one name: the environment's name, when set, wins and locks Look's field; else Look's name; else "Kenwerk".

## Behaviour

### Where each setting shows

| Part | Section (blueprint) | Fields |
|---|---|---|
| **Identity provider** | Security, Login (ADM-207, beside ADM-140) | Issuer address, client ID, client secret (set / not set; Keep, Change, Remove), name on the login button, make an account at a first login, accept an address the provider does not mark verified, claim with the groups |
| **Helper services** | Instance, General (ADM-208) | PDF helper address and its password (set / not set; Keep, Change, Remove); office service address; drawing service address |
| **Metrics** | Instance, General (ADM-209) | Token (set / not set; Keep, Change, Remove), with **Make a token**, which fills the field with 32 random bytes from the browser so it can be copied into the scraper before saving |
| **Name** | Look (ADM-013) | The existing field; locked while the environment sets it |

1. Each part is a unit with its own **Save** and **Reset changes** (`SaveReset`, NAV-163). A secret never shows: the field says set or not set, with **Keep**, **Change** (an empty field) or **Remove**, as the mail password does.
2. Saving asks for a second factor in the same form (`ConfirmFields`), with a login at most 10 minutes old. Only a system administrator sees the parts enabled; an administrator sees the values muted, with a line that only a system administrator changes them (ADM-094).
3. **Locked.** While the environment or the configuration file sets a connection, its part shows the value in force read-only under a notice: "The identity provider is set by KENWERK_OIDC_ISSUER (environment). Change it there, or remove it there to set it here." The helpers lock one by one: `PDF_URL` locks the PDF helper and its password, `COLLABORA_URL` the office service, `DRAWING_URL` the drawing service. `METRICS_TOKEN` locks the token. A setting of a unit without its key, such as `PDF_PASSWORD` without `PDF_URL` or `OIDC_CLIENT_ID` without `OIDC_ISSUER`, locks nothing, as for mail.
4. **The name.** While `KENWERK_INSTANCE_NAME` is set in the environment or the configuration file, Look shows that name in its field, muted, with the same notice. A change of the name is then refused (`409 instance_name_locked`); the rest of Look saves as before.
5. An empty address turns its connection off: no login button, no PDF, office previews through the PDF helper or none, no drawing, no `/metrics`.

### Limits

| Field | Rule |
|---|---|
| Issuer | `https://` (or `http://` with `KENWERK_OUTWARD_ALLOW_PRIVATE`), a host, an optional path, no user, query or fragment, at most 2048 characters; kept exactly as typed apart from spaces, because the provider must name the same issuer; empty = off |
| Client ID | one line, at most 255 characters, required with an issuer |
| Client secret | one line, at most 1024 characters; required with an issuer (set now or kept) |
| Button name | one line, at most 100 characters; empty = "Single sign-on" |
| Groups claim | empty, or letters, digits and `_ . : / -`, at most 100 characters |
| PDF helper, office service | as the issuer, without the trailing slash; empty = off |
| PDF password | one line, at most 1024 characters |
| Drawing service | as `KENWERK_DRAWING_URL`: `http(s)://host[:port]`, no path, another origin than the public address (one check, `config.ParseDrawingURL`) |
| Metrics token | 32 to 256 characters of the bearer token alphabet (RFC 6750, `token68`) |
| Name | Look's existing rule: one line, at most 200 characters, no `<` or `>` |

An address of this machine or of a private network is refused when saving (`localhost`, `*.localhost`, a loopback, private, link-local or reserved number), unless `KENWERK_OUTWARD_ALLOW_PRIVATE` is on; a name that resolves to one is refused when connecting. The drawing service is reached by the browser, not the server, so it keeps the rule of the environment.

### When a change takes effect

6. On the node that saved: at once. On every other node: within 5 seconds, through the reread of spec 075. No restart, for every part.
7. **Identity provider.** A new provider is built when any of its fields changes, so discovery runs again on the next login; logins started before the change fail and start again. Accounts are linked by issuer and subject, so a new issuer starts new links and the old ones stay for a return to the old issuer.
8. **Helpers.** The next export, preview and helper check use the new address; one running at the moment of the change finishes with the old one.
9. **Drawing.** The Content-Security-Policy is built per answer from the address in force, so a page loaded after the change frames the new service; a page already open keeps the old one until it is loaded again.
10. **Name.** Mail, the test mail, the authenticator label of a new enrolment, `/system/info` and the screens use it within 30 seconds (the cache of the look). Four places keep the name the process started with, on purpose: the passkey prompt (the relying party is made once at start), the `List-Id` header (mail filters depend on it not moving), the restore confirmation (`kenwerk restore` asks for the same name from the configuration it reads, so the console and the command line ask for one name), and the instance row of the first start. The operations guide says so; Look keeps its field as it was, so its form does not grow a line for a detail of four places.

## Permissions and audit

- **Read** (`GET /api/v1/admin/connections`): an administrator, also through a token with the `admin:read` scope, as the mail server (spec 098). Never a secret, its sealed form or its length: only `client_secret_set`, `password_set`, `token_set`.
- **Change** (`PUT /api/v1/admin/connections/{identity-provider,pdf,office,drawing,metrics}`): a system administrator in a signed-in session, logged in within 10 minutes (`Sensitive`), with a second factor checked in the handler. A locked part is refused before the code is spent (`409 connection_locked`). No grant means no access: a member, an administrator, a token and a session without a second factor are refused.
- **Audit.** Each change records `connection.changed` in the same transaction, with `part` and `changes` as spec 090 writes them: addresses, client ID, button name, the two switches and the groups claim before and after; the client secret, the PDF password and the metrics token only as `{"redacted": true}` when they changed. An outbox event `connection.changed` with the part goes with it. A change of the name stays `settings.updated` of Look, as today.
- **Logs.** No secret is logged; a failed reread logs the error of the key, never a value.

## Data

Migration 0079 (expand) adds `connections`: one row (`id boolean PRIMARY KEY CHECK (id)`) with the seven fields of the provider (`oidc_client_secret_sealed bytea`), `pdf_url`, `pdf_password_sealed bytea`, `collabora_url`, `drawing_url`, `metrics_token_sealed bytea` and `updated_at`. The previous release reads nothing of it. The three sealed columns use the purposes `identity provider client secret`, `pdf helper password` and `metrics token`, and join `sealedColumns`, so `kenwerk key reseal` and `kenwerk key check` reach them.

## Through the API

| Route | Rule | Scope (`scopes.go`) | What it does |
|---|---|---|---|
| `GET /api/v1/admin/connections` | `permission:administrator` | `admin:read` | Every part in force: `identity_provider`, `pdf`, `office`, `drawing`, `metrics`, each with `source` (`database`, `environment` or `none`) and `locked` (`{"setting", "source"}` or null), and `updated_at` |
| `PUT /api/v1/admin/connections/identity-provider` | `sensitive permission:system_administrator`, a second factor in the body | `admin:write` | Body: `issuer`, `client_id`, `client_secret` (`{"action": "keep" \| "set" \| "remove", "value"}`), `display_name`, `auto_create`, `allow_unverified_email`, `groups_claim`, `code` |
| `PUT /api/v1/admin/connections/pdf` | as above | `admin:write` | `url`, `password` (keep/set/remove), `code` |
| `PUT /api/v1/admin/connections/office` | as above | `admin:write` | `url`, `code` |
| `PUT /api/v1/admin/connections/drawing` | as above | `admin:write` | `url`, `code` |
| `PUT /api/v1/admin/connections/metrics` | as above | `admin:write` | `token` (keep/set/remove), `code` |
| `GET /api/v1/admin/instance-name` | `permission:administrator` | `admin:read` | `name` in force, `source` (`look`, `environment` or `default`), `locked` |
| `GET`/`PUT /api/v1/admin/settings/look` | as before | as before | The name with the rest of Look; `409 instance_name_locked` for a change of a locked name |

Every change answers the whole view, as the read does. A token reads; a change stays a session's, as every change of the administration (spec 085, spec 096 D5).

## Load budget

- **Every node:** one primary-key read of one row every 5 seconds beside the rereads of spec 075 and 098; the secrets are opened only when `updated_at` changed. The name adds no read: it comes from the look, which is cached for 30 seconds already.
- **Saving:** one locked read and one write of one row, one audit row and one outbox row; a few a year.
- **Requests:** the policy header is one string join per answer of the web app; `/metrics`, the login button and the helpers read a pointer. Nothing on saving pages, reading or search. Within ARC-233 and the 4x headroom.

## Acceptance criteria

- [x] Without a grant nothing changes: a member, an administrator and a token with every scope are refused on every change route, and nothing is stored (`TestNobodyButASystemAdministratorChangesAConnection`).
- [x] A system administrator without a second factor, or with an old login, is refused (`TestAConnectionChangesOnlyWithAFreshLoginAndASecondFactor`).
- [x] No read holds a secret: the read through a session and through a token holds neither the client secret, the PDF password, the metrics token nor their sealed forms, and neither does the audit (`TestNoReadNoAuditAndNoLogOfTheConnectionsHoldsASecret`).
- [x] An issuer, helper or drawing address that breaks a limit is refused, as is a private address without `KENWERK_OUTWARD_ALLOW_PRIVATE` (`TestAnInvalidAddressIsRefused`, `internal/connections`).
- [x] With the environment setting a part, it shows locked and its change is refused without spending the code; the other parts stay open (`TestTheEnvironmentLocksItsConnections`).
- [x] The name of the environment locks Look's field and refuses its change (`TestTheEnvironmentLocksTheName`).
- [x] Secrets are sealed, kept, removed, and audited without their values (`TestSecretsAreSealedAndAuditedWithoutTheirValues`); the key rotation reaches them (`TestEverySealedColumnIsKnown`, `TestResealReachesTheSecretsOfTheConnections`).
- [x] A change is used without a restart, at once on the saving node and on another node after its reread: the login button, the PDF helper, the drawing frame and `/metrics` (`TestAChangedIdentityProviderIsUsedWithoutARestart`, `TestChangedHelpersAndTheTokenAreUsedWithoutARestart`).
- [x] A stored helper reaches only allowed addresses (`TestAStoredHelperReachesOnlyAllowedAddresses`, `TestAStoredProviderReachesOnlyAllowedAddresses`).
- [x] The section: the parts, the locked notice and the guard (`web/e2e/admin-connections.spec.ts`, design pictures `admin-login-provider`, `admin-general-helpers`, `admin-connections-locked`).

## How the product owner tests it

1. Log in as a system administrator with an authenticator app. Open Administration, Security, Login: the part **Identity provider** is at the foot.
2. Fill in the issuer, client ID and client secret of a provider, press Save, enter the code. Log out: the login page shows the button with its name. Log in through it.
3. Open Instance, General: set the PDF helper's address and password, save with a code. A page now offers PDF. Remove the address and save: PDF is gone within 5 seconds.
4. Under Metrics press **Make a token**, copy it into the scraper, save with a code. The scraper reads `/metrics`.
5. Open Administration, Audit: `connection.changed` lists what changed, and the secrets as redacted.
6. On an installation with `KENWERK_OIDC_ISSUER` or `KENWERK_INSTANCE_NAME` set, the parts show read-only with the notice naming the setting.

## Upgrade notes

- An installation that sets these in the environment or the configuration file behaves as before, and the parts show locked. To move a part to the administration, remove its key setting (`OIDC_ISSUER`, `PDF_URL`, `COLLABORA_URL`, `DRAWING_URL`, `METRICS_TOKEN`) and restart, then fill in the part.
- **The name.** An installation that sets `KENWERK_INSTANCE_NAME` and a different name in Look now shows the environment's name on the screens too. One that sets only Look's name now also uses it in mail and for new authenticator enrolments. Existing authenticator entries keep their label.
- During a rolling upgrade a node of the previous release keeps the values it started with.

## Decided on the product owner's behalf on 2026-11-23, may be overruled

- **D1. One module and one row** (option B): `internal/connections` owns `connections` and gives the values in force to the modules that use them; the name stays in Look.
- **D2. The environment wins per unit.** The identity provider is one unit (as the mail server); the helpers lock one by one, since each is its own service and an installation often runs one of them in Compose and not the others. The metrics token and the name are units of one.
- **D3. Every change is guarded**, also the drawing service, which spec 098's appendix thought needed no guard: the framed service sees every drawing and sits inside the editor, so moving it is as weighty as moving the PDF helper. Reading stays an administrator's.
- **D4. Outgoing rules for what the server reaches.** A stored issuer, PDF helper and office service connect only through `internal/outward`; a provider or helper on the own network needs `KENWERK_OUTWARD_ALLOW_PRIVATE`, or stays in the environment, as for mail. Plain `http` follows the same switch. Discovery of a stored issuer follows no redirect.
- **D5. Secrets.** The client secret, the PDF password and the metrics token are sealed and never returned. The metrics token is chosen by the administrator, or made in the browser with **Make a token**, so no answer of the server ever holds it.
- **D6. No test button in this wave.** Spec 098 needed one because a mail that never arrives says nothing; here the result shows at once: the login button leads to the provider, System health checks every helper each minute, and a scraper says when it is refused. A test of the identity provider is left for a later wave if it is asked for.
- **D7. The name follows Look, the environment locks it.** Four places keep the start name on purpose (behaviour 10).
- **D8. One audit action**, `connection.changed` with the part, instead of one per part.
- **D9. The section.** The identity provider joins Login, where the login methods are chosen; the helpers and the metrics token join General, so no new section moves the administration's sidebar.
- **D10. The read is `admin:read`**, as the mail server's read (spec 098): it holds addresses and names of systems, never a secret, and `admin:system` is a scope no token can choose yet (spec 096), so a script could not read the connections at all.
- **D11. A check comes after the code**, as for the mail server: a change that breaks a limit spends the code it came with. The lock is checked before the code, so a change that cannot be made at all costs nothing.

## What stays in the environment, and why

Every other setting stays as spec 098's appendix sorts it: `CONFIG_FILE`, `ROLE`, `HTTP_ADDR`, `PUBLIC_URL`, `TRUSTED_PROXIES`, the three database addresses, `NATS_URL` and `NATS_REPLICAS`, `DATA_DIR`, `MASTER_KEY_FILE`, `PUBLISH_DIR`, `MIGRATE_ON_START`, `CONTRACT_GRACE`, `UPGRADE_BACKUP_MAX_AGE`, `SHUTDOWN_DELAY`, the session ceilings, `PASSWORD_BLOCKLIST_FILE`, `EXAMPLE_SPACE`, `OUTWARD_ALLOW_PRIVATE`, `LOG_LEVEL`, the tracing settings, `COLLAB_URL` and `COLLAB_TOKEN`, and the variables of the backup service and of Compose. In short: they are read before the database or the console exists, they are the fence around what the console may reach, or they are a secret another process reads from its own environment. `LOG_LEVEL` and the backup schedule already have their place in the console. Nothing else in `internal/config` is environment-only and safe to change while running.

## Supersedes

- Spec 098, the appendix rows `INSTANCE_NAME`, `OIDC_*`, `METRICS_TOKEN`, `PDF_URL`, `PDF_PASSWORD`, `COLLABORA_URL` and `DRAWING_URL`: built here. Its row `DRAWING_URL` ("not guarded beyond an administrator"): see D3.
- Spec 058, 1.2, the row `OIDC_*`: the identity provider moves to the console, its secret sealed.
- Spec 081, "Through the API": the Login and General rows gain the routes above; "identity providers are set in the environment" no longer holds.

## Provenance

Own design, on specs 004, 013, 015, 021, 034, 058, 075, 076, 081, 085, 090, 096 and 098. OpenID Connect Discovery 1.0, section 4.3, on the issuer that must match exactly (openid.net, consulted 2026-11-23). RFC 6750, section 2.1, on the `token68` alphabet of a bearer token (rfc-editor.org, consulted 2026-11-23). Content-Security-Policy Level 3, `frame-src` (w3.org, consulted 2026-11-23).
