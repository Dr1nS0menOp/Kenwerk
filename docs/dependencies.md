# Dependencies

Rule from the product owner (2026-11-04): keep this list as short as possible, to avoid constant security advisories and abandoned code. But never hand-write an important or security-critical part when a widely used, maintained module does the job, unless it lacks a feature we need. Small non-critical code gets written here and adds no dependency.

Rule from the product owner (2026-11-24): every judgement of a dependency includes its OpenSSF Scorecard and a real search for something better (other maintainers, maintained forks, big vendors, the standard library), and all security-critical and architecture-critical dependencies are reviewed together, against the base rule of 2026-11-23: recent releases and commits, advisories fixed fast, an organisation or two active maintainers, widely used with a Scorecard, an allowed licence, and as few modules as possible. Every dependency, direct and transitive, is in [the dependency inventory](dependency-inventory.md); the review and its verdicts are in [the dependency review of 2026-11-24](reports/2026-11-24-dependency-review.md).

Every direct dependency is listed with its licence and the reason it exists. Licences must be MIT, BSD, Apache-2.0 or ISC.

## Backend (Go)

| Module | Licence | Why | Approved |
|---|---|---|---|
| `jackc/pgx` | MIT | PostgreSQL driver | Blueprint 04 |
| `nats-io/nats.go`, `nats-server` | Apache-2.0 | Message queue, embedded for small installs | Blueprint 04 |
| `google/uuid` | BSD-3 | UUIDv7 ids | Blueprint 05 |
| `golang.org/x/crypto` | BSD-3 | Argon2id password hashing | Blueprint 06 |
| `coreos/go-oidc`, `golang.org/x/oauth2` | Apache-2.0, BSD-3 | OIDC login. Token verification must not be hand-written. | Blueprint 04 |
| `go-webauthn/webauthn` | BSD-3 | Passkeys. Far too intricate to write ourselves. | Blueprint 04 |
| `pquerna/otp` | Apache-2.0 | TOTP codes and the QR code for enrolment. Replaced the planned hand-written TOTP and the frontend QR library. | The product owner, 2026-11-04 |
| `yuin/goldmark` | MIT | Markdown parser, no dependencies of its own | The product owner, 2026-11-04 |
| `golang.org/x/net/html` | BSD-3 | HTML import. Parsing hostile HTML must not be hand-written. | The product owner, ADR-026 |
| `go.yaml.in/yaml/v3` 3.0.6 | MIT and Apache-2.0, read from its `LICENSE` and `NOTICE` | The configuration file (spec 056). Parsing YAML must not be hand-written. The maintained successor of the archived `gopkg.in/yaml.v3`; it needs no other module, and was already in the build through a test library | The product owner, ADR-040; spec 048 D4 |
| `go.opentelemetry.io/otel`, `otel/trace`, `otel/sdk`, `otel/exporters/otlp/otlptrace/otlptracehttp` 1.47.0 | Apache-2.0, read from each module's `LICENSE` | Traces over OTLP (spec 060), off by default. The official SDK: the wire format and batching must not be hand-written. No contrib modules (`otelhttp`, `otelpgx`): the middleware, query tracer and NATS headers are our own few lines, so no attribute is added that spec 060 D6 forbids. They bring `go.opentelemetry.io/otel/metric`, `otel/log`, `otel/exporters/otlp/otlptrace`, `go.opentelemetry.io/auto/sdk` (Apache-2.0), `go.opentelemetry.io/proto/otlp` (Apache-2.0), `google.golang.org/protobuf` (BSD-3), `google.golang.org/grpc` and `google.golang.org/genproto/googleapis/api` and `/rpc` (Apache-2.0), `grpc-ecosystem/grpc-gateway/v2` (BSD-3), `go-logr/logr` and `go-logr/stdr` (Apache-2.0), `cenkalti/backoff/v5` (MIT), `cespare/xxhash/v2` (MIT): the OTLP protocol package links its gRPC stubs even for HTTP. Each licence read from the module's own file | The product owner, ADR-040; spec 048 D5 |
| `modelcontextprotocol/go-sdk` 1.8.0 | MIT for its existing code, Apache-2.0 for new contributions, read from its `LICENSE` | The Model Context Protocol for `kenwerk mcp` (spec 096, wave MC3): the official SDK, which speaks revision 2026-07-28 and the older ones. The protocol's framing, versions and life cycle are not ours to keep up with by hand. It brings `google/jsonschema-go` 0.4.3 (MIT), which also checks the arguments of every tool against its schema, `yosida95/uritemplate/v3` (BSD-3), and `segmentio/encoding` and `segmentio/asm` (MIT); and it links `golang-jwt/jwt/v5` (MIT), which was already in the module graph, for its OAuth helpers. Each licence read from the module's own file | The product owner, 2026-11-22 (spec 096, question 2) |
| `golang.org/x/text/unicode/norm` | BSD-3 | Unicode NFC for passwords (SEC-107). It was already in the build through other modules; only its listing is new. Unicode tables must not be hand-written. | Spec 035 |

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
| `@hocuspocus/server` 4.8.0, `@hocuspocus/common` 4.8.0 | MIT, read from each package | The WebSocket server for Yjs | ADR-026 |
| `yjs` 13.6.33, `y-protocols` 1.0.7, `lib0` 0.2.119 | MIT | The shared document | ADR-026 |
| `crossws` 0.4.17, `async-mutex` 0.5.0, `isomorphic.js` 0.2.5, `kleur` 4.1.5 | MIT | Come with Hocuspocus | ADR-026 |
| `tslib` 2.9.1 | 0BSD | Comes with `async-mutex` | ADR-026 |

## Release tools (CI only, never in the product)

They build, list and sign a release in `.github/workflows/release.yml` and the CI job `release-dry-run` (spec 057). Nothing of them ends up in the binary, the packages or the image. Each is pinned by version, and each action by commit SHA.

| Tool | Licence | Why | Approved |
|---|---|---|---|
| GoReleaser 2.20.1 (OSS), with nFPM | MIT, read from its `LICENSE.md` | Archives, `.deb` and `.rpm`, checksums | The product owner, ADR-040 |
| cosign 3.1.4 | Apache-2.0 | Keyless Sigstore signatures of `checksums.txt` and the image | Spec 048 D7 |
| syft 1.57.1 | Apache-2.0 | The SBOMs in SPDX and CycloneDX | Spec 048, OPS-094 |
| `actions/attest-build-provenance` 4.2.2 | MIT | SLSA provenance through GitHub | Spec 048, OPS-094 |

## Deployment checks (CI only, never in the product)

They check the deployment templates in `scripts/deploy-check.sh` and the CI job `deploy` (spec 099), and the release workflow publishes the Helm chart with the same `helm`. Nothing of them ends up in the binary, the packages or the images. Each is pinned by version and sha256 in the script; cfn-lint and its packages by hash in `scripts/deploy-check/cfn-lint.txt`. An operator who deploys with a template uses the platform's own tools, which are theirs to choose.

| Tool | Licence | Why | Approved |
|---|---|---|---|
| Helm 4.3.1 | Apache-2.0 | `helm lint`, `helm template`, and packaging and pushing the chart | Spec 099 D15 |
| kubeconform 0.8.0 | Apache-2.0 | The rendered chart against the schemas of Kubernetes 1.33 | Spec 099 D15 |
| Bicep 0.48.1 | MIT | `bicep lint`, and building `azuredeploy.json` | Spec 099 D15 |
| OpenTofu 1.13.8 | MPL-2.0 | `tofu validate` and `fmt` of the module and examples | The coordinator allowed MPL-2.0 for these CLIs; spec 099 D16 |
| Terraform 1.5.7 | MPL-2.0 | The same with Terraform. The last MPL-2.0 release: later ones are BUSL-1.1, which is not allowed | As above |
| `hashicorp/helm`, `kubernetes`, `random`, `google` providers | MPL-2.0 | Downloaded by `init` so `validate` can check the module and examples | Decided on the product owner's behalf, spec 099 D16, may be overruled |
| cfn-lint 1.60.0, with jsonpatch, jsonpointer, networkx (BSD-3-Clause), mpmath, sympy (BSD), PyYAML (MIT), regex (Apache-2.0 and CNRI-Python), typing_extensions (PSF-2.0) | MIT-0 | The CloudFormation template, with warnings as failures | As above: MIT-0 and PSF-2.0 are permissive, but not on the list |

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
| Message bus for jobs | PostgreSQL | Imports and periodic tasks use a table with `SKIP LOCKED`. One moving part fewer than a second NATS consumer. Events still go through the outbox and NATS. |

## Frontend (npm)

See `web/package.json`. The list and its reasons are below, and `scripts/check-licenses.sh` fails the build on a licence outside the allow-list.

| Package | Licence | Why | Approved |
|---|---|---|---|
| `react`, `react-dom` | MIT | UI | Blueprint 04 |
| `@tanstack/react-query` | MIT | Server state and caching | Blueprint 04 |
| `@tanstack/react-router` | MIT | Routing | Blueprint 04 |
| `@tiptap/*` | MIT | Editor, on ProseMirror (MIT) | Blueprint 04 |
| `yjs` 13.6.33 | MIT | The shared document that merges by itself | ADR-026 |
| `@tiptap/extension-collaboration` 3.32.2, `@tiptap/extension-collaboration-caret` 3.32.2, `@tiptap/y-tiptap` 3.2.0 | MIT, read from each package | Connect the editor to Yjs, with cursors and an undo per person. Pinned together with TipTap | ADR-026 |
| `@hocuspocus/provider` 4.8.0 | MIT, read from the package | Talks to the service | ADR-026 |
| `y-indexeddb` 9.0.12 | MIT | Keeps typing safe offline | ADR-026 |
| `y-protocols` 1.0.7, `lib0` 0.2.119 | MIT | Come with Yjs | ADR-026 |
| `@tiptap/suggestion` | MIT | The menus at the cursor for `/` and `:`. Its helper for placing a popup, `@floating-ui/dom`, was already there through `@tiptap/react`. | The product owner, 2026-11-05 |
| `i18next`, `react-i18next` | MIT | Translation framework | Blueprint 04 |
| `lowlight`, `highlight.js` | MIT, BSD-3 | Colours in code blocks | The product owner, 2026-11-04 |

Development only: `vite`, `typescript`, `vitest`, `eslint`, `prettier`, `@playwright/test`, `@axe-core/playwright`, all named in blueprint 09.

| Package (development only) | Licence | Why | Approved |
|---|---|---|---|
| `@stryker-mutator/core` 10.1.1, `@stryker-mutator/vitest-runner` 10.1.1 | Apache-2.0, read from each package | Mutation testing of the frontend logic (`make mutation-web`, spec 097): it proves the unit tests catch changed code, which coverage cannot. Writing a mutation tester ourselves would be a large, non-critical project. They bring 157 packages, all development only and never in a build: MIT, Apache-2.0, ISC, BSD and 0BSD, apart from `caniuse-lite` (CC-BY-4.0, browser data, through Babel). Pinned exactly, installed with `npm install --before` a date two weeks back | The product owner, 2026-11-21 (wave QG1) |

## Quality tools (make check and CI only, never in the product)

Run as separate programs with `go run module@version`, so the Go checksum database verifies every module they are built from, as for staticcheck and govulncheck. Nothing of them is linked into Kenwerk or shipped. Spec 097 says what each catches.

| Tool | Licence | Why | Approved |
|---|---|---|---|
| golangci-lint 2.15.0 | GPL-3.0, read from its `LICENSE` | Runs gocyclo (BSD-3), funlen (MIT), dupl (MIT) and gosec (Apache-2.0) with one configuration, `.golangci.yml`, and one JSON report for the ratchet. A GPL tool called as a separate process is allowed by blueprint 02; it never touches our code's licence | The product owner, 2026-11-21 (wave QG1) |
| gitleaks 8.30.1 | MIT, read from its `LICENSE` | The secret scan of the working tree and of every commit, with `.gitleaks.toml` | The product owner, 2026-11-21 (wave QG1) |

## Wanted, waiting for the product owner

| What | For | Why it is not here |
|---|---|---|
| An S3 client, such as `minio-go` (Apache-2.0) | ARC-192, ARC-193 | A new module, and the choice for phase 3 is the product owner's |
| A text extractor as a separate program | ORG-025, ARC-126 | A new program to run and to keep up to date |

No Radix or other component library: native HTML elements plus our own CSS were enough, and accessibility is checked with axe.
