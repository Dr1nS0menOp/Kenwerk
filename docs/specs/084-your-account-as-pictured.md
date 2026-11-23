# 084: Your account, as blueprint 03 arranges it

Status: built in wave SC6 (2026-11-22) on top of SC1, SC4 and SC5, which have landed, except what "Built in wave SC6" names as moved: the route that revokes all tokens and the body of the Tokens screen go to wave MC2 or later (D22, D23)
Phase: the screens of blueprint 03, fourth item of the order in `docs/handoff/2026-11-15-screens-study.md`, third part (wave SC6), after the study of 2026-11-14 (ADR-045)

## Problem

A person keeps their own side of the instance in one place: who they are to others, how they sign in, which sessions and tokens act as them, what they get told, and how the screens behave for them. Today that place is five tabs (Profile, Preferences, Security, Tokens, Data) inside the Plain frame under the full top bar, with Notifications and Watching as screens of their own outside it, and every part a form with its own Save. The study of 2026-11-14 rewrote how Your account is arranged (blueprint 03, chapter 9, sections 9.1 and 9.2): a bar of its own in place of the top bar, nine sections as text tabs in a fixed order, one narrow centred column, Tokens and Sessions as screens below Security, a profile edited in place in three cards, notices wherever someone else handles a thing, and tables with airy rows. The product owner asked on 2026-11-15 for the screens to be rebuilt as those lines say (ADR-045). This spec plans the rebuild of Your account. It writes no code: SC6 builds on the frame of SC1 and on the shared settings pieces of SC4 and SC5, and none of them has landed yet.

The look stays ours: colours, icons, fonts and every value come from `tokens.css` (ADR-021, 02 "One exception"). Only the arrangement follows the lines.

## Study

### What SC1, SC4 and SC5 give this wave

Spec 078 (branch `wave-sc1`, built, not merged) brings:

- the account menu of NAV-096 (`components/topbar.tsx`, `AccountMenu`): Profile opens `/people/{id}`, **Your account** opens `/me`, Preferences opens `/me/preferences`; Notification settings and Watching left the menu;
- Watching as an entry of the global sidebar (`components/sidebar-entries.ts`, hidden at first), still at `/me/watching` in the Personal frame;
- `HelpMenu` and `AccountMenu` as components of their own, which the account's bar reuses as they are;
- the Theme sub-menu with `menuitemradio` entries, the pattern the visibility chooser of this wave follows.

SC1 leaves every `/me` route in `app.tsx` in the Plain frame with `AccountNav`.

Specs 081 (`wave-sc4`) and 083 (`wave-sc5`), both plans only, build the pieces this wave reuses rather than makes a second time:

| Piece | Built in | What SC6 uses it for |
|---|---|---|
| A typed registry of entries and its unit test (`views/admin-sections.ts`, `views/space-sections.ts`) | SC4 step 1, SC5 step 1 | The same entry type for `views/account-sections.ts`: id, name key, address, documentation path, plus a parent for the screens below Security |
| `SettingsSection`: title row with primary action and More, introduction with a documentation link, notices, content | SC4 step 5 | The head of every section and screen of Your account |
| `Notice` in three kinds, `.note` restyled everywhere (SC4 D4) | SC4 step 6 | Every notice of ACC-109 to ACC-111, the second-factor requirement, the welcome after setup |
| The table rule of NAV-157 and `TableBox` with an empty state (SC4 D5) | SC4 step 7 | The tables of Tokens and Sessions, with the airy rows of ACC-085 |
| `SaveReset` in `components/` (SC5's request to SC4 step 8a; SC5 step 0 extracts it otherwise) | SC4 step 8a | Notifications, the one form of Your account that saves as a unit |
| `Switch` (NAV-166) | SC5 step 6 | The on and off choices of Preferences, which apply at once |
| The documentation link of an introduction (SC4 D10) | SC4 step 5 | The guide links of ACC-106 and ACC-107 |

Your account has no sidebar, so `SettingsFrame` is not used; its frame is new (below). Nothing of `ToolRow` is needed: no list of Your account is long enough for one.

### How Your account is built today

- **Routes** (`web/src/app.tsx`): `/me` (ProfileView), `/me/preferences`, `/me/security`, `/me/tokens`, `/me/data`, `/me/notifications` (NotificationSettingsView), all in `Plain width="reading"` under the full top bar; `/me/watching` (WatchingView) in the Personal frame. `Shell` draws the top bar, `SiteNotes` and `IdleWarning` around every route; `ReauthProvider` wraps the whole app and answers `reauth_required` for every request.
- **Tabs.** `AccountNav` in `views/account.tsx` lists five addresses; each view draws `<h1>Your account</h1>` and the tabs itself. Notifications and Watching have their own `h1` and no tabs.
- **Profile** (`views/account.tsx`): the picture with upload, crop and remove; one form with job title, department, location, the text about you and the e-mail address (disabled), each with a native select for who sees it, and one Save that sends `PUT /me/profile` with all fields and visibilities; then the groups the person belongs to, with a link to each group they own.
- **Security** (`views/profile.tsx`): a note while a second factor is required or the sign-in is weak, the welcome note after setup (`?welcome=1`); then, for an account with a password, Change password and the authenticator app; passkeys; the table of sessions; the table of recent logins. While `needs_second_factor` holds, the tabs, sessions and logins are left out, because the server refuses every other route until a factor exists.
- **Tokens** (`views/account.tsx`): an explanation, the table (name, scope, expires, last used, Revoke with a confirmation), then the form for a new token (name, end date, scopes `read`, `write`, `export`, `admin`) and a dialog that shows the secret once.
- **Data:** Download my data, and Ask for removal with a confirmation.
- **Preferences** (`views/preferences.tsx`): native selects and checkboxes that apply at once through `usePreferences`.
- **Notifications:** one form with per-kind choices, the digest, quiet hours and automatic watching, saved by one Save.

### The routes behind it and their guards

Every route under `/api/v1/me/` and `/api/v1/auth/reauth` keeps its rule (from `docs/api/routes.txt`):

| What | Routes | Rule |
|---|---|---|
| Password, authenticator start and confirm, sessions, tokens, logins, security summary, profile, picture, data, removal | `POST /me/password`, `POST /me/totp/begin`, `/confirm`, `GET` and `DELETE /me/sessions…`, `POST /me/sessions/end-others`, `GET`, `POST`, `DELETE /me/tokens…`, `GET /me/logins`, `GET /me/security`, `PUT /me/profile`, `PUT` and `DELETE /me/picture`, `POST /me/export`, `POST /me/removal-request` | session only: a token never reaches them (SEC-228, PRM-038) |
| Turning off the authenticator, adding and removing passkeys | `POST /me/totp/disable`, `POST /me/passkeys/begin`, `/finish`, `DELETE /me/passkeys/{id}` | sensitive: session only, and a proof of who you are at most 10 minutes old (ARC-140, SEC-605, ADM-005) |
| Preferences, notification settings, watches | `GET` and `PUT /me/preferences`, `/me/notification-settings`, `GET /me/watches` | authenticated |

Two guards act behind these routes and must keep applying:

- **Confirming who you are.** A sensitive route answers `403 reauth_required`; `ReauthProvider` asks for the password or a passkey and sends the request again. It wraps the whole app, so it works in any frame.
- **The password stop of wave RV8** (spec 046 D4). A wrong password given with a session (confirming who you are, changing the password, starting or turning off the authenticator) counts toward the stop after 100 wrong passwords in a row, together with login; after the stop even the right password gets the answer of a wrong one. The server decides this and answers alike either way, so a screen must never word a refusal in a way that tells the two apart.

A third check lives in the middleware: while a session `needs_second_factor`, only the routes of `secondFactorRoutes` answer. The browser's hiding of tabs only spares the person screens that would fail.

### Every part today and its place in the target

The target order is that of ACC-105; Tokens and Sessions are screens below Security (ACC-108). "Address" is the address that opens it after this wave.

| Today (tab or screen, address) | Holds | Target (section or screen) | Address after |
|---|---|---|---|
| Profile, `/me` | picture, the profile form, own groups | **Profile and visibility**: the picture card, the about-you card, the contact card, then the groups (D8) | `/me` |
| Profile, `/me` | the e-mail address, disabled, with its visibility | the address moves to **E-mail** (read) and the contact card (its visibility) | `/me/email` (new) and `/me` |
| Security, `/me/security` | sign-in notes, password, authenticator, passkeys | **Security**: password, two-step verification, passkeys, then parts for tokens and recent devices that link on | `/me/security` |
| Security, `/me/security` | the table of sessions | **Sessions**, a screen below Security (ACC-074) | `/me/sessions` (new) |
| Security, `/me/security` | the table of recent logins | **Sessions**, its second part (D9) | `/me/sessions` |
| Tokens, `/me/tokens` | the list and the form for a new token | **Tokens**, a screen below Security; the form moves into a dialog that Create token opens (ACC-083) | `/me/tokens` |
| Data, `/me/data` | Download my data | **Privacy** (ACC-109) | `/me/data` (D3) |
| Data, `/me/data` | Ask for removal | the end of **Preferences**, with its notice (ACC-109) | `/me/preferences` |
| Preferences, `/me/preferences` | theme, language, time zone, date format, first day, start screen, the on and off choices | **Preferences** | `/me/preferences` |
| Notification settings, `/me/notifications` (no tabs) | the notification form | **Notifications**, a section with the tabs | `/me/notifications` |
| Watching, `/me/watching` (Personal frame) | what the person watches | **Watches**, a section with the tabs (D4) | `/me/watches` (new); `/me/watching` stays in the Personal frame |

Sections the lines name that are **not** built in this wave, because nothing behind them exists yet and the feature freeze of ADR-043 holds (D1): **Connected apps** (ACC-122, later, phase 7) and **Link preferences** (EDT-201, a preference that does not exist yet). Each takes its place in the registry when its own wave builds it; ACC-105 says where.

### What the lines change that is not a move

- **The frame** (ACC-102, ACC-104): a bar of its own in place of the top bar (logo and the words Your account at the start, the tabs, help and the account menu at the end, no search, bell or Create, a thin line under it), and under it one narrow column of fixed width centred in the window, with no sidebar, breadcrumbs, back link, footer or save bar.
- **The tabs** (ACC-103): muted text, the selected one in accent with a bar on the bar's lower edge and `aria-current`, a tint on hover and focus, each its own address, and the parent tab selected on the screens below it.
- **A section** (ACC-106, ACC-107): its title, one sentence that says what it holds, a guide link where a choice needs explaining, notices, then parts with a bold heading close to their content and larger gaps between parts than inside them.
- **Notices in place of controls** (ACC-109 to ACC-111, NAV-151): what the identity provider or an administrator handles shows as a notice that says who and where, never as a control that would fail.
- **The profile** (ACC-114 to ACC-117, ACC-120): three cards a shade off the page, rows of label and value with a visibility chooser at the end, edited in place and saved when a field is left.
- **Tables** (ACC-085, NAV-157): airy rows of up to two lines, the second muted.

## Lines in scope

Every line of chapter 9, sections 9.1 and 9.2, that concerns Your account, and the lines of other chapters it needs, with the status after this wave. "Not this wave" names a line that needs a feature that does not exist yet, a change of the API or the data model this plan does not make, or its own study. Built lines of 9.1 not named here (ACC-001 to ACC-004, ACC-009 to ACC-016, ACC-018) concern login and the administration and do not change.

### Chapter 9, section 9.1

| Line | Was | After SC6 | What changes |
|---|---|---|---|
| ACC-005 | built | built | Change password, now the first part of Security; ending the other sessions is unchanged |
| ACC-006 | built | built | Now on the Sessions screen |
| ACC-007, ACC-008 | built | built | The parts Two-step verification and Passkeys of Security; behaviour unchanged |
| ACC-017 | built | built | Recent logins move to the Sessions screen. The words "with place" in the line contradict ADR-026, which stands: the line is corrected in step 9 (D10) |
| ACC-019 | built | built | Now the Tokens screen |
| ACC-074 | new | built | The table of running sessions in the columns of the line. The server's list also leaves out sessions past their absolute or idle limit that the cleaning job has not removed yet (step 6, D11) |
| ACC-075 | new | built | Device and program read from the stored user agent in the browser (D12); network address in full; last active relative, now for the session in use |
| ACC-076 | new | built | The status mark in words for the session in use; a normal button that ends any other at once |
| ACC-077 | new | built | End all other sessions at the end of the heading's line, danger style, asks first through `POST /me/sessions/end-others`, which exists. Completes SEC-177 |
| ACC-078 | new | built | The sentence with its guide link, the sub-heading over the table, the largest gap of the screen under the explanation |
| ACC-079 | new | built | Name, scope, created, expires, last used and action, newest first, as the server already sorts them; no sort, filter, search, selection, paging or count |
| ACC-080 | new | built | Long names wrap; dates in the person's date format (D13); last used relative, or never in words |
| ACC-081 | new | built | Revoke as the only row action, asking first as today; the secret never in the list |
| ACC-082 | new | not this wave | A limit on live tokens needs its own study of the number and a change of the server; the explanation names no number until then |
| ACC-083 | new | built | One sentence with a guide link, then Create token (primary) and Revoke all tokens; Create opens a dialog with name, end date and scope (D14) |
| ACC-084 | new | built | Revoke all tokens through one new session-only route that revokes and audits every live token of the caller in one transaction (D15) |
| ACC-085 | new | built | Through the table rule of SC4, with airy rows of up to two lines |
| ACC-086 | new | not this wave | Changing one's own address is a new feature: a route, a migration for the waiting change, two mails. Waits for its own wave under ADR-043 (D5) |
| ACC-087 | new | not this wave, recommended against as written | Its administrator path without mail drops two of the three guards of SEC-192; see D6 and ADR-051 |
| ACC-088 | later | later | |
| ACC-089 to ACC-099 | later | later | Login policies; administration |
| ACC-100, ACC-101 | new | not this wave | The rule that provider accounts sign in only through the provider is a server feature of its own. Its notice in Your account comes with it |

### Chapter 9, section 9.2

| Line | Was | After SC6 | What changes |
|---|---|---|---|
| ACC-020, ACC-021 | built | built | The public profile `/people/{id}` does not change; its Edit button for one's own profile keeps leading to `/me` (D7) |
| ACC-022 | built | built | Upload, crop and remove now sit in the picture card |
| ACC-023 | built | built | Visibility per field through the chooser of ACC-115; locked fields keep their lock |
| ACC-024 | partly | built | Notifications and Watches are sections of Your account |
| ACC-025 | partly | partly | The built preferences in the new section. Typing replacements, a pinned toolbar and the editor width stay open |
| ACC-026 | built | built | |
| ACC-027 | built | built | Download in Privacy; asking for removal at the end of Preferences |
| ACC-028 | built | built | |
| ACC-102 | new | built | The account's bar (D2) |
| ACC-103 | new | built | Text tabs with their own addresses; Security stays selected on Tokens and Sessions |
| ACC-104 | new | built | One centred column of fixed width, the page scrolling as a whole (D2) |
| ACC-105 | new | partly | Profile and visibility, E-mail, Security, Privacy, Preferences, Notifications, Watches. Connected apps and Link preferences wait (D1) |
| ACC-106 | new | built | Through `SettingsSection` of SC4, with the leave mark on guide links and plain links to other screens of Your account |
| ACC-107 | new | built | One sentence per section; guide links for visibility, the second factor, passkeys, tokens and sessions, none for the password; the address as SC4 D10 decided |
| ACC-108 | new | built | The five parts of Security in the order of the line; Tokens and Sessions keep Security selected. The way back is that selected tab and the browser's Back (D16) |
| ACC-109 | new | partly | Privacy holds Download my data; Preferences ends with removal and its notice. The link to the organisation's privacy notice waits for ADM-142 |
| ACC-110 | new | partly | Notices for the password and second factor of a provider account, its e-mail address, the fields the provider fills and locks, and removal. The passkeys notice comes with ACC-100 |
| ACC-111 | new | built | One notice at the top of Profile for locked fields; on Security the notice directly under the heading |
| ACC-112 | new | built | The address in bold, then how the person signs in, from `GET /me/security` |
| ACC-113 | new | partly | The notice for a provider account and the pointer to Notifications. The change for a local account waits for ACC-086 (D5) |
| ACC-114 | new | built | Three cards a shade off the page, no lines between rows |
| ACC-115 | new | built | Label and value or a dim invitation; the visibility chooser borderless at the end, one column, one muted caption per card (D17) |
| ACC-116 | new | built | Text at rest, an input when selected, saved when left with a live-region message, Escape undoes (D18) |
| ACC-117 | new | partly | The about-you card in the order of the line without pronouns and organisation; the name read-only and without a chooser (D19); the contact card with the address and its visibility |
| ACC-118 | new | not this wave | Pronouns and organisation are new fields of the profile: migration, API, SCIM mapping. They wait (D1) |
| ACC-119 | new | not this wave | A visibility of the picture changes every read that returns `has_picture` and the picture route: a rule of its own that needs its own study |
| ACC-120 | new | built | Not set, with a link to Preferences; the time zone chooser there shows a placeholder while empty |
| ACC-121, ACC-122 | later | later | |

### Other chapters

| Line | Was | After SC6 | What changes |
|---|---|---|---|
| NAV-096 | new | built (SC1) | Unchanged; Your account and Preferences lead into the new frame |
| NAV-149, NAV-151 | new | built (SC4) | Used for every notice of Your account |
| NAV-157 | new | built (SC4) | Tables of Your account follow it |
| NAV-160 to NAV-163 | partly (SC4, SC5) | built | Notifications saves as one unit with Save and Reset changes; the password form is an action, not a setting (D20) |
| NAV-161 | partly (SC5) | partly | The choices of Preferences apply at once with a short message |
| NAV-166 | built (SC5) | built | Used in Preferences |
| SEC-177 | partly | built | One button ends all other sessions (ACC-077) |
| SEC-192, SEC-921 | new | new | Unchanged: no address of a local account can change yet (D5, D6) |
| EDT-201 | new | new | Link preferences wait (D1) |

## Behaviour

1. **Opening.** Your account opens from the account menu (SC1) at `/me`, and from Preferences in that menu at `/me/preferences`. Every address of today opens the section it opened; three addresses are new: `/me/email`, `/me/sessions` and `/me/watches`.
2. **The bar.** In place of the top bar, a bar across the window: at the start our logo, which leads to the start screen, and the words **Your account**; after them the tabs; at the end the help menu and the account menu of SC1. No search, no bell, no Create, no sidebar button. A thin line runs under the bar. Site notes (`SiteNotes`) still show under it, the idle warning still works, and confirming who you are still opens over any screen.
3. **The tabs.** Profile and visibility, E-mail, Security, Privacy, Preferences, Notifications, Watches, in that order, as text links inside one `nav` named for Your account. A tab is muted text; the selected one is accent text with a bar on the lower edge of the bar and `aria-current="page"`; a tab under the pointer or with the focus gets a tint. On Tokens and Sessions, Security is the selected tab. On a narrow screen the row of tabs scrolls sideways on its own, the selected tab scrolled into view once, and the page itself never scrolls sideways.
4. **While a second factor is required.** The bar shows no tabs, and only Security opens; every other address of Your account shows Security with its notice, as the server refuses the routes behind the other sections until a factor exists (`secondFactorRoutes` in `internal/httpapi/server.go`). Security then shows its notice, the password, two-step verification and passkeys, and leaves out the parts that link to Tokens and Sessions, as it leaves out sessions and logins today.
5. **The column.** Under the bar, every screen is one column of fixed width centred in the window, with wide empty margins, and the page scrolls as a whole. No sidebar, breadcrumbs, back link, footer or save bar.
6. **A section from top to bottom.** Through `SettingsSection`: the title as the one `h1`; one sentence on what the section holds; a guide link where a choice needs explaining, ending its sentence with a mark that it leaves the instance, also said in words to screen readers; notices; then the parts, each with a bold `h2` close to its content and clearly larger gaps between parts than inside them. A link to another screen of Your account stands alone on its own line, without the leave mark.
7. **Profile and visibility.** A notice at the top when the identity provider fills and locks fields. Then three cards, each a slightly rounded card a shade off the page under a heading that stands above it, with no lines between rows:
   - **Picture**: the picture large, Upload and Remove as today with the crop dialog; the question who may see the picture is not offered (ACC-119 waits).
   - **About you**: name (read-only, no chooser), job title, department, location, local time, the text about you. Each row shows a small bold label with the value under it, or a dim line that invites the person to add it; at its end the visibility chooser. A locked row shows its lock and stays text. Local time is the time in the person's time zone, or **Not set** with a link to Preferences.
   - **Contact**: the e-mail address (read-only here, see E-mail) with its visibility chooser.
   One muted caption per card heads the column of choosers. After the cards, a part **Your groups** lists the groups the person belongs to, a group they own as a link (D8).
8. **Editing in place.** A row at rest looks like text. Selecting it, by click, Enter or Space, turns the value into an input with the same words, focused. Leaving the input saves: the browser sends `PUT /me/profile` with the stored profile and this one change; a live region says it was saved. Escape puts back the stored value and leaves the input. A failed save keeps the input open with what was typed and an error notice under the card. Only one row is open at a time.
9. **The visibility chooser.** A borderless button with the icon of the audience, its name and an arrow, named for screen readers as "Who sees {field}: {audience}". It opens a menu of three `menuitemradio` entries (everyone who may see the profile, members only, only me), the current one checked. A choice applies at once through the same `PUT /me/profile`, with the same live-region message.
10. **E-mail.** Under a bold sub-heading, a sentence that holds the account's address in bold; then one read-only line with a small icon that says how the person signs in: password, password and authenticator, passkeys, or the identity provider, from `GET /me/security`. For an account of the identity provider an information notice under the address says that it is changed at the provider. For a local account an information notice says that the address of this account is the one used to log in and cannot be changed here (D5). A second sub-heading with one sentence points to Notifications for the mail Kenwerk sends.
11. **Security.** The welcome notice after the first setup and the second-factor and weak sign-in notices first, as today, as `Notice`s. Then five parts, each with a bold heading and an explanation:
    - **Password**: for a local account, the current password and the new one (`NewPasswordField`) and one primary button **Change password**, with no guide link (ACC-107). For an account of the identity provider an information notice directly under the heading, with no sentence before it, says the provider handles the password and the second factor.
    - **Two-step verification**: state, start or turn off as today, with its guide link; the offer to end other sessions after turning it off stays.
    - **Passkeys**: the list, add and remove as today, with its guide link; the offer to end other sessions after a removal stays.
    - **Personal API tokens**: one sentence with its guide link, then a link **Manage tokens** on its own line to `/me/tokens`.
    - **Recent devices**: one sentence with its guide link, then a link **See sessions** on its own line to `/me/sessions`.
    A wrong password anywhere on this screen shows the server's own message; the screen adds nothing that tells a wrong password from a stopped one.
12. **Sessions** (`/me/sessions`, Security selected). The title, one sentence that explains the list and what to do after losing a device, with its guide link; the largest gap of the screen; a sub-heading **Running sessions** with **End all other sessions** at the end of its line, its end level with the end of the table, in the danger style. The table, most recently active first: device (an icon for a computer or a phone with the kind of device, the operating system and its version muted under it), program (browser or app, its version muted under it), network address in full, last active (relative time, now for the session in use), and the action column, whose heading only screen readers hear. The session in use shows a status mark **This session** in words in the success colour and no button; every other row a normal button **End session** that ends it at once. End all other sessions asks first, repeating the action on its confirming button; afterwards the table holds only this session. A second part, **Recent logins**, holds the table of today: when, how, network address, device (D9).
13. **Tokens** (`/me/tokens`, Security selected). The title, one sentence that a token acts as the person and must be kept as safely as a password, with its guide link; then a row of compact buttons: **Create token**, the one primary action, and **Revoke all tokens** in the danger style, present only while a live token exists. The table, newest first: name (wrapping), scope (in words, such as Read or Read and write), created and expires (dates), last used (relative, or Never), and **Revoke** in the last column, asking first as today. No sort, filter, search, selection, paging or count. With no tokens the table keeps its heading row with one centred sentence.
14. **Create token.** A `Dialog` with name, end date (90 days ahead by default, at most a year) and the scopes as checkboxes: Read, Write, Export, and Administration only for a person who holds the global permission administrator (D14). Create closes the form and shows the secret once in the same dialog, with Copy, as today. When the server answers that an administrator turned tokens off, the dialog closes, an information notice takes the place of Create token for the rest of the visit, and existing tokens can still be revoked.
15. **Revoke all tokens.** A confirmation that says how many tokens will stop working and repeats the action on its button. The browser sends one request; every live token of the person is revoked and audited as a single revoke is; the table then shows its empty row.
16. **Privacy** (`/me/data`). One sentence; the part **Download my data** with its explanation and a normal button, as today.
17. **Preferences.** The selects of today (theme, language, time zone with a placeholder while empty, date format, first day, start screen) and the on and off choices as `Switch`es, each applying at once with a short message that it was saved, also to screen readers (NAV-161). The section ends with a part **Remove your account**: an information notice that an administrator removes accounts and that this asks them to, beside **Ask for removal**, which asks first; after it the notice says the request was sent.
18. **Notifications** (`/me/notifications`). The form of today in its parts (per kind, digest, quiet hours, automatic watching), ending in **Save** and **Reset changes** of `SaveReset`, inactive until something changed (NAV-162).
19. **Watches** (`/me/watches`). The body of `WatchingView` with its filter and Stop watching, inside Your account. `/me/watching` keeps opening the same body in the Personal frame from the sidebar (D4).
20. **Words.** Every tab name, section introduction, part heading, notice and button goes through `en.json`. The tab Profile becomes **Profile and visibility**, Data becomes **Privacy**; Notification settings becomes **Notifications**; Watching, inside Your account, **Watches**.

## Permissions and audit

Nothing about access changes, and this is checked rather than assumed:

- Every route the screens call keeps its `Access` rule in `httpapi.Router`, listed in "The routes behind it and their guards". The route walker and `docs/api/routes.txt` change only by the one new route of D15.
- **The new route** `POST /api/v1/me/tokens/revoke-all` is registered as `SessionOnly(Authenticated())`, like `DELETE /me/tokens/{id}`, so a token can never revoke tokens (SEC-228). It acts only on the caller's own tokens (`WHERE user_id = $caller`), in one transaction, and writes one `token.revoked` audit event per token with the same details as a single revoke, in that transaction. No outbox event, as today for a single revoke. It narrows access and never widens it.
- **Confirming who you are** stays global through `ReauthProvider`, which wraps the new frame as it wraps every frame. Turning off the authenticator, adding and removing a passkey keep their `Sensitive` rule. An end-to-end test proves the dialog still appears in the new frame.
- **The password stop of RV8** is unchanged: the same three password routes, the same answers. The screens show the server's message as it comes and never infer a stop.
- **While a second factor is required**, the server still refuses every route outside `secondFactorRoutes`; the browser's hiding of tabs is a courtesy, tested in the end-to-end tests.
- **Token scopes.** The scope Administration is offered only to administrators (NAV-004). The server keeps accepting the scopes it accepts today and keeps the owner rule (a token never exceeds its owner, SEC-229), so hiding a checkbox removes nothing a non-administrator could use.
- **The sessions list** of D11 filters by the same limits that `identity.Principal` already enforces on every request, so it shows exactly the sessions that still work. Ending a session keeps its own rule.
- **Profile saves** are the same `PUT /me/profile` as today, one per change instead of one per form. A profile is personal and not audited (`people.SetOwn`); that stays.
- No audit or outbox event changes besides the new route's events.

### The admin scope against ARC-140 (studied, not changed)

**Since this study, `main` moved:** spec 085 (ADR-052) makes every route under `/api/v1/admin/` whose method is not `GET` or `HEAD` session-only when it is registered, so a token with the scope `admin` reads the administration and never changes it. That answers the question below as far as changing goes; D21 stands for the wording of ARC-140, which this wave still does not touch. The study as written on 2026-11-16 follows.

The handoff of 2026-11-15 asked whether a token with the scope `admin` reaches the administration (SEC-229 against ARC-140 and SEC-228). What the code does: `scopeFor` in `internal/httpapi/server.go` maps every route under `/api/v1/admin/` to the scope `admin`; `SessionOnly` and `Sensitive` routes refuse every token before the scope is looked at. Most administration routes are session only, and every route that manages tokens, sessions or factors, and every route that asks to confirm who you are, is too. A token with the scope `admin`, owned by an administrator, does reach the administration routes that carry only `permission:administrator`, as spec 015 H9 designed. So SEC-228 and SEC-229 hold as written; ARC-140, the comment on `sessionOnly` in `router.go` and spec 013 AC-12 say "the console", which is true of the installation console (CSL-1015) and of what needs a fresh proof, not of the whole administration. This wave changes no route and no scope. Whether the scope `admin` should keep reaching those routes is a question for the product owner and a security wave of its own; the wording of ARC-140 is corrected in that wave, once the answer is known (D21).

## Data

- **No migration.** The preferences document, the profile and the tokens keep their shape.
- **API.** One route is added (D15): `POST /api/v1/me/tokens/revoke-all`, body empty, answer `{"revoked": n}`. `docs/api/routes.txt` and `openapi.json` gain it. Nothing is removed or renamed.
- **The sessions list** (`identity.Service.Sessions`) adds `AND expires_at > now() AND last_seen_at > now() - <idle>` to its query, with the idle limit as a parameter, as the cleaning job already uses it. The answer keeps its shape.

## Load budget

- **Class:** none of the screens is on the paths of saving pages, reading or search (ARC-233); all are personal and rare. `internal/app/query_budget_test.go` gains a budget for the new route only.
- **Opening a section** reads what the old tab read, and less for Security: Profile reads `GET /people/{id}` (as today); E-mail reads `GET /me/security` (already held under the query key `security`, which the session code also uses); Security reads `GET /me/security` and `GET /me/passkeys`, and no longer the sessions and logins; Sessions reads `GET /me/sessions` and `GET /me/logins` (the two reads Security made); Tokens reads `GET /me/tokens`; Notifications and Watches read what their screens read today.
- **Profile edits** make one `PUT /me/profile` per field left with a change, one row update without audit, where today a Save made one for the whole form. A person who edits five fields makes five small writes; nothing else waits on them.
- **The sessions list** stays one indexed read by `user_id`; the two added conditions only drop rows.
- **Revoke all tokens:** one transaction, one `UPDATE … RETURNING` over the caller's live tokens, and one audit insert per token. The number is bounded by the person's live tokens (a few, typically; ACC-082 later sets a limit). Budget: 2 queries plus one per token.
- **Browser:** the user-agent reading of D12 is a few string matches per row, no dependency. The bar renders seven links.

## Upgrade notes

- **Addresses.** Every address of today keeps working and opens the same section, and `/me/watching` keeps its Personal frame. Three addresses are added: `/me/email`, `/me/sessions` and `/me/watches`. The server's links to `/me/security` (the sign-in prompt, the summary's attention list, the first setup's `?welcome=1`) stay right. No redirect is needed.
- **Mixed releases.** During a rolling upgrade a browser may hold the new frontend while its request reaches a node of the previous release, which does not know `POST /me/tokens/revoke-all` and answers 404: the confirmation then shows an error notice, and the person revokes one by one or tries again after the upgrade. Every other request is one the previous release answers. A browser that holds the old frontend sees the old tabs until a reload.
- **The sessions list** shows fewer rows on an instance where the cleaning job had not yet removed dead sessions; nothing that worked stops working.
- **Where things went.** The changelog lists: the sessions and recent logins to Sessions, below Security; Tokens below Security, its form in a dialog; Download my data to Privacy; Ask for removal to the end of Preferences; Notification settings and Watches as sections of Your account; the address shown in E-mail; and the profile saved field by field.
- **Documents.** `docs/operations/identity-providers.md` and `docs/operations/incidents.md` name Your account, Security, for sessions and factors; the builder checks their words in step 9. `docs/design/README.md` changes in step 9.

## Design pictures and end-to-end tests

### Pictures to take again (all in `web/e2e/design-baselines/`)

`profile`, `security`, `tokens`, `personal-data`, `preferences`, `notification-settings`. The picture `watching` (Personal frame) does not change. The builder lists every picture that changed in the report, and the product owner sees each before and after.

The tests `ProfileView: your account` (waits for the heading About you, which stays as a card heading), `SecurityView: how you sign in` (waits for Change password, which stays the heading of the password part; its mask of `table` goes, because Security no longer holds a table), `TokensView: personal tokens` (waits for New token, which moves into the dialog: it waits for Create token instead) and `PersonalDataView: your data` (waits for Ask for removal, which moves to Preferences: it waits for Download my data instead) change their waits as said.

### New pictures

Named `AccountView: …` in `web/e2e/0-design.spec.ts`, each looked at in light, dark, narrow and right-to-left:

- the bar with the tabs, Profile and visibility selected (`account-bar`), and at 360 pixels with the tabs scrolled (`account-bar-narrow`);
- a profile row being edited, with the live-region message after leaving it (`account-profile-editing`), and the visibility chooser open (`account-visibility`);
- Profile with locked fields and its notice, on an account of the identity provider (`account-profile-locked`);
- E-mail for a local account and for an account of the provider (`account-email`, `account-email-provider`);
- Security for an account of the provider, with the notice in place of the password (`account-security-provider`), and while a second factor is required, with no tabs (`account-second-factor`);
- Sessions with two sessions and recent logins (`account-sessions`), and the confirmation of End all other sessions (`account-sessions-end-all`);
- Tokens with a long name, a never-used token and the two buttons (`account-tokens`), Tokens empty (`account-tokens-none`), the Create token dialog as a member and as an administrator (`account-token-create`, `account-token-create-admin`), and the confirmation of Revoke all tokens (`account-tokens-revoke-all`);
- Privacy (`account-privacy`), Preferences with its switches and the removal part (`account-preferences`), Notifications with a change, Save and Reset changes active (`account-notifications-changed`), and Watches (`account-watches`).

### End-to-end tests

- **New `web/e2e/account.spec.ts`:** the bar holds the logo, Your account, the tabs, help and the account menu, and no search, bell or Create; the tabs come in the order of ACC-105; the selected tab has `aria-current`; Tokens and Sessions keep Security selected; every address of today opens its section and the three new ones open theirs; the logo leads to the start screen; site notes still show under the bar; axe on each section; right-to-left and 360 pixels, with no sideways scroll of the page.
- **Guards survive, written first:** removing a passkey in the new frame asks to confirm who you are, and the passkey is gone after confirming; turning off the authenticator asks for the password as today; a token sent to `GET /api/v1/me/sessions`, `POST /api/v1/me/tokens` and `POST /api/v1/me/tokens/revoke-all` gets `403 session_only`; while a second factor is required the bar shows no tabs, `/me/preferences` shows Security, and `GET /api/v1/me/preferences` still answers `second_factor_required`.
- **Profile:** a field selected, changed and left is saved and stays after a reload; Escape puts back the stored value; a locked field cannot be opened; a visibility change applies at once and shows on the public profile to another person accordingly; a missing time zone shows Not set with its link.
- **Sessions:** a second browser context makes a second session; it shows with End session, which ends it at once (the second context is then logged out); End all other sessions asks first and leaves only this session; the session in use has no button.
- **Tokens:** a member does not see the Administration scope and an administrator does; a token made in the dialog shows its secret once and appears in the table newest first; Revoke all tokens names the count, and afterwards a request with a revoked token gets `401`.
- **Moves:** Ask for removal works from Preferences; Download my data from Privacy; Notifications saves with Save and Reset changes puts back the stored values; Watches lists the watched pages and Stop watching works, and `/me/watching` still shows them in the Personal frame.
- **Files that visit Your account** and need their addresses or headings checked: `0-design.spec.ts`, `access.spec.ts`, `people.spec.ts`, `platform.spec.ts`, `reading.spec.ts`, `together.spec.ts`, `writing.spec.ts`, and `frame.spec.ts` of SC1 (the account menu's Your account and Preferences).

### Unit tests (written first)

- `web/src/views/account-sections.test.ts`: ids and addresses are unique; the sections come in the order of ACC-105; Tokens and Sessions have Security as parent and are not tabs; every address of today is in the registry; while a second factor is required only Security is offered.
- `web/src/user-agent.test.ts`: the device kind, operating system and version, and program and version for a fixed set of user-agent strings of common desktop and phone browsers, and an unknown string read as unknown without failing.
- `web/src/views/account-profile.test.ts`: a field saved on leaving sends the stored profile with only that change; Escape sends nothing.

### Go tests (written first)

- `internal/identity`: `TestRevokingAllTokensEndsEveryLiveTokenOfTheCaller`, `TestRevokingAllTokensLeavesOtherPeoplesTokens`, `TestRevokingAllTokensAuditsEachTokenInTheSameTransaction`, `TestRevokingAllTokensWithNoneRevokesNothing`; `TestSessionsLeaveOutSessionsPastTheirLimits`.
- `internal/httpapi`: the route table test with the new route as `session-only authenticated`; `TestATokenCannotRevokeAllTokens`.

### Mutations

Three lines in `scripts/mutation-check.sh`: drop `user_id = $1` from the revoke-all statement (another person's tokens would go); drop the audit insert per token; drop the expiry condition from the sessions list. The route's `SessionOnly` is guarded by the route table test.

## Build plan

Each step is one builder's work, ends with `make check` green, and commits its pictures. Sizes: S up to about 200 changed lines, M up to about 500, L more. Steps 3 to 8 may run in any order after step 2; everything else in the order given.

| Step | What | Lines | Size | Pictures |
|---|---|---|---|---|
| 0 | Rebase `wave-sc6` on `main` once SC1, SC4 and SC5 have landed. Check that `SettingsSection`, `Notice`, the table rule with `TableBox`'s empty state, `SaveReset` in `components/` and `Switch` exist; if `SaveReset` is still inside `SectionForm`, extract it with SC4's tests unchanged (SC5 step 0 may have done so). Run the e2e of Your account once as the baseline | | XS to S | none |
| 1 | **The registry and the frame.** `web/src/views/account-sections.ts` with its unit test first (the entry type of SC4 with a parent); `AccountFrame` in `components/account-frame.tsx` with the bar (logo, Your account, the tabs, `HelpMenu`, `AccountMenu`), the line under it and the centred column of fixed width (one new token in `tokens.css` for it, D2); `Shell` draws the account's bar instead of the top bar for the addresses of the registry; `SiteNotes` and `IdleWarning` under it as before; `AccountNav` goes; the three new addresses route; the narrow tab row | ACC-102 to ACC-105 | M | new `account-bar`, `account-bar-narrow`; every account picture |
| 2 | **The head of a section and the notices.** `SettingsSection` on every section and screen with its introduction and guide link (SC4 D10); the notices of Security (welcome, second factor required, weak sign-in) as `Notice`s; the second-factor state without tabs | ACC-106, ACC-107, ACC-111 (Security) | M (mostly words) | new `account-second-factor` |
| 3 | **Profile and visibility.** The three cards, the rows with label and value or invitation, the in-place editing with its unit test first, the visibility chooser on `Menu` with `menuitemradio`, the locked-fields notice, local time with Not set, Your groups after the cards | ACC-114 to ACC-117, ACC-120, ACC-111 (Profile), ACC-022, ACC-023 | L | new `account-profile-editing`, `account-visibility`, `account-profile-locked`; `profile` |
| 4 | **E-mail.** The section with the address, how the person signs in, the notices for a provider and a local account, the pointer to Notifications | ACC-112, ACC-113, ACC-110 (e-mail) | S | new `account-email`, `account-email-provider` |
| 5 | **Security.** The five parts in order; the password part as an action with one primary button; the provider notice in place of password and second factor; the links to Tokens and Sessions on their own lines; the offers to end other sessions stay | ACC-005, ACC-007, ACC-008, ACC-108, ACC-110 (password, factor) | M | new `account-security-provider`; `security` |
| 6 | **Sessions.** Server first: the sessions list leaves out dead sessions, Go test and mutation line first. Then the screen: the user-agent reading with its unit test first, the table with airy two-line rows, This session, End session, End all other sessions with its confirmation, Recent logins as the second part | ACC-006, ACC-017, ACC-074 to ACC-078, ACC-085, SEC-177 | M | new `account-sessions`, `account-sessions-end-all` |
| 7 | **Tokens.** Server first: `POST /me/tokens/revoke-all`, `SessionOnly`, its Go tests and mutation lines first, `routes.txt`, `openapi.json`, its query budget. Then the screen: the explanation, Create token and Revoke all tokens, the table in the columns of ACC-079 with airy rows, the Create dialog with the Administration scope only for administrators, the notice when tokens are off, the count in the confirmation | ACC-019, ACC-079 to ACC-081, ACC-083 to ACC-085 | M | new `account-tokens`, `account-tokens-none`, `account-token-create`, `account-token-create-admin`, `account-tokens-revoke-all`; `tokens` |
| 8 | **Privacy, Preferences, Notifications, Watches.** Download my data in Privacy; Preferences with `Switch` and the saved message, the time zone placeholder, the removal part with its notice at the end; Notifications on `SaveReset`; Watches as a section from the body of `WatchingView`, which keeps its Personal frame at `/me/watching` | ACC-024, ACC-025, ACC-027, ACC-109, ACC-110 (removal), NAV-161, NAV-162 | M | new `account-privacy`, `account-preferences`, `account-notifications-changed`, `account-watches`; `personal-data`, `preferences`, `notification-settings` |
| 9 | **Documents and the last look.** `docs/design/README.md` (the frame table gains Account in place of "your account" under Plain; the components table loses `AccountNav` and names `AccountFrame`); blueprint 03 status lines as in "Lines in scope", and ACC-017 without "with place" (D10); the operations documents of the upgrade notes; the changelog; the full e2e once and `0-design.spec.ts` twice in a row; the report with every before and after picture; the handoff | | M | none new |

If the wave runs long, step 7's route is the one to move to a wave of its own: the Tokens screen is whole without Revoke all tokens, which then stays absent (NAV-004).

## Acceptance criteria

- [ ] Every line marked built or partly above behaves as written, proved by the tests above.
- [ ] Every address of today opens the section it opened, and `/me/watching` keeps its frame (unit test and e2e).
- [ ] No access rule or guard changed: the route table differs only by `POST /me/tokens/revoke-all` as `session-only authenticated`; the e2e prove that confirming who you are, the second-factor requirement and the refusal of tokens still hold in the new frame.
- [ ] Revoke all tokens touches only the caller's tokens and audits each one, proved by Go tests and mutation lines.
- [ ] The sessions list shows only sessions that still work.
- [ ] `make check`, the whole e2e suite once, and `0-design.spec.ts` twice in a row are green.
- [ ] The product owner has seen the before and after pictures of every changed screen in the report.

## How the product owner tests it

1. Open the account menu and choose Your account. The top bar is gone: a bar with our logo, **Your account**, seven tabs, help and your picture. No search field, no bell, no Create.
2. In Profile and visibility, click your job title, change it and press Tab: a message says it was saved. Reload: the change is there. Click it again, type something and press Escape: the old value is back.
3. Open the chooser at the end of the location row and choose Only me. Log in as someone else in a private window and open your profile: the location is gone.
4. Open E-mail: your address in bold, and a line saying how you sign in.
5. Open Security: Password, Two-step verification, Passkeys, Personal API tokens and Recent devices, in that order. Remove a passkey: you are asked to confirm who you are first.
6. Press See sessions: Security stays selected. Log in from a second browser; it shows as a session. Press End all other sessions: it asks first, then only this session is left, and the second browser is logged out.
7. Go back to Security, press Manage tokens, and press Create token. As a member you see Read, Write and Export; as an administrator also Administration. Make two tokens, then press Revoke all tokens: it says two tokens will stop working. Confirm: the list is empty.
8. Open Preferences: the on and off choices are switches that save at once. At the end, Ask for removal.
9. Open Notifications, change something: Save and Reset changes become active. Press Reset changes: the old choices are back.
10. Open a link you saved earlier to `/me/data`: Privacy opens, with Download my data.

## Decided on the product owner's behalf on 2026-11-16, may be overruled

- **D1. Only what exists gets a section or a field.** Connected apps (ACC-122), Link preferences (EDT-201), pronouns and organisation (ACC-118), the picture's visibility (ACC-119), the header image (ACC-121) and a limit on tokens (ACC-082) need features, fields or studies that do not exist yet, within the feature freeze of ADR-043, as SC4 D1 and SC5 D1 decided. A tab or row with nothing behind it would be a promise the screen cannot keep.
- **D2. The account's frame is a frame of its own.** ACC-102 and ACC-104 replace the Plain frame and the top bar for Your account. The design standard's table of frames gains **Account** (bar, tabs, one centred column), and `Shell` chooses the account's bar for the addresses of the registry, so no other screen needs to know. The column takes a fixed width from one new token in `tokens.css`, set to the narrowest width the reading column already takes, so no new size is invented. Site notes, the idle warning and confirming who you are stay, because they guard the session, not the frame.
- **D3. Addresses keep their ids.** `/me/data` stays the address of Privacy and `/me` of Profile and visibility, as SC4 D2 decided for the administration: bookmarks, the server's links and the tests keep working without a redirect. The words people see follow the lines; the address is not a word they read.
- **D4. Watches in two frames, at two addresses.** SC1 made Watching an entry of the sidebar at `/me/watching` in the Personal frame; ACC-105 makes Watches a section of Your account. The same body opens at both, as SC5 D10 decided for Files and Archived pages: `/me/watching` in the Personal frame, `/me/watches` in the Account frame. Which frame a screen uses depends on its address only.
- **D5. A local account's address stays fixed for now.** ACC-086 is a new feature (a route, a migration for the waiting change, mail to both addresses) and waits for its own wave under ADR-043. Until then E-mail says plainly, in an information notice, that the address is the one used to log in and cannot be changed here (NAV-151), and SEC-192 and SEC-921 stay open.
- **D6. ACC-087's administrator path is recommended against as written.** Without mail it lets an administrator change an address with only a fresh proof of their own identity and an audit event. That drops two of the three guards SEC-192 requires (a confirmation at the new address, a notice to the old one), on the value `Login` matches on. Recommended instead, for the wave that builds ACC-086: without mail, an administrator's change is only a proposal, which the account holder accepts in Your account with their password or a passkey (a sensitive route); the old address stays the one for login until then, and both the proposal and the acceptance are audited. Nobody then changes an address without the holder's fresh proof, so SEC-192 does not weaken; someone locked out first gets a password reset from an administrator (ACC-009), then accepts. Recorded in ADR-051; ACC-087 is reworded in that wave.
- **D7. The public profile keeps its Edit link.** ACC-116 replaces the form with its Save by editing in place in Your account; the public profile `/people/{id}` stays read-only, and its Edit button on one's own profile keeps leading there.
- **D8. Your groups stay in Profile and visibility.** ACC-033 is built only there today; the lines of 9.2 do not name it. It follows the three cards as a read-only part, so no built line is lost.
- **D9. Recent logins go to Sessions.** ACC-108 names recent devices as the fifth part of Security, ending in a link to Sessions; ACC-017's recent logins are the other half of "which devices reached my account", so they become the second part of that screen, after the running sessions.
- **D10. No place in the login history.** ACC-017 says "with place"; ADR-026 says no place, because a place needs an outside lookup or a database that ages (SEC-900). ADR-026 stands, and ACC-074 already leaves place out of the sessions; ACC-017's words are corrected in step 9. This answers the question of the handoff of 2026-11-15.
- **D11. The sessions list shows only sessions that work.** ACC-074 never lists a session older than the absolute limit; today the list holds dead sessions until the cleaning job removes them. The query gains the two limits the session check already applies; nothing about ending sessions changes.
- **D12. Device and program are read in the browser.** The server stores the user agent as text; a few matches in a small module of our own name the device kind, system and program with their versions, and anything else reads as unknown. A library for this would be a dependency for a small, non-critical part (`docs/dependencies.md` policy), and the server's answer does not change.
- **D13. Dates follow the person's date format.** ACC-080 names day, short month and year; the person's own date format (NAV-077) decides how every date of the app is written, and a table that ignored it would be the one place that does.
- **D14. One Create, and the Administration scope only for administrators.** ACC-083 asks for one Create that asks for the scope in its form; the form moves into a dialog so the screen starts with the list. A non-administrator's token with the scope `admin` can do nothing more than without it, so the choice is left out for them (NAV-004); the server keeps accepting it, which changes nothing for anyone.
- **D15. Revoke all tokens is one request.** ACC-084 asks that every token stops in one action. Revoking one by one from the browser could stop halfway and leave some tokens alive after a leak, the moment this action exists for. One session-only route revokes them in one transaction and audits each as a single revoke is. It is the one server addition of this wave: it narrows access and adds no part.
- **D16. The way back from Tokens and Sessions is the Security tab.** ACC-104 forbids a back link and ACC-108 leaves the way back open. Security stays selected on both screens and is a link, and the browser's Back works as everywhere.
- **D17. The visibility chooser is a menu, not a select.** ACC-115 asks for an icon, the audience's name and an arrow, borderless; a native select cannot hold an icon. A `Menu` with `menuitemradio` entries, as SC1's Theme entry, keeps the keyboard and screen-reader behaviour of a choice of one.
- **D18. In-place editing saves one field at a time through the route of today.** `PUT /me/profile` takes the whole profile; leaving a field sends the stored profile with that one change, so no route changes. Two tabs open on one profile could overwrite each other, which is also true today.
- **D19. The name is shown, not edited.** ACC-117 lists the name first; no route lets a person change their own name today (the invitation and the identity provider set it). It shows as a read-only row without a chooser until a wave adds that change.
- **D20. The password form is an action.** NAV-162's Save and Reset changes are for settings; changing the password is an action with a current and a new value, so it keeps one primary button, Change password, and no Reset (SPC-153).
- **D21. The admin scope is reported, not changed.** The study above finds SEC-228 and SEC-229 true and ARC-140's "the console" narrower than the code. Changing which routes a token may reach is a change of a guard and its tests, outside the arrangement this wave rebuilds; it goes to the product owner and to a security wave of its own.

## Through the API

Every section of Your account reads and changes what it shows through routes of `/api/v1/` that exist; this wave adds none and removes none. The rule of each route is that of `docs/api/routes.txt`: "session" means a signed-in session only, so a token is refused by design (SEC-228, PRM-038); "sensitive" adds a proof of who you are at most 10 minutes old (ARC-140); "any" means a session or a token with the right scope.

| Section | Reads | Changes |
|---|---|---|
| Profile and visibility | `GET /me` (any), `GET /people/{id}` (any), `GET /people/{id}/picture` (any), `GET /me/groups` (any) | `PUT /me/profile` with the whole profile and its visibility (session), `PUT /me/picture?x=&y=&size=` (session), `DELETE /me/picture` (session) |
| E-mail | `GET /me` (any), `GET /me/security` (session) | nothing: no address changes yet (D5) |
| Security | `GET /me/security` (session), `GET /me/passkeys` (session) | `POST /me/password` (session), `POST /me/totp/begin` and `/confirm` (session), `POST /me/totp/disable` (sensitive), `POST /me/passkeys/begin` and `/finish` (sensitive), `DELETE /me/passkeys/{id}` (sensitive), `POST /me/sessions/end-others` (session); confirming who you are through `POST /auth/reauth` and `/auth/reauth/passkey/begin` and `/finish` (session) |
| Tokens | `GET /me/tokens` (session) | `POST /me/tokens`, `DELETE /me/tokens/{id}` (session; since wave MC2 a token takes scopes per route and may be limited to chosen spaces) |
| Sessions | `GET /me/sessions` (session, now only sessions that still work, D11), `GET /me/logins` (session) | `DELETE /me/sessions/{id}`, `POST /me/sessions/end-others` (session) |
| Privacy | nothing beyond the download | `POST /me/export` (session), which answers the file |
| Preferences | `GET /me/preferences` (any) | `PUT /me/preferences` (any), `POST /me/removal-request` (session) |
| Notifications | `GET /me/notification-settings` (any) | `PUT /me/notification-settings` (any) |
| Watches | `GET /me/watches` (any) | `DELETE /pages/{id}/watch?scope=page` or `scope=branch` (page.view), `DELETE /spaces/{id}/watch` (space.view) |

So everything this wave shows is reachable through the API. What is session only stays so on purpose: a script or an assistant acting with a token must never manage the sign-in, the sessions or the tokens of the person it acts for. The one route the plan added, `POST /me/tokens/revoke-all`, moves with D22.

## Built in wave SC6

Steps 0 to 6, 8 and 9 as planned; of step 7, only the frame and the head of the Tokens screen. On `main` the pieces this wave reuses had landed under these names: `SettingsSection` and `SectionActions` (`components/settings-section.tsx`), `Notice`, `SaveReset` with `differs` in `components/save-reset.tsx`, `Switch`, `TableBox` with `TableEmpty`, `GuideLink`, the card of SC5 (`.settings-card` with its rows), and `useSaved`, the short message that a setting which applies at once was saved. Nothing of them was made a second time.

| Part | Where |
|---|---|
| The registry of sections and its unit test | `web/src/views/account-sections.ts`, `account-sections.test.ts` |
| The bar, the column and the head of a section | `web/src/components/account-frame.tsx` (`AccountBar`, `AccountMain`, `AccountSectionHead`); `Shell` in `app.tsx` draws `AccountBar` in place of the top bar for the addresses of the registry |
| One section at its address, and the second-factor state | `web/src/views/account-view.tsx` |
| Profile and visibility, editing in place | `views/account-profile.tsx`, `views/account-profile-edit.ts` and its unit test |
| E-mail | `views/account-email.tsx` |
| Security (was `views/profile.tsx`) | `views/account-security.tsx` |
| Sessions and the user-agent reading | `views/account-sessions.tsx`, `web/src/user-agent.ts` and its unit test |
| Privacy, Tokens' frame | `views/account.tsx` (the body of `TokensView` is unchanged for MC2) |
| Preferences with switches and removal | `views/preferences.tsx` |
| Notifications on `SaveReset`, Watches in both frames | `views/notifications.tsx` (`WatchList`) |
| The sessions list leaves out dead sessions | `identity.Service.Sessions` in `internal/identity/users.go`, `TestSessionsLeaveOutSessionsPastTheirLimits` |
| Mutation lines | two for the sessions list (absolute and idle limit) and one for the tabs while a second factor is required, in `scripts/mutation-check.sh` |
| End-to-end | `web/e2e/account.spec.ts`; `people.spec.ts` and `access.spec.ts` follow the moves; 13 new pictures in `0-design.spec.ts` |

## Decided on the product owner's behalf on 2026-11-22, may be overruled

- **D22. Revoke all tokens waits for a wave after MC2.** Wave MC2, built at the same time and landed first, rewrote the token routes and `internal/identity/tokens.go` (scopes per route, chosen spaces, tokens for an assistant). A revoke-all route written beside that rewrite would be written twice. The build plan already named this route as the one to move; MC2 or the wave after it adds `POST /me/tokens/revoke-all` with the tests, mutation lines and budget of D15. Until then the Tokens screen has no Revoke all tokens (NAV-004), and ACC-084 stays new.
- **D23. The body of the Tokens screen is MC2's.** This wave places Tokens in the frame with its head and keeps `TokensView` as it is, so the two waves meet in one place only. The table of ACC-079, the Create dialog of D14 and the notice when tokens are off come with or after MC2; ACC-079 to ACC-083 stay new until then.
- **D24. The column is the reading column.** D2 asked for one new token at the narrowest width the reading column takes. That width is `--size-reading`, which `.column` already applies, so the frame uses `column settings-area centred` as the administration does and adds no token.
- **D25. The bar's account menu leaves while a second factor is required.** Every entry of that menu leads to a route the server refuses until a factor exists, as the Plain frame of that state had no menu before; the bar keeps the logo, the words Your account and help.
- **D26. Saves say so through the shared message.** Each field left with a change, each audience chosen and each preference says "Saved." through `useSaved`, the status region the whole app uses (NAV-161), rather than a second live region of its own. Notifications saves as a unit with Save and Reset changes.
- **D27. Guide links go to the documents that exist.** No user guide exists yet. Security, its parts and Sessions link to `security/risks.md` ("Protect your account", "Report anything odd"); Tokens to `api/README.md` ("Tokens"). Profile and visibility gets none until a document explains who sees what, so no link leads to a page that does not answer it.
- **D28. End all other sessions shows only while another session exists.** With no other session the button would do nothing (NAV-004).
- **D29. Recent logins read the user agent too.** The device column of Recent logins shows the program and the system as the running sessions do, instead of the raw user agent; the server's answer does not change.

## Supersedes

ADR-051 records that this spec supersedes, once built: the Plain frame and the top bar for Your account (ADR-030's "the top bar stays", for Your account only; the frame table of the design standard); `AccountNav` and Tokens and Data as tabs of their own; the profile form with one Save of spec 013 (F4, the Edit of one's own profile now leads to editing in place); and, as a recommendation for the wave that builds it, the administrator path of ACC-087 without the holder's acceptance.

## Seen, not changed

- `identity.Service.Sessions` lists sessions past their limits until the cleaning job removes them; step 6 fixes it (D11).
- `views/profile.tsx` holds the Security screen and `views/account.tsx` the profile: the names are swapped against what they hold. Step 1 or 3 may rename the files as part of the rebuild, since both are rewritten.
- The Tokens screen offers Create while tokens are turned off and only learns it from the refusal; the browser has no way to know beforehand (D14 handles it in the screen; a flag in `GET /me` would be an API change of its own).
- ARC-140, the comment on `sessionOnly` in `internal/httpapi/router.go` and spec 013 AC-12 say tokens never reach "the console"; see "The admin scope against ARC-140" (D21).
- ACC-024 says notifications and watches are still open for wave C; both are built as screens of their own. Step 9 corrects it.

## Provenance

Own words, from blueprint 03 chapter 9 sections 9.1 and 9.2 and chapter 1 sections 1.13 and 1.14, as written in the study of 2026-11-14 (ADR-045, 02 "One exception"), the built code on `main`, the code of `wave-sc1`, and specs 013, 015, 046, 078, 081 and 083. No pictures, inventories or other product were consulted in writing this spec.
