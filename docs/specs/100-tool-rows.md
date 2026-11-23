# 100: The tool rows

Status: built in wave TR1 (2026-11-23); "As built" at the end says what differs from the plan
Phase: the screens of blueprint 03 (ADR-045), the work that waves SC4 and SC5 moved out of their plans: step 10 of spec 081 (D25) and steps 7 and 8 of spec 083 (D33, D34)

## Problem

The long lists of the administration and of the settings of a space each filter in their own way. Users has a search field and seven dropdowns that say "Type: any"; the Audit log has five text fields, a dropdown and two date fields in one row with its buttons; Spaces filters in the browser, with two number fields whose placeholder is their only label; People has a search field and nothing else; Content has a form of eleven labelled fields; Trash has a search and a checkbox that sorts. A person learns a new row on every screen, the filters of Spaces and People never reach the address, and the filters of Spaces and People exist only in the browser, so a script or an MCP client cannot ask the same question. Sorting is a button in a heading on three screens of figures and a dropdown on two lists, and no sorted column says so.

Blueprint 03 gives every long list one row of tools (ADM-103, SPC-120, SPC-154), one look for a sorted column (NAV-157, ADM-110), and the empty block of NAV-173 for sections a person may fill (ADM-114). The product owner's rule of 2026-11-17 adds that every feature is usable through the API, so every search, filter and sort a screen offers is a parameter of its route.

The look stays ours: colours, icons, fonts and every value come from `tokens.css` (ADR-021, 02 "One exception"). Only the arrangement follows the lines.

## Study

### The lists of the administration and of space settings today

| Screen | Route | Search | Filters | Sort | Where it filters | In the address |
|---|---|---|---|---|---|---|
| Administration, Users | `GET /admin/users` | `q` (name, e-mail) | `type`, `status`, `source`, `role`, `space_id`, `group_id`, `idle_days` as seven dropdowns | fixed: name | server, paged by `limit`/`offset` | filters yes, search no |
| Administration, Audit log | `GET /admin/audit-events` | none | `actor_id`, `action`, `object_type`, `object_id`, `space_id` as text fields; `result` dropdown; `since`, `until` dates | fixed: newest first, paged by `before_seq` | server | yes |
| Administration, Spaces | `GET /admin/spaces` | name or key | pages at least, MiB at least, quiet for | none | **browser**, over the whole list | no |
| Space settings, People | `GET /spaces/{id}/role-assignments` | name | none | fixed: kind, then name | **browser** | no |
| Space settings, Permissions | `GET /spaces/{id}/access` | `q` | none | fixed | server | no |
| Space settings, Content | `GET /spaces/{id}/content` | none | `stage`, `label`, `owner_id`, `contributor_id`, `inactive_months`, four dates, five flags, as a form | `sort` dropdown: title, changed, created, owner | server, paged | yes |
| Space settings, Trash | `GET /spaces/{id}/trash` | `q` | none | `sort=title` as a checkbox | server | no |
| Space settings, Files | `GET /spaces/{id}/files` | `q` | `kind`, `label`, `uploader` dropdowns | fixed: newest | server, paged | no |
| Templates, of a space and of the instance | `GET /spaces/{id}/manage-templates`, `GET /admin/templates` | none | state (guided templates only) | fixed | **browser** | no |

Short lists that hold at most a few dozen rows and have no search today (Groups, Service accounts, Invitations, Webhooks, Automation, Document control, Spaces in the trash, Pages still to write, Audit of the space) get no tool row: ADM-103 is for a long list. Lists outside the administration and the settings (the directory, the people list, Recent, the search page) keep their rows until their own waves.

### What the lines ask

- **ADM-103.** One row above a long list: a search field first, with its search mark and a stronger border, filtering as one types; one button per filter, an icon and a name of one height, that opens a small chooser; a button for more filters when there are many; the screen's own action alone at the end. A set filter shows its name and value in words, in the active look (accent outline, accent text, tint); the others keep a neutral outline. No Filter button: a choice applies at once. The filters are part of the address.
- **ADM-105** (new, with an open study): a muted count line between the row and the list, counting only what the person may see, with a refresh button.
- **ADM-108 to ADM-110.** The first column holds what a row is about and is the widest; row actions last, under a heading only screen readers hear; a long list sorts by its columns, and the sorted column's heading shows accent words and an arrow.
- **ADM-114, NAV-173.** An empty section the person may fill shows one centred block with its heading, lines, primary button and guide link, and no button in the title row.
- **NAV-157.** A sorted column shows one arrow right after its heading's text, with that heading in the accent colour.
- **SPC-118 to SPC-121.** People: one row per holder; above it a search by name, a filter by kind of holder and by role, nothing chosen at first, and at the end a button to add people; Export as CSV in the title row's More.
- **SPC-154.** A table of space settings puts the title column first and widest and the actions last, shows a sort mark on the sorted column, and filters above it that apply at once (ADM-103).

### What exists to build from

- `SearchFilterBar` (`components/search-filter-bar.tsx`) has filter buttons and choosers for search. Its choosers sit in a strip under the row, its buttons show a count instead of words, and it edits the search syntax. It stays for search (spec 080); the tool row is a component of its own with the same look of a button, and the two share the classes `.filter-button` and `.filter-choice`.
- `Menu` (`components/menu.tsx`) gives a list of choices the arrow keys, Home, End, letters, Escape and Tab, and keeps a floating list on the screen. A chooser of fixed choices is a `Menu` of `menuitemradio` entries.
- `useAddressFilters` lives inside `views/admin.tsx`, and `content.tsx` has its own `useFilters`: two ways to keep filters in the address. They become one hook.
- `SortTable` (`components/sort-table.tsx`) sorts a whole list in the browser for the tables of figures (Insights, releases). Its heading button becomes the one sorted heading of the app, `SortHeading`, which a table sorted by the server uses as well.
- `EmptyState`, `TableEmpty`, `SettingsSection` and `SectionActions` of spec 081.

## Behaviour

1. **One row.** Every list named in "Screens" has one `ToolRow` above it, in this order: the search field, the filter buttons, **More filters** when the screen has more, **Reset** while anything is set, and the screen's own action at the end edge. On a narrow screen the row wraps; the action stays last.
2. **Search.** A field with a search mark at its start and a stronger border, labelled for screen readers with what it searches ("Search by name or e-mail"). Typing filters after a short pause (the existing `useDelayed`, about 250 ms), so each pause costs one request, not each key.
3. **A filter button.** An icon and the filter's name. Pressing it opens its chooser under it. Once set, the button reads "Role: Administrator", in the active look, and its accessible name says the same. A filter that is not set has the neutral outline.
4. **Choosers.** Two kinds, one look:
   - **Choices**: a menu of the values, each a `menuitemradio` with the set one checked, first **Any**, which clears the filter. Arrow keys, Home, End and letters move; Enter or Space chooses and closes; Escape closes and gives the focus back to the button.
   - **A field**: a small panel under the button with one or two labelled fields (a date range, a number, a person, a short text) and **Clear**. A change applies at once (a typed text after the pause); Escape or a press outside closes it, and Escape gives the focus back to the button.
5. **More filters.** A button with `aria-expanded` that shows the rarer filters as a second line of filter buttons under the row. While one of them is set the second line shows without a press, so a set filter is never hidden.
6. **Reset.** A quiet button, shown while a search or a filter is set, that clears all of them and the sort, and returns to the list as it opens.
7. **The address.** The search text, every filter and the sort are parameters of the address, under the same names as the API's parameters, so a copied address opens the same view and a reload keeps it. A change replaces the address instead of adding a step to the history, so Back leaves the screen.
8. **The count.** Under the row, a muted line that screen readers hear as a polite status: how many rows match, counted by the server over what the person may see, such as "12 people". Where the server already knows the whole number cheaply (Spaces), "12 of 40 spaces" (ADM-105, D4).
9. **Sorting.** A sortable column's heading is a button in the heading; pressing it sorts by that column, pressing again reverses, where the list can go both ways. The sorted heading has accent words and one arrow right after them, up for ascending and down for descending, and `aria-sort` on its cell; the others have neither. A list sorted by the server keeps its sort in the address as `sort`, with a leading `-` for the reverse. A list whose order is fixed, such as the Audit log, marks its fixed column the same way, without a button (D5).
10. **Columns.** The first column holds what the row is about and is the widest; row actions sit in the last column under a heading only screen readers hear, as `td.row-actions`; a checkbox column of a list whose rows can be chosen comes first.
11. **Empty blocks.** Automation (of the instance and of a space), Templates (of the instance and of a space) and Document control show the block of NAV-173 while they hold nothing and the person may add the first: a short heading, one or two lines, the button that makes the first one, the guide link; no button in the title row meanwhile.
12. **What a filter may show.** A filter only narrows what the server returns to the person: every list is filtered on the server, inside the same access rule as the list without filters. The values a chooser offers come from routes the person may read (the groups and spaces of the administration, the roles of a space, the labels and uploaders of the files the person may see), never from a list the browser keeps of its own.

### Screens

| Screen | Search | Filter buttons | More filters | Sortable columns | Action at the end |
|---|---|---|---|---|---|
| Users | name or e-mail | Type, Role, Group | Status, Space, Last login, How they log in | Name, E-mail, Last login | **New user** stays in the title row (ADM-080) |
| Audit log | action, exactly (D6) | Person, Time | Object, Object id, Space, Result | none: newest first, fixed (D5) | none; Export as CSV (with the filters) and Verify in the title row |
| Spaces | name or key | Status, Quiet for | Pages at least, Size at least | Name, Key, Pages, Storage, Last change | none |
| People (a space) | name | Kind, Role | none | none: kind, then name, fixed | **Add people** |
| Permissions (a space) | name | none | none | none | **Export as CSV** |
| Content (a space) | title | Status, Label, Owner | Inactive for, Contributor, Changed, Created, Has parents, Restricted, Broken links, Nothing leads to it, Past review | Title, Owner, Last change | none |
| Trash (a space) | title | none | none | Name, Deleted | none |
| Files (a space, and in the space) | name | Kind, Label, Uploaded by | none | none | none |
| Templates (a space and the instance) | name | State, while guided templates are on | none | none | none |

## Permissions and audit

- No route is added, removed or given another rule; the route walker and `scopes.go` stay as they are, because a query parameter is no new route (D15). Every parameter added below narrows the answer of its route inside the module's existing check: `permissions.RequireSpace(... SpaceManageAccess)` for People, `RequireSpace(... SpaceAdminister)` and `perm_listed_pages` for Content, `administrator` for Users and Spaces, the template module's own rule for Templates.
- Written first, as tests of the server: a parameter never widens a list. A filtered list of People holds only holders of that space, and someone without `space.manage_access` still gets the refusal with any parameters; a search of Content never finds a page the person may not see, also when its title matches; a filter of Spaces is refused to a non-administrator like the list; an unknown kind, role, state or sort is a `400`, never an unfiltered list.
- Reading a list writes no audit event, as today; the Audit log keeps its `audit.viewed`.

## Through the API

Every list's search, filter and sort is a parameter of its route; the screen sends exactly these. Paths are relative to `/api/v1`. **New** marks what this wave adds; the rest existed. Rules and scopes are those in `docs/api/routes.txt`; none changed.

| List | Route | Search | Filters | Sort | Paging |
|---|---|---|---|---|---|
| Users | `GET /admin/users` | `q` | `type`, `status`, `source`, `role`, `space_id`, `group_id`, `idle_days` | **new** `sort`: `name` (default), `email`, `last_login`, each with `-` for the reverse | `limit` (at most 500), `offset`; `total` is the number that match |
| Audit log | `GET /admin/audit-events`, `GET /admin/audit-events/export` | `action` (exact) | `actor_id`, `object_type`, `object_id`, `space_id`, `result`, `since`, `until` (RFC 3339) | newest first, fixed | `limit`, `before_seq`, `next_before_seq` |
| Spaces | `GET /admin/spaces` | **new** `q` (name or key) | **new** `status` (`active`, `archived`), `min_pages`, `min_mib`, `quiet_months` | **new** `sort`: `name` (default), `key`, `pages`, `storage`, `activity`, each with `-` | the whole list; **new** `total` is the number of spaces before filtering |
| People of a space | `GET /spaces/{id}/role-assignments` | **new** `q` (name) | **new** `kind` (`person`, `group`, `service`, `all_members`, `all_guests`), `role` (a role's id) | kind, then name, fixed | the whole list; each row **new** `user_type` for a person (`member`, `guest`, `service`) |
| Holders of the instance's roles | `GET /admin/role-assignments` | **new** `q` | **new** `kind`, `role` | as above | as above |
| Who has access to a space | `GET /spaces/{id}/access`, `GET /spaces/{id}/access.csv` | `q` | none | fixed | the whole list |
| Content of a space | `GET /spaces/{id}/content` | **new** `q` (title) | `stage`, `label`, `owner_id`, `owner_disabled`, `contributor_id`, `inactive_months`, `with_parents`, `changed_from`, `changed_until`, `created_from`, `created_until`, `restricted`, `broken_links`, `orphaned`, `past_review` | `sort`: `title` (default), `changed`, `created`, `owner` | `limit`, `offset`, `total` |
| Trash of a space | `GET /spaces/{id}/trash` | `q` | none | `sort`: deleted (default, newest first) or `title` | the whole list |
| Files of a space | `GET /spaces/{id}/files`, `GET /spaces/{id}/files/filters` for the choices | `q` | `kind`, `label`, `uploader` | newest first, fixed | `offset` |
| Templates | `GET /spaces/{id}/manage-templates`, `GET /admin/templates` | **new** `q` (name) | **new** `state` (`draft`, `waiting`, `approved`, `sent_back`, `withdrawn`) | fixed | the whole list |

The choices of the filters come from routes the same person reads: `GET /admin/groups` and `GET /admin/spaces` (Users, Audit log), `GET /roles?scope=space` (People), `GET /spaces/{id}/files/filters` (Files), the directory search of `SubjectPicker` (a person). A script or an MCP client uses these routes with a session, or with a token of the scope each route names; the administration's reads that are session-only stay so (spec 085).

## Data

No migration. Every new parameter is read by a query that exists, or narrows a list in Go after the module's check.

## Load budget

- **Users:** the sort adds `ORDER BY` on columns of `users`, which the query already reads; the count and the page stay two queries. No index is added: the list is for administrators, at most 500 rows a page, over at most the 5,000 accounts the product is sized for (ARC-233).
- **Audit log:** unchanged. The search is the exact `action` filter, which uses `audit_events_action_idx (action, seq)`. A search on part of an action would read the whole log backwards until it found 100 rows: it waits (D6).
- **Spaces:** one read of all spaces and one of their totals, as today; filtering and sorting happen in Go over at most the few thousand spaces of an instance. The answer gets smaller, never larger.
- **People:** one query, as today, with three more conditions; the list is the holders of one space.
- **Content:** one more condition, `position(lower($q) in lower(p.title)) > 0`, on rows the query already reads and limits.
- **Templates:** filtered in Go after the module's one read.
- **Browser:** one request per pause in the search field and one per choice, never one per key. The choices of Group and Space load when their chooser first opens, not with the screen.

## Upgrade notes

- **API.** Only additions: the parameters marked new above, `total` on `GET /admin/spaces`, `user_type` on the rows of the role assignments. A request without the new parameters gets the answer it got before, except that `GET /admin/spaces` now returns `totals` only for the spaces it lists, which without filters is every space, as before.
- **Addresses.** The filters of Users, the Audit log and Content keep their names in the address. Users now also keeps its search (`q`) and sort; Spaces, People, Trash, Files and Templates now keep theirs. An old address opens the same view.
- **Mixed releases.** During a rolling upgrade a browser with the new frontend may reach a node of the previous release, which ignores the new parameters: Spaces then shows its whole list and People every holder, unfiltered, until that node is upgraded. Nothing is shown that the person could not see before.

## Design pictures and end-to-end tests

### Pictures (in `web/e2e/0-design.spec.ts`)

New: the tool row of Users with a filter set and More filters open (`admin-users-filters`, named in spec 081); a chooser open (`admin-users-chooser`); the Audit log with Person and Time set (`admin-audit-filters`); Spaces with a filter and a sorted column (`admin-spaces-filters`); People with Kind and Role set (`space-settings-people`, named in spec 083); Content with the tool row (`content-filters`); the empty block of Automation (`admin-automation-empty`). Changed: every picture of the screens in "Screens" (the row and the headings), and the pictures of the tables of figures that use `SortHeading`.

### End-to-end tests (`web/e2e/tool-rows.spec.ts`)

- Users: a filter chosen from its menu shows its name and value in words, reaches the address, holds over a reload, and narrows the list; Reset clears it; More filters shows its line, and shows it by itself while one of its filters is set; Escape closes a chooser and the focus is back on its button; a column sort reaches the address and the heading has `aria-sort`; axe on the row with a chooser open.
- Audit log: Person and Time narrow the list and stay in the address; Export as CSV carries the filters.
- Spaces: the search and a filter narrow the list on the server (the request carries them) and reach the address.
- People: Kind and Role narrow the holders, reach the address; Add people opens the way of adding holders; a member without `space.manage_access` who types the address of People with filters sees what they saw before (no list).
- Content: the search finds a page by part of its title and not a restricted page of the same name the person may not see.
- Automation of the instance with no rule shows the empty block and no button in the title row.

### Unit tests (written first)

- `components/tool-row.test.ts`: the words of a set filter, which filters show on the second line, when Reset shows, and the address a change gives (the keys kept, empty values left out, the sort reversed by a second press).
- `components/sort-heading.test.ts`: the next sort of a press (ascending, then descending, then another column ascending), and `aria-sort` for each state.
- Go: `internal/httpapi` tests of the Spaces filter and sort (a pure function), the parameters' validation (`400` for an unknown value); `internal/identity` of the Users sort; `internal/permissions` of the People filter, refused without the permission; `internal/pages` of the Content search over what the person may see; `internal/app` of the Templates filter.

## Build plan

| Step | What | Size |
|---|---|---|
| 1 | Server: the new parameters with their tests, written first | M |
| 2 | `useListAddress`, `ToolRow`, `SortHeading`, their unit tests first; `SortTable` uses `SortHeading` | M |
| 3 | The administration: Users, Audit log, Spaces | M |
| 4 | Space settings: People, Permissions, Content, Trash, Files, Templates | L |
| 5 | Empty blocks: Automation, Templates, Document control | S |
| 6 | e2e and pictures; `docs/design/README.md`; blueprint 03 status lines; changelog; report; handoff | M |

## Acceptance criteria

- [ ] Every screen of "Screens" has one `ToolRow` and no second way to filter; its search, filters and sort are in the address and are parameters of its route.
- [ ] No filter shows what the list without it would not: proved by the server tests above.
- [ ] Sorted headings have accent words, one arrow and `aria-sort`.
- [ ] Automation, Templates and Document control show the empty block while empty.
- [ ] `make check`, the whole e2e suite once and `0-design.spec.ts` twice in a row are green.
- [ ] The product owner has seen the before and after pictures in the report.

## How the product owner tests it

1. Open Administration, Users. Above the list: a search field, then Type, Role and Group, then More filters. Choose Role, Administrator: the button reads "Role: Administrator" in the accent colour, the list narrows, and the address holds `role=administrator`. Reload: it stays. Press Reset: everything is back.
2. Press More filters: Status, Space, Last login and How they log in appear on a line under the row. Press the heading Last login: the list sorts by it and the heading shows an arrow in the accent colour.
3. Open the Audit log, choose Person and pick yourself: only your actions show. Press Export as CSV: the file holds the same rows.
4. Open a space's settings, People. Choose Kind, Groups: only groups show. Press Add people: the way to add someone opens.
5. Open Content and type part of a page's title in the search field: the list narrows to it.
6. Open Administration, Automation on an instance without rules: a centred block explains what a rule does, with one button to make the first.

## Decided on the product owner's behalf on 2026-11-23, may be overruled

- **D1. Which lists get a row.** The lists of "Screens", because each has a search or filters today or can hold hundreds of rows. Short lists without either (Groups, Service accounts, Invitations, Webhooks, Automation, Document control, Spaces in the trash, Pages still to write, Audit of the space) get none: ADM-103 is for a long list, and an empty search over ten rows is noise. Lists outside the administration and the settings follow in their waves.
- **D2. Two kinds of chooser.** Fixed values are a menu of radio entries, so the arrow keys work and screen readers hear which is set; a date range, a number, a person or a free text is a small panel with labelled fields and Clear, because a menu may hold only entries. Both apply at once and close with Escape onto their button.
- **D3. More filters is a second line, not a panel.** The rarer filters show as more buttons under the row, so they work exactly like the first ones and a set one is visible without opening anything; the line shows by itself while one of its filters is set.
- **D4. The count says what matches.** ADM-105's question whether an exact total stays cheap is open, so the line gives the number the server already counts: the matching rows of Users, Content and Files, the holders of People, the spaces of Spaces with the whole number beside it, because that list is read whole anyway. The refresh button of ADM-105 waits for its study; a reload or a new filter loads the list again.
- **D5. The Audit log keeps one order.** It is append-only and pages backwards by its sequence; sorting it by another column would break paging and the proof of the chain's order. Its When column carries the sort mark of a fixed order, without a button. People keeps kind, then name, and Files newest first, for the same reason of one order per list without a column worth sorting by.
- **D6. The Audit log's search is the action, exactly.** The log has no free text, and the only cheap search is the exact action through its index. A search on part of an action, or on words in details, would read the log backwards until it found 100 rows, which on a large instance is a full scan: it waits for a study of its own. The field's placeholder says that it takes an action such as `page.created`.
- **D7. One convention for sorting.** `sort=<column>`, with `-` before it for the reverse, where a list can go both ways. Content and Trash keep the keys they had, each in the one direction that makes sense (the newest change first), so their headings sort but do not reverse.
- **D8. Reset on every row.** Spec 081 named Reset for the Audit log; a way back to the list as it opens is as useful on every list with filters, and one row should behave the same everywhere.
- **D9. Spaces and People filter on the server.** SC4 D21 kept the filters of Spaces in the browser over the whole list, and SC5 did the same for People. The rule of 2026-11-17 and this wave's brief ask for every filter as a parameter of the route, so both move to the server, and the browser no longer narrows any list itself.
- **D10. People's kinds.** Person, Group, Service account, All members and All guests: SPC-120's kinds of holder, with service accounts apart because ACC-043 names them. A person's row now carries `user_type`, so the row says "Service account" and a guest carries the Guest mark (SPC-119, partly).
- **D11. Add people opens a dialog.** SPC-120 puts the button at the end of the row; the way of adding holders of today moves into a dialog it opens, with the same steps and the same preview.
- **D12. People's Export as CSV is the list of who has access.** SPC-121 asks for Export as CSV in the title row's More; the one CSV of a space's holders is `access.csv`, which lists everyone who can open the space and how. It moves there from the row of Permissions, which keeps its own Export as CSV at the end of its row.
- **D13. New user, Export and Verify stay in the title row.** ADM-080 puts a section's primary action in its title row, as SC4 built for Users; ADM-103's action at the end of the row is for a screen whose action belongs to the list, such as Add people. The Audit log's export now carries the filters of the view.
- **D14. Templates filter on the server.** The state filter of guided templates moves to the server with a search by name, as D9 says.
- **D15. No new scope.** A query parameter is part of its route, so `scopes.go` gets no line; no route was added.
- **D16. `SearchFilterBar` stays.** The filters of search write the search language, and their strip of choices under the row is spec 080's; they share the buttons' look with the tool row. Merging them is a later step if the product owner wants one chooser for both.
- **D17. Directory and people list wait.** `views/directory.tsx` and `views/people.tsx` have the same kind of row, but are not lists of the administration or the settings; their screens' waves move them to `ToolRow`.

## As built (wave TR1, 2026-11-23)

- **Components.** `components/tool-row.tsx` (`ToolRow`, and the fields a filter's panel holds: `FilterText`, `FilterNumber`, `FilterDate`, `FilterPerson`, `usePersonWords`); `components/tool-row-model.ts` (what a row shows, apart from how: the words of a filter, the line of more filters, what Reset clears, `choiceFilter`); `components/list-address.ts` (`useListAddress`, `queryOf`, `nextSort`, `sortStateOf`), which replaces `useAddressFilters` of `views/admin.tsx` and `useFilters` of `views/content.tsx`; `components/sort-heading.tsx`, which `SortTable` now uses too. `views/admin-space-filter.ts` is gone: its filter is `internal/httpapi/admin_spaces.go` on the server.
- **Tests.** The unit tests of the row and of sorting are one file, `components/tool-row.test.ts`. The Go tests are `internal/httpapi/list_params_test.go` and `admin_spaces_test.go` (pure), and `internal/app/tool_rows_test.go` (through the API, with the access rule): the user sort, the spaces filter, People refused without `space.manage_access` and narrowed only within the space, the Content search that never finds a restricted page, the templates filter.
- **Differences from the plan.** The choices of Group and Space load with the screen, as before, not when their chooser first opens: two small reads an administrator already made. Content's Status and Label are short texts in a panel rather than menus, because a space's statuses and labels are free words. Content gained a Created column so its sort by creation date, which the dropdown offered, has a heading. The search of People matches the names of people and groups; All members and All guests are found by Kind, because their names are words of the browser's language. Add people reads the whole list, not the filtered one, so a holder outside the filter keeps their roles when given another.
- **Lines.** ADM-103, ADM-114 and SPC-120 are built; ADM-105 (the count without the refresh button), SPC-118 (no checkbox column, D15 of spec 083), SPC-119 (the service account line and the Guest mark) and SPC-121 (Export as CSV in More; the row's More waits) are partly built; ADM-108 to ADM-110 and SPC-154 stay partly built (Webhooks and the parents of ADM-110 wait).

## Provenance

Own words, from blueprint 03 chapter 10 section 10.1 (ADM-103 to ADM-114), chapter 2 section 2.11 (SPC-118 to SPC-121, SPC-154) and chapter 1 (NAV-157, NAV-172, NAV-173), as written in the study of 2026-11-14 (ADR-045), specs 081 and 083, and the code on `main`. No pictures, inventories or other product were consulted in writing this spec.
