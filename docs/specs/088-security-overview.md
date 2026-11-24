# 088: The security overview

Status: built (wave SO1, 2026-11-23), as an experimental part that starts off
Phase: a new part before 1.0, allowed by the product owner as an exception to the feature freeze of ADR-043, on the condition that it is experimental and off by default (wave SO1)

## Problem

An administrator who wants to know whether the installation is set up safely has to visit many screens: Users for who holds administration, Login and second factor for the rules, Backups for the last backup and restore test, Audit log for the chain and its witness, Configuration for the public address, and the documentation for what the database roles and the key that seals secrets should be. The summary's list of things that need attention names some of it, one fact at a time. Blueprint 03 asks for one screen that gathers the steps that make an installation safer, works out for each whether it is done, and leads to the screen where it is done (ADM-125 to ADM-128, ADM-191). This spec is that screen, and the route behind it, which an assistant reaches as well (spec 096).

The look stays ours: colours, icons, fonts and every value come from `tokens.css` (ADR-021, ADR-045). Only the arrangement follows the lines.

## Study

The plan of 2026-11-16 (the first version of this spec, on branch `wave-so1`) was written before wave SC4 landed. SC4 is on `main` now: the registry `web/src/views/admin-sections.ts`, `SettingsSection`, `Notice`, the Security group and every section a step links to exist. The study below is that plan's, brought up to date with two things decided since: every feature is reachable through the API and so through MCP (decided 2026-11-17), and the overview also covers tokens, public sharing and the key that seals secrets.

### What each line asks

| Line | Asks | Notes from the study |
|---|---|---|
| ADM-125 | A Security overview opens the Security group: steps in groups, each with a state the product works out (done, needs attention, not started), one line on why it matters, a count where it helps, and a link to where the step is done. Nobody ticks a step, the overview changes nothing, and nothing asks an outside server (SEC-900). Setting a step aside on purpose is open. | Read-only. Every state comes from facts the installation already holds. Setting aside waits (D9). |
| ADM-126 | The steps: two active administrators; an identity provider for login and provisioning; a second factor for administrators and members; a passkey for every administrator; rules for login and guests; the data controls looked at; https; two database roles; encrypted backups, a recent backup and a tested restore; the audit chain checked lately and its witness lines kept outside the host; rules for apps once apps exist. | Every step but apps is judged from today's data, without a migration. Apps do not exist, so their step is absent (D7). Tokens and the key that seals secrets join as steps of their own (D16, D17). |
| ADM-127 | A step that needs attention also shows on the summary's attention list. Under the steps, four shortcut cards: figures about account security, the audit log, the list of tokens, and the documentation. | One counted item on the summary (D5). Two of the four cards lead to screens that do not exist yet (ADM-192, ADM-194); they wait (D8). |
| ADM-128 | Groups under small bold headings; each step a full-width outlined row that is one link: a state tile, a bold title, a softer line, sub-steps as bullets, a small outlined count with a unit word and an arrow. Cards under the groups. No primary button. | `SecurityStep`, a new component, and SC4's `SettingsSection`. |
| ADM-191 | A switch at the end of the heading over the steps, off by default, hides the steps already done. | Kept in the address (D11). |
| ADM-072 | The Security group of the sidebar starts with Security overview. | A registry entry, first in Security, present only while the part is on. |
| ADM-067, ADM-115 | An experimental section that is on carries the Experimental mark; one that is off stays hidden. | SC4 builds both through the registry. |

### Signals that already exist

| Signal | Where it lives | Used by step |
|---|---|---|
| Who holds `administrator`, directly or through a group, active and not ended | `global_grants`, `group_members`, `users` (identity) | Two administrators, administrators' factors |
| Passkeys and authenticator apps of an account | `webauthn_credentials`, `totp_credentials` (identity) | Second factor, administrators' factors |
| Where an account comes from (`local`, `oidc`, `scim`) | `users.source` | Only local accounts count, as `needsSecondFactor` does (D14) |
| The second-factor rule, its 14-day grace, the idle time | settings section `access`, `instance.created_at` (SEC-164) | Second factor, rules for login |
| Guests and when their accounts end | `users` (`type = 'guest'`, `expires_at`) | Guests |
| Login through an identity provider | the answering node's provider (`sso.Switch`) | Identity provider |
| Provisioning tokens | `scim.Tokens` | Identity provider |
| Personal and service tokens: scopes, assistant mark, space limit, last use | `api_tokens` (identity, spec 096) | Tokens |
| All logins of the last day from one private address | `health.Facts.OneLoginAddress` | Rules for login |
| Public sites and shared pages allowed, and how many are live | `exchange.Limits`; `public_sites`, `public_links` (sites) | Public sharing |
| When the export rules were last saved | audit action `export.policy_changed` | Public sharing |
| Public address on https | `config.SecureCookies`, `config.PlainToOthers` (SEC-257) | https |
| Whether this node holds the owner's address | `config.MigrateDatabaseURL` (ADR-019, ADR-044) | Database roles |
| The role the application connects as | the catalogue: `pg_roles`, `pg_tables` | Database roles |
| Keys loaded on this node, and when a key was last made the one that seals | `keys.Keyring.KeyIDs`; audit action `keys.promoted` (SEC-713) | Key that seals secrets |
| Last noted backup, a failed backup, the interval | `health.Facts` (cached 30 seconds) | Recent backup |
| The backup service's key and the newest restore check | `backups.Overview` | Encrypted backups, tested restore |
| Newest daily check of the audit chain by the worker | audit action `audit.verified` by actor `worker` | Audit chain checked |
| Newest witness report recorded by the owner of the tables | `health.Facts` (`WitnessReported`, `WitnessAt`, `WitnessOK`) | Witness outside the host |

So **no migration** is needed: the experimental part is one more name in the list under the key `experimental`, which starts without it.

### Signals that would need new data, and are not used

| Wanted | Why not now |
|---|---|
| Whether the witness lines are kept on another host | The installation cannot see where an operator keeps its log; the step rests on a recent report by the owner of the tables (D6). |
| A configuration fact of every node, not only the one that answers | The overview says which steps describe the answering node (D12). |
| The figures about account security and the list of tokens (ADM-192 to ADM-196) | Screens of their own; their cards wait (D8). |
| A record that a step was set aside on purpose | Needs its own study (D9). |
| When the key was replaced, if the audit log was pruned since | The step falls back to the age of the installation, which can only make it look older, never younger (D17). |

## Lines in scope

| Line | Was | After SO1 | What changes |
|---|---|---|---|
| ADM-125 | new | partly | Built, behind the experimental part. Setting a step aside waits (D9) |
| ADM-126 | new | partly | Every step but rules for apps (D7) |
| ADM-127 | new | partly | The summary item and two of the four cards (audit log, documentation); the other two wait for ADM-192 and ADM-194 (D8) |
| ADM-128 | new | built | |
| ADM-191 | new | built | |
| ADM-072 | partly | partly | Security overview joins the Security group while the part is on |

## Behaviour

### The steps

Every step has an id, a group, one or more sub-steps, a count where it helps, and one link. Each sub-step is **critical** or **advisory** (D3). A step is:

- **done** when every sub-step holds;
- **needs attention** when a critical sub-step fails;
- **not started** when only advisory sub-steps fail.

The order of groups and steps never changes with the states, so a person finds a step where it was last time. The rules live in `internal/hardening`, which reads nothing itself.

**Group `sign_in`: Sign-in and accounts**

| Step | Sub-steps (weight) | Count | Link |
|---|---|---|---|
| `identity_provider` | `provider`: login through an identity provider is set up on the answering node (advisory); `provisioning`: a provisioning token works (advisory) | none | `login` |
| `second_factor` | `rule_administrators`: the rule in force asks administrators (critical; advisory during the grace of SEC-164); `rule_members`: the rule asks every member (advisory) | local active people without a second factor | `login` |
| `two_administrators` | `two_active`: at least two active members hold administration (advisory, D4) | administrators | `instance-permissions` |
| `administrator_factors` | `admin_second_factor`, `admin_passkey`: every administrator who signs in here holds a second factor and a passkey (critical, SEC-162). No administrator at all is not started, never done | administrators without a passkey | `users?role=administrator` |
| `login_rules` | `proxy_trusted`: the login limits see each person's own address (critical); `idle_limit`: sessions end after an idle time (advisory) | none | `login` |

**Group `access`: Tokens and sharing**

| Step | Sub-steps (weight) | Count and figures | Link |
|---|---|---|---|
| `tokens` | `admin_tokens_in_use`: every token that reaches Administration was used in the last 90 days (advisory); `tokens_in_use`: every token was (advisory) | tokens that still work; figures: reach Administration, may change content, for an assistant, limited to some spaces, not used for 90 days | `service-accounts` (D18) |
| `guests` | `guests_end`: every active guest has an end date (advisory) | guests without an end date | `users?type=guest` |
| `public_sharing` | `sharing_reviewed`: public sites and shared pages are both off, or the export rules were saved in the last 180 days (advisory, D10) | live sites and shared pages; figures: sites, pages | `export` |

**Group `installation`: Installation**

| Step | Sub-steps (weight) | Count | Link |
|---|---|---|---|
| `https` | `https`: the public address uses https (critical when it is plain http on a host other than this machine, SEC-257; advisory for `localhost`) | none | `configuration` |
| `database_roles` | `role_owns_nothing`: the application's role owns no table and is no superuser (critical); `owner_address_apart`: the answering node holds no address of the owner (advisory, ADR-044) | none | `configuration` |
| `key_rotation` | `rotation_finished`: one key is loaded, so no replacement is left half done (advisory); `key_recent`: the key in force was made or replaced in the last 365 days (advisory, D17) | days the key has sealed | `configuration` |

**Group `backups_audit`: Backups and audit**

| Step | Sub-steps (weight) | Count | Link |
|---|---|---|---|
| `backups_encrypted` | `backup_key`: the backup service reported its key (critical once a service was seen; advisory before) | none | `backups` |
| `backup_recent` | `backup_recent`: a backup within its interval and two hours, or 26 hours without an interval, and the newest did not fail (critical, as System health) | hours since the last backup | `backups` |
| `restore_tested` | `restore_tested`: the newest restore check succeeded within 8 days (critical once any ran; advisory before) | days since the last check | `backups` |
| `audit_checked` | `audit_checked`: the newest daily check of the chain by the worker succeeded within 48 hours (critical once any ran; advisory before) | none | `audit` |
| `witness_outside` | `witness_outside`: the newest witness report of the owner of the tables found no difference and is at most 8 days old (critical once any exists; advisory before) | days since the last report | `audit` |

The thresholds are named constants of `internal/hardening`, and reuse those of `internal/health` (`BackupDueWithin`, `WitnessWarnAfter`), so the overview and System health never disagree.

### The screen

1. **Head.** Through `SettingsSection`: the title "Security overview" with the Experimental mark in the sidebar; an introduction saying that the state of each step is worked out from how the installation is set up, that nothing here changes it, and that each step leads to the section where it is done; a link to `operations/security-overview.md` at the documentation address. No primary action and no More.
2. **The heading over the steps** carries at its end the switch of ADM-191, its label before it, off at first. On, steps that are done are hidden, a group with no step left is hidden, and while every step is done one muted sentence says so. The switch lives in the address (`?done=hidden`).
3. **Groups and rows** as ADM-128 says. The row is one link. The state tile shows the state by tint and symbol (done: green tint and a tick; needs attention: the warning tint and a warning mark; not started: a neutral tint and an open circle), and screen readers hear the state in words before the title. The softer line says why the step matters. Figures follow as one muted line. Sub-steps show as bullets, each with its own state in words. The count is a small outlined chip with its unit word.
4. **A value not known yet** shows as a dash that screen readers hear as "not known" (ADM-124), and the step is then never done.
5. **Facts of the answering node.** The steps that read the node's configuration (identity provider, https, database roles, the key) add a sentence that they describe the node that answered.
6. **Cards.** Under the groups, equal cards with an icon tile, a bold title, a line and a way on: **Audit log**, which opens `audit`, and **Documentation**, which opens the operator's document at the documentation address. The cards of ADM-192 and ADM-194 join when their screens exist (D8).
7. **Failure.** When the facts cannot be read, the section shows `ErrorNote` and no steps. A partial answer is never shown.
8. **The summary.** While the part is on and at least one step needs attention, the attention list holds one item `security_steps` with the number of such steps and a link to the overview. Steps not started do not go there (D5). The items the list held before stay as they are, also while the part is off.
9. **The part is off.** The entry is absent from the sidebar, the address says that the part is off, the route answers `404 experimental_off`, and the summary has no `security_steps` item. Nothing of the overview is read.

## Through the API

Every part of the overview is reachable through the API, and so through MCP (decided by the product owner on 2026-11-17).

| Route | Rule | Scope | What it does |
|---|---|---|---|
| `GET /api/v1/admin/security-overview` | `permission:administrator`, tokens allowed | `admin:read` | The whole overview, as the screen shows it |
| `GET /api/v1/admin/attention` (unchanged route) | session only, as before | `admin:read` | Gains the item `{"kind": "security_steps", "count": n}` while the part is on and `n > 0` |
| `GET /api/v1/admin/experimental`, `PUT /api/v1/admin/experimental` (unchanged) | as before | `admin:read`, `admin:write` | The part `security_overview` is listed and switched like the others |
| `GET /api/v1/system/capabilities` (unchanged route) | as before | `content:read` | Gains `security_overview: true|false` |

The scope of the new route is one line in `internal/httpapi/scopes.go`. Because it is a read below `/api/v1/admin/` that is not session-only, `describe_api` lists it for an assistant whose token holds `admin:read`, and `call_api` reaches it under every rule of the route (spec 096). No change goes through the overview, so the approval class of assistants is not touched.

Answer `200`:

```json
{
  "as_of": "2026-11-23T09:00:00Z",
  "attention": 2,
  "groups": [
    {
      "id": "sign_in",
      "steps": [
        {
          "id": "two_administrators",
          "state": "not_started",
          "substeps": [{"id": "two_active", "state": "not_started"}],
          "count": {"value": 1, "unit": "administrators"},
          "link": {"section": "instance-permissions"},
          "node_fact": false
        }
      ]
    }
  ]
}
```

- `state` is `done`, `attention` or `not_started`, for steps and sub-steps alike.
- `count` is absent where a step has none; `value` is `null` when not known.
- `figures` (tokens, public sharing) holds further counts by name.
- `link.section` is an id of the registry, with an optional `query` object, so the server never builds a browser address (D15). Every word comes from `en.json` under the step, sub-step, unit and figure ids; a Go test proves each exists and each section is in the registry.
- `404 experimental_off` while the part is off; `403` for anyone without administration, also through a token; `401` without a credential.

## Permissions and audit

- **Who may see it.** Administrators only, deny by default. The route is `Permission(identity.PermAdministrator)` with scope `admin:read`; `App.SecurityOverview` takes the caller and checks the global permission `administrator` itself, so no other caller reaches the answer without the check.
- **System administration is not needed** (D2): every fact is already shown to administrators elsewhere, and the overview shows counts only. The screens a step links to keep their own guards.
- **What it shows.** Counts and states, never a name, an address of a person, an id, a token or any content (SEC-601). The answer holds nothing per person, so one answer serves every administrator.
- **It reports configuration, never a weakness of Kenwerk itself.** Each step names a setting an operator chooses; none describes a flaw in the product.
- **Audit and outbox.** Reading changes nothing, so it writes no audit event and no outbox event, like every other read of Administration. Turning the part on or off is the existing `PUT /api/v1/admin/experimental`, which already writes `settings.updated`.

## Where the code goes

- **`internal/hardening`** (new): `Facts`, `Evaluate`, the thresholds and `Cache`. It reads nothing.
- **The facts**, in `internal/app/security_overview.go`. Each module answers through its own Go API: `identity.SecurityCounts` (one statement over accounts, credentials and tokens), `scim.Tokens`, `exchange.Limits`, `sites.LiveEverywhere`, `audit.List` for the newest event of an action, `instance.CreatedAt`, `db.CurrentRole`, `backups.Overview`, and the cached health facts. No module names another's table.
- **The route** in `internal/httpapi/handlers_security.go`, with the summary item beside it.
- **The browser**: `web/src/views/admin-security.tsx`, the model in `security-overview-model.ts`, the row `components/security-step.tsx`, styles in `design/layout.css`, one new drawing `IconOpenCircle`, the registry entry, and the words in `en.json`.

## Load budget

Nothing is claimed for 5,000 people until it is measured.

- **Class:** reports (ARC-233). Nothing on saving pages, reading pages or search.
- **Part off:** the route reads the `experimental` key (one row) and stops; the attention route adds that same one-row read and nothing else.
- **Cold read:** 34 statements on the test database, measured with the session, the checks and the health facts read cold; each an aggregate over a table that stays small, an indexed lookup or a catalogue read, plus the health facts when their cache is cold. The newest event of an action reads the index on `(action, seq)` and stops at the first row.
- **Warm read:** within 30 seconds, per node, no statement of the overview at all: only the session, the route's rule, the part's switch and the module's own check of administration, at most 6 statements (`TestTheSecurityOverviewIsKeptForHalfAMinute`). One answer serves every administrator.
- **Steady state:** none. The overview is read when an administrator opens it or the summary, at most once per 30 seconds per node; no worker job is added, and it is not on the band of every page.
- **The aggregates that grow with people:** `identity.SecurityCounts` reads every active account once, with lookups on the primary keys of the credentials, and every token that still works. At 5,000 people that is 5,000 rows, read at most twice a minute per node. It has **not been measured on 5,000 accounts** in this wave; that measurement is owed before the part leaves experimental, and if it costs more than 20 ms the count moves to the worker (D13).

## Tests

Failure paths first, then boundaries, then the happy path.

- `internal/hardening`: a safe installation has every step done; the order and unique ids; only attention counts for the summary; nothing known makes no step done and no count; each step's boundaries (one second past each threshold); the second-factor rule in all its forms; tokens, guests, public sharing, https, database roles, the key, backups, restore, audit chain and witness; every id has its words in `en.json` and links to a section of the registry; the cache answers again within half a minute, reads again after it, and keeps no failure.
- `internal/db`: the role that migrated owns tables; an application role made with `GrantApp` owns none and is no superuser.
- `internal/app`: the part is off on a new installation (route, summary, capabilities); nothing is read while off; a warm read stays within its budget; only administrators are answered, through a session and a token with `admin:read`, a member's token is refused, and the module refuses a member called directly; the answer names nobody; a second administrator, a guest and their end date, a token, and the rules for logging in move their steps; the summary counts the steps that need attention, and loses the item when the part is turned off.
- Browser unit tests: done steps and empty groups hide; nothing is left when all are done; a step's address with its filters; figures that are zero are left out; the registry has the section, behind its part, first in Security.
- End-to-end, `web/e2e/security-overview.spec.ts`: the entry first in Security with the Experimental mark; groups and steps in order; states in words; a row opens its section; the switch hides done steps and stays after a reload; the cards; a member gets "not found"; with the part off there is no entry and the address says the part is off; axe on each state; 360 px wide.
- Design pictures in `0-design.spec.ts`, named `AdminView: the security overview …`: all three states with sub-steps, counts and figures; done steps hidden; everything done with the switch on; light, dark, narrow and right-to-left.

## Mutation lines

In `scripts/mutation-check.sh`, under "Spec 088, wave SO1":

| Mutation | Caught by |
|---|---|
| a step not started counts for the summary | `TestTheAttentionNumberCountsOnlyStepsThatNeedAttention` |
| a sub-step that fails critically is only not started | the boundary tests of backups, restore, audit chain and witness |
| one administrator counts as two | `TestOneAdministratorIsAStepNotTakenAndTwoAreDone` |
| an administrator without a passkey is fine | `TestAnAdministratorWithoutAPasskeyOrSecondFactorNeedsAttention` |
| the grace of the second factor lasts for ever | `TestTheSecondFactorFollowsTheRuleInForce` |
| `localhost` over plain http needs attention | `TestHTTPS` |
| the application role owning a table is fine | `TestTheDatabaseRoles` |
| a backup at its limit needs attention (`<=` to `<`) | `TestABackupFollowsTheAgeOfSystemHealth` |
| a failed witness report is done | `TestTheWitnessReport` |
| an old export review counts as a look | `TestPublicSharingIsDoneWhenClosedOrLookedAtLately` |
| the overview never goes stale | `TestTheOverviewIsReadOncePerHalfMinute` |
| the module skips its own check of administration | `TestOnlyAnAdministratorSeesTheSecurityOverview` |
| the route works while the part is off | `TestTheSecurityOverviewIsOffOnANewInstallation` |
| the summary reads the overview while the part is off | `TestNothingOfTheOverviewIsReadWhileItIsOff` |
| the screen shows done steps while they should hide | `security-overview-model.test.ts` |

## Upgrade notes

- **No migration.** The part is a new name in the list under `experimental`; an upgraded installation starts without it.
- **Mixed releases.** A node of the previous release ignores a part it does not know. Saving the experimental parts through the previous release's screen during a rolling upgrade drops the new part; turning it on again afterwards is all it takes. Nothing is damaged, so the part is not held for older releases.
- **Restore.** A restored backup brings its own list of parts. Nothing of the overview is stored.
- **Documents.** `docs/operations/security-overview.md` is new; `docs/operations/upgrade.md` names the new part among those that start off.

## Acceptance criteria

- [x] A new installation and an upgraded one have the overview off: no entry, no summary item, `404 experimental_off`, nothing read.
- [x] With the part on, every step but apps shows in order with the state its facts give, by the rules above, proved by the table tests.
- [x] Only administrators reach it, through a session or a token with `admin:read`, and through the module's own check; the answer names nobody.
- [x] A step needing attention shows as one counted item on the summary; steps not started do not.
- [x] The overview changes nothing and calls nothing outside the installation.
- [x] Two reads within 30 seconds cost one read of the facts per node.
- [ ] The cold read is measured on 5,000 accounts (owed before the part leaves experimental).

## How the product owner tests it

1. Log in as an administrator and open the administration. Under Security there is no Security overview yet.
2. Open Organising and turn on the experimental part "Security overview". Security now starts with Security overview, marked Experimental.
3. Open it. You see four groups. On a fresh test installation "Have two administrators" is not started with the count 1, and "Protect every administrator" needs attention.
4. Add a passkey under Your account and come back after half a minute: that sub-step is done, and the summary counts one step fewer.
5. Turn on "Hide steps that are done": only the open steps stay. Reload: they stay hidden.
6. Press a step: its section opens.
7. With a token that holds `admin:read`, `GET /api/v1/admin/security-overview` gives the same answer.
8. Log in as a member and type the address of the overview: the page says it does not exist.
9. Turn the part off again in Organising: the entry and the summary item are gone.

## Decided on the product owner's behalf on 2026-11-23, may be overruled

The decisions of the plan of 2026-11-16 (D1 to D15) are kept, with D2 and D8 updated; D16 to D19 are new.

- **D1. One experimental part, `security_overview`, off by default, without a migration.** It is how ADR-043 adds an optional part.
- **D2. Administrators see it, through a session or a token with `admin:read`; system administration is not needed.** Every fact is already shown to administrators elsewhere, as counts, and every feature is reachable through the API (decided 2026-11-17). The actions a step leads to keep their own guards.
- **D3. Critical and advisory sub-steps decide between "needs attention" and "not started".** "Needs attention" means something that matters now has failed or lapsed; "not started" means a recommended step not taken. This keeps the summary for what needs a person now.
- **D4. One administrator is advisory.** A small team often has one; the risk is being locked out, which the command line undoes.
- **D5. The summary gets one counted item, not one per step.** The items it held before stay unchanged, so the summary with the part off is exactly as before.
- **D6. The witness step rests on a recent report by the owner of the tables.** The installation cannot see where its log is kept.
- **D7. No step for apps.** Apps do not exist; the step comes with them.
- **D8. Two of the four cards wait.** The figures about account security (ADM-192) and the list of tokens (ADM-194) do not exist; a card that leads nowhere would be a promise the screen cannot keep. Until ADM-194 exists, the tokens step shows the counts that list would hold.
- **D9. No way to set a step aside in this wave.** The advisory weight already keeps such steps off the summary.
- **D10. "The data controls looked at" means public sharing off, or the export rules saved within 180 days.** The screen of data controls (ADM-197) is later; a save of the export rules is the trace that someone looked.
- **D11. The switch that hides done steps lives in the address.** It is a way of looking, not a preference worth storing.
- **D12. Facts of configuration are those of the node that answers,** and the steps that read them say so.
- **D13. A 30-second cache per node, not a worker job.** If the aggregate over accounts costs more than 20 ms at 5,000 people once measured, only that count moves into the worker.
- **D14. Accounts of an identity provider are left out of the passkey and second-factor counts.** They sign in at the provider.
- **D15. The step's link is a section id, not an address.** A Go test proves every id is in the registry.
- **D16. Tokens are a step of their own, and every sub-step of it is advisory.** A token that still works and that nobody used for 90 days is the risk worth naming; how many tokens reach Administration, may change content, belong to an assistant or are limited to spaces are shown as figures, never judged, because each can be right.
- **D17. The key that seals secrets is advised to be replaced once a year, and a replacement left half done is named.** Both are advisory: the key file is the operator's and is replaced with `kenwerk key` (SEC-713). When a key was replaced comes from the audit action `keys.promoted`; without one, the first key is as old as the installation.
- **D18. The tokens step leads to Service accounts until the list of every token (ADM-194) exists.** It is the one section that lists tokens today.
- **D19. The summary item stays session-only, as the attention route is; the overview itself is open to tokens.** Changing the rule of an existing route is outside this wave.

## Open for the product owner

- Is the split into critical and advisory right (D3, D4, D16, D17)? In particular: should one administrator, or a token nobody uses, reach the summary?
- Should the two cards wait for ADM-192 and ADM-194 (D8)?
- Is a way to set a step aside wanted before 1.0 (D9)?

## Supersedes

Nothing. The overview adds an entry to SC4's registry, one item to the attention list and one route.

## Provenance

Own words, from blueprint 03 chapter 10 (ADM-067, ADM-072, ADM-124 to ADM-128, ADM-191 to ADM-197), the security lines SEC-156, SEC-162, SEC-164, SEC-257, SEC-601, SEC-713, SEC-814, SEC-833 and SEC-900, the built code on `main`, and specs 051, 058, 069, 075, 076, 077, 081 and 096. No pictures, inventories or other product were consulted.
