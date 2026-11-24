# How Kenwerk is tested

Written for: a developer or security-minded reader new to this repository, who wants to decide whether to trust Kenwerk or contribute to it. Every number here was counted from the repository, with the command beside it, so you can count again. Where a check is planned but not running, this page says so.

## How the product is built and checked

The product owner decides what Kenwerk does and tests its behaviour, but does not read the code. So the automated checks act as the code reviewer ([blueprint 09](blueprint/09-way-of-working.md)). They are meant to be stricter than in a team where people review each other's code.

The code, tests and documentation are written by Claude build sessions, an AI model from Anthropic. The commits say so: 213 of the 214 commits on `main` carry the line `Co-Authored-By: Claude`, and the one without it is the initial commit. No person reads the code line by line ([SEC-1024](blueprint/06-security-and-compliance/11-supply-chain-and-disclosure.md)). That is the main reason the checks below exist, and why outside review is welcome (see [Known limits](#known-limits-of-the-test-setup)).

Work comes in waves. Each wave:

1. starts with a study and a spec in [`docs/specs/`](specs/README.md): behaviour, permissions and audit, a load budget, acceptance criteria, and "How the product owner tests it";
2. writes the tests first, from the acceptance criteria, and only then the code;
3. records its decisions in the spec, and larger ones as an ADR in [the decision log](blueprint/10-decision-log.md);
4. ends with a report in [`docs/reports/`](reports/README.md) (what was measured and what was not proven) and a handoff note in `docs/handoff/` (what is next).

## Every check

"Push" means every push to `main`. CI also runs on every pull request; today the only pull requests are dependency updates from Renovate. "Nightly" is the scheduled run at 03:17 UTC; it is four jobs, `nightly-fuzz`, `nightly-mutation` (six shares on six runners), `nightly-stryker` and `nightly-restore-drill`, and the product owner can start the whole workflow by hand from the Actions tab (`workflow_dispatch`). Local commands run inside the development container: start it with `scripts/dev up`, then prefix a command with `scripts/dev`, as [development.md](development.md) explains. `make check` runs every check marked † in one go.

### Code quality

| What it proves | Tool | When | Run it locally | Defined in |
|---|---|---|---|---|
| Go code is formatted † | `gofmt` | Push | `make fmt-check` | `Makefile`, `ci.yml` job `go` |
| No suspicious Go constructs † | `go vet` | Push | `make vet` | `Makefile`, job `go` |
| No known Go bug patterns or dead code † | staticcheck 0.8.2 | Push | `make staticcheck` | `Makefile`, job `go` |
| No function over 40 lines or 10 paths, no copied blocks, no unexplained security pattern (gosec). The 25 packages that do not meet this yet are listed with their counts, and a count may only go down † | golangci-lint 2.15.0 and `cmd/ratchet` | Push | `make lint` | `.golangci.yml`, `scripts/lint-ratchet.txt`, job `go` |
| The frontend type-checks, lints and is formatted † | TypeScript (strict), ESLint, Prettier | Push | `make web-check` | `web/package.json`, job `web` |
| All UI text goes through `web/src/locales/en.json` † | `web/scripts/check-ui-strings.mjs` | Push | `cd web && npm run strings` | job `web` |
| The design rules hold: tokens, contrast, icons, dialogs † | `web/scripts/check-design.mjs` | Push | `cd web && npm run design` | job `web` |
| The binary builds | `go build` | Push | `make build` | job `go` |

### Supply chain and secrets

| What it proves | Tool | When | Run it locally | Defined in |
|---|---|---|---|---|
| No known vulnerability in Go code that the code reaches † | govulncheck 1.9.0 | Push | `make vuln` | `Makefile`, job `go` |
| No High or Critical advisory in any npm package of `web/` or `collab/`, development packages too † | `npm audit` | Push | `make audit` | `Makefile`, job `web` |
| Every dependency has a permissive licence † | `scripts/check-licenses.mjs` | Push | `make licenses` | job `web` |
| No secret in the working tree. A planted key must be found first, so an allowlist that is too wide fails † | gitleaks 8.30.1 | Push | `make secrets` | `scripts/secret-scan.sh`, `.gitleaks.toml`, job `secrets` |
| No secret in any commit of any branch | gitleaks 8.30.1 | Push | `make secrets-history` (needs a full clone) | same, job `secrets` |
| Every commit is signed off (DCO) | `scripts/check-dco.sh` | Pull requests only | `sh scripts/check-dco.sh <base> <head>` | job `dco` |

### Security scanners

| What it proves | Tool | When | Run it locally | Defined in |
|---|---|---|---|---|
| No finding of the Go, TypeScript, React and secrets rules. An exception is a `nosemgrep` comment with its reason | Semgrep 1.183.0 | Push | the `semgrep scan` command of the job, in the `semgrep/semgrep` image | job `semgrep` |
| No unsuppressed result of the extended security queries, Go and TypeScript | CodeQL | Push | none; it runs on GitHub | job `codeql` |
| No fixable High or Critical vulnerability in the app image, the backup image or the image of the service for editing together | Trivy (`trivy-action` 0.36.0) | Push | none scripted; build with `docker build` and scan by hand | job `container` |
| The running image passes a passive web scan, with the rules in `.zap/rules.tsv` | OWASP ZAP baseline 0.15.0 | Push | none scripted | job `container` |

### Tests

| What it proves | Tool | When | Run it locally | Defined in |
|---|---|---|---|---|
| Go unit and integration tests pass, under the race detector, against a real PostgreSQL 16 † | `go test -race` | Push | `make test-race` | `scripts/test-race.sh`, job `go` |
| Frontend logic works † | Vitest | Push | `cd web && npx vitest run` | `web/vite.config.ts`, job `web` |
| The service for editing together works † | `node --test` | Push | `make collab-check` | `collab/*.test.mjs`, job `web` |
| The real binary, PostgreSQL and Chromium behave as the specs say. Each of 39 spec files runs axe on its screens, with the rules for WCAG 2.0 and 2.1 A and AA and WCAG 2.2 AA. Every test fails on a script error or a Content Security Policy or Trusted Types violation | Playwright, `@axe-core/playwright` | Push | `scripts/e2e` | `scripts/e2e`, `web/playwright.config.ts`, `web/e2e/helpers.ts`, job `e2e` |
| Every screen matches its approved picture, within 0.2% of its pixels | Playwright `toHaveScreenshot` | Push, inside e2e | `scripts/e2e 0-design.spec.ts` | `web/e2e/0-design.spec.ts`, `web/e2e/design-baselines/` |
| The permission rule gives the same answer three ways (see [Security testing](#security-testing)) | Go test | Push, inside the Go tests | `go test ./internal/permissions -run Matrix` | `internal/permissions/matrix_test.go` |
| Each main screen stays within its budget of database queries | Go test | Push, inside the Go tests | `go test ./internal/app -run Budget` | `internal/app/query_budget_test.go` |
| The main reads (page, tree, search, quick search, feed, the bell) stay inside their p95 budgets at about a tenth of the model, for 150 seconds against the real binary and PostgreSQL with a small seeded organisation; under 1% of requests fail and none is a server error. It finds a read that became much slower, not capacity | k6 2.4.0 (`scripts/load/smoke.js`), pinned by sha256 | Push, pull request | `scripts/dev bash scripts/load/smoke.sh` | `scripts/load/smoke.sh`, job `load-smoke` |

### Contracts the tests keep

| What it proves | Tool | When | Run it locally | Defined in |
|---|---|---|---|---|
| `docs/api/routes.txt` lists every route and its access rule, exactly as the code registers them | `TestRouteTableIsDocumented` | Push | `go test ./internal/app -run RouteTable`; regenerate with `UPDATE_ROUTES=1` | `internal/app/app_test.go` |
| A route cannot be registered without an access rule: the router panics | `TestRouteWithoutAccessRulePanics` | Push | `go test ./internal/httpapi` | `internal/httpapi/router_test.go` |
| `docs/api/openapi.json` matches the routes, and every entry carries its rule (`x-access`) | `TestTheAPIDescriptionMatchesTheRoutes` | Push | `go test ./internal/app -run APIDescription` | `internal/app/app_test.go` |
| A module names only its own tables in SQL, apart from listed and counted exceptions (spec 072) | Go tests | Push | `go test ./internal/db` | `internal/db/boundary_test.go`, `internal/db/boundary_list_test.go` |

### Upgrades, releases and deployment

| What it proves | Tool | When | Run it locally | Defined in |
|---|---|---|---|---|
| The previous build serves traffic while this one migrates the same database, both run side by side, and the old one runs again afterwards, as a rollback does | `scripts/upgrade-check.sh` | Push | `bash scripts/upgrade-check.sh <commit of the previous release>` | job `upgrade` |
| The same between two binaries you choose | `scripts/upgrade-test.sh` | By hand | `bash scripts/upgrade-test.sh <old binary> <new binary>` | the script |
| The three images build | `docker build` | Push | `docker build .` | job `container` |
| The binary and web assets build the same byte for byte twice; the release configuration is valid; two snapshot releases are identical; the `.deb` installs on Debian 12 and the `.rpm` on Fedora 41 | `scripts/reproducible.sh`, GoReleaser 2.20.1 | Push and nightly, not on pull requests | `make reproducible` | job `release-dry-run`, `.goreleaser.yaml` |
| The Helm chart, the Terraform module (OpenTofu and Terraform), the Azure template (Bicep) and the AWS template (cfn-lint) are valid, and the database role step works against PostgreSQL | `scripts/deploy-check.sh`, tools pinned by version and sha256 | Push | `bash scripts/deploy-check.sh` (on the host, needs Docker) | job `deploy` |
| A release comes only from a tag on `main`, has a CHANGELOG section, and is signed with SLSA provenance and SBOMs | GoReleaser, cosign, syft | A tag `vX.Y.Z` | none | `.github/workflows/release.yml` |
| The CI steps pass in a fresh clone of what is committed | `scripts/ci-local.sh` | By hand | `scripts/dev sh scripts/ci-local.sh` | the script |

### Slow checks

| What it proves | Tool | When | Run it locally | Defined in |
|---|---|---|---|---|
| Every parser and rule with a fuzz target survives random input, all twelve targets: Markdown, normalising a document, Word files, front matter, bundle signatures, HTML import, archives, SCIM filters, the search language, template conditions, the rewriting of released pages and workflows, 30 or 60 seconds each. A target missing from the table fails the run; a target runs again only after Go's own fuzz race (golang/go#75804) | Go native fuzzing, `scripts/fuzz.sh` (its behaviour held by `scripts/fuzz-test.sh`) | Nightly | `make fuzz`; `FUZZ_ONLY=<target>` for one | `scripts/fuzz.sh`, job `nightly-fuzz` |
| The tests catch a security rule broken on purpose: each mutation edits a copy of the code and must make a test fail | `scripts/mutation-check.sh` | Nightly (full, in six shares) | `make mutation`; `MUTATION_CHANGED=<file of changed paths>` runs only what a change can affect, `MUTATION_SHARD=k/n` one share | job `nightly-mutation` |
| Every mutation still applies whole to the code, without running a test | `scripts/mutation-check.sh` | Push, pull request | `MUTATION_APPLY_ONLY=1 bash scripts/mutation-check.sh` | job `web` |
| The frontend tests catch changed code; no file's mutation score may fall below its floor | Stryker 10.1.1, `cmd/ratchet` | Nightly | `make mutation-web`; `STRYKER_ARGS="--concurrency 2"` on a shared machine | `web/stryker.config.mjs`, `scripts/stryker-ratchet.txt`, job `nightly-stryker` |
| An encrypted backup restores on a clean installation: page, file, search, login, audit chain and database roles come back | `scripts/restore-drill.sh` | Nightly | `bash scripts/restore-drill.sh` | job `nightly-restore-drill` |
| A real identity provider (Authentik) provisions users and groups through SCIM, and a real browser logs in through it | `scripts/idp-test/run.sh` | By hand | `docker build -t kenwerk:local . && bash scripts/idp-test/run.sh` | the script |
| How reading, search, saving and the whole app hold under load, up to 5,000 people | k6 (`scripts/load/reading.js`, `scripts/stress/load.js`) and the scripts beside them | By hand, on machines of their own | `scripts/stress/README.md` | `scripts/load/`, `scripts/stress/` |
| The topology of several nodes, and what happens when parts of it break | `scripts/ha/` | By hand; nothing here runs in CI | `scripts/ha/README.md` | `scripts/ha/`, spec 062 |

Integration tests need `KENWERK_TEST_DATABASE_URL`, pointing to a PostgreSQL role that may create databases. Each test gets a database of its own (`internal/testutil`). Without the variable they are **skipped**, not failed, so a plain `go test ./...` on a machine without it proves much less. CI and `scripts/dev` set it.

## The numbers

Measured on 2026-11-23, on `main` at `e5e8323`. Each count changes as waves land: run the command to get today's. The commands are for a POSIX shell at the repository root.

| What | Count | Command |
|---|---|---|
| Go test files | 315 | `git ls-files '*_test.go' \| wc -l` |
| Go test functions (without `TestMain`) | 1,930 | `git grep -E '^func Test[A-Z_]' -- '*_test.go' \| grep -vc 'func TestMain('` |
| Go fuzz targets | 12, all fuzzed nightly | `git grep -E '^func Fuzz' -- '*_test.go' \| wc -l`; the table of times is in `scripts/fuzz.sh` |
| End-to-end spec files | 43 | `git ls-files 'web/e2e/*.spec.ts' \| wc -l` |
| End-to-end tests | 699 | `scripts/dev sh -c "cd web && npx playwright test --list" \| tail -1` |
| Accessibility checks (axe) in end-to-end tests | 326 calls in 39 files | `git grep -c 'checkAccessibility(' -- 'web/e2e/*.spec.ts'` |
| Vitest files and tests | 58 files, 956 tests | `scripts/dev sh -c "cd web && npx vitest run"` (the last lines) |
| Tests of the service for editing together | 4 files, 24 tests | `git grep -E '^\s*(test\|it)\(' -- 'collab/*.test.mjs' \| wc -l` |
| Mutations | 1,542: 1,486 Go, 44 frontend, 12 editing service (2026-11-24); six nightly shares of 257 each | `grep -cE '^mutate(_web\|_collab)? ' scripts/mutation-check.sh` |
| Frontend files under Stryker, each with a floor | 16 | `grep -vcE '^(#\|$)' scripts/stryker-ratchet.txt` |
| Approved design pictures | 259 | `git ls-files 'web/e2e/design-baselines/*.png' \| wc -l` |
| Routes, each with an access rule | 625, of which 30 public | `grep -vc '^#' docs/api/routes.txt`; `grep -c ' public$' docs/api/routes.txt` |
| Cases of the permission matrix in `Evaluate` | 37,813,800 | `scripts/dev go test ./internal/permissions -run '^TestMatrixEvaluate$' -v \| grep 'cases compared'` |
| Specs | 98 | `ls docs/specs \| grep -cE '^[0-9]{3}-'` |
| ADRs | 52 (ADR-001 to ADR-052) | `grep -cE '^\*\*ADR-[0-9]+' docs/blueprint/10-decision-log.md` |
| Reports | 90 | `ls docs/reports/*.md \| grep -vc README` |
| Handoff notes | 100 | `ls docs/handoff/*.md \| wc -l` |

The matrix count is the product of its case tables: 15 kinds of person × 31 grants × 23 restrictions × 18 page states × 5 space states × 35 actions, with three kinds of credential on the unrestricted case, and each delete action asked twice (by the creator and by someone else). The test fails if the count falls below 1,000,000, so a table cannot shrink unnoticed.

## The end-to-end suite by area

One line per file in `web/e2e/`. Each file names its spec at the top.

| File | What it proves |
|---|---|
| `0-design.spec.ts` | Every screen, light and dark, wide and narrow, matches its approved picture |
| `access-roles.spec.ts` | The Access screen of a space gives roles; someone can hold several; taking access away asks first |
| `access.spec.ts` | Login refuses a wrong password; a logged-out person is sent to login; a guest cannot reach a restricted page by any route; a viewer sees no edit controls |
| `account.spec.ts` | Your account: its bar and tabs, every address, and that it never scrolls sideways at 360 pixels or right to left |
| `addresses.spec.ts` | Old page addresses lead to the current one; a new space key keeps old links working; a person without access sees what the space chose |
| `admin-connections.spec.ts` | Only a system administrator with a second factor changes the identity provider, helpers and metrics token; a secret is never shown again |
| `admin-frame.spec.ts` | The administration's sidebar, section heads and forms, and the guards on each section |
| `admin-mail.spec.ts` | The mail server: read-only for an administrator, its password never shown, locked when set by the environment |
| `backups.spec.ts` | Backups, restoring over the installation (name and second factor), configuration sources and ending sessions in the console |
| `blocks.spec.ts` | The slash menu and every block of the editor survive publishing and reloading |
| `collab.spec.ts` | Two real browsers editing one page; undo takes back only your own work. Runs only with `E2E_COLLAB=1` |
| `control.spec.ts` | Document control: a controlled page stays hidden from readers until approved; review comments stay with reviewers |
| `create-kinds.spec.ts` | Create offers only the kinds of item a person may make; switched-off parts are offered nowhere |
| `databases.spec.ts` | Databases: made from Create, used with spreadsheet keys, pasted from Excel; a reader sorts and changes nothing |
| `dynamic-blocks.spec.ts` | Blocks that fill themselves, and charts that follow their table |
| `editor-feedback.spec.ts` | Table tools, menus near the edge of the screen, and table lines with enough contrast |
| `editor-rest.spec.ts` | The row of tools folds into More without cutting anything off; formatting and list tools with their keys |
| `editor.spec.ts` | Writing with Markdown shortcuts, publishing, discarding a draft |
| `exchange.spec.ts` | Export and import by keyboard, an import report before it runs, undoing an import, a public site preview |
| `feedback.spec.ts` | Space pictures, comparing versions, people pickers |
| `file-details.spec.ts` | Uploads with progress and cancel, new versions of a file, previews |
| `floating-bars.spec.ts` | The bars over selected text and images: one state with the row of tools, reachable by keyboard, inside the window |
| `frame.spec.ts` | The top bar, sidebar and panels, the account menu and its Theme choices |
| `health.spec.ts` | System health lists every check and what to do |
| `insert.spec.ts` | The insert dialog and slash menu by keyboard, and how fast the dialog opens |
| `installation.spec.ts` | A member reaches none of the screens that run the installation; upgrades, events, audit signatures |
| `links-tables.spec.ts` | A reader who may not see a page learns nothing of it from a link, tag or card; tables with handles |
| `more-blocks.spec.ts` | Page trees, indexes, report tables and activity blocks |
| `new-version.spec.ts` | An open tab notices a new version, and a reload loses no text being written |
| `organising.spec.ts` | Statuses, labels, templates and handing over a page; a label on a hidden page shows nowhere |
| `people.spec.ts` | People and accounts: a guest finds only people they share a space with; a forgotten password answers the same for every address |
| `platform.spec.ts` | Automation rules, webhooks (an address on a host nobody allowed is refused), insight and presence |
| `publishing.spec.ts` | Draft and published spaces: releasing pages, approval, withdrawal |
| `reading.spec.ts` | Reading and getting around by mouse and keyboard: theme, panels, quick search, search filters, shortcuts |
| `roles.spec.ts` | A role is made, given in a space, and changed only after a preview |
| `space-home.spec.ts` | The home of a space, and the example space with every page working |
| `space-settings.spec.ts` | The settings of a space: sidebar, jump field, every screen |
| `templates-form.spec.ts` | Guided templates by keyboard: errors beside the field, answers kept on a refusal |
| `together.spec.ts` | Comments, mentions and notifications between two people, keyboard first |
| `tool-rows.spec.ts` | Filters, search and sort of long lists live in the address and are applied on the server |
| `tree-search.spec.ts` | The page tree loads branches as they open; the search results, its tabs and filters |
| `walk.spec.ts` | Findings of a walk through the real screens, kept as tests |
| `writing.spec.ts` | The small things a writer feels: title and body, Backspace, spelling, focus |

## Security testing

**The permission matrix.** One rule decides who may do what ([blueprint 05, chapter 11](blueprint/05-data-and-permissions/11-test-matrix.md)). `internal/permissions/matrix_test.go` computes it three independent ways and fails on any difference: a hand-written transcription of the rule in the test itself (`literalRule`), the Go function the application uses for single decisions (`permissions.Evaluate`), and the SQL functions that lists, search and exports use, on real rows. `Evaluate` is checked on every one of the 37,813,800 combinations above. The SQL half pairs the newer values with the plain ones, so that it runs in minutes.

**Tests that walk every route.** These pick up a new route without anyone adding it to a list:

- `TestEveryNonPublicRouteRequiresASession`: every route not marked public answers 401 without a session.
- `TestEveryObjectRouteIsProtected` and `TestEveryRouteThatTakesAnIDIsProtected`: a stranger gets 404 and a viewer 403.
- `TestNoListShowsAHiddenPageOrWhatHangsOnIt`: every list route, called by someone who may not see a page, gives no title, word or id of it.
- `TestAPurgedPageLeavesNothingBehind`: after a purge, no column of any table holds the page's id or words.
- `TestEveryAdministrationChangeNeedsASession` and `TestEveryRouteBelowAdministrationNeedsAnAdministrationScope`: tokens cannot change the administration.

**Deny by default.** No route exists without an access rule (`TestRouteWithoutAccessRulePanics`). A refused administration request is refused and audited (`TestNonAdminIsDeniedAndAudited`). The literal rule in the matrix starts from "no" and grants only what a grant allows. Single sign-on makes no accounts and sign-up is off unless turned on (`TestSingleSignOnMakesNoAccountsByDefault`, `TestSignUpIsOffByDefaultAndOnlyForListedDomains`). An experimental part answers 404 until it is switched on (`TestANewInstallationRefusesEveryExperimentalPart`).

**Mutation lines prove that a test guards each rule.** A test that passes may still prove nothing. `scripts/mutation-check.sh` holds 1,542 deliberate faults, such as dropping a permission check, an audit event or an escape. Each is applied to a copy of the code, and the script fails if the tests stay green. Every new security rule adds a line ([development.md](development.md)). Stryker does the same, without a list, for 16 frontend files.

**Self-tests.** The project attacks its own software. It is a self-test, not an independent penetration test, and the reports say so:

- Spec 025, "Breaking the architecture", run on the build of 6 November 2026. Its results, including "Attacks that held" and "Not run", are in [known limits](operations/limits.md). The builders' notes are in [Builder reports, 6 and 7 November 2026](reports/2026-11-07-builders.md).
- [Wave T: word forms, file names, and two checks from the self-test](reports/2026-11-07-wave-t.md), 7 November 2026.
- [Wave SX, the security wave of ADR-038](reports/2026-11-10-wave-sx.md), 10 November 2026: Semgrep, CodeQL and the ZAP baseline joined CI, with every first finding and how it was handled.
- [Wave RV2: pinned and scanned builds, a walk of every route that takes an id](reports/2026-11-13-wave-rv2.md), 13 November 2026.

No independent penetration test or audit has been done ([risks](security/risks.md)). The [threat model](security/threat-model.md) names, for each threat, the check that covers it.

**How weaknesses are handled.** Report a vulnerability privately, as [SECURITY.md](../SECURITY.md) says; GitHub's private vulnerability reporting is on for this repository. A weakness is never described in this repository, its reports or its commits until its fix has landed ([reports README](reports/README.md)). The [beta criteria](beta-criteria.md) (S1) block the beta while any finding rated Medium or higher is open.

## Load and stress

What was measured is in [known limits](operations/limits.md), with the machine and the date of each table, and in two reports from a test server:

- [Stress test on a real server, 10 November 2026](reports/2026-11-10-stress-test.md): 5,000 seeded people, 300 spaces, 60,000 pages, k6 from a second virtual machine. PostgreSQL ran out of CPU from about 50 active people, on 8 cores of a 2012 processor. It answered the extra work "busy" (search first), and no answer was wrong.
- [Stress test 2, 12 November 2026](reports/2026-11-12-stress-test-2.md): saving got faster, and parallel space creation no longer froze. Reading was worse on that data set, and the feed did not answer within 60 seconds. It was fixed afterwards and measured again on a copy of that data (spec 061), but **not repeated on the server**.

What Kenwerk claims is "one node, a few hundred people, measured on your own hardware" (ADR-043). **The 5,000-person level is not proven.** In the second test, 5,000 people at once were 99.6% answered "busy". The load criteria L1 to L3 of the [beta criteria](beta-criteria.md) are not met yet.

## What a wave must pass before it lands

A wave lands as one squash-merged commit on `main`, which is then pushed. Before that, on the wave's branch:

1. Rebase on the newest `main`.
2. `make lint`, with the ratchet.
3. `make check`.
4. The full end-to-end suite, `scripts/e2e`.
5. The design pictures. Look at each new or changed picture before committing; then `0-design.spec.ts` must pass twice in a row without `--update-snapshots`. A picture is never retaken just to get past a failure.
6. The mutation check for what the change can affect (`MUTATION_CHANGED`), with a new line for each new security rule. The full run is the nightly job.
7. A CHANGELOG entry with its "Upgrade impact" line.
8. A report in `docs/reports/` and a handoff note in `docs/handoff/`.

After the push, GitHub CI must be green on `main`. When it is not, the next work is to find out why (see below).

## How unreliable tests are handled

A test that fails now and then is treated as a finding, not as noise. The cause is found first. A test is never loosened, a time limit is not raised and a picture is not retaken just so a run passes. Examples from the reports:

- [Wave FX11](reports/2026-11-23-wave-fx11.md): four end-to-end tests failed on CI after a change that touched no web code. One was a real fault. A scroll could shut a sub-menu just after it opened, depending on timing, and a person could meet the same thing. The menu was fixed, not the test, and a new test holds it. For two pictures that failed only on CI, no cause could be seen without the CI pictures, so neither was retaken.
- [Wave FX10](reports/2026-11-23-wave-fx10.md): a search test failed under the race detector and on a loaded machine. The 3-second limit had been reached, so a real search on a large space could come back empty. The query plan was fixed instead of raising the limit.
- [Wave FX7](reports/2026-11-22-wave-fx7.md): an end-to-end test pressed a key before the editor had taken the new cursor place. The test now waits for the condition it needs. The product did not change, because the product was right.
- [Wave RV7](reports/2026-11-14-wave-rv7.md): a test read once whether four event consumers had passed an event. It now waits for all four, and no fixed wait is left in it.
- [The first setup screen (wave F2)](reports/2026-11-09-first-setup.md): two pictures failed when a relative time ("now", "2 minutes ago") changed width. The time gets a fixed text before the picture. The report notes that retaking pictures would have hidden this.

The Playwright configuration has no retries (`retries: 0`), so a flaky test shows up as a failure instead of passing on a second try.

## The 1.0 test report

Decided by the product owner on 2026-11-23: before 1.0 is published, there will be one full public test report. It is one run of every check on this page against the release candidate, with each result. It covers:

- CI: every job of `ci.yml`, the four nightly ones included;
- the end-to-end suite and the design pictures;
- the full mutation check and Stryker;
- fuzzing;
- the restore drill;
- the upgrade test;
- the security scanners: govulncheck, npm audit, gitleaks, Semgrep, CodeQL, Trivy and the ZAP baseline;
- load and stress on the test server;
- the permission matrix.

The results will be kept in `docs/reports/`, naming the commit. Readers can then see that the product works and how it was tested, not only what this page plans. It is a 1.0 criterion in [the 1.0 promises](promises.md).

## Known limits of the test setup

- **Only a small load test in CI.** Since wave LT1 the job `load-smoke` runs a short k6 test of the main reads on every push and pull request (the product owner, 2026-11-24). It runs on a shared hosted runner, with the load tool beside the app and PostgreSQL, so its budgets are wide: it catches a read that became several times slower, not a small slip, and it proves nothing about capacity. The test of 5,000 people stays a manual run on a server, and none runs at night.
- **Tests use one shared PostgreSQL**, not Testcontainers. CI uses a `postgres:16` service container. During development, tests use the database of the Compose development environment. Each test makes its own database in it, so tests do not share data, but they do share one server and its settings. NATS, where a test uses it, is the embedded server of `internal/queue`, in the same process.
- **No pull requests for waves.** A wave lands as a local squash-merge and a push to `main`. CI runs after the push, not before, and `main` has no branch protection. As a result, the DCO job, which runs only on pull requests, does not check landed commits. Every commit on `main` except the initial one carries a `Signed-off-by` line, which `git log` shows. Open: the product owner decides on pull requests and branch protection. The [beta criteria](beta-criteria.md) ask for branch protection (S7) before outside contributions are invited.
- **The nightly checks have not passed on hosted runners since 12 November 2026.** The single nightly job ran out of disk in the full mutation check, so Stryker and the restore drill never ran. Wave NG1 split it into four jobs and the mutation check into six shares, and proved each step on the build machine, but the full mutation check has not yet run end to end on hosted runners; the first run after NG1, by schedule or started by hand, is that proof. See the scheduled runs in the repository's Actions tab.
- **Editing together in two browsers** (`collab.spec.ts`, 10 tests) runs only with `E2E_COLLAB=1`. CI does not set it, so CI skips these tests. The service's own tests (`make collab-check`) do run.
- **The pictures of a failed end-to-end run are kept for 7 days only.** Since wave FX13 the e2e job uploads `web/test-results` (Playwright's actual, expected and diff images and traces) as the artifact `e2e-test-results` when it fails; after that, only the annotations remain.
- **Outside review is wanted.** The code is written by AI sessions and read by no person ([SEC-1024](blueprint/06-security-and-compliance/11-supply-chain-and-disclosure.md)). There is no budget for paid review (ADR-029), and there is no outside review after every wave (ADR-043). One outside reader is planned before 1.0, for permissions, login and restore. Volunteers are welcome ([blueprint 09](blueprint/09-way-of-working.md)): a penetration tester, or an experienced Go developer who reviews at milestones.
