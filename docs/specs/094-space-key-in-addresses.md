# 094: The space key in addresses, and what a person without access sees

Status: built (wave UR1, 2026-11-20)
Phase: wave UR1, after wave SC2 (spec 079) and before or after wave SC5 (spec 083), see "Order with other waves"

## Problem

Today the home page of a space opens at `/pages/<id>`, and so does every other page: `/spaces/BLUE` only looks the space up and then replaces the address with the home page's id. A reader cannot tell from the address, from a link in a mail or from a link pasted in a chat which space a page belongs to. The product owner asked on 2026-11-16 that every address of a space's content carries the space key: the home page at `/spaces/BLUE`, every other page at `/spaces/BLUE/pages/<id>`. Old addresses must keep working forever, and a change of key or a move to another space must break nothing.

The product owner answered a second question the same day: an address of a page or space someone may not see should not pretend to be "not found". It may say that the person has no access, and the space administrators choose what that screen shows. Blueprint 03 so far said the opposite ("Not found comes first", decision 9; COL-049), with one exception that already exists: the space feature **Requests for access** (`access_requests`), which keeps the answer "not found" but adds a button to ask. This spec turns that switch into the choice the product owner asked for, instead of adding a second way.

## What exists today (the study)

### Addresses

- The client router is `web/src/router.tsx` (a small matcher, no dependency); the route table is `Routes` in `web/src/app.tsx`. Page screens: `/pages/:id`, `/pages/:id/edit`, `/pages/:id/history`, `/pages/:id/compare`, `/pages/:id/insights`. Space screens: `/spaces/:key` and about twenty `/spaces/:key/<screen>` routes (settings, content, blog, files, trash, and so on).
- `SpaceHome` (`web/src/views/space.tsx`) resolves `/spaces/:key` through `GET /api/v1/space-keys/{key}` and then navigates to `/pages/<home id>` with `replace`.
- `useCurrentSpace` (`web/src/components/current-space.ts`) and `SpaceShell` (`web/src/components/frame.tsx`) take the space of a page screen from the page's `space_id`, never from the address. Space screens take it from the key.
- The server serves the built frontend for every path that is not `/api/` or `/scim/` (`internal/webui`), so every address is decided in the browser; the server never answers a page address with a redirect.
- About 90 places in `web/src` build a page address by hand as `` `/pages/${id}` ``, and one helper exists (`pageAddress` in `components/editor/page-links.tsx`). Copy link is built in four places from `window.location.origin` (`share-dialog.tsx`, `tree.tsx`, `page-details.tsx`, `editor.tsx` for headings); the space menu copies the space's own address.
- `comment-box.tsx` and `gone-links.ts` (`pageOfAddress`) read a page id out of an address.

### Keys

- A key has 2 to 32 letters, digits, dashes or underscores, starting with a letter or digit (`keyPattern`, `internal/spaces/spaces.go`). It is stored as typed. A personal space's key is `~` and ten hexadecimal characters derived from the person's id (`PersonalKey`).
- **Uniqueness, verified:** `spaces_key_key` is a unique index on `lower(key)` (migration 0002), so a key is unique per installation regardless of case. An old key lives on in `space_key_aliases` (primary key `alias`, stored in lower case) and stays taken until a space administrator frees it; `keyTaken` checks both tables before a create or a change.
- `GetByKey` looks a key up case-insensitively in the current keys and then in the old keys, and then behaves as `Get`, which refuses with "not found" for a space the person may not see (`permissions.refusal`: not visible means not found). Unknown and hidden therefore answer the same today.
- `ChangeKey` writes the old key as an alias, audits `space.key_changed`, and the space settings show the old keys with a way to free each (`ReleaseKey`, `space.key_released`).
- A page may be seen only by someone who may see its space (`permissions.Evaluate` checks `space.view` for every action), so anyone who may see a page may also learn its space's key.

### Links stored in documents

- A link that follows its page is a `pageLink` or `pageCard` node holding `page_id` only (spec 023). An ordinary link mark may hold an address inside the instance, such as `/pages/<id>#heading`, as written by the link dialog (`setHref('/pages/<id>')`).
- The server finds such addresses with one pattern, `^/pages/<uuid>`, in four places: `document.LinkedPages` (incoming links), `document` HTML export (`html.go`), and the link rewriting of a release in `internal/publishing` (`rewrite.go`, `start_rewrite.go`). The rewrite also turns `/spaces/<draft key>...` into the published space's key so that the draft space never shows to readers (PUB-108).

### Addresses the server writes

- Mail and notifications: `notify.link` writes `<origin>/pages/<id>` with `#comment-<id>`. Mail rows are read through `visibleRows`, so a mail only names pages the person may still see, and it already groups items under their space.
- Automation: the placeholder `page.url` is `<origin>/pages/<id>`, read as the rule's account sees the page.
- Signing returns to `/pages/<id>` (`internal/pages/signing.go`); the handler accepts only a return path that starts with `/pages/`.
- Webhooks carry `page_id` and `space_id`, no address. REST responses carry ids, and many lists also carry `space_key` (`PageRef`, lists, feed, search); `PageDetail` carries `space_id` only.
- Public sites and single shared pages are files under their own addresses, with tokens or file names, and carry no key.

### What a person without access sees

- `GET /api/v1/pages/{id}` refused as not found goes through `failPage`, which asks `sharing.MayAsk`: true only for a published page in a space whose feature `access_requests` is on. Then the answer is still 404, with the code `not_found_ask`, and `PageMissing` in `frame.tsx` shows the not-found words with an **Ask for access** button.
- `access_requests` is the one feature that starts off in every space (`offByDefault`), because asking says that a hidden page exists. An administrator can also turn it off for every space (the instance's `Off` list).
- Blueprint lines: COL-049 (built), decision 9 in `03-functional-requirements.md`, and later lines COL-109 to COL-112 for an instance-wide choice, requests to enter a space, the administration's section and its preview.
- A space address of a space the person may not see answers not found; asking to enter a space (COL-110) is not built.

## Behaviour

### 1. The address scheme

1. The home page of a space is at `/spaces/<KEY>`. Its screen is the page screen, with the space's sidebar, as `/pages/<home id>` is today.
2. Every other page, blog post, live document, database and folder is at `/spaces/<KEY>/pages/<id>`. The kind does not show in the address, because Convert (PAG-131) changes the kind and must not change the address.
3. The screens of a page follow it: `/spaces/<KEY>/pages/<id>/edit`, `/history`, `/compare` (with its `?from=&to=`), `/insights`. The home page's screens use its id too: `/spaces/<KEY>/pages/<home id>/edit`, so the home page's own address stays short and its screens follow one rule.
4. `/spaces/<KEY>/pages/<home id>` is a valid address and is replaced by `/spaces/<KEY>`.
5. The screens of a space keep their addresses (`/spaces/<KEY>/settings`, `/content`, and so on). `pages` becomes a reserved word after `/spaces/<KEY>/`; it is a fixed part of the path, not a key, so no key is lost.
6. No title in the address (D2).
7. The fragment (`#heading`, `#comment-<id>`) and the query of an address survive every replacement in this spec.
8. Templates (`/templates/:id`), people, the administration and the personal screens keep their addresses: they are not content of a space.
9. Draft and published spaces of a pair (spec 073) are ordinary spaces with their own keys and get the same scheme; a twin is at the published space's key, its draft at the draft space's key.
10. Personal spaces get the same scheme with their `~` key.
11. Public sites and single shared pages keep their own addresses and never carry a key (D9).

### 2. Canonical address and the key's case

12. The canonical address uses the key as stored, in its own case: `/spaces/BLUE/pages/<id>` for a space keyed `BLUE`, `/spaces/~0190abcd12` for a personal space. Keys are not forced into upper case (D3).
13. A key in an address is looked up without regard to case, in the current keys and then the old keys, as `GetByKey` does today.
14. When the address in the bar is not the canonical one, it is replaced by it with `history.replaceState`, so Back does not return to the old form: `/pages/<id>`, a key in other case, an old key, a key of another space, and the home page's id form.

### 3. Old addresses, renamed keys and moved pages

15. `/pages/<id>` and all its screens keep working forever. They open the page and the bar then shows the canonical address.
16. On every page address the id decides; the key is never used to find the page. `/spaces/OLD/pages/<id>`, `/spaces/OTHER/pages/<id>` and `/spaces/NONSENSE/pages/<id>` all open the page with that id for someone who may see it, and the bar then shows its canonical address. So a change of key, a move to another space, and an old key freed and taken by another space break no page address.
17. `/spaces/<KEY>` with an old key opens the space whose old key it is, and the bar then shows its current key, as SPC-012 says. Once an old key is freed and taken by another space, `/spaces/<KEY>` leads to that space: that is what freeing a key means (SPC-093), and the information under the key field says so.
18. A space screen with an old key (`/spaces/OLD/settings`) opens and its address is replaced with the current key the same way.

### 4. Never revealing more than the person may see

19. A page address is resolved by asking for the page by id, as today. Until that answer allows the page, nothing that depends on the key in the address is shown, and the address is not replaced. The space of the screen comes from the page's `space_id`, never from the key in the address, so a key of a space the person may not see causes no request that could answer differently.
20. A replacement address is built only from the answer of a request the person was allowed, so it never holds the key of a space they may not see.
21. What a person without access sees for a page or a space is the choice of section 5. For every case the choice does not cover, and for every address in a space that chose to stay hidden, the answer is the same "not found" for: an id that never existed, a page in the trash, a template, someone else's unpublished draft, a page hidden by a restriction, a page in a space the person may not see, a key that never existed, and a key of a space the person may not see. The status, the code and the words are the same in all of them.
22. A key in an address is an identifier, not a secret: the form to create a space already says when a key is taken (SPC-003). The address of a page shared in a chat shows the key to everyone who sees the link, including people who may not open it. Space administrators who keep a space's name confidential choose a key that does not give it away (D8; told in the information under the key field).

### 5. What a person without access sees

23. Every space has one setting, **When someone cannot see this**, with three choices:
    - **Not found**: the space and its pages stay hidden. A person without access gets the same not-found screen as for an address that does not exist. This is today's behaviour of a space without requests for access.
    - **No access**: the screen says that the person has no access to this page (or this space), and nothing more.
    - **No access, and ask for it**: as No access, with a button to ask for access to the page (COL-050 to COL-053, unchanged).
24. The setting replaces the feature switch Requests for access (`access_requests`): there is one place to decide, not two. Where the administrator turned requests off for every space (the instance's `Off` list), the third choice is absent and a space that held it answers as No access (D12).
25. The no-access screen holds no title, no space name, no key that was not already in the address, no owner and no excerpt. It never replaces the address, because the canonical address would hold the key (rule 20). It shows the same for a page restricted inside a space the person can see and for a page in a space they cannot see.
26. The choice applies only to an address that leads to something that exists in a form a reader could be given: a published page that is not in the trash, not a template and not someone else's draft, or a space that is active or archived. Everything else stays not found whatever the space chose (rule 21).
27. A space address (`/spaces/<KEY>` and its screens) of a space set to No access, or to No access and ask, says the person has no access to this space. Asking to enter a space (COL-110) is not built here, so the space's no-access screen has no button.
28. The draft space of a pair always answers Not found, and its setting shows that choice read-only with one line saying why: readers of the published space must never learn of the draft space (PUB-108).
29. Existing spaces keep exactly what they do today: a space with Requests for access off gets **Not found**; one with it on gets **No access, and ask for it** (its words change from "not found" to "no access", which the button already gave away). A new space starts at **No access, and ask for it** (D11).
29a. The request from the no-access screen of a page goes to the space's owners (SPC-091) first: the first owner, in the order of the owners list, who may grant it. Space owners need hold no rights, so when none of them may grant it, the request follows today's chain (COL-051, `whoToAsk`): the page's creator, its last editor, then the space administrators in the order of their grants. Today's chain does not ask space owners at all, and the page owner is not in it either, although COL-051 names them; the build adds the space owners for this request and leaves the chain otherwise as it is (D17). One person is asked, as today (`access_requests.asked_id`); everyone with *manage restrictions* still sees the request in Share and may answer it.
29b. Limits, as today: one open request per person, page and kind (`already_asked`), and no new request for a week after a refusal (`recently_refused`). New: at most 20 open view requests per person across the installation, refused with 429 `too_many_requests`, because the default now offers the button everywhere (D18). Audit and outbox as today (`access.requested`, `access.allowed`, `access.refused`).
30. The screen follows the arrangement COL-112 describes for its preview: centred, a picture of our own or none, a short heading, one or two lines, and with asking on a primary button to ask with a second button to the start screen beside it; without asking, only the button to the start screen.
31. Changing the setting needs *space administer* and is audited as `space.access_answer_changed` with the old and new choice. It is a setting of the space, not of a page.

### 6. Links inside documents

32. The server keeps storing ids, never keys: a `pageLink` or `pageCard` holds `page_id`, and an ordinary link to a page of this installation is stored as `/pages/<id>` followed by what came after it.
33. `document.Normalize`, the one gate every saved document passes, turns an internal address of the new form, `/spaces/<anything>/pages/<id><rest>`, into `/pages/<id><rest>`, so a person who pastes a canonical address stores the key-free form. A key change or a move can then never change stored content, and no key is ever stored in a document.
34. The patterns that find page addresses (`document.pageLink`, `publishing.pageHref`, the client's `pageOfAddress`) also accept the new form, as a second line of defence for content saved during the overlap of two releases (section 9) and for content imported from a bundle.
35. A release rewrites both forms to the twin, and turns `/spaces/<old key of the draft space>` into the published key as it does for the current key (rule 28; acceptance criteria).
36. The reader renders an internal link as the canonical address of its target when the link facts it already loads (`POST /pages/link-facts`) name the target's space key, so hovering shows the space; a link to a page the reader may not see keeps its words and no address, as today. Adding `space_key` to a link fact adds a join to a query that already reads the space name.
37. Exports keep their own rule: an internal address means nothing in a file and is left out or turned into the file's own link (`html.go`), whichever form it has.

### 7. Addresses the server writes

38. Mail and notifications print the canonical address `<origin>/spaces/<KEY>/pages/<id>` (with `#comment-<id>`), or `<origin>/spaces/<KEY>` for a home page. Rows are read through `visibleRows` as today, so a mail only ever names a key of a space the person may see; the mail already names that space. The key is read when the mail is made, so a key changed after sending still works through rule 16.
39. The automation placeholder `page.url` becomes the canonical address, read as the rule's account sees the page.
40. Signing keeps its return path `/pages/<id>`; the page opens and replaces its address (rule 15). Its check of the return path stays as strict as today.
41. Webhook payloads and REST responses keep ids and add nothing: an address is not part of the API (D10).
42. The login screen's `next` keeps whatever address the person asked for.

### 8. Copy link and the address shown

43. Copy link (Share, the tree, Page information, the link of a heading) copies the canonical address, with the fragment of the heading. The space menu copies `/spaces/<KEY>`.
44. Page information shows the canonical address.
45. One helper builds every address of a page in the client, from an id and, when known, a key and whether it is the home page. Hand-built `` `/pages/${id}` `` strings go, and a check in `make check` refuses new ones in `web/src` outside the helper and the API calls (D13).

## Order with other waves

- **SC2 (spec 079)** rebuilds the page screen, its header row and the breadcrumbs. UR1 builds after it lands, on the same files. SC2 and SC1 landed first; UR1 was built on them (2026-11-20).
- **SC5 (spec 083)** puts Features in the General group and the Access group with Permissions, Public site and Audit of the space. The setting of section 5 is a section of its own in the Access group, after Permissions, named **When someone cannot see this**, with `?section=no-access`; the Features card loses the switch Requests for access. If UR1 lands before SC5, the setting sits where the Features switch is today and SC5 moves it; whichever lands second makes the move, and the spec of SC5 gets a line saying so.

## Build notes (2026-11-20)

The product owner set two rules on 2026-11-17 that the build follows: until 1.0 the API and every part of the app may change radically, so compatibility kept only for the API may be simplified; and every feature must be usable through the API. The build therefore differs from the text above where the decisions below say so.

- The canonical address can be read through the API: `GET /api/v1/pages/{id}` carries `space_key` and `address` (the path, without the origin), and link facts and notifications carry `address` (D19, overrules D10).
- The setting is set with `PUT /api/v1/spaces/{id}/access-answer`, as the other settings of a space are, not `PATCH` (D20).
- The client no longer understands `not_found_ask`, and the server no longer accepts `access_requests` on `PUT /api/v1/spaces/{id}/features` (400) nor lists it in a space's `features` (D21, overrules the last line of D16 and of the API section). The feature rows stay in step for the previous release, as the Data section says.
- A space created by a node of the previous release during an overlap is not put in step on first read (D24).
- The study found two more things to do in this wave, built with tests first: one key, current or old, belongs to one space in the database itself, through `space_key_claims` (D25); and a release turns old keys of the draft space into the published key as it does the current key, and keeps them in its link map so verification does the same (D26).

## API, as built

Every part of this spec can be used through the API (MCP):

| What | Route |
| --- | --- |
| Read a page's canonical address and its space's key | `GET /api/v1/pages/{id}`: `address`, `space_key` |
| Read the canonical address of linked pages | `POST /api/v1/pages/link-facts`: `address` and `space_key` per page |
| Read the address of a notification's page | `GET /api/v1/me/notifications`: `address` per item |
| Find a space by a current or old key, in any case | `GET /api/v1/space-keys/{key}`: the space with its current `key` |
| Read what a person without access sees | `GET /api/v1/spaces/{id}`: `access_answer`, and `access_ask_off` when the instance turned requests off; for those who may administer the space |
| Choose what a person without access sees | `PUT /api/v1/spaces/{id}/access-answer` with `{"answer": "not_found" \| "no_access" \| "no_access_ask"}`: 204; 400 `invalid_input` for another value; 403 or 404 without space administer; 409 `managed_space` for the draft space of a pair |
| What a refused page answers | `GET /api/v1/pages/{id}`: 404 `not_found`, or 403 `no_access` or `no_access_ask` with a fixed message |
| What a refused space answers | `GET /api/v1/space-keys/{key}`: 404 `not_found`, or 403 `no_access` |
| Ask for access from the no-access screen | `POST /api/v1/pages/{id}/access-requests` with `{"kind": "view"}`: as before, and 429 `too_many_requests` past 20 open requests to view |
| The old and the current key of a space | `GET /api/v1/spaces/{id}/old-keys`, `PUT /api/v1/spaces/{id}/key`, `DELETE /api/v1/spaces/{id}/old-keys/{alias}`, unchanged |

## Decisions on the product owner's behalf (2026-11-16, may be overruled)

Each is decided on the product owner's behalf on 2026-11-16, and may be overruled.

- **D1, scheme:** `/spaces/<KEY>` for the home page and `/spaces/<KEY>/pages/<id>` for everything else, with the id as the anchor. The id is what the server finds a page by, so the key never decides which page opens and can change freely.
- **D2, no title in the address:** titles change, a title can be confidential while the page's existence is not, a link pasted in a chat would show it to everyone, and the id alone is enough. Accepting a trailing title and ignoring it is not done either: it would let a wrong title live on in links.
- **D3, the key's case:** the canonical address uses the key as stored; lookups ignore case. Keys may legitimately be lower case (personal keys are), and forcing upper case would make a second spelling the canonical one.
- **D4, the home page's screens** use `/spaces/<KEY>/pages/<home id>/<screen>`, so one rule serves every page; only the page itself has the short address.
- **D5, client-side replacement, no server redirect:** the server sends the app for every address and the app already asks for the page and its space, so finding the canonical address costs no request; a server redirect would need its own access check on a second path.
- **D6, the kind is not in the address,** because Convert changes the kind.
- **D7, documents store ids,** and the gate normalises pasted canonical addresses to `/pages/<id>`, so no stored content holds a key.
- **D8, keys are identifiers, not secrets,** and the information under the key field says that a key shows in every link.
- **D9, public sites and single shared pages keep their addresses,** without a key: they are for people outside the installation.
- **D10, the API adds no address field.** Clients build addresses from ids and keys they already get.
- **D11, the default of section 5, decided by the product owner on 2026-11-16:** existing spaces keep today's answer (Requests for access off becomes Not found, on becomes No access and ask), so nothing an administrator did not choose is revealed after an upgrade; a new space starts at No access, and ask for it, whose button sends a request to the space's owners (rule 29a). This is not a decision on the product owner's behalf.
- **D17, who is asked:** the first space owner who may grant, then today's chain. One person, because the table holds one; space owners who cannot grant would leave a request nobody can answer.
- **D18, a cap of 20 open view requests per person:** with asking on by default, one person could otherwise send a request for every page id they have seen; the existing limits are per page.
- **D12, the instance's switch:** an administrator who turned requests for access off everywhere still does; a space set to ask then answers No access. The instance-wide choice of COL-109 stays later.
- **D13, one helper for page addresses,** guarded by a check, because some ninety hand-built strings would otherwise drift apart again.
- **D14, the draft space of a pair always stays hidden** (rule 28).
- **D15, one release,** not two: the claimed setup is one node (decision of 2026-11-13), and section 9 lists what an overlap of two releases does.
- **D16, the no-access answer is 403** with the code `no_access` or `no_access_ask`, and never names the page or space; Not found stays 404 with today's code. The old code `not_found_ask` is still understood by the client for one release (overruled by D21).

## Decisions on the product owner's behalf (2026-11-20, may be overruled)

Each is decided on the product owner's behalf on 2026-11-20, and may be overruled.

- **D19, the page carries its address:** every feature must be usable through the API, so `GET /api/v1/pages/{id}` gives `space_key` and `address`, read in the query the page runs anyway; a client no longer needs to know the rule of section 1. Link facts and notifications carry `address` as well.
- **D20, `PUT` for the setting,** as for every other setting of a space (`/key`, `/features`, `/title-align`).
- **D21, no compatibility kept only for the API:** `not_found_ask` is gone from client and server, and the feature `access_requests` is refused on the features route and left out of a space's `features`. The administration's list of features for every space keeps it, since D12 reads it.
- **D22, a new space without requests:** where an administrator listed requests for access among the features that start off in new spaces, a new space starts at No access instead of No access, and ask for it, so that choice keeps meaning something.
- **D23, the screen of a space has no button to ask,** as rule 27 says, and both screens offer the way to the start screen.
- **D24, no repair on first read:** a space made by a node of the previous release during an overlap starts at No access, and ask for it on the new nodes while the old ones answer not found, until every node runs this release. One node is the claimed setup (D15); the upgrade notes say so.
- **D25, keys in one table of claims:** `space_key_claims` holds every key a space holds, current and old, in lower case, as its primary key, kept by triggers on `spaces` and `space_key_aliases`. A claim of a key another space holds fails as a unique violation, which the spaces module answers as `key_taken`. An old key that already is another space's current key keeps its row without a claim; lookups find the current key first.
- **D26, old keys of the draft space in a release:** the rewrite treats an old key of the draft space as its current key, in addresses and in blocks that name spaces, and the link map keeps them under `space:draft_old_keys`, so verification does the same rewrite. They are read once per run, with the spaces.
- **D27, the check of hand-built addresses is a lint rule** in `web/eslint.config.js`, which refuses `/pages/` in a template or string in `web/src` unless it goes straight to `api`; an API path kept in a variable says why on its line. Where a screen does not know a page's space, `pagePath` gives `/pages/<id>`, which the page screen replaces on arrival.
- **D28, the tests of earlier specs keep hidden spaces:** the helper that makes a space in `internal/app` sets it to Not found, because those tests are about who may see what and expect "not found"; the tests of this spec make spaces as a new one starts.

## Changes to blueprint 03

The build updates these lines and their status, as the product owner's answers of 2026-11-16 decide:

- NAV-008 and PAG-038: a page keeps its id in its address whatever happens; a rename never changes the address; a move to another space gives it the new space's key, and the old address leads to the new one.
- PAG-045: a move keeps old addresses working through the id.
- SPC-012 and SPC-093: an old key leads to the current one in every address; the information explains that the key shows in every link, and that a freed key leads to whichever space takes it.
- COL-049 and decision 9 of `03-functional-requirements.md`: a space chooses what a person without access sees; a new space starts at No access, and ask for it, and an existing space keeps its answer (D11); COL-051 names the space owners first for a request from the no-access screen (rule 29a).
- New lines, numbered at landing with the next free numbers of their chapters: the address scheme (section 1), the canonical replacement (section 2), the setting of section 5, and the no-access screen.

## Permissions and audit

- Nothing new is allowed. Reading a page or a space keeps its check; the canonical address is built only from answers the person was allowed.
- The answer for a person without access is decided in the module that refuses: `sharing` for a page (its `MayAsk` grows into one function that gives Not found, No access or No access and ask), `spaces` for a space address. The handler only writes what the module decided (CLAUDE.md: the module makes the decision).
- Changing the setting: *space administer*, audited as `space.access_answer_changed` with `from` and `to`, and an outbox event `space.updated` in the same transaction, as other space settings do.
- The migration's copy of the old switch into the setting writes no audit event: it changes nobody's answer.

## API

- `GET /api/v1/pages/{id}` refused: 404 `not_found` as today for every case of rule 21; 403 `no_access` or `no_access_ask` for a space that chose so, with a fixed message and no other field.
- `GET /api/v1/space-keys/{key}` refused: 404 as today; 403 `no_access` for a space that chose No access or No access and ask.
- `GET /api/v1/spaces/{id}` returns `access_answer`: `not_found`, `no_access` or `no_access_ask`, for those who may administer the space; `PATCH /api/v1/spaces/{id}/access-answer` with `{"answer": ...}` sets it (refused with 400 for an unknown value, and with 409 `managed_space` for the draft space of a pair).
- `POST /api/v1/pages/link-facts` adds `space_key` to each fact.
- The feature `access_requests` disappears from the Features list in the client; the server keeps accepting it for one release (section 9) and keeps it in step with the setting.

## Data

One expand migration, numbered at landing: 0076 (`0076_space_access_answer.sql`), which also adds `space_key_claims` (D25):

- `spaces.access_answer text NOT NULL DEFAULT 'not_found'` with a check on the three values, which gives every existing space Not found;
- set to `no_access_ask` for every space whose `space_features` row has `access_requests` enabled;
- then the column's default becomes `'no_access_ask'`, so a space made afterwards starts at No access, and ask for it (D11); the new release also turns `access_requests` on for a space it creates, and a space created by a node of the previous release gets its feature row in step when the new release first reads it;
- `space_features` rows for `access_requests` stay, so the previous release keeps reading them. While both releases may run, the new release writes both: `no_access_ask` turns the feature on, the other choices turn it off. A later contract migration removes the feature rows once no node of the previous release runs.

No other table changes. Documents are not rewritten: they already hold the id form.

## Version skew (two releases side by side)

- Old client, new server: it builds `/pages/<id>` addresses, which work forever. It shows the 403 of a no-access space as a generic refusal, without the ask button, until reloaded.
- New client, old server: the new server's routes are client routes, but a reload of `/spaces/<KEY>/pages/<id>` that reaches a node of the old release gets the old app, which does not know the route and says not found until that node is upgraded. The old server answers `not_found_ask`, which the new client still shows with its button.
- A document saved through an old node during the overlap may hold a pasted canonical address; rule 34 keeps it working, and the next save normalises it.
- The old release reads `access_requests`, which the new release keeps in step, so both answer the same.
- The upgrade notes say this, and that a single node has no overlap.

## Load budget

- Reading a page: no new query on the path that succeeds. The client already asks for the page and its space; the canonical address is computed from both. Opening `/spaces/<KEY>` costs what it does today (the key, then the page), with one history entry less.
- A refusal: one more query, reading `access_answer` of the page's space, on the failing path only (the `MayAsk` query it replaces costs the same). `internal/app/query_budget_test.go` gets the refusal path with this count.
- Link facts: one join to `spaces`, already joined for the name.
- Mail and automation: one join for the key, in background work.
- No cache: the key comes with data already loaded.

## Tests to write first

Server (`internal/app`, `internal/sharing`, `internal/spaces`, `internal/document`, `internal/publishing`):

1. **No leak, hidden space:** for a space at Not found, `GET /pages/{id}` answers the same status, code and body for an unknown id, a trashed page, a template, someone else's draft, a page behind a restriction, and a page in a space the person may not see; `GET /space-keys/{key}` answers the same for an unknown key, an old key and a current key of a hidden space.
2. **A space set to stay hidden still answers not found** after it was set to No access and back, and after the instance turned requests off.
3. No access: the 403 body holds no title, name, key or id; it is the same for a page restricted in a visible space and a page in a hidden space; a trashed page, a template and a draft in that space still answer 404.
4. No access and ask: the code is `no_access_ask`; asking works as before; with the instance's switch off it answers `no_access`.
5. The draft space of a pair: the setting is refused with `managed_space`, and its pages answer not found.
6. The setting: refused without *space administer*, audited with from and to, an unknown value refused.
7. The migration: an existing space with the feature on gets `no_access_ask`, other existing spaces `not_found`; a space created after it, through either release, gets `no_access_ask`; both releases' tests read the same answer.
7a. The request from the no-access screen asks the first space owner who may grant; with no such owner it asks today's chain; the 21st open view request of one person is refused with 429; a second request for the same page and one within a week of a refusal are refused as today; each request writes `access.requested`. A mutation removes the owners step and one removes the cap.
8. `GetByKey` ignores case, finds an old key, and gives the current key in its answer.
9. `Normalize` turns `/spaces/X/pages/<id>#h` into `/pages/<id>#h`, leaves `/spaces/X` and `/spaces/X/settings` alone, and leaves outside addresses alone; `LinkedPages` and the HTML export find both forms.
10. A release rewrites `/spaces/<draft>/pages/<draft id>` to the twin's id form, rewrites an old key of the draft space, and the fuzz test of spec 073 also generates both forms and old keys and finds no draft id or key in the result.
11. Mail and `page.url` print the canonical address, with the comment fragment, and a mail never names a key of a space the person lost access to (the row is gone).
12. Mutations for `make mutation`: `failPage` answering no access for a space at Not found; the no-access answer adding the title; the refusal of the setting in a draft space; `Normalize` keeping the key.

Client (`web/src`, unit):

13. The address helper: home, other page, screens, fragment and query kept, key as stored.
14. The canonical replacement: from `/pages/<id>`, from another key, from an old key, from the home's id form; not before the page was allowed; never for a refused page.
15. `pageOfAddress` and the comment box find both forms.
16. The check refuses a hand-built `/pages/${...}` outside the helper.

Browser (`web/e2e`):

17. Opening `/pages/<id>` lands on `/spaces/<KEY>/pages/<id>`; opening `/spaces/<KEY>` shows the home page and stays; Back after a replacement does not return to the old form.
18. After a key change, an old link opens and shows the new key; after a move, the old link shows the new space's key.
19. A person without access: Not found, No access and No access and ask each show their screen, and the address in the bar is never replaced.
20. Copy link from Share, the tree and a heading gives the canonical address.
21. The address assertions of the existing suites (`toHaveURL` with `/pages/`) follow the new form; their `goto('/pages/...')` stay, because they now also prove old addresses work.

Design pictures (`web/e2e/0-design.spec.ts`): the no-access screen with and without the ask button, at full width and at 360 pixels, and the setting's section. Each picture is looked at before committing; axe finds nothing on them.

## Acceptance criteria

- [ ] Every page has the canonical address of section 1, and the home page is `/spaces/<KEY>`.
- [ ] Every old form of section 3 opens and is replaced by the canonical address; nothing is replaced before access is allowed.
- [ ] A space at Not found answers every case of rule 21 identically (test 1 and 2).
- [ ] The setting of section 5 works with its three choices, its defaults, its audit and the draft-space rule.
- [ ] No document stores a key; links survive a key change and a move.
- [ ] Mail, notifications and `page.url` print the canonical address; webhooks and the API are unchanged except the fields named under API.
- [ ] Copy link copies the canonical address everywhere.
- [ ] The design pictures are new and looked at; axe is clean.
- [ ] `make check`, `make mutation` and `scripts/e2e` are green; the query budgets hold.

## Build plan

In this order; S is under a day, M a day or two, L more.

1. **S** Server: `GetByKey` gives the current key; the case and alias tests (8). Tests first.
2. **M** Server: `Normalize` and the three patterns accept and store the id form; the release rewrite handles both forms and old draft keys; the fuzz test extended (9, 10).
3. **M** Migration and setting: `spaces.access_answer`, kept in step with `access_requests`; the `sharing` and `spaces` answers; `failPage` and the space-key handler; audit, outbox, the draft-space rule; mutations (1 to 7, 12).
4. **M** Client: the address helper and the check; the route table with `/spaces/:key/pages/:id` and its screens; `SpaceHome` renders the home page in place; the canonical replacement in `SpaceShell` and the space screens (13 to 16).
5. **L** Client: every page address through the helper (about ninety places), copy link, Page information, the comment box, link facts with `space_key`.
6. **S** Mail, notifications and `page.url` (11).
7. **M** The no-access screen and the setting's section (in Features' place or SC5's Access group), translations, design pictures, axe.
8. **M** The e2e suites: new address assertions and tests 17 to 21.
9. **S** Blueprint lines, the design standard's list if the screen counts as a new screen, `docs/operations` upgrade notes, the changelog, the handoff and report.

## Upgrade notes (to go into the operations guide)

- Page addresses change their form; every old address keeps working, including those in sent mail and saved bookmarks.
- Spaces that offered requests for access now say "no access" instead of "not found", with the same button. All other existing spaces still answer not found. A space created after the upgrade starts at "no access" with a button to ask its owners for access; its administrators can choose otherwise. One person may have at most 20 open requests to view.
- With two nodes of different releases, a reload of a new address on an old node may show not found until that node is upgraded.

## Tenants

If the product ever serves several tenants in one installation, keys would be unique per tenant, not per installation, and the address would need the tenant before the key (or a host name per tenant). Nothing here prevents that: a page is still found by its id, and the key in the address only names the space. No tenant work is part of this spec.

## How the product owner tests it

1. Open a space: the address is `/spaces/` and the key. Open a page in it: `/spaces/`, the key, `/pages/`, then the id.
2. Paste an old `/pages/...` link: the page opens and the address shows the key.
3. Change the space key, then open an old link: it opens with the new key. Move a page to another space: its old link shows the other space's key.
4. In a space's settings, choose what someone without access sees. With a person who may not see the space, open a link in each of the three choices: Not found, No access, and No access with an Ask button.
5. Copy a link from Share and paste it: it holds the key.

## Provenance

Own design, from the product owner's requests of 2026-11-16 and the existing code and blueprint lines named above. The history methods follow the HTML Living Standard's `history.replaceState` (html.spec.whatwg.org, consulted 2026-11-16) and status codes RFC 9110 (sections 15.5.4 and 15.5.5). No other product's addresses, text or pictures were used.
