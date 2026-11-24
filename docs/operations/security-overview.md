# The security overview

Administration, Security, **Security overview** gathers the steps that make an installation safer, and works out for each whether it is done (spec 088). It reads how the installation is set up and changes nothing: every step is a link to the section where it is done.

It is an experimental part and starts off on every installation. Turn it on under Administration, Instance, Organising, Experimental parts, **Security overview**.

## States

- **Done**: every condition of the step holds.
- **Needs attention**: something that matters now failed or lapsed. The summary of the administration counts these steps in one line.
- **Not started**: a recommended step that was not taken. It does not reach the summary.

A number that is not known yet, such as the hours since a backup when none was ever noted, shows as a dash. A step that rests on something not known is never done.

Steps marked as describing the node that answered read that node's configuration: its identity provider, its public address, whether it holds the address of the owner of the tables, and the keys it loaded. All nodes of one installation are meant to share one configuration.

## The steps

### Sign-in and accounts

| Step | Done when | Where |
|---|---|---|
| Sign in through an identity provider | Login through an identity provider is set up, and a provisioning token works | Login and second factor; Provisioning |
| Ask for a second factor | The rule asks administrators for a second factor (needs attention once the 14 days a new installation gets have passed, or when the rule is set to none), and asks every member | Login and second factor |
| Have two administrators | At least two active people hold administration | Instance permissions |
| Protect every administrator | Every administrator who signs in with a password here holds a second factor and a passkey. People of an identity provider sign in there and are left out | Users, filtered on administrators |
| Set the rules for logging in | The login limits see each person's own address, which fails when every login of the last day came from one private address (set `KENWERK_TRUSTED_PROXIES`), and sessions end after an idle time | Login and second factor |

### Tokens and sharing

| Step | Done when | Where |
|---|---|---|
| Keep tokens few and in use | Every token that still works was used in the last 90 days. The step also counts tokens that reach Administration, may change content, belong to an assistant, or are limited to some spaces | Service accounts; a person revokes their own under Your account, Security, Tokens |
| Give guests an end date | Every active guest has an end date | Users, filtered on guests |
| Look at what is public | Public sites and shared pages are both off, or the export rules were saved in the last 180 days | Export and publishing |

### Installation

| Step | Done when | Where |
|---|---|---|
| Serve the public address over https | `KENWERK_PUBLIC_URL` starts with `https://`. Plain http on `localhost` is a trial on one machine and is only not started | Configuration |
| Use two database roles | The role the application connects as owns no table and is no superuser, and the node that serves people holds no `KENWERK_MIGRATE_DATABASE_URL` (see `install.md`) | Configuration |
| Replace the key that seals secrets | Only one key is loaded, so no replacement was left half done, and the key in force was made or replaced in the last year. Replace it with `kenwerk key add`, `promote`, `reseal`, `check` and `retire` (`backup-restore.md`) | Configuration |

When a key was last made the one that seals comes from the audit log (`keys.promoted`). An audit log kept shorter than a year may have lost that event; the step then counts from the start of the installation and may call the key older than it is.

### Backups and audit

| Step | Done when | Where |
|---|---|---|
| Encrypt the backups | The backup service reported its key | Backups |
| Back up on schedule | A backup was noted within its interval and two hours (26 hours without a schedule), and the newest did not fail | Backups |
| Test a restore | A restore check succeeded in the last 8 days | Backups |
| Check the audit chain every day | The worker's daily check of the chain succeeded in the last 48 hours | Audit log |
| Keep the witness outside this host | A witness report by the owner of the tables found no difference in the last 8 days (`kenwerk audit verify --witness --report`) | Audit log |

The ages of backups and of the witness are those System health warns at, so the two screens agree.

## Through the API

`GET /api/v1/admin/security-overview` answers the same overview to an administrator, in a session or with a token that holds `admin:read`, and so to an assistant (`mcp.md`). It answers `404` with the code `experimental_off` while the part is off. The answer holds counts and states only, never a name, an address or a token.

## Load

The overview is worked out at most once per 30 seconds per node and kept for every administrator; a read within that time costs no statement of its own. A full read is about thirty small statements, one of which reads every active account once.
