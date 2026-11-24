# 089: The installation's own header and footer

Status: built in wave HF1 (2026-11-23), experimental and off by default; the study was written on 2026-11-16, before SC1, SC2, SC4, RV11, MC2, QG1, QG2 and ST1 landed, and "Since the study" below says what changed with them
Phase: a new part before 1.0, allowed by the product owner on 2026-11-15 as an exception to the feature freeze of ADR-043, on the condition that it is experimental and off by default (wave HF1)

## Since the study (2026-11-23)

`main` moved a long way between the study and the build. What changed for this part, each decision marked "decided on the product owner's behalf on 2026-11-23, may be overruled" in the list at the end (D15 to D23):

- **The product is Kenwerk** (spec 095). Words and documents say Kenwerk.
- **SC1, SC2 and SC4 landed.** The registry of sections (`views/admin-sections.ts`), `SettingsSection`, `SaveReset` and `Notice` exist, and the page is drawn as behaviour 9 expects. The registry entry carries the experimental part, as Automation and Import a space already do.
- **RV11 landed (spec 090).** Every settings change records each changed field before and after in `settings.updated`, and a link mark keeps no title anywhere: the gate drops it for every document, so the title rule of D3 needs nothing of its own here. The gap the study found, that a settings change recorded only its new values, is closed on `main`. The header and footer record their change in the same event and the same shape (D16).
- **MC2 added a scope to every route** (`internal/httpapi/scopes.go`, spec 096): a route without one does not start. The three routes get theirs in "Through the API".
- **Spec 085:** a token may read the administration but never change it, decided by the router for every route below `/api/v1/admin/`. The admin read follows that rule (D19).
- **A fresh login** that is missing answers `403 reauth_required`, not `401` (D15).
- **QG1 and QG2 added `make lint` with a ratchet:** every new package and every new line must be clean.
- **ST1 added `internal/connections`**, which this part does not touch.

## Problem

Many organisations need one line on every page that is the same everywhere: a classification such as "Internal", a note on how long content is kept, or who to contact about the wiki. Today an administrator can only put a site-wide banner under the top bar, which readers dismiss and which is meant for news and maintenance (ADM-017), or ask every space administrator to repeat the line in each space. Blueprint 03 asks for a header and a footer that the administration sets once and that show above and below the document of every page and blog post (ADM-147 to ADM-149). This spec plans that part. It writes no code: the setting is a section of the administration as wave SC4 rebuilds it, it sits on the page as wave SC2 rebuilds it, and neither has landed.

What makes this part delicate is who sees it. An administrator writes it once, and every reader sees it on every page, inside the product's own frame, where readers trust what they see as much as the product itself. Whoever controls it, legitimately or with a stolen session, holds a channel to every reader. The plan therefore starts from what the content may hold and how it is checked, and only then from where it shows.

The look stays ours: colours, icons, fonts and every value come from `tokens.css` (ADR-021, ADR-045). Only the arrangement follows the lines.

## Study

### What each line asks

| Line | Asks | Notes from the study |
|---|---|---|
| ADM-147 | A header and a footer for the whole installation, in the section Header and footer of the Look group (ADM-074): content above and below the document of every page, blog post and live document, such as a classification line or a contact. Both empty by default; a change is audited with what changed (SEC-603). | Pages and blog posts are both drawn by `views/page.tsx`. Live documents do not exist yet (OTH-001); they get the band when they are built. The audit records the content before and after (D10). |
| ADM-148 | Written in the editor like a page; may hold text, links, images from attachments and dynamic blocks, as a space's do (SPC-158). Each reader sees them as the editor renders a page (PAG-122); a dynamic block shows each reader only what they may see (BLK-006); an image from an outside address is not fetched (deliberate difference 5). | Text and links are built, through a strict subset of the document format (D2). Images need a store of their own and dynamic blocks a measured load; both wait (D4, D5). The rendering rule of PAG-122 holds unchanged. |
| ADM-149 | Under the introduction, the header field and then the footer field: a small bold label above an editor field about three lines tall and half the column wide, empty, with no placeholder or preview; then Save and Reset changes (NAV-162). Where they sit on a page, how they combine with a space's own header and footer, whether print, exports and public sites show them, and their cost on every page load need their own study. | The study is this spec: place (D6), combination (D7), print, exports, public sites, mail and the login page (D8), and cost (Load budget). |
| ADM-074 | The Look group holds Look, PDF design, Header and footer, and Watermark. | One entry in SC4's registry, present only while the part is on. |
| ADM-067, ADM-115 | An experimental section that is on carries the Experimental mark; one that is off stays hidden. | SC4 builds both through the registry. |

The lines these lean on, read in full: SEC-603 (settings changes are audited with what changed), SPC-158 and SPC-159 (the header and footer of a space, not built), PAG-122 (stored documents are only rendered by the editor), BLK-006 (permissions come first in dynamic blocks), NAV-162 and NAV-163 (Save and Reset changes), NAV-113 (the introduction), ADM-005 (sensitive changes ask for the password again), ADM-092 (a form edits in place), EXC-012 and EXC-060 (the PDF design has a header and footer of its own), and the fifth deliberate difference of blueprint 03 (the server fetches nothing outside by default).

### What is built today

| Part | Where | What it gives this part |
|---|---|---|
| The document gate | `internal/document`: `Normalize` rebuilds every node and mark from an allow-list; `attrCleaners` keep only named attributes; `SafeHref` allows http, https, mailto and paths that start with `/` or `#`, and refuses every other scheme in any spelling, protocol-relative addresses, backslashes and control characters | The base of the check. The header and footer go through `Normalize` first and then through a stricter check of their own (D2, D3) |
| Rendering a stored document | `DocumentView` in `web/src/components/editor/editor.tsx`: the editor, read-only, so no HTML from a document reaches the browser; outside links get `rel="noopener noreferrer nofollow"` and `target="_blank"` from `extensions.ts` | The band renders through it, with `plain` (no heading links, no comment marks) and without `checkLinks` (D3) |
| A small editor | `CommentBox` in `components/comments/comment-box.tsx` builds a reduced editor with its own extensions and allowed link protocols | The pattern for the field's editor: the same base, a smaller set of tools |
| Settings that are not sections | `settings.Load`, `settings.Store` and `settings.Write` keep one JSON value under one key of `settings`; the logo and the experimental parts live this way | The header and footer are one value under the key `header_footer`, outside the generic section route (D12) |
| A node's cached reading of a setting | `settings.Service.Maintenance` rereads its key at most every five seconds and updates at once after its own write | The same pattern, at 30 seconds (Load budget) |
| Fresh login for a change | `httpapi.Sensitive` asks for a login at most 10 minutes old; the console's dialog answers `reauth_required` by itself | Saving the header and footer is `Sensitive(administrator)` (D9) |
| The look the browser reads | `GET /api/v1/appearance`, public because the login page needs the logo, name and font | Not used: the header and footer are for people who are logged in (D8) |
| The app's content security policy | `internal/webui/webui.go`: scripts only from our origin, no inline script, Trusted Types, images from our origin, `data:` and `blob:` | No change needed (see "Security") |
| Experimental parts | `internal/features/experimental.go`: `ExperimentalParts`, `SetExperimental`, `RequireExperimental` (`404 experimental_off`); `testutil.AllExperimentalOn` and `scripts/e2e` turn every part on for the tests; `TestTheTestDatabaseTurnsOnEveryExperimentalPart` fails until a new part is in both; `/api/v1/system/capabilities` tells the browser | One more part, `header_footer` (D1) |
| Where the page draws its body | `views/page.tsx`: for kinds other than folder, link and database, the body is a `DocumentView` after the title, byline, page notes and bands; after it come child pages, labels, reactions and comments. Blog posts are the kind `post` of the same view. SC2 keeps this order under its new header row and byline | The two places the band goes (D6) |
| Files that leave the installation | `document.ToHTML` and `document.Shell` write exported HTML, public sites and the input of the PDF helper. That HTML is never served by the installation to a browser (spec 014, D1) | Not touched: exports and public sites carry no instance header or footer (D8) |
| A space's header and footer | SPC-158 and SPC-159, not built; wave SC5 (spec 083) leaves them out of its Layout section | The order of the two is fixed now, for when the space's arrive (D7) |

Nothing of the header and footer exists in the code today, and no line of blueprint 03 about them has the status built.

### What the content may become in the wrong hands

The plan guards against these, each named in the tests:

1. **Script in the content.** Markup, event handlers or a `javascript:` address in a link, in any spelling. Guarded by the gate, by rendering through the editor only, and by the content security policy as the last line.
2. **A link that lies about where it goes.** Link text such as "Log in again" leading to another host; an address with a user part (`https://intranet.example@other.example/`); a host in letters that look like another's; text turned around by direction controls. Guarded by the stricter link rule (D3), by showing the host of every outside link (D3), by the outward mark, and by refusing direction controls in text (D3).
3. **A stolen administrator session.** Guarded by a fresh login for every save (D9), the audit of every change with its content before and after (D10), and the line of who changed it last on the section itself.
4. **Too much.** A header that pushes the page out of view, or a value so large that every page load carries it. Guarded by limits on text, paragraphs, links and bytes (D11).
5. **Content that reaches the wrong readers.** A line meant for colleagues on a public site or on the login page, where nobody is logged in; a dynamic block that shows one reader what another may see. Guarded by showing the band only to people who are logged in, only inside the app (D8), and by leaving dynamic blocks out until they are studied (D5).
6. **Load.** One more request on every page view for every reader. Guarded by a per-node cache and a browser that asks at most once a minute per tab (Load budget).

## Lines in scope

| Line | Was | After HF1 | What changes |
|---|---|---|---|
| ADM-147 | new | built | Behind the experimental part. Pages and blog posts; live documents get the band when they exist (OTH-001) |
| ADM-148 | new | partly | Text and links through the subset of D2. Images (D4) and dynamic blocks (D5) wait for their own study |
| ADM-149 | new | built | The section as the line says; the study it asks for is decided in D6 to D8 and the load budget |
| ADM-074 | new (partly after SC4) | partly | The Header and footer entry joins the Look group while the part is on |

## Behaviour

### The section in the administration

1. **Entry.** One entry of SC4's registry: id `header-footer`, settings tier, group Look, after PDF design and before Watermark as ADM-074 orders them (those two are not built, so in practice after Look), width `column`, experimental part `header_footer`, documentation path `operations/header-and-footer.md`. While the part is off the entry is absent and the address says that the part is off and where to turn it on (spec 081, D8).
2. **Head.** Through `SettingsSection`: the title "Header and footer", then two sentences: that the header shows above and the footer below the text of every page and blog post, for everyone who is logged in, and that both may hold text and links; then the documentation link (NAV-113). No primary action in the title row, because the form has its own Save (NAV-162), and no More.
3. **The fields.** Under the introduction, **Header** and then **Footer**: each a small bold label above an editor field about three lines tall and half the column wide, empty at first, without a placeholder and without a preview (ADM-149). The field's editor offers exactly what the content may hold (D2): bold, italic, underline, a text colour from the named list, a status mark, a link, and alignment. Nothing else is offered, so a writer never builds what the server will refuse. Pasted content is cut down to the same set in the browser; the server checks it again either way.
4. **A hint under each field** (ADM-087): at most 600 characters and 5 links; an outside link shows its host to readers; the content is kept in the audit log. The numbers come from the server's limits through `en.json`, never typed twice (D11).
5. **Save and Reset changes** as one unit under both fields (NAV-162): inactive until a field changed; Reset changes puts back what is stored in both fields; a failed save keeps what was typed and shows the refusal as an error notice that names the field and the reason, such as "The footer links to an address that is not https." Emptying a field and saving removes that part.
6. **A fresh login.** Saving asks for the password or a passkey again when the last login is older than 10 minutes, through the console's existing dialog (ADM-005, D9). Nothing is stored until it succeeds.
7. **Facts below the fields** (NAV-160): "Last changed by" with the person's name and a relative time, or nothing while it was never changed. A person who no longer exists shows as no longer active (`PersonMark`).
8. **Turning the part off** hides the section and the band, and keeps what was written: turning the part on again shows it as it was (D1).

### On a page

9. **Where.** On the reading view of a page and of a blog post (the kinds `page` and `post`, the home page of a space included), the header stands directly above the document's body, after the title, byline, page notes and bands; the footer stands directly after the body, before child pages, labels, reactions and comments (D6). Both take the width of the reading column and follow full width when the page uses it.
10. **Not elsewhere.** The band is not shown in the editor, in a comparison of versions, on an older version, in a template's preview, on folders, links and databases, on the start screen, in search results, in the administration, in the settings of a space or in Your account (D6).
11. **What a reader sees.** The content as the editor renders it (PAG-122), set apart from the page by space and in the text colour of the page, so it reads as the installation's words rather than the page's. Every link that leaves the installation carries the outward mark and, after its text, its host in muted words, such as "Contact (help.example.org)" (D3). Screen readers hear the host and that the link opens elsewhere. A link inside the installation is an ordinary link.
12. **Landmarks.** Each band is a `section` with an accessible name, "Note from this installation, above the page" and "Note from this installation, below the page", so a screen-reader user hears where the words come from and can skip them. There is no `header` or `footer` element: the frame already has the one banner, and the page is not the place for a second (D13).
13. **Light, dark, right to left, narrow.** Text and named colours come from tokens that pass 4.5:1 on the page in both themes (the design check holds the pairs); the host words use `--color-muted`, which passes too. Logical properties only, so right to left needs nothing of its own. On a narrow screen the band wraps like the text of the page.
14. **Print.** Printing a page prints the header and the footer, because a classification line belongs on paper too, with each outside link's host in the text (D8).
15. **When the band cannot be read.** The page shows without it and without a message: a missing note must never keep anyone from the page. The browser asks again on the next minute (Load budget). The administration shows its own failure as an error notice.
16. **When the part is off** nothing is asked and nothing is shown.

### Where it never shows (D8)

- The login page, the first setup and every screen before login.
- Public sites and single shared pages, which are static copies for readers without an account.
- Exports of every format (PDF, Word, ODT, HTML, Markdown, bundles). A PDF has the header and footer of its PDF design (EXC-012, EXC-060).
- Mails and notifications, and their excerpts of pages.
- Search: the header and footer are not part of any page, so they are not indexed, not counted in a page's words, and not copied with a page.

## Security

### The content model (D2)

The header and the footer are each a document of the existing format, stored and rendered as one, that passes two checks in this order:

1. `document.Normalize`, the gate every document passes: unknown nodes and marks refused, every attribute rebuilt from its own allow-list, links through `SafeHref`, at most 5 MiB.
2. `document.CheckHeaderFooter`, new, which walks the normalised tree and refuses anything outside this subset:

| Kind | Allowed | Attributes kept |
|---|---|---|
| Nodes | `doc`; `paragraph`; inside a paragraph `text`, `hardBreak` and `status` | paragraph: `align`, `dir`; status: `color`, `text`, as the gate keeps them. `indent` is dropped |
| Marks | `bold`, `italic`, `underline`, `textColor`, `link` | text colour: a name of the list; link: `href` only, never `title` (D3) |
| Not allowed | Headings (they would break the outline of the page under its title), lists, tables, panels, columns, code, quotes, rules, images, files, media, mentions, page links and cards, dates, every dynamic block, excerpts, charts, sheets, template fields and values, conditional sections, unknown blocks, and the marks strike, code, subscript, superscript and highlight | |

Refused means refused, not quietly dropped: the save answers `400` with a code and a sentence that names the field and what is not allowed, so an administrator never stores something other than what they saw.

### Links (D3)

Beyond `SafeHref`, a link in the header or footer must be one of:

- `https:` with a host of ASCII letters, digits, dots and hyphens (an international name is written in its `xn--` form), with no user part (`user@` or `user:pass@` before the host);
- `mailto:` with one address and nothing after it;
- a path inside the installation that starts with a single `/` and not with `//` or `/\`.

Refused: `http:` (a link on every page should not send readers over plain http), `#` anchors (they mean nothing across pages), every other scheme in any spelling (`javascript:`, `vbscript:`, `data:`, `file:`, `blob:`, `ftp:`), control and white-space characters anywhere in the address, and addresses over 2,048 bytes.

The link's `title` attribute is dropped, because a tooltip could claim another destination. Every outside link shows its host after its text to readers (behaviour 11), so the words of a link can never hide where it goes.

### Text (D3)

Text and status words must be valid UTF-8 without control characters and without the characters that override or isolate the direction of text (U+202A to U+202E, U+2066 to U+2069), which can turn an address or a word around on screen. Ordinary right-to-left text needs none of them: a paragraph's `dir` says its direction.

### Limits (D11)

Each field, after normalising: at most 600 characters of visible text (status words included), 5 paragraphs, 5 links, 3 status marks and 8 KiB of stored JSON. The numbers are named constants in `internal/document`, the API answers them in the admin read, and the hint shows them from there.

### Rendering and the content security policy

The band renders through a small React renderer of the subset (D24), so its content becomes DOM through React elements and never through HTML, which is what PAG-122 guards. The renderer knows only the subset, holds the link rule of the server, and turns a node it does not know into nothing and a mark it does not know into plain words, never raw markup. The app's policy (`script-src 'self'`, no inline script, Trusted Types, images only from our origin) already stops an injected script and any outside image; this part adds nothing that needs the policy to change, and the e2e test that reads the policy header keeps proving it unchanged.

### Who may change it (D9)

- `GET /api/v1/admin/header-footer`: `Permission(administrator)`, scope `admin:read`: a session, or a token of an administrator that holds `admin:read`, as every read of the administration since spec 085 (D19).
- `PUT /api/v1/admin/header-footer`: `Sensitive(administrator)`, scope `admin:write`, so an API token is refused and the login must be at most 10 minutes old. The service checks the global permission `administrator` itself through `identity.HasGlobalPermissionIn`, so no other caller can store without the check.
- System administration and a second factor are not asked: this change does not let more through in the sense of spec 076 (no weaker login rule, no fewer backups, no shorter audit), and every administrator already shapes what all readers see through the look, the banner and the login text.
- Reading for display: `GET /api/v1/header-footer`, `Permission(use_product)`, scope `content:read`: every person who may use the product, guests included, and their tokens, as `GET /api/v1/system/capabilities` (D18). Without a session it is `401`; the route is never public.

### Audit and outbox (D10, D16)

- A save writes one audit event `settings.updated` on the object `settings` / `header_footer`, in the same transaction as the change, with `details` holding `key` and `changes`, the shape of spec 090: for each field that changed, `before` and `after` as the stored documents (each at most 8 KiB by D11, kept whole rather than cut at 200 characters, because the content is what changed) and `removed: true` when a field was emptied. A save that changes nothing writes nothing and answers `200`.
- The same transaction enqueues `settings.updated` with `{"key": "header_footer"}`, as every other stored setting does.
- Turning the part on or off is the existing `PUT /api/v1/admin/experimental`, which already records `settings.updated`.
- Reads write nothing.

## API

`GET /api/v1/header-footer` (anyone who may use the product)

- `404 experimental_off` while the part is off; `401` without a session.
- `200`:

```json
{
  "header": {"type": "doc", "content": [{"type": "paragraph", "attrs": {"align": "center"}, "content": [{"type": "status", "attrs": {"color": "blue", "text": "Internal"}}]}]},
  "footer": null,
  "version": "0193f6d2c1e47a8b"
}
```

- `null` means that part is empty. `version` changes with every save, so the browser can tell a new value from the one it has.

`GET /api/v1/admin/header-footer` (administrator)

- `404 experimental_off` while off. `200`: the same `header` and `footer`, plus `changed_at` (or `null`), `changed_by` (`{"id", "name", "active"}` or `null`) and `limits` (`{"characters": 600, "paragraphs": 5, "links": 5, "statuses": 3, "bytes": 8192}`).

`PUT /api/v1/admin/header-footer` (administrator, fresh login)

- Body: `{"header": <doc or null>, "footer": <doc or null>}`. Unknown fields are refused, as everywhere in the API. A document whose text is empty is stored as `null`.
- `200` with the stored value as the admin read gives it.
- `400 invalid` with `fields`, one entry with `field` (`header` or `footer`), `problem` and a sentence in `message`; the problems are `not_allowed` (a node or mark outside the subset), `link_not_allowed`, `text_not_allowed`, `too_long`. A document the gate refuses answers `400 invalid` the same way, with the problem `not_allowed`.
- `403 reauth_required` when the login is too old (D15); `403 forbidden` without administration; `403 session_only` with a token; `404 experimental_off` while off.

## Through the API

Every part of Kenwerk is reachable through the API, and so by an assistant through MCP (product owner, 2026-11-17). The three routes, each with the one scope a credential needs (spec 096):

| Route | Rule | Scope | Through MCP |
|---|---|---|---|
| `GET /api/v1/header-footer` | `permission:use_product` | `content:read` | `call_api`, for any assistant token with `content:read` |
| `GET /api/v1/admin/header-footer` | `permission:administrator` | `admin:read` | `call_api`, for an administrator's token with `admin:read` |
| `PUT /api/v1/admin/header-footer` | `sensitive permission:administrator` | `admin:write` | Refused with the approval reason: a change below `/api/v1/admin/` needs the person's approval, which arrives with wave MC5; no token holds `admin:write` yet (spec 096, D5) |

Turning the part on or off is the existing `PUT /api/v1/admin/experimental` (`admin:write`), read through `GET /api/v1/admin/experimental` (`admin:read`), and `GET /api/v1/system/capabilities` (`content:read`) says `header_footer: true` while it is on. `routes.txt` and `openapi.json` list the three routes with their rules and scopes. No task tool is added: reading the header and footer is a rare task for an assistant, and `call_api` reaches both reads under their own rules.

## Where the code goes

- **`internal/document/header_footer.go`** (new): `CheckHeaderFooter(Node) error`, the subset, the link rule and the text rule, with the limits as named constants. Pure, so every case is a table test. It is part of the document package because it is a rule about the format, beside `Normalize` and `SafeHref`.
- **`internal/headerfooter`** (new package, D17): the stored value `Value` (`header`, `footer` as `*document.Node`, `changed_at`, `changed_by`, `version`) under the key `header_footer` of `settings`, read and written through `settings.LoadEach`, `settings.LoadEachLocked` and `settings.Store`; `Set(ctx, caller, input)`, which checks administration, normalises and checks both fields, compares with what is stored under a row lock, stores, audits and enqueues in one transaction; `ForReaders(ctx)`, which answers from the per-node cache; `ForAdministration(ctx)`, which reads anew. The key is not a section, so the generic `PUT /admin/settings/{section}` cannot reach it (`sectionValue` answers not found for any name it does not know).
- **The cache**: one value per node holding whether the part is on and the stored header and footer, read in one statement (`SELECT key, value FROM settings WHERE key = ANY(...)`, over `experimental` and `header_footer`) at most every 30 seconds, and dropped at once after a save or a change of the experimental parts on the same node. Other nodes follow within 30 seconds.
- **Routes** in `internal/httpapi/handlers_header_footer.go`: the reader route, the admin read and the admin save, each with its rule and its line in `scopes.go`.
- **The browser**: the registry entry and `web/src/views/admin-header-footer.tsx` through `SettingsSection`; a field editor `HeaderFooterField` in `components/` built on the reduced editor of `CommentBox`; the band `InstanceNote` in `components/` with a `place` of `'above' | 'below'`, used twice in `views/page.tsx`; the host after outside links as a small decoration of the band's read-only renderer; styles in `web/src/design/` with tokens only; every word in `en.json`; `header_footer` in `Capabilities` and `NOTHING_ON`. The query of the band has a stale time of 60 seconds and is enabled only while the capability is on and a page or post is open.

## Load budget

Nothing is claimed for 5,000 people until it is measured (step 7).

- **Class:** reading (ARC-233), because it rides along with every page view.
- **Part off:** the browser asks nothing, because the capability is off; the reader route, if called, answers from the node's cache with no statement beyond the session check.
- **Reader route, warm:** no statement beyond the session check, for every reader on the node, for 30 seconds. Cold: one statement over two keys of `settings`. Budget in `internal/app/query_budget_test.go`: `header and footer for readers` at the session statements plus at most one.
- **Browser:** at most one request per open tab per minute while pages are read, because the answer is shared by every page and kept for 60 seconds; moving between pages asks nothing new. At 5,000 people reading at once that is at most about 85 requests a second across the installation, each answered from memory after the session check. The measurement in step 7 states the real cost of the session check under that rate.
- **Page view:** the band adds no statement to the page's own read; the page's budget does not change.
- **Saving:** one locked read and one write of `settings`, one audit row, one outbox row, with a person behind each save; negligible.
- **Size:** at most 16 KiB of JSON for both fields, so the answer stays small on every page.

## Tests to write first

Failure paths first, then boundaries, then the happy path.

### `internal/document` (pure, table tests): `CheckHeaderFooter`

- **Script and markup:** text `<script>alert(1)</script>` is kept as text and never becomes a node; a node `{"type": "html"}`, `iframe`, `script` or any unknown type is refused by the gate; attributes `onclick`, `style`, `class` and `src` on a paragraph are dropped by the gate and never reach the stored value.
- **Link schemes:** each refused: `javascript:alert(1)`, `JaVaScRiPt:alert(1)`, ` javascript:alert(1)` with leading spaces, `java\tscript:`, `java\nscript:`, `javascript&#58;alert(1)` as literal text in `href`, `%6Aavascript:`, `vbscript:`, `data:text/html,<script>`, `data:image/svg+xml;base64,…`, `file:///etc/passwd`, `blob:`, `ftp://files.example/`, `http://intranet.example/`.
- **Link shapes:** each refused: `//other.example/`, `/\other.example/`, `\\other.example`, `https://intranet.example@other.example/`, `https://user:pass@other.example/`, `https://ехample.org/` with a Cyrillic letter, `#top`, an address of 2,049 bytes, an address with a space, tab, newline or NUL; `mailto:a@example.org?bcc=b@example.org` and `mailto:` with two addresses.
- **Link shapes allowed:** `https://help.example.org/wiki`, `https://xn--bcher-kva.example/`, `mailto:help@example.org`, `/spaces/HR/pages/0193f6d2`, and an address of exactly 2,048 bytes.
- **The link title** is dropped; a link with only a title and no address is refused.
- **Subset:** each node outside the table refused (heading, bulletList, table, image, inlineImage, file, mention, pageLink, date, dynamic, excerpt, chart, codeBlock, panel, columns, conditional, templateField); each mark outside it refused (strike, code, subscript, superscript, highlight); `indent` dropped from a paragraph.
- **Text:** each of U+202A to U+202E and U+2066 to U+2069 refused, in text and in status words; U+200F (a right-to-left mark) allowed; invalid UTF-8 refused by the gate.
- **Limits:** 600 characters pass and 601 are refused, counting status words; 5 paragraphs pass and 6 are refused; 5 links pass and 6 are refused; 3 status marks pass and 4 are refused; 8,192 bytes pass and 8,193 are refused.
- **Empty:** a document with one empty paragraph is empty, and stores as `null`.
- **Happy path:** a centred status mark "Internal" and a line "Questions: help@example.org" with a mailto link pass unchanged.

### `internal/settings` and `internal/app` (integration, a fresh database each)

- `TestTheHeaderAndFooterAreOffOnANewInstallation`: all three routes answer `404 experimental_off`, and the capabilities say `header_footer: false`.
- `TestOnlyAnAdministratorChangesTheHeaderAndFooter`: a member, a guest, a space administrator, a service account's token and an administrator's API token are refused; the service called directly with a member's caller is refused too.
- `TestChangingTheHeaderAndFooterNeedsAFreshLogin`: an administrator whose login is 11 minutes old gets `403 reauth_required` and nothing is stored or audited; after logging in again the same save holds.
- `TestTheHeaderAndFooterNeverCarryContentOfASpace`: a footer that links to a page of a space the reader may not open answers the reader with the stored link and words only: no title, no excerpt and no other word of that page reaches the answer, and a mention or a page link is refused when it is saved.
- `TestTheGenericSettingsRouteCannotReachTheHeaderAndFooter`: `PUT /api/v1/admin/settings/header_footer` answers not found and stores nothing.
- `TestARefusedHeaderAndFooterStoreNothing`: with a valid header and a footer holding `javascript:`, nothing is stored, no audit row and no outbox row is written, and the answer names the footer.
- `TestTheHeaderAndFooterChangeIsAuditedWithWhatChanged`: one event with `before` and `after` of the changed field only; removing a field records `removed`; saving the same value twice writes one event.
- `TestEveryReaderSeesTheSameHeaderAndFooter`: a member and a guest read the same answer; without a session the route answers `401`.
- `TestTheHeaderAndFooterAreReadOncePerHalfMinute`: two reads within 30 seconds cost one statement; after 30 seconds on a fake clock it reads again; after a save on the same node the next read shows the change at once.
- `TestTurningThePartOffKeepsWhatWasWritten`: off answers `404`; on again answers the stored value.
- The route walker lists the three routes with their rules; `TestTheTestDatabaseTurnsOnEveryExperimentalPart` fails until `header_footer` is in `testutil.AllExperimentalOn` and in `scripts/e2e`.

### Browser unit tests

- `web/src/components/header-footer-field.test.ts`: the field offers only the tools of the subset; pasting a heading, a list, an image and a highlighted word leaves plain paragraphs with the allowed marks.
- `web/src/components/instance-note.test.ts`: an outside link renders with its host after the text, `rel="noopener noreferrer nofollow"` and `target="_blank"`; a link inside the installation renders without either; a node the subset does not know renders nothing; the two regions have their names.

## Mutation lines

Each in `scripts/mutation-check.sh`, with the test that catches it:

| Mutation | Caught by |
|---|---|
| `CheckHeaderFooter` lets `http:` through | the link-scheme table test |
| the user-part check is removed | the link-shape table test |
| the ASCII-host check is removed | the link-shape table test (Cyrillic letter) |
| `//` is allowed as a path | the link-shape table test |
| `heading` joins the subset | the subset table test |
| `dynamic` joins the subset | the subset table test |
| the direction-control check is removed | the text table test |
| the character limit `>` becomes `>=` | the limits boundary test (600 passes) |
| the link limit is off by one | the limits boundary test |
| the save skips `CheckHeaderFooter` | `TestARefusedHeaderAndFooterStoreNothing` |
| the save route loses `Sensitive` | `TestChangingTheHeaderAndFooterNeedsAFreshLogin` |
| the service skips its own check of administration | `TestOnlyAnAdministratorChangesTheHeaderAndFooter`, calling the service directly |
| the audit event loses `before` | `TestTheHeaderAndFooterChangeIsAuditedWithWhatChanged` |
| the reader route works while the part is off | `TestTheHeaderAndFooterAreOffOnANewInstallation` |
| the cache never goes stale (`<` to `>` on the age) | `TestTheHeaderAndFooterAreReadOncePerHalfMinute` |

## End-to-end tests and design pictures

### End-to-end, new `web/e2e/header-footer.spec.ts`

- With the part off: no entry in the Look group; the address says the part is off; a page shows no band.
- Turned on in Organising: the entry appears in Look with the Experimental mark. An administrator writes a centred status mark "Internal" in the header and "Questions: help@example.org" in the footer and saves; Save asks to log in again when the login is old, and the change holds after it.
- A member opens a page, a blog post and the home page of a space: the header stands directly above the body and the footer directly after it, before child pages and comments; both are announced as notes from the installation; the footer's mailto link works.
- An outside link `https://help.example.org/` shows "(help.example.org)" after its words and the outward mark, and opens in a new tab.
- The editor, a comparison of versions, a folder and the login page show no band.
- **Attempts that must fail in the browser:** pasting HTML with `<img src=x onerror=…>`, `<script>` and an `<a href="javascript:…">` into the field leaves no image, no script and no link; sending a `javascript:` link straight to the API answers `400` with the field named, and the page shows nothing new; no dialog opens and the page logs no script error throughout.
- The response header of the app still holds the content security policy of today.
- Print emulation shows both bands.
- A guest sees the bands on a page they may read; a person logged out sees the login page without them.
- axe on the section and on a page with both bands, in light and dark; right to left; 360 px wide.

### New pictures in `web/e2e/0-design.spec.ts`

Each looked at in light, dark, narrow and right to left:

- `AdminView: header and footer` with both fields empty, and with both filled and Save active (`admin-header-footer`, `admin-header-footer-changed`);
- `AdminView: header and footer refused`, with the error notice that names the footer (`admin-header-footer-refused`);
- `PageView: the installation's header and footer`, with a short page and with a long one, because a picture only guards the state it shows (`page-header-footer-short`, `page-header-footer-long`).

Pictures that change: the SC4 sidebar pictures that show the Look group with every experimental part on, and Organising, which lists one more part. Page pictures do not change, because the fixtures of every other test leave the header and footer empty. The product owner sees each before and after in the report.

## Upgrade notes

- **No migration.** The part is a new name in the list under the key `experimental`, and the content is one new key of `settings`, written on the first save. An upgraded installation starts with the part off and nothing stored.
- **Mixed releases.** A node of the previous release knows neither the part nor the routes. A browser served by it does not ask; a browser of this release that reaches it gets `404` and shows the page without the band (behaviour 15). An administrator who saves the experimental parts through the previous release's screen sends a list without the new part, which turns it off again; turning it on once more after the upgrade is all it takes. Nothing is damaged, so the part is not held for older releases.
- **Restore.** A restored backup brings its own `header_footer` and `experimental` values; the band follows them within 30 seconds on every node.
- **Reset of the look.** Reset to defaults in Look (ADM-018) leaves the header and footer as they are: they are a section of their own, emptied by saving empty fields.
- **Documents.** `docs/operations/header-and-footer.md` is new: what the band may hold, where it shows and where not, the limits, and why outside links show their host. `docs/operations/upgrade.md` names the part among those that start off. The threat model's chapter on content gains one line on content that the administration shows to every reader, and the audit chapter names `look.header_footer_changed`.
- **Turning it off** hides the section and the band and keeps what was written.

## Build plan

SC1, SC2 and SC4 must have landed on `main` first: SC1 for the frame and the settings button, SC2 for the page as rebuilt (the band's places are under its header row and byline), and SC4 for the registry, `SettingsSection`, `Notice` and the Save and Reset changes unit. SC3 (the editor) is not needed: the field builds on the comment editor, not on the editor's strip. Wave SO1 adds a part to the same lists; whichever lands second adds its name beside the other's. Each step is one builder's work, ends with `make check` green, and commits its pictures. Sizes as in spec 081: S up to about 200 changed lines, M up to about 500, L more.

| Step | What | Lines | Size | Pictures |
|---|---|---|---|---|
| 0 | Rebase `wave-hf1` on `main` once SC1, SC2 and SC4 have landed. Check the registry's `experimental` field, the Look group, `SettingsSection`, the Save and Reset changes unit, and the order of the page under SC2 | | XS | none |
| 1 | **The part.** `header_footer` in `ExperimentalParts`, `testutil.AllExperimentalOn`, `scripts/e2e`, the capabilities answer and type, its name and line in Organising and `en.json`. Tests first: off on a new installation, can be turned on | ADM-067 | S | Organising |
| 2 | **The gate.** `internal/document/header_footer.go` with the subset, the link rule, the text rule and the limits; every table test above written first, the XSS cases among them; its mutation lines | ADM-148 | M | none |
| 3 | **Storing and reading.** `internal/settings/header_footer.go`: the value, the save with its own check of administration, the comparison, the audit with before and after, the outbox; the per-node cache over both keys. The three routes with their rules, the route walker, the query budget; the integration tests above | ADM-147 | M | none |
| 4 | **The section.** The registry entry, `admin-header-footer.tsx` through `SettingsSection`, `HeaderFooterField` with the reduced tools and the cut-down paste, the hint from the server's limits, Save and Reset changes, the error notice that names the field, the fresh login through the existing dialog, the facts below the fields; browser unit tests first | ADM-149, ADM-074 | M | the three admin pictures |
| 5 | **On the page.** `InstanceNote` with its two places and region names, the host after outside links, print styles, styles with tokens only; the two places in `views/page.tsx` for pages and posts only; the query with its stale time, enabled only while the part is on; browser unit tests first, then the e2e file | ADM-147, ADM-148 | M | the two page pictures |
| 6 | **Measure.** The reader route at the rate of the load budget on the build VM, with the cost of the session check; the cold read; numbers into `docs/operations/limits.md` and this spec's load budget | | S | none |
| 7 | **Documents and the last look.** `docs/operations/header-and-footer.md`, `upgrade.md`, the threat model and audit lines, the changelog, the status lines of blueprint 03 (ADM-147 built, ADM-148 partly, ADM-149 built, ADM-074 partly), the components table of the design standard (`InstanceNote`, `HeaderFooterField`), the full e2e once and `0-design.spec.ts` twice in a row, the report with every before and after picture, the handoff | | M | none new |

Step 2 may start before SC1, SC2 and SC4 land: it touches only `internal/document`. Steps 3 and 6 touch no screen either, and may start once step 2 is done; steps 4 and 5 wait for the waves they build on.

## Acceptance criteria

- [ ] A new installation and an upgraded one have the part off: no entry, no band, `404 experimental_off`, nothing asked by the browser.
- [ ] Only the subset of D2 can be stored; every case of the XSS table is refused or rendered as text, proved by the table tests and the e2e attempts.
- [ ] Only an administrator with a login at most 10 minutes old stores a change, through the route and through the service's own check; tokens are refused.
- [ ] Every change is audited with the content before and after, in the same transaction as the change.
- [ ] The band shows above and below the body of pages and blog posts for everyone logged in, never on the login page, public sites, exports or mail; outside links show their host.
- [ ] The reader route costs no statement beyond the session check when warm, and one when cold, per node per 30 seconds; measured at the rate of the load budget.
- [ ] `make check`, the whole e2e suite once and `0-design.spec.ts` twice in a row are green; the product owner has seen every new and changed picture.

## How the product owner tests it

1. Log in as an administrator and open the settings. Under Look there is no Header and footer yet.
2. Open Organising and turn on the experimental part "Header and footer". Look now holds Header and footer, marked Experimental.
3. Open it. Type "Internal" in the header, make it a status mark and centre it. In the footer type "Questions:" and an e-mail address as a link. Press Save. If you logged in long ago, you are asked for your password first.
4. Open any page and a blog post: "Internal" stands above the text, the footer below it, before the comments.
5. Back in the section, add a link to an outside address in the footer and save. On a page the link shows the address's host after its words.
6. Try to make a link that starts with `http://` or `javascript:` and save: the section refuses and says why. Nothing changes on the pages.
7. Open the audit log: one entry per save, with what the header and footer said before and after.
8. Log out: the login page shows neither. Log in as a member: both show on pages they may read.
9. Turn the part off in Organising: the section and both bands are gone. Turn it on again: they are back as you left them.

## Decided on the product owner's behalf on 2026-11-16, may be overruled

- **D1. One experimental part, `header_footer`, off by default, without a migration; turning it off keeps the content.** It is how ADR-043 adds an optional part, and nothing used it before. Keeping the content means an administrator can switch it off for a while without losing what they wrote.
- **D2. Text and links only, through a strict subset of the document format.** The lines name the editor and the format, so the band is a document that passes the same gate as every page, then a stricter check. The subset holds what a classification line or a contact needs: paragraphs, bold, italic, underline, named text colours, status marks, alignment and links. Everything else is refused, not dropped. A plain-text field would be simpler but would lose the status mark and alignment a classification line needs; the whole format would give every reader's page a second author with the full toolbox.
- **D3. Links: https, mailto and paths inside the installation; no plain http, no user part, ASCII hosts, no title; outside links show their host.** These close the common ways a link misleads: an address that names a trusted host before the `@`, a host in look-alike letters, a tooltip that claims another address, and link text that hides where it leads. Showing the host costs a few words and gives every reader the proof. Direction controls are refused in text for the same reason.
- **D4. Images wait.** Attachments belong to pages, and their permissions would hide an image from readers of other spaces; an image on every page needs a store of its own, as the logo has, with its own checks and size, and its own study. ADM-148 stays partly built.
- **D5. Dynamic blocks wait.** A dynamic block asks the server for each reader; in the band it would do so on every page view of every reader, which multiplies the cost of reading pages across the installation. The load-headroom rule asks for a measured budget first, and each block must also be checked for what it would show on every page. ADM-148 stays partly built.
- **D6. The band sits directly above and below the body of pages and blog posts, and nowhere else in the app.** The line says "above and below the document"; under the title, byline and page notes, the page's own title stays the first thing a reader meets after the header row, and the band stays close to the words it is about. The editor, comparisons, older versions and templates are left out because the band is not part of any page's content.
- **D7. With a space's own header and footer (SPC-158, not built), the installation's is outermost.** Top to bottom: the installation's header, the space's header, the body, the space's footer, the installation's footer. A rule of the whole installation frames what a space adds. The space's wave builds this order.
- **D8. Only for people who are logged in, only inside the app, and in print.** The login page, public sites, single shared pages, exports, mail and search do not carry it. A line meant for colleagues does not belong in front of people without an account, and the login page is the first place a false message would be tried. A PDF has its own header and footer in its design. Print shows the band, because a classification belongs on paper; whether exports should carry a classification line is a question for the PDF design (EXC-056).
- **D9. An administrator with a fresh login; no system administration, no second factor.** Spec 076 asks those for changes that let more through; this change does not. A fresh login limits what a stolen session can do on a channel to every reader, at the cost of one password prompt now and then, as ADM-005 asks for sensitive changes.
- **D10. The audit keeps the content before and after.** SEC-603 asks for what changed, and for this channel that is the content itself; both fields are short by D11. A contact named in the footer is shown to every reader anyway; the hint says the audit keeps it.
- **D11. 600 characters, 5 paragraphs, 5 links, 3 status marks and 8 KiB per field.** Enough for a classification line and a contact with room to spare, small enough that the band never pushes a page out of view and that every page load stays light.
- **D12. Its own key and routes, outside the generic settings sections.** The generic section route is `SessionOnly(administrator)` without a fresh login, and its sections are plain values; this content needs the document gate and `Sensitive`. Keeping it apart means no generic route can store it.
- **D13. Two named regions, not `header` and `footer` elements.** The frame has the one banner landmark, and the page is not a place for a second banner or content information landmark. A `section` with a name tells a screen-reader user where the words come from and lets them skip.
- **D14. A band that cannot be read is left out silently.** It is a note, not the page; a failure must never keep someone from reading. The administration shows its own failures.

## Decided on the product owner's behalf on 2026-11-23, may be overruled

Where `main` moved between the study and the build:

- **D15. A login that is too old answers `403 reauth_required`.** That is what every sensitive route answers on `main`, and the console's dialog already answers it; the study wrote `401` by mistake.
- **D16. The change is recorded as `settings.updated`, in the shape of spec 090, with the documents whole.** RV11 made `settings.updated` with `changes` the one way a settings change is recorded, and the audit screen already reads it; a new event name would be a second way. Unlike other settings, the values are not cut at 200 characters, because for this channel the content is what changed (D10), and D11 keeps each document under 8 KiB.
- **D17. The code sits in a new package, `internal/headerfooter`, not in `internal/settings`.** The cached read must know whether the part is on, which is the features package's to say, and features sits above settings; a package above both keeps the knowledge where it belongs without a cycle. Settings gains `LoadEach` and `LoadEachLocked`, so it stays the only module that names its table (ARC-027).
- **D18. The reader route needs `use_product`, like the capabilities answer.** Guests hold it; a person who may not use the product has no page to read the band on.
- **D19. The admin read is open to an administrator's token with `admin:read`.** Spec 085 lets a token read the administration and never change it, and the product owner wants every part reachable through the API; the save stays `Sensitive`, so session-only, as the study planned.
- **D20. The link title needs no rule of its own.** Since RV11 the gate drops the title of every link, so the mutation "the link title is kept" of the study is RV11's, and this wave adds none for it.
- **D21. The field offers text colour and status marks through two small menus of named colours.** The study asked for both; a menu of names is how the editor offers them, and the menus show only the colours the server accepts.
- **D22. No migration.** As D1 said: the part is a new name in the experimental list and the content a new key of `settings`, written on the first save.
- **D23. Turning the part on or off drops the node's copy at once.** Otherwise the node that switched it would show the band, or keep showing it, for up to 30 seconds; other nodes follow within 30 seconds, as for a save.
- **D24. The band renders from the subset by React, not by a read-only editor.** The study planned `DocumentView`. A renderer of five node and mark types gives the same safety (React builds every element, no HTML of the content reaches the browser, an unknown node becomes nothing), lets the outward mark be our own icon and the host plain words after the link, holds the server's link rule a second time, and costs no editor on every page view. It uses the classes of the document, so the band looks like the text of the page.

## Open for the product owner

- Should images and dynamic blocks come in a later wave (D4, D5), or are text and links enough for what the band is for?
- Is refusing plain `http:` links right (D3), or do some installations need links to internal sites without https?
- Should the other administrators get a notification when the header or footer changes? It would make a change by a stolen session visible at once; today the audit log and the "Last changed by" line show it.
- Should exports carry the classification line, through the PDF design (D8)?

## Supersedes

Nothing. The section adds an entry to SC4's registry, and the page gains two places that are empty unless the part is on and something is written.

## Provenance

Own words, from blueprint 03 chapter 10 (ADM-067, ADM-074, ADM-147 to ADM-149) as written in the study of 2026-11-14 (ADR-045, 02 "One exception"), the lines SPC-158, SPC-159, PAG-122, BLK-006, NAV-113, NAV-160, NAV-162, ADM-005, ADM-087, EXC-012, EXC-060 and SEC-603, the fifth deliberate difference of blueprint 03, the built code on `main`, and specs 013, 014, 069, 076, 078, 079, 081 and 088. No pictures, inventories or other product were consulted in writing this spec.
