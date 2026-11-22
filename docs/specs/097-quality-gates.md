# 097: Stronger quality gates, held by a ratchet

Status: built (wave QG1); the cleaning goes on in waves QG2 and later
Phase: hardening before 1.0 (wave QG1)

## Problem

Nobody reads the code of Kenwerk line by line: the automated checks are the reviewer (blueprint 09). They already catch formatting, vet and staticcheck findings, known vulnerabilities, licences, frontend types and lint, failing tests and races, and, at night, injected bugs in the security rules. They do not catch:

- functions that grew too long or too branched to read and to test well;
- blocks of code copied instead of shared;
- the security patterns gosec knows, such as a path or a command built from input;
- a secret committed to the repository, now or at any time in its history;
- a known vulnerability in a package used only to build or test;
- frontend logic whose unit tests run every line but would not notice it changing.

The product owner shared a set of gates used elsewhere and decided on 21 November 2026:

- every newly added check holds for **all** code, not only for new code;
- a check that passes at once is made to pass at once; a check the existing code cannot meet is measured first, then tightened package by package with a **ratchet**, and a package that is clean is locked to the hard rule at once, until the whole repository passes;
- not taken: a coverage percentage gate (coverage is a diagnostic, never a target), Gherkin scenarios, and a hook that runs the gates after every turn of a build session.

## Study

### What each check catches

| Check | Catches | Does not catch |
|---|---|---|
| **gocyclo**, at most 10 | A function with more than ten independent paths (each `if`, `for`, `case`, `&&` and `\|\|` adds one). Past that, a function needs more tests than anyone writes, and a reader cannot hold it in their head. | Deep nesting with few branches; a long function of plain steps. |
| **funlen**, 40 lines | A function longer than 40 lines, comments not counted. Our coding standard asks at 40 whether the boundaries are right; at 60, split or say why. | A short function that does two jobs. |
| **dupl**, 150 tokens | The same stretch of syntax in two places, which must then change together and drift apart. | Copies with renamed parts that differ in structure. |
| **gosec** | Security patterns: a file path, a command or an address built from a variable (G304 and G204, and G703 and G704 by taint analysis), integer conversions that can overflow (G115), weak random numbers (G404), file permissions wider than needed (G301, G306), hard-coded credentials (G101), and more. An exception is a `#nosec G… -- reason` comment on the line, which is how the code already wrote them. | Mistakes in our own access rule; that is what the permission matrix and the mutation check are for. |
| **gitleaks** | API keys, tokens, private keys and passwords in files, by the patterns of its default rules and by entropy, in the working tree and in every commit of every branch. A secret that was ever pushed is public, even after a later commit removes it. | A secret in a form no rule knows. GitHub's own secret scanning and push protection stay on as a second net. |
| **npm audit**, high and up | A published advisory of high or critical severity against any package in `web/` or `collab/`, development ones too: a compromised test or build tool runs on every developer machine and in CI. | Advisories below high; malicious code nobody has reported yet. |
| **Stryker** | Logic the unit tests run but do not check. Stryker changes the code in small ways (a `<` becomes `<=`, a condition becomes `true`, a string becomes empty) and runs the tests for each change; a change no test notices is a gap in the tests, whatever the coverage says. | Missing behaviour that was never written; code outside its list of files. |

The Go mutation check (`make mutation`, spec 037) stays as it is: it breaks named security rules on purpose. Stryker is the same idea for the frontend, done by a tool over whole files.

### Measured at the start, on c17fbe0

**gitleaks 8.30.1.** The history: 371 commits on all branches in 5.3 s, 7 findings in 3 places. The tree, without what git ignores: 25.7 MB in 8 s, the same 3 places. None is a secret:

| Where | What | Why it may stay |
|---|---|---|
| `internal/webhooks/webhooks_test.go` | the key and message id of the Standard Webhooks signature test vector | published with that specification, to test against |
| `internal/app/backups_test.go` | `0123456789abcdef` as a key fingerprint | made up for the test |
| `scripts/idp-test/run.sh` | the bootstrap token of the Authentik the test starts and removes | a throwaway container, on localhost only |

Each is allow-listed in `.gitleaks.toml` by its file **and** its value, with the reason, so another secret in the same file is still found. Without the paths git ignores (`node_modules`, builds, local secrets), the tree scan read 196 MB and took 72 s; with them, 8 s.

**npm audit.** `web/`: no high or critical; 9 moderate, all one advisory against `minimatch` (a denial of service by pattern), reached only through ESLint, a development tool. `npm audit fix` would bring one new package, `@isaacs/nonrecursive-glob-match` (BlueOak-1.0.0), so it is left to Renovate and the product owner. `collab/`: nothing at all. With Stryker added, `web/` still has no high or critical advisory; the moderate ones become 13, the new ones against `qs`, through `typed-rest-client`, which Stryker uses for its online dashboard; we do not report there.

**golangci-lint 2.15.0**, all 69 packages, tests included, 1,169 findings:

| Linter | All code | Without `_test.go` |
|---|---|---|
| gocyclo | 584 | 325 |
| funlen | 457 | 226 |
| gosec | 128 | 62 |
| dupl | 0 | 0 |

19 packages were clean. gosec by rule: G304 38, G115 24, G703 12, G101 12, G404 8, G124 5, G704 4, G204 3, G306 2, G104 2, one each of G710, G705, G602 and G301. Most G304 and G703 findings are files the operator or a test names, which gosec cannot tell from input; most G101 are test passwords. Each needs a look all the same, which is the point.

Findings per package, largest first: `internal/app` 397 (381 of them in tests), `internal/pages` 111, `internal/publishing` 85, `internal/permissions` 57, `internal/templates` 44, `internal/identity` 43, `cmd/kenwerk` 40, `internal/exchange` 31, then 42 packages with 1 to 27 each.

The first run reported 796, not 1,169: golangci-lint shows one finding per line by default, and a long function is often a complex one, on the same line. `uniq-by-line: false` shows both.

**Stryker 10.1.1** on the 16 files of D7: 3,680 mutants, a score of 71.8% over all files (2,619 caught, 22 timed out, 754 survived, 285 reached by no test), in 37.5 minutes with two test processes on the development container. 687 mutants are "static" (in constants and tables evaluated when a module loads), which need the whole suite each and take 95% of the time.

| File | Score | File | Score |
|---|---|---|---|
| `views/admin-search.ts` | 98.6 | `components/tree-model.ts` | 80.0 |
| `create-permission.ts` | 96.0 | `components/editor/shared-clean.ts` | 77.3 |
| `permission-words.ts` | 90.5 | `capabilities.ts` | 65.6 |
| `template-conditions.ts` | 84.9 | `components/editor/table-rules.ts` | 60.0 |
| `components/search-filters.ts` | 83.6 | `components/frame-messages.ts` | 42.8 |
| `components/sheet/csv.ts` | 82.9 | `components/restriction-state.ts` | 35.1 |
| `template-fields.ts` | 82.1 | `components/editor/dynamic/kinds.ts` | 22.8 |
| `components/sheet/formula.ts` | 81.2 | `kept-fields.ts` | 19.2 |

The low ones are mostly code no unit test reaches (`kept-fields.ts`: 98 of 140 mutants; `restriction-state.ts`: 68 of 108); Stryker counts only unit tests, not the end-to-end ones. `kinds.ts` has 312 survivors, most in its tables of kinds. Two tests read the Go side's shared tables of cases from outside `web/`, which Stryker's copy of `web/` does not hold; they now find the repository through `KENWERK_REPO` (`web/src/shared-cases.ts`), with the old relative path as the default.

### What QG1 cleaned

Fourteen packages with one to four findings each, by splitting functions along the steps they already had, with no change of behaviour: `internal/collab`, `internal/outward`, `internal/spaces`, `internal/tasks`, `internal/blocks`, `internal/jobs`, `internal/restore`, `internal/setup`, `internal/console`, `internal/tracing`, `internal/analytics`, `internal/feed`, `internal/example` and `cmd/password-filter`. Four gosec findings in `console` and `password-filter` are values gosec cannot see are safe (a percentage of at most 100, paths the person running a tool names); each got a `#nosec` with the reason. One line of `scripts/mutation-check.sh` follows the code it mutates to its new place (`internal/jobs`, "jobs run during maintenance"). The new `cmd/ratchet` is clean from its first line. After QG1: 70 packages, 34 clean and locked, 36 listed with 1,138 findings (gocyclo 568, funlen 446, gosec 124).

### Choices

- **Tests count.** The limits hold for `_test.go` files too: "all code" is all code. Half of the findings are in tests, mostly long test functions. A table of cases is data and stays long only as a table; a test that walks through ten steps becomes helpers with names.
- **The linters that already ran stay where they are.** `go vet` and `staticcheck` keep their own make targets and already fail on any finding. golangci-lint runs only the four new linters, so nothing is checked twice and no existing check changes.
- **Pinned and checked as the others.** Every tool runs as `go run module@version`, like staticcheck and govulncheck: Go checks each module it builds from against the public checksum database. No binary is downloaded.
- **golangci-lint is GPL-3.0.** It runs as a separate program and is never linked into Kenwerk or shipped, which blueprint 02 allows for a GPL tool. The four linters it runs are BSD-3, MIT, MIT and Apache-2.0. gitleaks is MIT, Stryker Apache-2.0.
- **Stryker is new.** Two development packages, which bring 157 others into `web/node_modules`, all MIT, Apache-2.0, ISC, BSD or 0BSD apart from `caniuse-lite` (CC-BY-4.0, browser data). They are never in a build. They were installed with `npm install --before` a date two weeks back: the newest version of one of them was published minutes earlier and could not even be downloaded yet, which is also how a hijacked release reaches people first.

## Decision

Taken on the product owner's behalf on 22 November 2026, within the decisions of 21 November; may be overruled:

- **D1. A ratchet per package and linter.** `scripts/lint-ratchet.txt` lists, for each package that is not clean yet, how many findings each linter still has there. `make lint` fails when a number grows, when a package or linter that is not listed has a finding, and when a listed one has none: then its line goes, and from then on that package is held to the hard rule. A new package is never listed, so it is clean from the start. A number that falls only gives a note, because two branches that each fix a finding would otherwise make `main` fail when both land; `ratchet lint -update` lowers the numbers, and never raises one.
- **D2. Inverted, on purpose.** The list names the packages that are *not* clean, not the ones that are. A list of clean packages would let every new package start outside the rule.
- **D3. dupl holds for all code now.** It has no finding anywhere, so it is not on the list at all.
- **D4. The secret scan holds for all code now.** The tree in `make check`, the history in CI. Before each scan a token planted in a temporary folder must be found, so an allowlist that grew too wide fails the check instead of hiding everything.
- **D5. npm audit holds for all packages now**, at high and up, in `make check` and in CI. It replaces the audit of shipped packages only, which it covers.
- **D6. Stryker, a ratchet per file.** `web/stryker.config.mjs` names the files, `scripts/stryker-ratchet.txt` holds the floor of each file's score. A score below its floor fails, and so do a mutated file that is not listed and a listed file that is no longer mutated. No single threshold for all files: one file could fall while another rose.
- **D7. The scope of Stryker** is the logic that decides what a person sees or may do, chosen for its own unit tests: what a person may do (`capabilities`, `create-permission`, `permission-words`, `restriction-state`), addresses and messages from outside the page (`shared-clean`, `frame-messages`), search (`search-filters`, `admin-search`), and documents, templates and tables (`template-conditions`, `template-fields`, `kept-fields`, `table-rules`, `dynamic/kinds`, `sheet/csv`, `sheet/formula`, `tree-model`).
- **D8. Where each runs.** `make check` gains `lint`, `secrets` and `audit` (together about 40 s warm). CI runs them too, in the `go` and `web` jobs and a new `secrets` job. Stryker runs in CI as `make mutation-web` in the nightly job, beside the Go mutation check: a full run takes over half an hour. `ignoreStatic` would make it a few minutes, but it would drop 687 mutants from the score; not taken. Locally it is a heavy gate, run before landing a change to a file it mutates.
- **D9. The hard rule for Stryker** at the end is that every surviving mutant in scope is either caught or marked as equivalent with a `// Stryker disable next-line <mutator>: <reason>` comment: the same as a clean lint package, an exception on its line with its reason. Until then the floors only rise.

## CI cost

| Gate | Where | Time |
|---|---|---|
| golangci-lint, whole repository | `go` job, `make check` | about 60 s for the first build of the tool, 20 s with a warm cache, plus the analysis, 60 s cold |
| gitleaks, tree | `secrets` job, `make check` | 8 s, plus 20 s to build the tool the first time |
| gitleaks, history | `secrets` job | 6 s for 371 commits; it grows with the history |
| npm audit, `web/` and `collab/` | `web` job, `make check` | a few seconds, one request each |
| Stryker, 16 files | `nightly` job | 37.5 minutes with two processes locally; not yet measured on a hosted runner |

## Follow-up waves

Each wave cleans whole packages, so each one ends with lines removed from the list and those packages locked. A wave that touches a package for another reason may also clean it. Order: small first, so the list shortens quickly and most packages are held early; the big packages last, when the way to split their functions is well worn. Sizes are findings today.

| Wave | Packages | Findings | Rough size |
|---|---|---|---|
| QG2 | `mail` 5, `outbox` 5, `queue` 5, `sso` 5, `webui` 5, `conditions` 6, `people` 6, `search` 6, `settings` 6, `sharing` 6, `scim` 7, `sites` 7, `templates/fields` 7, `comments` 8 | 84 | one wave |
| QG3 | `notify` 11, `automation` 12, `config` 13, `db` 13, `attachments` 14, `backups` 14, `workflow` 15, `keys` 17, `office` 17, `events` 18 | 144 | one wave |
| QG4 | `storage` 22, `document` 26, `audit` 27, `httpapi` 27, `exchange` 31, `cmd/kenwerk` 40 | 173 | one wave |
| QG5 | `identity` 43, `templates` 44, `permissions` 57 | 144 | one wave; `permissions` is the access rule, so its mutation check runs in full |
| QG6 | `publishing` 85, `pages` 111 | 196 | one or two waves |
| QG7, QG8 | `internal/app` 397, almost all long test functions | 397 | two waves: shared steps of the integration tests become named helpers |
| alongside | Stryker: first unit tests for the code no test reaches (`kept-fields`, `restriction-state`, `frame-messages`, 181 mutants), then the survivors (754, of which 312 in `dynamic/kinds`), then more files into scope (`dates`, `router`, `editor/outline`, `editor/paste`, `sheet/model`, the views' helpers) | 1,039 mutants | a part of each wave; QG2 takes the three files without tests |

At the end `scripts/lint-ratchet.txt` holds only its heading, and the check could drop the ratchet; keeping it costs nothing and keeps the rule for new packages.

## Acceptance criteria

- [x] `make lint` fails on a finding in a package that is not listed, on more findings than listed, and on a listed package that is clean (tests of `cmd/ratchet`).
- [x] `ratchet -update` lowers the list and refuses to raise it; for Stryker it raises floors and refuses to lower them (tests of `cmd/ratchet`).
- [x] `make secrets` fails when a planted token is not found, and passes on the tree; the history of every branch has no finding.
- [x] `make audit` passes for `web/` and `collab/`, development packages included.
- [x] `make check` runs `lint`, `secrets` and `audit`; CI runs them and `secrets-history`; no existing check is weaker.
- [x] Stryker runs on the files of D7, and its ratchet holds every file at today's score (floors rounded down to a tenth). A mutant that times out on one run and survives on another can move a score by a fraction; if that ever fails the nightly run, the fix is a test that catches that mutant outright.

## How the product owner tests it

Nothing changes in the product. To see the gates work:

1. Open the latest CI run of a pull request: the `go` job has a step **lint**, the `web` job **known vulnerabilities in all packages**, and there is a job **secrets**. All are green.
2. Open `scripts/lint-ratchet.txt`: it lists 36 packages; no package outside it may get a finding.
3. Each later QG wave removes lines from that list. When a wave says a package is clean, its line is gone.

## Provenance

Own design, from the product owner's material and decisions of 21 November 2026. Versions, release dates and licences read on 22 November 2026 from the release pages and licence files of github.com/golangci/golangci-lint, github.com/gitleaks/gitleaks and github.com/stryker-mutator/stryker-js, and from the npm registry. How each tool behaves was checked by running it on this repository, as measured above.
