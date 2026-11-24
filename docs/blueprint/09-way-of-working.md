# 09: Way of working

## Roles

| Who | Role |
|---|---|
| **The product owner** | Product owner (decides *what* and *why*), tester and operator. Reviews **behaviour**, not code. |
| **Claude (build sessions)** | Developer: writes code, tests and documentation from specs and ADRs |
| **Claude (review sessions)** | A fresh session that has **not** seen the build. Reviews a module against the specs, the security rules and this document. Not after every wave: the written rules, the checks and the tests carry each wave (ADR-043). |
| Volunteers (welcome, never assumed) | A penetration tester, or an experienced Go developer who reviews at milestones. There is no budget for paid help (ADR-029). |

Because the product owner does not read code, **the automated checks are the code reviewer**. They must be stricter than in a normal team. [How Kenwerk is tested](../testing.md) lists every check, where it is defined, when it runs and how to run it, with counts measured from the repository.

## GitHub setup

As found on 2026-11-23.

- **Landing.** A wave lands as a local squash-merge and a push to `main`, not as a pull request. CI runs on every push to `main`, after the push. `main` has no branch protection on GitHub. Open: the product owner decides whether waves go through pull requests and whether `main` is protected; the [beta criteria](../beta-criteria.md) ask for branch protection before outside contributions are invited (S7).
- **DCO sign-off** is on every commit of `main` but the initial one. The DCO check of CI (`scripts/check-dco.sh`) runs on pull requests only, so it does not check what lands by push.
- **Not in place:** signed commits (commits carry no GPG or SSH signature), a `CODEOWNERS` file, and issue templates. Releases are signed instead, with Sigstore (`release.yml`).
- **Dependency updates:** Renovate (`renovate.json`) opens update pull requests on Monday mornings, Go modules and GitHub Actions each grouped, security updates at any time. CI runs on them. None had been merged on 2026-11-23.
- **Scanning:** CodeQL, Semgrep, Trivy, a ZAP baseline and gitleaks run in CI. Private vulnerability reporting is on ([SECURITY.md](../../SECURITY.md)). GitHub's own secret scanning and push protection are repository settings that the repository files cannot show.

## Quality gates (every change)

Each runs in CI on every push to `main` and on every pull request, unless the row says otherwise.

| Gate | Tools |
|---|---|
| Formatting and lint | `gofmt`, `go vet`, `staticcheck`, `golangci-lint` with gocyclo (at most 10), funlen (40 lines), dupl and gosec for all code, the packages that do not meet it yet held by a ratchet (spec 097), ESLint, Prettier, TypeScript strict mode |
| Unit tests | `go test -race`, Vitest. Coverage is a diagnostic, never a target; the mutation checks show whether the tests catch faults (decided by the product owner on 2026-11-22). |
| Integration tests | Real PostgreSQL 16: a service container in CI, and the database of the Compose development environment locally, with a database of its own per test (`internal/testutil`). Not Testcontainers. NATS, where a test uses it, is the embedded server, in process. Without `KENWERK_TEST_DATABASE_URL` the integration tests are skipped |
| Permission matrix | Generated tests from 05. Must be 100% green. |
| End-to-end | Playwright on the built app, including accessibility checks (axe) |
| Design | `docs/design/README.md`: tokens, contrast, icons and dialogs through `npm run design`; approved pictures of every screen in the end-to-end run |
| Upgrade test | Start the previous release with traffic, upgrade to this build, no failed requests allowed, then roll back to the previous release. In CI as the job `upgrade`, with the target branch or the previous commit of main as the previous release (OPS-036) |
| Security | In CI: `govulncheck`, Trivy (image and dependencies), `npm audit` of every package, development ones too, gitleaks over the tree and every commit (spec 097), licence scan, Semgrep (Go, TypeScript, React and secrets rules), CodeQL (extended security queries, Go and TypeScript), an OWASP ZAP baseline against the real image, and the mutation checks: the Go one nightly, Stryker on the frontend logic with a ratchet per file (spec 097). A finding fails the build; an exception sits on its line with the reason (SEC-1023, ADR-038) |
| Fuzzing | Go native fuzzing on parsers (Markdown, imports, sanitiser), nightly |
| Load | **A smoke test on every push and pull request** (the product owner, 2026-11-24; wave LT1): the CI job `load-smoke` runs `scripts/load/smoke.js` with k6 for 150 seconds against the real binary and PostgreSQL with a small seeded organisation, and fails when a main read crosses its p95 budget, more than 1% of requests fail, or any answer is a server error. The budgets and their sources are at the top of the script. The test of 5,000 people stays manual: the k6 scripts in `scripts/load/` and `scripts/stress/` run by hand on machines of their own, and their results are in `docs/operations/limits.md` and the stress-test reports. None runs at night |
| API contract | The OpenAPI spec matches the code, and every endpoint has a permission annotation |

## Every phase starts with a study (product owner, 2026-11-05)

The product owner: this is one of the most important ways to make the product as complete as possible. No phase or wave is built from a short list. Before the first line of code:

1. **Read widely.** Public help pages of other products, for behaviour only (`02`). W3C, MDN and library documentation for how it should work. Not one source: several, and in detail.
2. **Write what was found.** What people expect, what accessibility demands, what the libraries allow, what is risky.
3. **Plan every feature in detail** in `docs/specs/`: behaviour, mouse, keyboard, accessibility, document format, export, search, edge cases and limits.
4. **Decide and write it down:** a table of decisions with reasons, what is in and what waits.
5. **Plan the build:** an order of work, a test plan per level, acceptance criteria, risks, and how the product owner tests it.
6. **Log the sources** in the spec, and update `03-functional` when the study finds something new.

Only then does building start. If a build has started without this, stop and do the study first. Spec 008 is the example to follow.

## How a build session works

1. **One wave, one branch, one commit on `main`.** Keep it small: one feature or fix. The branch is rebased on `main` and lands as a squash-merge and a push (see GitHub setup).
2. At the start Claude reads `CLAUDE.md`, the relevant spec and ADRs, and the latest handoff note.
3. Claude writes the tests **first** from the spec's acceptance criteria, then the code.
4. Claude runs the checks locally before landing: what a wave must pass is in [How Kenwerk is tested](../testing.md#what-a-wave-must-pass-before-it-lands).
5. The **"How to test" steps in plain language** for the product owner are in the spec, under "How the product owner tests it" (the template in `docs/specs/README.md`), for example "Log in as the guest user → open space X → you should NOT see page Y". A pull request from someone else carries them in the pull request template.
6. At the end Claude updates the changelog, the relevant docs, any new ADR, and writes a **report** (`docs/reports/`) and a **handoff note** (`docs/handoff/`) so the next session knows where things stand.

## The product owner's review sessions ("as a colleague")

- **When:** at least once per phase milestone, and for every wave touching permissions, authentication, encryption or upgrades
- **Where:** a build of the wave or of `main`. CI deploys nothing: no staging environment is redeployed automatically
- **How:** Claude prepares a script of scenarios. The product owner performs them and reports what they see. Claude fixes the deviations, and each deviation becomes a new automated test.
- **The product owner's fixed checks per milestone:** upgrade while a colleague is editing, kill a node, restore from backup, try to reach a restricted page as a guest

## Definition of done

The feature matches its spec and acceptance criteria, all gates are green, permissions and audit events are covered, the UI text goes through translation files, the screen follows the design standard, the docs are updated, the upgrade test passes, and the product owner has gone through the spec's "How the product owner tests it". A change that makes the document gate stricter also says what happens to stored versions: a pass over them, or the same check when they are read, because stored documents are trusted as they are (SEC-308).

## Working within Claude Max limits

- Plan work in **small, independent issues**, so a session can always finish something
- Use parallel cloud sessions only for tasks that don't touch the same files
- Spec sessions and review sessions are cheap. Big refactors are expensive and are avoided by deciding early (ADRs).
- When a limit is reached, the handoff note makes it safe to stop at any time

## Documentation language

English, because the project is public. These blueprint documents are the start of `docs/`.
