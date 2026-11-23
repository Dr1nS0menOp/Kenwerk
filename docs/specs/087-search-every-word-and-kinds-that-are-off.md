# 087: Search, wave SR3: every word a reader sees, and kinds of item that are off

Status: built in wave SR3 (steps 0 to 5), on the branch `wave-sr3`; EDT-221 and the switches of SPC-115 wait as below
Phase: before 1.0, under the exception of 2026-11-15 that puts search first and allows new search features before 1.0 (spec 080). The feature freeze of ADR-043 still holds for everything that is not search.

## Problem

Spec 080 gave wave SR3 two lines: EDT-221, "search finds text in every part of a tabs block", to be built with the editor wave that builds the block, and SPC-117, what happens to existing items of a kind of item that a space turned off, "in the tree, in links and in search", as a study. This spec studies both, says what can be built now and what cannot, and plans the build.

The study found that neither line can be built as written today. No wave builds the tabs block: wave SC3 (spec 082, D20) leaves it out as a new part under the freeze. No switch for a kind of item exists either: wave SC5 (spec 083, D14) builds the Features card without them. What the study did find is that search already misses words a reader sees today, which is the same machinery EDT-221 needs, and that one filter of search offers a part the installation turned off. Those are built here.

## Study

### What the lines ask

| Line | Status | Asks | Depends on |
|---|---|---|---|
| EDT-220 | new | A tabs block: several named parts, one shown at a time; each part holds any block; following a link into a part opens it | A new node in the document format, the editor, the reader, the catalogue of SC3 |
| EDT-221 | new | Printing and exporting show every part under its name; Markdown gives each part a heading; search finds text in every part; a comparison shows every part. A limit on parts, tabs inside tabs and narrow screens need their own study | EDT-220 |
| EDT-155 | built | Every new block of chapter 4 is added to the allow-list, Markdown export, comparison and search | — |
| SPC-115 | new | The Features card has a group "kinds of item": Database, Folder, Link entry (and Live document and Whiteboard once they exist) | A switch per space for each kind; SC5 D14 leaves them out |
| SPC-116 | new | A switch applies at once; an experimental one shows only while the part is on | SC5 builds it for the switches of today |
| SPC-117 | new | A kind turned off leaves the create menu of the space; nothing is deleted (SPC-048). What happens to existing items of that kind in the tree, in links and in search needs its own study | SPC-115 |
| SPC-048 | built | Turning a feature off hides it and never deletes content | — |
| ADR-043 | — | An experimental part that is off is not offered on any screen, and keeps what exists | — |

### What exists today

**How a page's words reach search.** On publish, `pages.makeCurrent` writes the readers' entry with `search.Index(title, document.Text(doc))`; a controlled page also gets a working entry through `search.IndexWorking` from its head version (spec 064, DOC-520). `document.Text` walks every node and writes one line per paragraph, heading, code block, file, decision and sheet, plus the alt and caption of an image and the title of a collapsible section. Because it walks every node, the paragraphs inside any container (panel, column, table cell, collapsible section) are already found.

**Words a reader sees that never reach search.** The allow-list keeps text attributes that the reader sees on the page and in the export, and that `Text` leaves out:

| Node | Attribute | Where the reader sees it |
|---|---|---|
| `table` | `caption` | A line above or below the table (EDT-102) |
| `codeBlock` | `title` | A line above the code (`html.go`, `code-title`) |
| `chart` | `title`, `x_title`, `y_title` | Over the chart and along its axes |
| `media` | `caption` | Under the embedded media |
| `spotlight` | `button_text` | The words on its button |

Left out on purpose, because no reader sees them as text on the page: `image.title` and the `title` of a link (tooltips), the `name` of an excerpt and an anchor (identifiers), the `facts_id` of page facts, the settings of dynamic blocks (a query, whose answer changes without the page changing), the `name` and `original` of an unknown block (never shown, EDT-158), and the fields and instructions of templates (a template is never found).

EDT-155 is marked built, so this is a gap in a built line. The words of a tabs block's part names would fall into the same gap: `Text` finds a part's paragraphs by itself, but not the name of the part, which is an attribute.

**No way to bring existing pages up to date.** `search_documents` changes only when a page is published (or its file names or labels change). A change to what `Text` gives reaches a page only at its next publish. There is no job that rebuilds the text of existing entries. The one-time job that encrypts stored files (`internal/app/encryption.go`, spec 034) is the pattern for one: a periodic task with a run budget, a cursor, and a row that says when it is done.

**Features that are off, today.** The features of a space (`internal/features`) are Blog, Comments, Reactions, access requests, Page statuses, Analytics, Automation and Calendar. None is a kind of item except Blog, whose kind is the blog post. What "off" does today:

| Feature off | New content | Existing content on its own page | Search |
|---|---|---|---|
| Blog | Refused, `feature_off` (`pages.Create`, `SetKind`) | A post still opens; the space's overview and the Blog group of the sidebar hide posts | Found, with the mark of a post |
| Comments | Refused, `comments_closed` | Existing threads still show under the page (`page.tsx`: `features.comments \|\| threads.count > 0`) | Found under Comments |
| Databases (experimental, for the installation) | Refused, `experimental_off` | A database stays readable and editable (spec 069) | Found; the kind filter still offers Database |

So in practice "off" means "no new ones here", and what exists stays reachable for whoever may see it. Search never asks whether a feature is on.

**The kind filter.** `search-filter-bar.tsx` offers the kinds `page`, `post`, `database` and `comment` always. With databases off for the installation it still offers Database, which ADR-043 forbids ("is not offered on any screen"). Folders and link entries have no choice in the filter.

### What can be built now, and what cannot

- **EDT-221 cannot be built in SR3.** It needs EDT-220, the tabs block, which is a new part of the editor. The exception of 2026-11-15 covers search features, not a new block, and SC3 D20 keeps tabs out under the freeze. SR3 writes down what the wave that builds tabs must do for search (the contract below), and builds now the part of the machinery that the tabs block will need and that is missing today: attribute words in `Text`, and a pass that brings existing entries up to date when `Text` changes.
- **SPC-117 cannot be built in SR3** either, since there is no switch for a kind of item. The study answers its question (below), so the wave that adds the switches builds a decided behaviour; SR3 pins the same principle for the features that exist, with tests.
- **Built now:** the words of the five attributes above in search (EDT-155), the pass that brings existing entries up to date, the kind filter that follows the installation's parts (ADR-043), and the tests that pin what search does with features that are off.

### SPC-117: what happens to items of a kind that is off

The question has three places: the tree, links and search. The options were:

1. **Hide them everywhere.** A folder that disappears from the tree hides every page under it, which the folder's kind has nothing to do with; a link to a database would answer "not found" for a person who may see it. That makes a switch of convenience into an access rule, and the rule of access is `permissions.Evaluate` and nothing else.
2. **Hide them from search only.** Search would then have to ask the switches of every space on every search, a join on `space_features` in the picking and in its total, for a result that links can still reach. Items would be reachable but not findable, which helps nobody.
3. **Keep them where they are.** Off means no new items of that kind in that space. Existing ones stay in the tree, links to them open, and search finds them with the mark of their kind (NAV-156), for whoever may see them. This is what Blog, Comments and the experimental databases already do.

Option 3 is chosen (D5). In detail, for the wave that adds the switches:

- **Create menu:** the kind is absent (SPC-117 itself), and so is the direct way in the top bar's Create.
- **Turn into:** turning a page into a kind that is off is refused with `feature_off`, as for a blog post today (`checkKindChange`). Turning an item of that kind back into a page stays possible where it is possible today.
- **Copy:** copying an item of a kind that is off into that space is refused, because a copy is new content.
- **Move:** moving an existing item into a space where its kind is off is allowed: nothing new is made, and refusing would strand the item where it stands.
- **Tree, links, search, exports and the trash:** unchanged. Search needs no query and no filter for it.

### The search contract for the tabs block (EDT-221)

For the wave that builds EDT-220. Tests are written first, in this order:

1. `document`: a word that stands only in the second part of a tabs block, and a word that stands only in the name of the second part, are both in `Text` (`TestTextHoldsEveryPartOfATabsBlockAndItsName`). The part's name goes on its own line before the part's content, as the title of a collapsible section does. The part's name is added to the table of searched attributes that step 1 of this wave introduces, so the guard test there covers it.
2. `internal/app`: a reader finds a page by a word that stands only in the second part, and by the name of the second part; a person who may not see the page finds neither, and neither is counted (`TestSearchFindsAWordThatStandsOnlyInTheSecondPartOfTabs`).
3. A controlled page with a tabs block only in its working version: readers do not find the words of its parts; its authors do (DOC-520).
4. The excerpt of a result may come from any part, as from any other block.
5. A result links to the page, as every result does. It does not open the part that holds the words: a result knows the page, not the block, and a link into a part needs the anchor that EDT-220 builds. A link to a part from a result is a later choice (D7).
6. The reader's own find in the browser: each part that is not shown uses the `until-found` state of the HTML `hidden` attribute where the browser supports it, and opens its part on the `beforematch` event, so finding on the page reaches every part as EDT-116's sections are reached when printing. Where the browser lacks it, the part stays hidden, and printing still shows every part (EDT-221). The tabs wave checks support when it builds; it adds no dependency.
7. The editor's Find (EDT-169) finds a match in any part and shows the part that holds the current match.
8. A tabs block adds a node to the document format. A previous release, during an upgrade, would refuse or drop it on save. The tabs wave offers the block only once no node of an older release runs, with the check that guided templates use (`features.RefuseWhileOlderReleaseRuns`, spec 074, TPL-1103), or adds the node to the allow-list one release before the editor offers it. Which one is that wave's choice.

No existing document holds a tabs block, so that wave does not need the pass of step 2 below; it raises the text version only if it changes what `Text` gives for blocks that already exist.

The rest of EDT-221 (printing and exporting every part under its name, a Markdown heading per part, a comparison that shows every part) and the open questions of EDT-221 (a limit on parts, tabs inside tabs, narrow screens) are that wave's own study.

**What must come first for the tabs wave:** SC3 on `main`, at least its steps 5 to 7 (the catalogue with its categories and roles, where tabs gets a place in EDT-177 and EDT-189, the insert dialog and the slash menu), because a new block enters through that catalogue. Then the product owner's choice to build tabs before or after 1.0 (D1). SR3 does not need SC3: it changes no file of the editor.

### What moved on `main` since the plan

The plan was written on 16 November. Before building, the branch took the rename (spec 095) and was rebased onto `main`, where these waves had landed meanwhile:

- **SR2 (spec 086):** the Tasks tab and people by any word. It added no kind to the kind filter, so `offeredKinds` keeps page, post, database and comment; `search-filter-bar.tsx` still lives in `web/src/components`.
- **FX10:** the hits of the index of words are one `MATERIALIZED` CTE in `internal/search/words.go`. The pass reads and writes entries only and touches no query of a search, so nothing here changes it.
- **QG1 (spec 097):** `make lint` holds every function to 40 lines and a complexity of 10, with `dupl` and `gosec`, tests included, by the ratchet in `scripts/lint-ratchet.txt`. The code of this wave adds no finding.
- **MC2 (spec 096):** every route needs a scope in `internal/httpapi/scopes.go`. This wave adds no route.
- **Migrations:** the highest on `main` was 0078 when building started and 0079 (`0079_connections.sql`) when it ended, so the state of the pass is `0080_search_state.sql`; renumber it at landing if another wave lands a migration first.

### Through the API

Every part of this wave is reachable through the API (the product owner's rule that every feature is), with the routes and scopes that exist:

- **The new words** are found by `GET /api/v1/search` and `GET /api/v1/search/quick` (scope `content:read`), as every word is; the request and its answer are unchanged, and the excerpt may show them.
- **The kind filter** reads `databases` from `GET /api/v1/system/capabilities` (scope `content:read`); `GET /api/v1/search?kind=database` still answers while databases are off, with the databases made before (D6), because a filter is not a rule of access.
- **The pass** needs nothing from anyone. Its end is the event `search.text_refreshed` in `GET /api/v1/admin/audit-events?action=search.text_refreshed` (scope `admin:audit`).
- **Blog and comments off** are set with `PUT /api/v1/spaces/{id}/features`, which already exists; search answers as before.

## Behaviour

1. **Every word a reader sees is found.** A word that stands only in a table's caption, a code block's title, a chart's title or axis titles, a media block's caption or the words of a spotlight's button finds the page, for whoever may see it, in a full search and in the box (the box matches titles only, as today, so there only through the page's title). The excerpt of a result may show those words. Tooltips and identifiers stay out (D2).
2. **Pages published before are brought up to date.** After an upgrade to this release, once every node runs it, the worker goes through the existing entries of search once and rewrites the text of each entry whose text is now different. Until it is through, the new words are found on pages published after the upgrade only. Nothing else about search changes while it runs. When it is through, it records that once in the audit log. It never runs again until a later release changes what search reads from a document.
3. **The kind filter offers what exists.** Database is a choice of the kind filter only while the installation has databases on. A database made before databases were turned off is still found among all kinds, with its mark (D6).
4. **A feature or kind that is off hides nothing from search.** A blog post in a space whose blog is off, and a comment on a page in a space whose comments are off, are still found by whoever may see them, as they are today (D5, D8).

## Permissions and audit

Nothing new is granted. Every result still passes `perm_visible_pages` (pages) or `perm_visible_comments` (comments) at the moment of the search; no list, count, suggestion or filter is added. The five attributes are part of the page the reader already may see.

The pass is the one new path that writes search entries, and it runs as the system, without a reader. Its rules, each with a test and a mutation:

- **The readers' entry comes from the version readers see**, `pages.current_version`, never from the head of a controlled page. Otherwise readers would find the words of a version that waits for approval (DOC-520).
- **The working entry is rewritten only where it exists**, from `page_control.head_version`, so it keeps its rule: only those who may edit match it (`workingMatches`).
- **The pass never creates an entry.** It rewrites only rows that are already in `search_documents` and `search_working`, so a draft, a template or a page whose working entry was dropped stays as it is.
- **The pass waits while a node of an older release runs**, because such a node would write the old text again behind it.

Audit: one standalone event when a pass is through, `search.text_refreshed`, actor the system (`worker`), with the text version and the counts of entries read and rewritten, as `storage.encrypted_all` does. No page text, title or id goes in it. No outbox event: no module acts on search entries.

## Data

**One expand migration**, `0080_search_state.sql` as built (main's highest was 0079 at commit time; renumber at landing if another wave lands one first):

```sql
-- phase: expand
CREATE TABLE IF NOT EXISTS search_state (
    id                 bool PRIMARY KEY DEFAULT true CHECK (id),
    text_version       integer NOT NULL DEFAULT 1,
    text_cursor        uuid,
    entries_read       bigint NOT NULL DEFAULT 0,
    entries_rewritten  bigint NOT NULL DEFAULT 0,
    refreshed_at       timestamptz
);
INSERT INTO search_state (id, text_version)
SELECT true, CASE WHEN EXISTS (SELECT 1 FROM search_documents) THEN 1 ELSE 2 END
ON CONFLICT (id) DO NOTHING;
```

`text_version` 1 is the text every entry held before this release. The code holds `search.TextVersion`, 2 in this release, and a rule in its doc comment: raise it whenever `document.Text` gives something else for a document that already exists. The pass runs while `text_version < search.TextVersion` and sets it when the pass reaches the last entry (D9). The two counts add up the batches of a pass across its runs, for the audit event at its end. An installation without entries holds no old text, so a new installation starts at 2 and never runs the pass (D10). A restore of an older backup brings the older value back, so the pass runs again, which is right.

A settings key was considered instead of a table: writing it needs a caller and records `settings.updated` for every move of the cursor, which is noise for a system job, and `storage_state` (migration 0032) is the precedent for a one-row state table.

No change to `search_documents` or `search_working`, and none to the document format.

## API

No route changes. The search request and its answer stay as they are. The kind filter's choices come from `/system/capabilities`, which the screens already read.

## Code

- `internal/document`: `Text` writes the five attributes on a line of their own where their block starts. The attributes come from one table, `searchedAttrs` (node type to attribute names), which `wordsOf` uses for the title of a collapsible section and the caption of an image as well, so a block has one place that says what search reads from it.
- `internal/search` (`text_pass.go`): `TextVersion`; `EntriesAfter`, the pages that have a readers' entry, in page order; `Refresh(ctx, q, bodies)` and `RefreshWorking(ctx, q, bodies)`, one `UPDATE … FROM unnest(…)` each for a whole batch, which rewrites an existing row only `WHERE body IS DISTINCT FROM` the new text, so an unchanged page costs no write and a missing row is never made; the state of the pass (`ReadTextPass`, `AdvanceTextPass`, `RestartTextPass`, `FinishTextPass`). As built, the two refreshes take a batch rather than one page, so a batch of 100 costs two writes instead of up to 200.
- `internal/pages` (`search_text.go`): `RefreshSearchText(ctx, after, limit) (TextBatch, error)`: one transaction per batch with `statement_timeout` 3 s, in `page_id` order from `after`. It asks search for the entries, reads for each page the document of its current version and, for a controlled page whose head is ahead of it, of its head version, calls `search.Refresh` and `search.RefreshWorking`, and moves the cursor with `search.AdvanceTextPass` in the same transaction. Pages owns versions and document control, and already calls `search.Index`; search keeps its own tables (the module boundary, spec 072).
- `internal/app` (`search_text.go`): `refreshSearchText`, the periodic task `refresh-search-text` (every minute), shaped like `encryptStoredFiles`: it does nothing when the version is current; while a node of an older release is alive (`olderReleaseRuns`, the check that `features.HoldWhileOlderReleaseRuns` is given) it waits, and a pass that had started goes back to the first entry (D11); it works within a run budget of two minutes, in batches of 50, resting after each batch 19 times as long as the batch took (D12); and when a batch comes back short, it sets the version and records the audit event in one transaction.
- `web/src/components/search-filter-bar.tsx`: the kinds come from a pure function, `offeredKinds(capabilities)`, which leaves Database out while databases are off.

## Load budget

**Requests:** no query is added to any request. Search, the box and the results screen keep their budgets in `query_budget_test.go`, which this wave does not change. The new words make a few bodies slightly longer, within `maxBodyBytes`; `TestSearchOnRealData` must still hold each search under 100 ms on the real-data dump.

**The pass** is background work of the worker, outside the three classes of ARC-233 and on the jobs' own connections. Its budget:

- one transaction per batch, `statement_timeout` 3 s; a batch reads its rows of `pages` and at most two documents of `page_versions` per page by primary key, and writes only the entries whose text changed;
- after each batch it rests, so it keeps only a share of one connection and of one core busy;
- **as built:** batches of 50 and a rest 19 times as long as the batch, so the pass is busy at most a twentieth of the time. The plan's batches of 100 with a rest as long as the batch were measured first and missed the budget below (D12);
- a run stops after two minutes and goes on at the next tick from its cursor.

To measure in step 2, on the real-data dump (60,385 pages, a tenth under control), and to write into the report: the median and slowest batch, the time of a whole pass, the share of entries rewritten, and the WAL written. While the pass runs, the stress profile's p95 for saving and reading must stay within 10 % of a run without it; a miss stops the wave until it is fixed (smaller batches or a longer rest). Nothing is claimed for 5,000 people beyond what that measurement shows (ADR-036).

**SPC-117** adds no load: search asks no switch.

## Tests to write first

In the order of the build steps. Every name states the behaviour.

**Step 1, `internal/document`:**
- `TestTextHoldsTheWordsAReaderSeesInCaptionsTitlesAndButtons`: one case per row of the table above; each word is in `Text`, on its own line.
- `TestTextPutsTheTitleOfACodeBlockOnALineBeforeTheCode`: the title is a line of its own, before the code.
- `TestTheGuardSeesTheReadsOfCalledFunctions`: the guard below finds a key read by a function a cleaner calls, such as `keepBlockID`.
- `TestTextLeavesOutTooltipsAndNames`: image title, link title, anchor and excerpt names, page facts id, dynamic settings and an unknown block's original are not in `Text`.
- `TestEveryTextAttributeIsSearchedOrNamedAsNotRead`: the test reads the source of the gate (`go/parser`) and finds, per node type, every string attribute its cleaner and the functions it calls read (`keepText`, `stringAttr`, or `in["key"].(string)`); each is in `searchedAttrs` or in the test's list `notReaderText`, with the reason, and neither table names an attribute the gate no longer keeps. A new text attribute in the gate without a place in one of them is the reason this test exists; the tabs wave adds the name of a part here.

**Step 1, `internal/app`:**
- `TestSearchFindsAWordThatStandsOnlyInATableCaption` (with the caption in the excerpt), `TestSearchFindsAWordThatStandsOnlyInAChartTitle` and `TestSearchFindsAWordThatStandsOnlyInASpotlightButton`: found by a reader of the space, not found and not counted for someone a restriction keeps out.

**Step 2, `internal/app` (each with real PostgreSQL):**
- `TestTheTextPassBringsPagesPublishedBeforeUpToDate`: an entry written with the old text (version 1), the pass, then the caption's word finds the page; the state says version 2 and when.
- `TestTheTextPassNeverPutsAWorkingVersionInTheReadersEntry`: a controlled page approved at version 1 and with a working version 2 that holds a word only there; after the pass a reader does not find that word, its author does.
- `TestTheTextPassCreatesNoEntry`: a draft never published and a template have no entry before the pass and none after, and a controlled page whose working entry was dropped gets none back.
- `TestTheTextPassLeavesAnUnchangedEntryAlone`: the `updated_at` of an entry whose text did not change stays as it was.
- `TestTheTextPassWaitsWhileANodeOfAnOlderReleaseRuns`: with an older node alive the pass reads nothing, and a pass that had started goes back to the first entry (D11); once the node has stopped, the pass runs.
- `TestTheTextPassGoesOnFromItsCursorAfterItsBudget`: with a budget that stops after one batch, the version is still 1 and a cursor is kept; a second run goes on from it, finishes, and only then sets the version (D9).
- `TestTheTextPassRunsOnceForEachTextVersion`: a new installation starts current (D10); when the state is current, a run reads nothing and records nothing.
- `TestTheTextPassRecordsItsEndWithoutText`: the audit event holds counts and the version, and no title, text or id; a second run records nothing.
- `TestTheTextPassOnRealData` (runs only with `KENWERK_REALDATA_URL`, through `scripts/stress/real-data.sh`): the measurement of the load budget below.

**Step 3, `web`:**
- `search-filters.test.ts`: `offeredKinds` without databases leaves Database out, and with them keeps the order page, post, database, comment (and SR2's kinds, if it added any).

**Step 4, `internal/app`:**
- `TestAPostIsStillFoundWhenItsSpaceTurnsTheBlogOff` and `TestACommentIsStillFoundWhenItsSpaceTurnsCommentsOff`: found by a reader, and still not by someone a restriction keeps out.

**Mutations,** under "Spec 087, wave SR3" in `scripts/mutation-check.sh`:
- search leaves out the caption of a table (caught by the step 1 test and the guard);
- the pass reads `head_version` for the readers' entry (caught by the working-version test);
- the pass walks pages rather than entries and `search.Refresh` inserts a missing row (caught by `TestTheTextPassCreatesNoEntry`, through the template);
- `search.RefreshWorking` inserts a missing row (caught by `TestTheTextPassCreatesNoEntry`, through the dropped working entry);
- the pass skips the check for older releases (caught by the waiting test);
- the pass is marked through when a run stops at its budget (caught by the cursor test);
- the kind filter offers Database while databases are off (`search-filters.test.ts`).
The pass mutations run `-run '^TestTheTextPass'`: only those tests run the pass, so that is every test that can catch them.

## End-to-end tests and design pictures

No screen changes look while every part is on, and `scripts/e2e` turns every part on, so no design picture changes and none is new. `tree-search.spec.ts` gains one test: a page whose only matching word is in a table caption is found from the results screen. The kind filter without databases is covered by the unit test of step 3, because the e2e suite runs with every part on.

## Upgrade notes

- One expand migration, which a release before this one ignores. N and N+1 run together.
- The pass starts only once every node runs this release. Until it is through, a word in a caption, a code title, a chart title or a button is found only on pages published since the upgrade. Operators need to do nothing; the worker logs when a run pauses at its budget and when the pass is through, and the audit log records its end (`search.text_refreshed`). A new installation has nothing to bring up to date and never runs it.
- A restore of a backup from before this release runs the pass again.
- Going back to the previous release leaves the table unused and the entries with their longer text, which the previous release reads as any text.
- `CHANGELOG.md` says, in plain words, that search now finds the words of captions, code titles, chart titles and buttons, and that a large installation may take a while after the upgrade before older pages are found by them.

## Build plan

S is up to half a day, M about a day, L two days. Each step ends green (`make check`, the tests it names, the targeted mutation run) and lands on the branch before the next starts.

| Step | Size | What | Lines | Must land before |
|---|---|---|---|---|
| 0 | S | Start: rebase `wave-sr3` on `main` once SR2 is there (SR2 changes the kind filter, `internal/search` and the search tests); read SR2's handoff; check that `search-filter-bar.tsx` still lives where SC1 left it | — | SR2 on `main` |
| 1 | M | Words of captions, code titles, chart titles and buttons in `Text`; `searchedAttrs`; the guard test; `TextVersion` raised to 2; the app tests | EDT-155 | Step 0 |
| 2 | M | The pass: the migration, `search.Refresh`, `pages.RefreshSearchText`, the worker task with budget, cursor, the wait for older releases and the audit event; the eight tests and four mutations; the measurement on the real-data dump and with the stress profile | EDT-155 | Step 1 |
| 3 | S | The kind filter follows the installation's parts | ADR-043, NAV-004 | Step 0 |
| 4 | S | SPC-117 answered: the two tests for Blog and Comments off; SPC-117 in `02-spaces.md` points to this spec for its answer and stays new; spec 011's D26 gets a note that it hides from the space's own places and not from search | SPC-117, SPC-048 | Step 0 |
| 5 | S | Closing: spec 080's SR3 row and this spec's status, `CHANGELOG.md`, the operations note on the pass in `docs/operations/`, the e2e test, the report with the measurements, the handoff | — | Steps 1 to 4 |

Steps 3 and 4 may go in any order after step 0. The wave is about three to four working days.

Not in this wave, and what it waits for:

| What | Waits for |
|---|---|
| EDT-220 and EDT-221, the tabs block with the contract above | SC3 steps 5 to 7 on `main`, and the product owner's choice (D1) |
| The switches for kinds of item (SPC-115) and the behaviour of SPC-117 above | A wave of space settings after SC5, which adds a setting per space for each kind |

## Acceptance criteria

- [ ] A word that stands only in a table caption, a code title, a chart title or axis title, a media caption or a spotlight button finds its page for a reader of it, and is neither found nor counted for someone a restriction keeps out.
- [ ] Tooltips and identifiers are not found.
- [ ] Every text attribute the gate keeps is either read by search or named as not reader text, by test.
- [ ] After the upgrade, the pass brings every existing entry up to date once, never writes a working version into the readers' entry, never creates an entry, leaves unchanged entries alone, waits while an older release runs, and goes on after its budget.
- [ ] The kind filter offers Database only while databases are on.
- [ ] A post and a comment stay findable when their space turns the blog or comments off.
- [ ] Search keeps its query budgets and stays under 100 ms on the real-data dump; the pass stays within its budget, measured.
- [ ] `make check`, the full mutation run on landing, and `scripts/e2e` are green.

## How the product owner tests it

1. Write a page with a table whose caption holds a word that is nowhere else, and publish it. Search for that word: the page is found, and the excerpt shows the caption.
2. Do the same with the title of a code block and the words on a spotlight's button.
3. As someone who cannot see that page, search for the same word: nothing is found and the count says none.
4. In the console, turn databases off. In search, open the kind filter: Database is not offered. Turn databases on again: it is back.
5. In a space's settings, turn Blog off. Search for a word of a blog post in that space: it is still found.

## Decided on the product owner's behalf on 2026-11-16, may be overruled

- **D1. The tabs block is not built in SR3.** EDT-220 is a new part of the editor; the exception of 2026-11-15 covers search, and SC3 D20 keeps tabs out under the freeze. EDT-221 stays new, and this spec holds its search contract for the wave that builds tabs. Recommendation: build tabs after 1.0, as SC3 decided; the product owner may bring it forward, and then it comes after SC3 steps 5 to 7.
- **D2. Search reads the words a reader sees, and only those.** Table caption, code title, chart title and axis titles, media caption and spotlight button text are added; tooltips (image and link titles), identifiers (anchor and excerpt names, page facts id), dynamic settings and unknown blocks stay out. A tooltip is not on the page, and an identifier is not a word the writer meant to be read.
- **D3. Existing pages are brought up to date by one pass in the worker,** not at their next publish: a page that is never published again would otherwise never be found by its caption. The pass waits for every node to run the release, rewrites only what changed and never creates an entry.
- **D4. The state of the pass is a one-row table** of its own, as `storage_state` is, not a settings key, because a settings write needs a caller and records an event for every move of the cursor.
- **D5. A kind of item or feature that is off hides nothing that exists.** It stops new items of that kind in that space (create menu, turn into, copy); a move into the space is allowed; existing items stay in the tree, their links open, and search finds them for whoever may see them. Off is not an access rule, and the only access rule is `permissions.Evaluate`.
- **D6. The kind filter follows the installation, not a space.** Database is offered only while the installation has databases on (ADR-043). A kind a single space turned off stays in the filter, because the filter covers every space the reader can see.
- **D7. A result opens its page at the start,** also when its words stand in a part of a tabs block that is not the first. A link from a result into a part needs to know the block that matched, which the index does not hold; that is a later choice.
- **D8. Today's behaviour for Blog and Comments off is kept and pinned by tests,** since it is the behaviour D5 asks for.

D5 was still open when SR3 was built: no answer of the product owner to it is recorded, so it stands as decided on the product owner's behalf, and SR3 pins what is built today, which is what D5 says.

## Decided while building, on the product owner's behalf on 2026-11-23, may be overruled

- **D9. A pass is through when it reaches the last entry, over as many runs as it needs.** The plan asked for a pass "from the first entry" within one run, as the encryption job does. On a large installation a whole pass does not fit in a run of two minutes, so it would never be marked; and marking adds no safety, since only a node of an older release writes old text, and D11 handles that. The cursor and the counts are kept across runs in `search_state`.
- **D10. A new installation starts at the current text version.** The migration sets `text_version` to 2 when `search_documents` is empty, so a new installation records no pass in its audit log; an installation with entries starts at 1.
- **D11. A node of an older release sends a started pass back to the first entry.** Such a node may have written old text behind the cursor while the pass waited, so the pass starts again once it has stopped.
- **D12. The pass is gentler than planned.** Measured with the plan's batches of 100 and a rest as long as each batch, the 95th percentile of reading a page rose by about half and of saving a draft by about two fifths while the pass ran, past the 10 % of the load budget. The pass now takes batches of 50 and rests 19 times as long as each batch. It takes longer (see the report), which a one-time background job can afford.

## Seen, not changed

- A stored document that cannot be read (it was normalized on the way in, so only damage would cause it) stops the pass at its batch with an error in the log at every run, rather than being skipped in silence; search itself goes on working.

- Spec 011 D26 says that turning a feature off "hides what exists". As built, Blog off hides posts from the space's overview and sidebar but not from search, a link or the blog list of all spaces (`pages.Posts` without a space does not ask the feature); Comments off keeps existing threads under the page. D5 agrees with what is built; step 4 adds a note to D26 rather than changing the behaviour.
- `searchFilters` in `internal/search/search.go` orders by `CASE WHEN $17 THEN 0 ELSE 0 END`, an expression that is always 0. It looks like a placeholder that keeps `$17` in use; it is harmless and out of scope.

## Provenance

Own design, from blueprint 03 (EDT-155, EDT-220, EDT-221, SPC-048, SPC-115 to SPC-117), the decision log (ADR-043, ADR-045), specs 011, 064, 069, 074, 080, 082 and 083, and reading Kenwerk's own code. The `until-found` state of the `hidden` attribute and the `beforematch` event are from the HTML standard (html.spec.whatwg.org); the tabs wave checks browser support when it builds. No other product, picture or text was consulted.
