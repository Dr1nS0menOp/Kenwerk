# Dependencies

Rule from the product owner (2026-11-04): keep this list as short as possible, to avoid constant security advisories and abandoned code. But never hand-write an important or security-critical part when a widely used, maintained module does the job, unless it lacks a feature we need. Small non-critical code gets written here and adds no dependency.

Rule from the product owner (2026-11-24): every judgement of a dependency includes its OpenSSF Scorecard and a real search for something better (other maintainers, maintained forks, big vendors, the standard library), and all security-critical and architecture-critical dependencies are reviewed together, against the base rule of 2026-11-23: recent releases and commits, advisories fixed fast, an organisation or two active maintainers, widely used with a Scorecard, an allowed licence, and as few modules as possible. Every dependency, direct and transitive, is in [the dependency inventory](dependency-inventory.md); the review and its verdicts are in [the dependency review of 2026-11-24](reports/2026-11-24-dependency-review.md).

Every direct dependency is listed with its licence and the reason it exists. Licences must be MIT, BSD, Apache-2.0 or ISC.

## Backend (Go)

| Module | Licence | Why | Approved |
|---|---|---|---|
| `jackc/pgx/v5` 5.13.0 | MIT | PostgreSQL driver. Brings its pool `jackc/puddle/v2` 2.2.4 (MIT) | Blueprint 04 |
| `nats-io/nats.go` 1.56.0, `nats-server/v2` 2.15.3 | Apache-2.0 | Message queue, embedded for small installs. Brings `nats-io/jwt/v2` 2.8.3, `nats-io/nkeys` 0.4.17 (Apache-2.0) and `klauspost/compress` 1.20.5 (BSD-3, Apache-2.0 and MIT for its parts) | Blueprint 04 |
| `google/uuid` 1.6.0 | BSD-3 | UUIDv7 ids, and the name-based v5 ids of five places. An exception to the base rule: see Exceptions below | Blueprint 05 |
| `golang.org/x/crypto` 0.59.0 | BSD-3 | Argon2id password hashing | Blueprint 06 |
| `coreos/go-oidc`, `golang.org/x/oauth2` 0.38.0 | Apache-2.0, BSD-3 | OIDC login. Token verification must not be hand-written. Brings `go-jose/go-jose/v4` 4.1.9 (Apache-2.0, with BSD-3 for its JSON package) | Blueprint 04 |
| `go-webauthn/webauthn` | BSD-3 | Passkeys. Far too intricate to write ourselves. Brings `fxamacker/cbor/v2` 2.10.0 (MIT) and `tinylib/msgp` 1.6.5 with `philhofer/fwd` 1.2.1 (MIT) | Blueprint 04 |
| `creachadair/otp` 0.5.6 | BSD-3, read from its `LICENSE` | TOTP codes by RFC 6238 (`internal/identity/totp.go`). Only its root package, which needs nothing but the standard library: its `otpauth` package would bring `creachadair/wirepb`, which has no release, so the `otpauth://` address for the QR code is a few lines of URL building of our own, with no cryptography in it. Replaced `pquerna/otp` (no commit since 2025-08, nobody active) in wave DA3; seeds enrolled before keep working. An exception to the base rule: see Exceptions below | The product owner, 2026-11-24 |
| `boombuler/barcode` 1.1.1 | MIT | The QR code for enrolling an authenticator app. Came with `pquerna/otp` before; direct since wave DA3, as `creachadair/otp` draws no QR codes | The product owner, 2026-11-04 and 2026-11-24 |
| `yuin/goldmark` | MIT | Markdown parser, no dependencies of its own | The product owner, 2026-11-04 |
| `golang.org/x/net/html` 0.63.0 | BSD-3 | HTML import. Parsing hostile HTML must not be hand-written. | The product owner, ADR-026 |
| `go.yaml.in/yaml/v3` 3.0.6 | MIT and Apache-2.0, read from its `LICENSE` and `NOTICE` | The configuration file (spec 056). Parsing YAML must not be hand-written. The maintained successor of the archived `gopkg.in/yaml.v3`; it needs no other module, and was already in the build through a test library | The product owner, ADR-040; spec 048 D4 |
| `go.opentelemetry.io/otel`, `otel/trace`, `otel/sdk`, `otel/exporters/otlp/otlptrace/otlptracehttp` 1.47.0 | Apache-2.0, read from each module's `LICENSE` | Traces over OTLP (spec 060), off by default. The official SDK: the wire format and batching must not be hand-written. No contrib modules (`otelhttp`, `otelpgx`): the middleware, query tracer and NATS headers are our own few lines, so no attribute is added that spec 060 D6 forbids. They bring `go.opentelemetry.io/otel/metric`, `otel/log`, `otel/exporters/otlp/otlptrace`, `go.opentelemetry.io/auto/sdk` 1.2.2 (Apache-2.0), `go.opentelemetry.io/proto/otlp` 1.11.1 (Apache-2.0), `google.golang.org/protobuf` (BSD-3), `google.golang.org/grpc` 1.85.0 and `google.golang.org/genproto/googleapis/api` and `/rpc` of 2026-11-23 (Apache-2.0), `grpc-ecosystem/grpc-gateway/v2` 2.34.0 (BSD-3), `go-logr/logr` and `go-logr/stdr` (Apache-2.0), `cenkalti/backoff/v5` (MIT), `cespare/xxhash/v2` (MIT): the OTLP protocol package links its gRPC stubs even for HTTP. Each licence read from the module's own file | The product owner, ADR-040; spec 048 D5 |
| `modelcontextprotocol/go-sdk` 1.8.0 | MIT for its existing code, Apache-2.0 for new contributions, read from its `LICENSE` | The Model Context Protocol for `kenwerk mcp` (spec 096, wave MC3): the official SDK, which speaks revision 2026-07-28 and the older ones. The protocol's framing, versions and life cycle are not ours to keep up with by hand. It brings `google/jsonschema-go` 0.4.3 (MIT), which also checks the arguments of every tool against its schema, `yosida95/uritemplate/v3` (BSD-3), and `segmentio/encoding` and `segmentio/asm` (MIT); and it links `golang-jwt/jwt/v5` (MIT), which was already in the module graph, for its OAuth helpers. Each licence read from the module's own file | The product owner, 2026-11-22 (spec 096, question 2) |
| `golang.org/x/text/unicode/norm` 0.44.0 | BSD-3 | Unicode NFC for passwords (SEC-107). It was already in the build through other modules; only its listing is new. Unicode tables must not be hand-written. | Spec 035 |

## Data

| Data | Licence | Why | Approved |
|---|---|---|---|
| SecLists `xato-net-10-million-passwords.txt` (`internal/identity/leaked/passwords.bloom`) | MIT | The check of new passwords against leaked ones, which must work offline. Kept as a Bloom filter of 10 MB, never as text. `go run ./cmd/password-filter list.txt internal/identity/leaked/passwords.bloom` rebuilds it. Source: `github.com/danielmiessler/SecLists`, `Passwords/Common-Credentials/`, sha256 `c95989fe...72fe`, 5,054,227 unique entries in lower case | The product owner, 2026-11-05 |

## Web builds, not compiled here

Downloaded by `scripts/fetch-craft.py`, which refuses any file but the pinned release. The files are stored in `web/public/vendor/`, each with its LICENSE-MIT, LICENSE-APACHE, NOTICE and ATTRIBUTION.md, and `scripts/craft-checksums.sha256` with a test keeps them unchanged. They are loaded only when someone opens a file in them, in a sandboxed frame without `allow-same-origin`. The ArtCraft name and logos stay unmodified, as part of the product; a fork of these builds must remove them. Spec 019 holds the measurements.

| Build | Licence | Why | Pin | Approved |
|---|---|---|---|---|
| PdfCraft 0.18.2 (`storytold/pdfcraft`, `pdfcraft-web-0.18.2.zip`, 18.7 MiB) | MIT or Apache-2.0 | Viewing and changing a PDF in the browser | sha256 `3f2c11ae...6867` | The product owner, ADR-026 |
| GridCraft 0.16.1 (`storytold/gridcraft`, `gridcraft-web-0.16.1.zip`, 8.9 MiB) | MIT or Apache-2.0 | Opening a spreadsheet file, or a database for heavy work | sha256 `496785cf...8368` | The product owner, 2026-11-06 |

## Pictures

| What | Licence | Why |
|---|---|---|
| Kenney, Animal Pack Remastered: the 30 round PNGs in `web/public/animals/`, 115 KB, with its `LICENSE.txt` | CC0 1.0 | The animals of spaces (ADR-031). No code. Credit is not required, and it is given here with thanks |

## The service for editing together (Node.js, optional)

Only in the `collab` container, and only where an operator installs it. Pinned in `collab/package-lock.json`. Node.js security updates apply from then on.

| Package | Licence | Why | Decided |
|---|---|---|---|
| `@hocuspocus/server` 4.9.0, `@hocuspocus/common` 4.9.0 | MIT, read from each package | The WebSocket server for Yjs | ADR-026 |
| `yjs` 13.6.33, `y-protocols` 1.0.7, `lib0` 0.2.120 | MIT | The shared document | ADR-026 |
| `crossws` 0.4.17, `async-mutex` 0.5.0, `isomorphic.js` 0.2.5, `kleur` 4.1.5 | MIT | Come with Hocuspocus | ADR-026 |
| `tslib` 2.9.1 | 0BSD | Comes with `async-mutex` | ADR-026 |

## Helper images (optional)

Separate programs in their own containers, reached over HTTP, never linked into Kenwerk. An operator runs them only when they want what they give.

| Image | Licence | Why | Approved |
|---|---|---|---|
| `gotenberg/gotenberg` 9.9.3, pinned by digest, as the base of our image `kenwerk-pdf` (`deploy/pdf`) | MIT (Gotenberg; it carries Chromium, BSD-3-Clause, and LibreOffice, MPL-2.0, as separate programs) | PDF export and the PDF preview of office files (ADR-026). Our image adds Debian's security updates since upstream's build, and Kenwerk's settings: no outside fetches, no JavaScript, no macros, and none of the routes for changing PDF files, which Kenwerk never calls. CI builds and scans it on every change and every night; `.github/workflows/pdf-image.yml` publishes it, signed, at every release; Renovate moves the base | ADR-026; Gotenberg 9 decided on the product owner's behalf (wave GB1); a weekly published image waits for their decision |

## Release tools (CI only, never in the product)

They build, list and sign a release in `.github/workflows/release.yml` and the CI job `release-dry-run` (spec 057). Nothing of them ends up in the binary, the packages or the image. Each is pinned by version, and each action by commit SHA.

| Tool | Licence | Why | Approved |
|---|---|---|---|
| GoReleaser 2.20.3 (OSS), with nFPM | MIT, read from its `LICENSE.md` | Archives, `.deb` and `.rpm`, checksums | The product owner, ADR-040 |
| cosign 3.1.4 | Apache-2.0 | Keyless Sigstore signatures of `checksums.txt` and the image | Spec 048 D7 |
| syft 1.57.2 | Apache-2.0 | The SBOMs in SPDX and CycloneDX | Spec 048, OPS-094 |
| `actions/attest-build-provenance` 4.2.2 | MIT | SLSA provenance through GitHub | Spec 048, OPS-094 |

## Deployment checks (CI only, never in the product)

They check the deployment templates in `scripts/deploy-check.sh` and the CI job `deploy` (spec 099), and the release workflow publishes the Helm chart with the same `helm`. Nothing of them ends up in the binary, the packages or the images. Each is pinned by version and sha256 in the script; cfn-lint and its packages by hash in `scripts/deploy-check/cfn-lint.txt`. An operator who deploys with a template uses the platform's own tools, which are theirs to choose.

| Tool | Licence | Why | Approved |
|---|---|---|---|
| Helm 4.3.2 | Apache-2.0 | `helm lint`, `helm template`, and packaging and pushing the chart | Spec 099 D15 |
| kubeconform 0.8.0 | Apache-2.0 | The rendered chart against the schemas of Kubernetes 1.33 | Spec 099 D15 |
| Bicep 0.48.1 | MIT | `bicep lint`, and building `azuredeploy.json` | Spec 099 D15 |
| OpenTofu 1.13.8 | MPL-2.0 | `tofu validate` and `fmt` of the module and examples | The coordinator allowed MPL-2.0 for these CLIs; spec 099 D16 |
| Terraform 1.5.7 | MPL-2.0 | The same with Terraform. The last MPL-2.0 release: later ones are BUSL-1.1, which is not allowed | As above |
| `hashicorp/helm`, `kubernetes`, `random`, `google` providers | MPL-2.0 | Downloaded by `init` so `validate` can check the module and examples | Decided on the product owner's behalf, spec 099 D16, may be overruled |
| `python:3.13-slim`, pinned by digest in the script | PSF-2.0 for Python, with the licences of its Debian packages | The image cfn-lint runs in, so no Python is installed on the runner | As above |
| cfn-lint 1.60.0, with jsonpatch, jsonpointer, networkx (BSD-3-Clause), mpmath, sympy (BSD), PyYAML (MIT), regex (Apache-2.0 and CNRI-Python), typing_extensions (PSF-2.0) | MIT-0 | The CloudFormation template, with warnings as failures | As above: MIT-0 and PSF-2.0 are permissive, but not on the list |

## Load test (CI only, never in the product)

The CI job `load-smoke` runs k6 against the real binary on every push and pull request (wave LT1), through `scripts/load/smoke.sh`, which pins it by version and by the sha256 of its release archive. The manual stress test of `scripts/stress/` uses the same tool. Nothing of it ends up in the binary, the packages or the images.

| Tool | Licence | Why | Approved |
|---|---|---|---|
| k6 2.4.0, the official `linux-amd64` release archive, sha256 `5a5ecf23...abb87` | AGPL-3.0, read from its `LICENSE` | Sends the load of the smoke test and checks its thresholds. Run unmodified as a separate program and never linked or shipped, which blueprint 02 allows, as for golangci-lint. Scorecard 7.7 (2026-11-23), Maintained 10, Code-Review 10, Pinned-Dependencies 9; Signed-Releases 0, so the pin is the sha256 that the release's `k6-v2.4.0-checksums.txt` publishes. Grafana Labs maintains it, with a release a month or more. Compared: Locust (MIT, 6.6) would need Python packages installed on the runner; Gatling (Apache-2.0, 5.4) needs a JVM; vegeta (MIT, 3.6) and hey (Apache-2.0, 3.4) score Maintained 0. The official `grafana/setup-k6-action` has no Scorecard and 22 stars, so the script downloads the release itself | The product owner, 2026-11-24 (load test in CI); the tool decided on their behalf in wave LT1, may be overruled |

## Deliberately not a dependency

| Part | Decision | Why |
|---|---|---|
| Sanitiser (`bluemonday`, in the blueprint) | Not used | We store no HTML. `document.Normalize` rebuilds documents from an allow-list, which is stricter. |
| `sqlc` (in the blueprint) | Not used | Hand-written parameterised SQL has been enough, and it saves a code generation step. |
| SCIM library | Not used | The only Go server library is not widely used. Our part is JSON mapping plus `eq` filters, and the real checks stay in the identity module. Revisit if clients need more of the protocol. |
| Version comparison | Own code | A small longest-common-subsequence routine, not security critical. |
| Encryption | Standard library | AES-GCM, Ed25519 and HKDF all come from Go itself. `internal/keys` only arranges them. |
| Rate limiter, migration runner | Own code | Small, and the blueprint allows our own migration runner. |
| TipTap colour, highlight and alignment packages | Own marks | They store free values, and our documents only allow names from a list (spec 008). Each mark is a few lines. |
| TipTap drag handle | Own code | Ours moves top-level blocks and is small. Yjs is here now, so it could be looked at again. |
| Emoji data | Own list | About 150 common emoji with our own keywords in `emoji.json`. The characters come from the system font, so nothing else ships. |
| Routing (`@tanstack/react-router`, in blueprint 04) | Own code | `web/src/router.tsx`, a small router over the browser's history. About a dozen screens did not justify a dependency. |
| Message bus for jobs | PostgreSQL | Imports and periodic tasks use a table with `SKIP LOCKED`. One moving part fewer than a second NATS consumer. Events still go through the outbox and NATS. |

## Frontend (npm)

See `web/package.json`. The list and its reasons are below, and `scripts/check-licenses.sh` fails the build on a licence outside the allow-list.

| Package | Licence | Why | Approved |
|---|---|---|---|
| `react`, `react-dom` | MIT | UI | Blueprint 04 |
| `@tanstack/react-query` 5.108.4 | MIT | Server state and caching | Blueprint 04 |
| `@tiptap/*` 3.35.0 | MIT | Editor, on ProseMirror (MIT): `prosemirror-model` 1.25.13, `-transform` 1.12.7 and the rest at their newest, apart from `prosemirror-view`, held at 1.42.9 by `overrides` in `web/package.json`: 1.43.0 (2026-11-19) moved mouse selection from the browser into the library, and with it a click on a file tile no longer selects the tile, so its tools never show (`file-details.spec.ts`). 1.42.9 has no known advisory; move on once a later release passes the end-to-end tests | Blueprint 04 |
| `yjs` 13.6.33 | MIT | The shared document that merges by itself | ADR-026 |
| `@tiptap/extension-collaboration` 3.35.0, `@tiptap/extension-collaboration-caret` 3.35.0, `@tiptap/y-tiptap` 3.3.1 | MIT, read from each package | Connect the editor to Yjs, with cursors and an undo per person. Pinned together with TipTap | ADR-026 |
| `@hocuspocus/provider` 4.9.0 | MIT, read from the package | Talks to the service | ADR-026 |
| `y-protocols` 1.0.7, `lib0` 0.2.120 | MIT | Come with Yjs | ADR-026 |
| `@tiptap/suggestion` | MIT | The menus at the cursor for `/` and `:`. Its helper for placing a popup, `@floating-ui/dom`, was already there through `@tiptap/react`. | The product owner, 2026-11-05 |
| `i18next` 26.7.2, `react-i18next` 17.1.13 | MIT | Translation framework | Blueprint 04 |
| `lowlight` 3.3.0, `highlight.js` 11.12.0 | MIT, BSD-3 | Colours in code blocks. lowlight asks for highlight.js 11.11, so `overrides` in `web/package.json` gives it 11.12.0, the one copy in the tree: 11.12.0 bounds two grammars that could take very long on crafted text, and changes no API that lowlight uses. lowlight is an exception to the base rule: see Exceptions below | The product owner, 2026-11-04 |

Development only: `vite`, `typescript`, `vitest`, `eslint`, `prettier`, `@playwright/test`, `@axe-core/playwright`, all named in blueprint 09.

| Package (development only) | Licence | Why | Approved |
|---|---|---|---|
| `@stryker-mutator/core` 10.1.1, `@stryker-mutator/vitest-runner` 10.1.1 | Apache-2.0, read from each package | Mutation testing of the frontend logic (`make mutation-web`, spec 097): it proves the unit tests catch changed code, which coverage cannot. Writing a mutation tester ourselves would be a large, non-critical project. They bring 157 packages, all development only and never in a build: MIT, Apache-2.0, ISC, BSD and 0BSD, apart from `caniuse-lite` (CC-BY-4.0, browser data, through Babel). Pinned exactly, installed with `npm install --before` a date two weeks back. `overrides` in `web/package.json` give Stryker `minimatch` 11.0.9 in place of 10.2.6 (GHSA-g3hv-75wg-m249) and its `typed-rest-client` `qs` 6.17.1 in place of 6.15.1 (four advisories fixed in 6.16.1), both scoped to Stryker alone; `make mutation-web` was run with them (wave DA3) | The product owner, 2026-11-21 (wave QG1) |

## Quality tools (make check and CI only, never in the product)

Run as separate programs with `go run module@version`, so the Go checksum database verifies every module they are built from, as for staticcheck and govulncheck. Nothing of them is linked into Kenwerk or shipped. Spec 097 says what each catches.

| Tool | Licence | Why | Approved |
|---|---|---|---|
| golangci-lint 2.15.0 | GPL-3.0, read from its `LICENSE` | Runs gocyclo (BSD-3), funlen (MIT), dupl (MIT) and gosec (Apache-2.0) with one configuration, `.golangci.yml`, and one JSON report for the ratchet. A GPL tool called as a separate process is allowed by blueprint 02; it never touches our code's licence | The product owner, 2026-11-21 (wave QG1) |
| gitleaks 8.30.1 | MIT, read from its `LICENSE` | The secret scan of the working tree and of every commit, with `.gitleaks.toml` | The product owner, 2026-11-21 (wave QG1) |
| govulncheck 1.10.0 | BSD-3 | Known vulnerabilities in the Go code and every module it requires (`make vuln`) | Blueprint 09 |
| Semgrep 1.186.0, the `semgrep/semgrep` image pinned by digest | LGPL-2.1, read from its `LICENSE` | The scan with the Go, TypeScript, React and secrets rules in CI. Runs in its own container, never linked into Kenwerk | ADR-038 |

## Versions of the security-relevant dependencies

The product owner's rule (2026-11-23): what matters for security is kept maintained and patched quickly. This table holds the version in use, the date that version was released, and the licence, for every security-relevant dependency that wave DU1 moved. Change it with every update. The base images are pinned by digest in the `Dockerfile`, `collab/Dockerfile`, `compose.yaml` and CI; the date is when the digest was refreshed.

| Dependency | Version | Released | Licence |
|---|---|---|---|
| `golang.org/x/crypto` | 0.59.0 | 2026-11-11 | BSD-3 |
| `golang.org/x/net` | 0.63.0 | 2026-11-17 | BSD-3 |
| `golang.org/x/oauth2` | 0.38.0 | 2026-11-06 | BSD-3 |
| `golang.org/x/text` | 0.44.0 | 2026-11-09 | BSD-3 |
| `golang.org/x/sys` | 0.50.0 | 2026-11-06 | BSD-3 |
| `golang.org/x/sync` | 0.25.0 | 2026-10-15 | BSD-3 |
| `go-jose/go-jose/v4` | 4.1.9 | 2026-11-05 | Apache-2.0, BSD-3 |
| `jackc/pgx/v5` | 5.13.0 | 2026-11-11 | MIT |
| `jackc/puddle/v2` | 2.2.4 | 2026-11-16 | MIT |
| `nats-io/nats-server/v2` | 2.15.3 | 2026-11-11 | Apache-2.0 |
| `nats-io/nats.go` | 1.56.0 | 2026-11-17 | Apache-2.0 |
| `nats-io/jwt/v2` | 2.8.3 | 2026-11-06 | Apache-2.0 |
| `nats-io/nkeys` | 0.4.17 | 2026-11-05 | Apache-2.0 |
| `klauspost/compress` | 1.20.5 | 2026-11-19 | BSD-3, Apache-2.0, MIT |
| `google.golang.org/grpc` | 1.85.0 | 2026-10-27 | Apache-2.0 |
| `grpc-ecosystem/grpc-gateway/v2` | 2.34.0 | 2026-11-16 | BSD-3 |
| `google.golang.org/genproto/googleapis/api`, `/rpc` | commit `1e707ab9fbc2` | 2026-11-23 | Apache-2.0 |
| `go.opentelemetry.io/auto/sdk` | 1.2.2 | 2026-11-20 | Apache-2.0 |
| `go.opentelemetry.io/proto/otlp` | 1.11.1 | 2026-09-30 | Apache-2.0 |
| `fxamacker/cbor/v2` | 2.10.0 | 2026-10-28 | MIT |
| `tinylib/msgp` | 1.6.5 | 2026-09-30 | MIT |
| `philhofer/fwd` | 1.2.1 | 2026-10-16 | MIT |
| `boombuler/barcode` | 1.1.1 | 2026-11-22 | MIT |
| `creachadair/otp` | 0.5.6 | 2026-11-08 | BSD-3 |
| `@tiptap/*` | 3.35.0 | 2026-11-20 | MIT |
| `@tiptap/y-tiptap` | 3.3.1 | 2026-11-20 | MIT |
| `@hocuspocus/provider`, `/server`, `/common` | 4.9.0 | 2026-11-20 | MIT |
| `@tanstack/react-query` | 5.108.4 | 2026-11-23 | MIT |
| `i18next` | 26.7.2 | 2026-11-05 | MIT |
| `react-i18next` | 17.1.13 | 2026-11-05 | MIT |
| `prosemirror-model` | 1.25.13 | 2026-11-08 | MIT |
| `prosemirror-view` (held, see `@tiptap/*` above) | 1.42.9 | 2026-10-31 | MIT |
| `prosemirror-transform` | 1.12.7 | 2026-11-19 | MIT |
| `prosemirror-history`, `-inputrules`, `-schema-list` | 1.5.2, 1.7.0, 1.6.1 | 2026-11-19 | MIT |
| `lib0` | 0.2.120 | 2026-11-09 | MIT |
| `highlight.js` | 11.12.0 | 2026-08-12 | BSD-3 |
| `eslint` (development only) | 10.15.0 | 2026-11-13 | MIT |
| `typescript-eslint` (development only) | 8.74.0 | 2026-11-23 | MIT |
| `golang:1.26` (build stage; Go 1.26.11) | digest `4165ee6bf3b7` | 2026-11-23 | BSD-3 (Go) |
| `postgres:16` (database, backup image; PostgreSQL 16.16) | digest `3950ad7c3148` | 2026-11-23 | PostgreSQL |
| `node:22-bookworm-slim` (web build stage) | digest `e9f565d32859`, the same image as `collab`'s `node:22-slim` | 2026-11-23 | MIT (Node.js) |
| `actions/setup-go` | 7.1.0 | 2026-11-17 | MIT |
| `github/codeql-action` | 4.39.4 | 2026-11-20 | MIT |
| govulncheck | 1.10.0 | 2026-11-17 | BSD-3 |
| GoReleaser | 2.20.3 | 2026-11-20 | MIT |
| syft | 1.57.2 | 2026-11-16 | Apache-2.0 |
| Helm | 4.3.2 | 2026-11-13 | Apache-2.0 |
| Semgrep | 1.186.0 | 2026-11-18 | LGPL-2.1 |

## Exceptions to the base rule

A dependency that fails the base rule of 2026-11-23 stays only by the product owner's decision, recorded here with its reason and when it is looked at again. The verdicts and measurements are in [the dependency review of 2026-11-24](reports/2026-11-24-dependency-review.md).

| Dependency | Rule it fails | Why it stays | Look again | Decided |
|---|---|---|---|---|
| `google/uuid` 1.6.0 | 1: no release since 2024-01-23, no commit in 12 months | It is Google's and has never had an advisory. The standard `uuid` package of Go 1.27 has no name-based v5, which Kenwerk uses at five places and which must not be hand-written. Stays with no change | At every Go release: once the standard library has v5, or Kenwerk no longer needs it, move to the standard package | The product owner, 2026-11-24 |
| `lowlight` 3.3.0 | 1 and 3: last release 2024-12-14, nobody active | It has never had an advisory, it turns code into a syntax tree rather than HTML, and the Tiptap code-block extension needs it; no drop-in replacement exists | Every quarter; drop highlighting or move if it becomes unsafe | The product owner, 2026-11-24 |
| `creachadair/otp` 0.5.6 | 3 and 4: one maintainer, about 20 stars, no Scorecard at the OpenSSF API (6.1 at deps.dev) | Released 2026-11-08, BSD-3, and its root package needs only the standard library, where `pquerna/otp` had nobody active. On **watch** | Every quarter | The product owner, 2026-11-24 |

## Wanted, waiting for the product owner

| What | For | Why it is not here |
|---|---|---|
| An S3 client, such as `minio-go` (Apache-2.0) | ARC-192, ARC-193 | A new module, and the choice for phase 3 is the product owner's |
| A text extractor as a separate program | ORG-025, ARC-126 | A new program to run and to keep up to date |

No Radix or other component library: native HTML elements plus our own CSS were enough, and accessibility is checked with axe.
