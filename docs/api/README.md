# The Kenwerk API

Our own web app uses the same API as everyone else. The routes and what each needs are in [`routes.txt`](routes.txt), and the same list is an OpenAPI 3.1 description in [`openapi.json`](openapi.json), also at `/api/v1/openapi.json` for anyone logged in. A test fails when either differs from the routes.

The description covers each route, its method, its path parameters and its rule, as `x-access`. It does not describe every field: those are checked by hand.

## What stays stable

Until 1.0 the API may still change, also radically (the product owner, 2026-11-17): a route can change meaning or go, when the product needs it. Every such change is in the changelog under "Upgrade impact", with what to do instead. From 1.0 on:

- `/api/v1` only grows. New routes and new fields can appear, so ignore fields you do not know.
- Nothing in `/api/v1` changes meaning or goes away without a new version.
- A removal is announced at least 12 months ahead with a `Sunset` header (RFC 8594) on the route, and in the changelog.

Before 1.0 we still keep to these where we can: spec 096, for one, removed nothing and kept the old scope words of tokens working.

## Tokens

A personal access token goes in `Authorization: Bearer kenwerk_...`. Make one under Your account, Tokens. It has scopes, and may be limited to some spaces (spec 096).

| Scope | Allows |
|---|---|
| `content:read` | Reading pages, spaces, comments, files, labels, tasks, templates, search and the feed |
| `content:write` | Creating and editing pages, drafts, comments, reactions, labels, tasks, files, reviews and workflow steps (never a signature) |
| `content:delete` | Deleting and archiving pages, files and comments, to the trash |
| `content:share` | Sharing a page, guests, public links, published sites, page restrictions, access requests and the members of a group |
| `content:export` | Routes that take content out in bulk, such as `export.zip` |
| `spaces:manage` | Looking after a space: its settings, access and roles, automation, webhooks, templates, statuses, workflows, archiving and deleting it, and its trash |
| `people:read` | The directory, people, profiles, follows and one's groups |
| `account:read`, `account:write` | One's own notifications, preferences, favourites and watches |
| `admin:read` | Reading routes under `/api/v1/admin/`, apart from the two below |
| `admin:audit`, `admin:system`, `admin:write` | Named on their routes already; no token can hold them yet, as their routes are all `session-only` |

Each route names the one scope it needs: `routes.txt` prints it as `scope:...`, and `openapi.json` as `x-scope`. `scope:none` is a route no token ever reaches, such as your password, your second factor, your tokens, a signature or a read confirmation.

**The old words.** Tokens made before spec 096 hold the words `read`, `write`, `export` and `admin`. They keep exactly what they reached:

| Word | Holds |
|---|---|
| `read` | `content:read people:read account:read` |
| `write` | `content:write content:delete content:share spaces:manage account:write` |
| `export` | `content:export` |
| `admin` | `admin:read` |

You may still send the words when making a token, but `write` then means `content:write content:delete account:write`: a new token that shares out or looks after spaces names `content:share` or `spaces:manage` itself. When an old `write` token shares or looks after a space, the audit event says so (`via.old_write`), so an administrator can find the tokens that still rely on it.

**Spaces.** A token reaches every space its person reaches, unless you choose spaces when you make it (at most 50; `"spaces": [...]`). A limited token gets `404` for a page, file, comment, task or export in any other space, finds nothing of other spaces in lists, search and the tree, cannot hold an `admin:` scope, and gets `403 token_spaces` on routes that belong to no space, such as making a space or changing a template.

**For an assistant.** `"assistant": true` marks a token you give to an AI assistant. It gets stricter limits (below), and later waves of spec 096 make it ask for your approval before it shares out or deletes for good.

A scope only limits a token. A token is its owner, so every check on the owner still applies, and a route marked `session-only` never takes a token. Every route under `/api/v1/admin/` that changes something is `session-only`: Administration is changed in a signed-in session, never by a token (spec 085).

## Limits

Counted on each node, per minute:

| What | Limit |
|---|---|
| Calls of one token | 600 |
| Calls of all tokens of one person together | 1,200 |
| Changes of one token for an assistant | 120 |
| Deleting, sharing or changing access, by one token for an assistant | 20 |

Past a limit a token gets `429 too_many_requests` with `Retry-After`. Refusals because of a scope, a space or a limit are in the audit log (`token.refused`, `token.rate_limited`, the latter at most once a minute per token), and so is a token's use, at most once a minute (`token.used`). Every event caused through a token names it in its `via` field: `{"kind": "token", "token_id": "...", "assistant": false}`.
## Errors

An error is `{"error": {"code": "...", "message": "..."}}`. The code is stable, and the message is for people.

## Webhooks

A webhook follows the Standard Webhooks format: the headers `webhook-id`, `webhook-timestamp` and `webhook-signature`, and an HMAC-SHA256 over `id.timestamp.body`. During a change of secret, the signature header holds two values. The id stays the same across attempts, so you can drop a double. The body holds ids, a type and a time, and a title only if the endpoint asked for it. Page text is never sent.

## The command line tool

`kenwerk client` uses only this API. Set `KENWERK_URL`, and `KENWERK_TOKEN` or `KENWERK_TOKEN_FILE`.

| Command | What it does |
|---|---|
| `kenwerk client spaces list` | The spaces you can see, as JSON |
| `kenwerk client pages list <space-id>` | The pages of a space, as JSON |
| `kenwerk client export <space-id> <file>` | Saves a space as a zip |
| `kenwerk client import <space-id> <file>` | Imports a file into a space |
| `kenwerk client backup-content <folder>` | Saves every space you can see |

Exit codes: 0 done, 1 failed, 2 wrong use, 3 refused by the server.
