# Dependency inventory

Written for: the product owner, operators and auditors who want to see every dependency of Kenwerk in one place.

Every dependency, direct and transitive: Go modules, the npm packages of the web frontend and of the service for editing together, container images, GitHub Actions and the CI tools. 553 rows, 129 of them critical. Measured on 2026-11-24.

This file is generated. Do not edit it by hand: run `scripts/dev node scripts/dependency-inventory.mjs` in the development toolbox, which needs the network, and commit the result. How each critical dependency is judged, and the verdict on each, is in [the dependency review of 2026-11-24](reports/2026-11-24-dependency-review.md); why each direct dependency exists is in [dependencies.md](dependencies.md).

The columns:

- **Direct, or through**: `direct` when Kenwerk names it itself, otherwise the dependency that brings it in first (for npm, the package that requires it; for Go, the first module on the shortest path in `go mod graph`).
- **Critical**: `security` for code that handles logins, sessions, tokens, cryptography, untrusted input, user content, the database, the queue or secrets in CI; `architecture` for what is hard to replace once built in. Only what ships or builds a release can be critical; development tools are `no`.
- **Used in**: `binary` is compiled into `kenwerk`; `tests and tools` is built only for tests or a command under `cmd/`; `module graph only` is named in the Go module graph and never built. `development only` npm packages never reach a build.
- **Last release**: the date and version of the newest release (deps.dev, Docker Hub for an image tag, GitHub for an action), which may be newer than the version used.
- **Scorecard**: the OpenSSF Scorecard of the source repository, from api.securityscorecards.dev, or from deps.dev when the first has none; `none` when neither has one. A score is of the repository, so packages from one repository share it.
- Licences come from deps.dev and the npm lock files; `scripts/check-licenses.mjs` is the gate that holds them to the allow-list.

This file lists no advisories. Known vulnerabilities are checked on every change by govulncheck and `npm audit` (`make check` and CI), and the images by Trivy in CI.

## Go modules

96 rows.

| Name | Version | Licence | Direct, or through | Critical | Used in | Last release | Scorecard |
|---|---|---|---|---|---|---|---|
| `cel.dev/expr` | v0.25.3 | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2026-10-27 (v0.26.0) | none |
| `cloud.google.com/go/compute/metadata` | v0.9.0 | Apache-2.0 | golang.org/x/oauth2 | no | module graph only | 2026-09-24 (v0.10.0) | 8.5 |
| `github.com/antithesishq/antithesis-sdk-go` | v0.9.0-default-no-op | MIT, BSD-3-Clause | github.com/nats-io/nats-server/v2 | no | binary | 2026-11-10 (v0.9.0) | 3.3 |
| `github.com/boombuler/barcode` | v1.1.1 | MIT | github.com/pquerna/otp | no | binary | 2026-11-22 (v1.1.1) | 5.3 |
| `github.com/BurntSushi/toml` | v1.4.1-0.20240526193622-a339e1f7089c | MIT | github.com/grpc-ecosystem/grpc-gateway/v2 | no | module graph only | 2025-12-18 (v1.6.0) | 5.6 |
| `github.com/cenkalti/backoff/v5` | v5.0.3 | MIT | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | no | binary | 2025-07-23 (v5.0.3) | 5.5 |
| `github.com/cespare/xxhash/v2` | v2.3.0 | MIT | go.opentelemetry.io/otel | no | binary | 2024-04-04 (v2.3.0) | 3 |
| `github.com/cncf/xds/go` | v0.0.0-20260202195803-dba9d589def2 | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2026-02-02 (v0.0.0-20260202195803-dba9d589def2) | 4.1 |
| `github.com/coreos/go-oidc/v3` | v3.21.0 | Apache-2.0 | direct | security | binary | 2026-09-01 (v3.21.0) | 4.1 |
| `github.com/davecgh/go-spew` | v1.1.1 | ISC | github.com/jackc/pgx/v5 | no | module graph only | 2018-02-21 (v1.1.1) | 2.9 |
| `github.com/envoyproxy/go-control-plane` | v0.14.0 | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2025-11-04 (v0.14.0) | 6.7 |
| `github.com/envoyproxy/go-control-plane/envoy` | v1.39.1-0.20260819172001-e6e3fd93e4be | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2026-10-13 (v1.40.0) | 6.7 |
| `github.com/envoyproxy/go-control-plane/ratelimit` | v0.1.0 | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2024-12-23 (v0.1.0) | 6.7 |
| `github.com/envoyproxy/protoc-gen-validate` | v1.3.3 | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2026-02-18 (v1.3.3) | 5.2 |
| `github.com/fxamacker/cbor/v2` | v2.10.0 | MIT | github.com/go-webauthn/webauthn | security | binary | 2026-10-28 (v2.10.0) | 8.8 |
| `github.com/go-jose/go-jose/v4` | v4.1.9 | Apache-2.0, BSD-3-Clause | github.com/coreos/go-oidc/v3 | security | binary | 2026-11-05 (v4.1.9) | 6.6 |
| `github.com/go-logr/logr` | v1.4.4 | Apache-2.0 | go.opentelemetry.io/otel | no | binary | 2026-07-20 (v1.4.4) | 8.2 |
| `github.com/go-logr/stdr` | v1.2.2 | Apache-2.0 | go.opentelemetry.io/otel | no | binary | 2021-12-14 (v1.2.2) | 3.3 |
| `github.com/go-quicktest/qt` | v1.101.0 | MIT | github.com/antithesishq/antithesis-sdk-go | no | module graph only | 2024-03-01 (v1.102.0) | 3.8 |
| `github.com/go-viper/mapstructure/v2` | v2.5.0 | MIT | github.com/go-webauthn/webauthn | no | binary | 2026-01-12 (v2.5.0) | 6.7 |
| `github.com/go-webauthn/webauthn` | v0.18.2 | BSD-3-Clause | direct | security | binary | 2026-09-19 (v0.18.2) | 8.5 |
| `github.com/go-webauthn/x` | v0.3.1 | BSD-3-Clause, ISC, BSD-2-Clause | github.com/go-webauthn/webauthn | security | binary | 2026-11-18 (v0.4.1) | 7.4 |
| `github.com/golang-jwt/jwt/v5` | v5.3.1 | MIT | github.com/go-webauthn/webauthn | security | binary | 2026-01-28 (v5.3.1) | 8.2 |
| `github.com/golang/glog` | v1.2.5 | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2025-04-29 (v1.2.5) | 3 |
| `github.com/golang/protobuf` | v1.5.4 | BSD-3-Clause | google.golang.org/grpc | no | module graph only | 2024-03-06 (v1.5.4) | 4.2 |
| `github.com/google/go-cmp` | v0.7.0 | BSD-3-Clause | github.com/google/jsonschema-go | no | module graph only | 2025-01-14 (v0.7.0) | 8.3 |
| `github.com/google/go-tpm` | v0.9.8 | Apache-2.0 | github.com/go-webauthn/webauthn | security | binary | 2025-12-29 (v0.9.8) | 6.7 |
| `github.com/google/go-tpm-tools` | v0.3.13-0.20230620182252-4639ecce2aba | Apache-2.0, BSD-3-Clause, BSD-2-Clause | github.com/google/go-tpm | no | module graph only | 2026-10-09 (v0.4.11) | 7.6 |
| `github.com/google/jsonschema-go` | v0.4.3 | MIT | direct | security | binary | 2026-04-17 (v0.4.3) | none |
| `github.com/google/uuid` | v1.6.0 | BSD-3-Clause | direct | architecture | binary | 2024-01-23 (v1.6.0) | 6.9 |
| `github.com/GoogleCloudPlatform/opentelemetry-operations-go/detectors/gcp` | v1.35.0 | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2026-11-17 (v1.39.0) | 7.9 |
| `github.com/grpc-ecosystem/grpc-gateway/v2` | v2.34.0 | BSD-3-Clause | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | no | binary | 2026-11-16 (v2.34.0) | 7.1 |
| `github.com/jackc/pgpassfile` | v1.0.0 | MIT | github.com/jackc/pgx/v5 | no | binary | 2019-03-30 (v1.0.0) | 2 |
| `github.com/jackc/pgservicefile` | v0.0.0-20240606120523-5a60cdf6a761 | MIT | github.com/jackc/pgx/v5 | no | binary | 2024-06-06 (v0.0.0-20240606120523-5a60cdf6a761) | 3 |
| `github.com/jackc/pgx/v5` | v5.13.0 | MIT | direct | security, architecture | binary | 2026-11-11 (v5.13.0) | 5.3 |
| `github.com/jackc/puddle/v2` | v2.2.4 | MIT | github.com/jackc/pgx/v5 | no | binary | 2026-11-16 (v2.2.4) | 3.4 |
| `github.com/klauspost/compress` | v1.20.5 | BSD-3-Clause, Apache-2.0, MIT | github.com/nats-io/nats-server/v2 | no | binary | 2026-11-19 (v1.20.5) | 7.5 |
| `github.com/kr/pretty` | v0.3.1 | MIT | github.com/jackc/pgx/v5 | no | module graph only | 2022-08-29 (v0.3.1) | 3.8 |
| `github.com/kr/text` | v0.2.0 | MIT | github.com/antithesishq/antithesis-sdk-go | no | module graph only | 2020-02-14 (v0.2.0) | 3.3 |
| `github.com/minio/highwayhash` | v1.0.4 | Apache-2.0 | github.com/nats-io/nats-server/v2 | no | binary | 2025-10-30 (v1.0.4) | 3.7 |
| `github.com/modelcontextprotocol/go-sdk` | v1.8.0 | Apache-2.0, MIT, CC-BY-4.0 | direct | security, architecture | binary | 2026-09-04 (v1.8.0) | 9.4 |
| `github.com/nats-io/jwt/v2` | v2.8.3 | Apache-2.0 | github.com/nats-io/nats-server/v2 | security | binary | 2026-11-06 (v2.8.3) | 4.4 |
| `github.com/nats-io/nats-server/v2` | v2.15.3 | Apache-2.0 | direct | security, architecture | binary | 2026-11-11 (v2.15.3) | 7.6 |
| `github.com/nats-io/nats.go` | v1.56.0 | Apache-2.0 | direct | security, architecture | binary | 2026-11-17 (v1.56.0) | 6.6 |
| `github.com/nats-io/nkeys` | v0.4.17 | Apache-2.0 | github.com/nats-io/nats-server/v2 | security | binary | 2026-11-05 (v0.4.17) | 5.1 |
| `github.com/nats-io/nuid` | v1.0.1 | Apache-2.0 | github.com/nats-io/nats-server/v2 | no | binary | 2019-04-10 (v1.0.1) | 3.6 |
| `github.com/philhofer/fwd` | v1.2.1 | MIT | github.com/go-webauthn/webauthn | no | binary | 2026-10-16 (v1.2.1) | 3.4 |
| `github.com/planetscale/vtprotobuf` | v0.6.1-0.20240319094008-0393e58bdf10 | BSD-3-Clause, MIT | google.golang.org/grpc | no | module graph only | 2024-01-29 (v0.6.0) | 5.5 |
| `github.com/pmezard/go-difflib` | v1.0.0 | BSD-3-Clause | github.com/jackc/pgx/v5 | no | module graph only | 2016-01-10 (v1.0.0) | 2.1 |
| `github.com/pquerna/otp` | v1.5.0 | Apache-2.0 | direct | security | binary | 2024-12-31 (v1.5.0) | 2.9 |
| `github.com/rogpeppe/go-internal` | v1.11.0 | BSD-3-Clause | github.com/antithesishq/antithesis-sdk-go | no | module graph only | 2026-07-01 (v1.16.0) | 4.7 |
| `github.com/segmentio/asm` | v1.1.3 | MIT | github.com/modelcontextprotocol/go-sdk | no | binary | 2023-11-07 (v1.2.1) | 4.9 |
| `github.com/segmentio/encoding` | v0.5.4 | MIT, Apache-2.0 | github.com/modelcontextprotocol/go-sdk | security | binary | 2026-03-10 (v0.5.4) | 4.2 |
| `github.com/spiffe/go-spiffe/v2` | v2.8.1 | Apache-2.0 | google.golang.org/grpc | no | module graph only | 2026-10-05 (v2.9.0) | 5.7 |
| `github.com/stretchr/objx` | v0.1.0 | MIT | github.com/stretchr/testify | no | module graph only | 2026-10-14 (v0.8.0) | 6.7 |
| `github.com/stretchr/testify` | v1.12.1 | MIT, BSD-3-Clause, ISC | github.com/go-webauthn/webauthn | no | module graph only | 2026-08-17 (v1.12.1) | 6.2 |
| `github.com/tinylib/msgp` | v1.6.5 | MIT | github.com/go-webauthn/webauthn | no | binary | 2026-09-30 (v1.6.5) | 6.1 |
| `github.com/x448/float16` | v0.8.4 | MIT | github.com/go-webauthn/webauthn | no | binary | 2020-01-17 (v0.8.4) | 8.5 |
| `github.com/yosida95/uritemplate/v3` | v3.0.2 | BSD-3-Clause | github.com/modelcontextprotocol/go-sdk | no | binary | 2022-04-19 (v3.0.2) | 2.6 |
| `github.com/yuin/goldmark` | v1.8.7 | MIT | direct | security | binary | 2026-10-30 (v1.8.7) | 4.5 |
| `Go toolchain and standard library` | go1.26.11 | BSD-3-Clause | direct | security, architecture | binary | see go.dev/doc/devel/release | 6.2 |
| `go.opentelemetry.io/auto/sdk` | v1.2.2 | Apache-2.0 | go.opentelemetry.io/otel | no | binary | 2026-11-20 (v1.2.2) | 7.9 |
| `go.opentelemetry.io/contrib/detectors/gcp` | v1.45.0 | Apache-2.0, BSD-3-Clause | google.golang.org/grpc | no | module graph only | 2026-10-02 (v1.47.0) | 9.2 |
| `go.opentelemetry.io/otel` | v1.47.0 | Apache-2.0, BSD-3-Clause | direct | architecture | binary | 2026-10-02 (v1.47.0) | 9.4 |
| `go.opentelemetry.io/otel/exporters/otlp/otlptrace` | v1.47.0 | Apache-2.0, BSD-3-Clause | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | architecture | binary | 2026-10-02 (v1.47.0) | 9.4 |
| `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp` | v1.47.0 | Apache-2.0, BSD-3-Clause | direct | architecture | binary | 2026-10-02 (v1.47.0) | 9.4 |
| `go.opentelemetry.io/otel/log` | v1.47.0 | Apache-2.0, BSD-3-Clause | go.opentelemetry.io/otel | architecture | binary | 2026-10-02 (v1.47.0) | 9.4 |
| `go.opentelemetry.io/otel/metric` | v1.47.0 | Apache-2.0, BSD-3-Clause | go.opentelemetry.io/otel | architecture | binary | 2026-10-02 (v1.47.0) | 9.4 |
| `go.opentelemetry.io/otel/sdk` | v1.47.0 | Apache-2.0, BSD-3-Clause | direct | architecture | binary | 2026-10-02 (v1.47.0) | 9.4 |
| `go.opentelemetry.io/otel/sdk/metric` | v1.47.0 | Apache-2.0, BSD-3-Clause | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | no | module graph only | 2026-10-02 (v1.47.0) | 9.4 |
| `go.opentelemetry.io/otel/trace` | v1.47.0 | Apache-2.0, BSD-3-Clause | direct | architecture | binary | 2026-10-02 (v1.47.0) | 9.4 |
| `go.opentelemetry.io/proto/otlp` | v1.11.1 | Apache-2.0 | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | no | binary | 2026-09-30 (v1.11.1) | 8.7 |
| `go.uber.org/goleak` | v1.3.0 | MIT | go.opentelemetry.io/otel/sdk | no | module graph only | 2023-10-24 (v1.3.0) | 7.1 |
| `go.uber.org/mock` | v0.6.0 | Apache-2.0 | github.com/go-webauthn/webauthn | no | module graph only | 2025-08-18 (v0.6.0) | none |
| `go.yaml.in/yaml/v3` | v3.0.6 | MIT, Apache-2.0 | direct | security | binary | 2026-10-13 (v3.0.6) | none |
| `go.yaml.in/yaml/v4` | v4.0.0 | Apache-2.0 | github.com/grpc-ecosystem/grpc-gateway/v2 | no | module graph only | 2026-11-04 (v4.0.0) | none |
| `golang.org/x/crypto` | v0.59.0 | BSD-3-Clause | direct | security | binary | 2026-11-11 (v0.59.0) | 5 |
| `golang.org/x/exp` | v0.0.0-20261113113407-e3970619a1a4 | BSD-3-Clause | github.com/grpc-ecosystem/grpc-gateway/v2 | no | module graph only | 2026-11-24 (v0.0.0-20261124000051-d6646c509b6d) | 6 |
| `golang.org/x/exp/typeparams` | v0.0.0-20231108232855-2478ac86f678 | BSD-3-Clause | github.com/grpc-ecosystem/grpc-gateway/v2 | no | module graph only | 2026-11-24 (v0.0.0-20261124000051-d6646c509b6d) | no source repository known |
| `golang.org/x/mod` | v0.42.0 | BSD-3-Clause | golang.org/x/text | no | module graph only | 2026-11-09 (v0.43.0) | 5.2 |
| `golang.org/x/net` | v0.63.0 | BSD-3-Clause | direct | security | binary | 2026-11-17 (v0.63.0) | 5.5 |
| `golang.org/x/oauth2` | v0.38.0 | BSD-3-Clause | direct | security | binary | 2026-11-06 (v0.38.0) | 3.8 |
| `golang.org/x/sync` | v0.25.0 | BSD-3-Clause | github.com/jackc/pgx/v5 | no | binary | 2026-10-15 (v0.25.0) | 3.8 |
| `golang.org/x/sys` | v0.50.0 | BSD-3-Clause | github.com/go-webauthn/webauthn | no | binary | 2026-11-06 (v0.50.0) | 5.5 |
| `golang.org/x/term` | v0.48.0 | BSD-3-Clause | golang.org/x/crypto | no | module graph only | 2026-11-09 (v0.48.0) | 4 |
| `golang.org/x/text` | v0.44.0 | BSD-3-Clause | direct | security | binary | 2026-11-09 (v0.44.0) | 5 |
| `golang.org/x/time` | v0.16.0 | BSD-3-Clause | github.com/modelcontextprotocol/go-sdk | no | binary | 2026-08-19 (v0.16.0) | 3.5 |
| `golang.org/x/tools` | v0.52.1-0.20261106145633-d407941a339a | BSD-3-Clause | github.com/modelcontextprotocol/go-sdk | no | module graph only | 2026-11-17 (v0.53.0) | 5.9 |
| `gonum.org/v1/gonum` | v0.17.0 | BSD-3-Clause | google.golang.org/grpc | no | module graph only | 2025-12-29 (v0.17.0) | 5.7 |
| `google.golang.org/genproto/googleapis/api` | v0.0.0-20261123191846-1e707ab9fbc2 | Apache-2.0 | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | no | binary | 2026-11-23 (v0.0.0-20261123191846-1e707ab9fbc2) | 8.1 |
| `google.golang.org/genproto/googleapis/rpc` | v0.0.0-20261123191846-1e707ab9fbc2 | Apache-2.0 | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | no | binary | 2026-11-23 (v0.0.0-20261123191846-1e707ab9fbc2) | 8.1 |
| `google.golang.org/grpc` | v1.85.0 | Apache-2.0 | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | no | binary | 2026-10-27 (v1.85.0) | 8.5 |
| `google.golang.org/protobuf` | v1.36.12 | BSD-3-Clause | go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | no | binary | 2026-08-10 (v1.36.12) | 5.6 |
| `gopkg.in/check.v1` | v1.0.0-20201130134442-10cb98267c6c | BSD-2-Clause | github.com/jackc/pgx/v5 | no | module graph only | 2020-11-30 (v1.0.0-20201130134442-10cb98267c6c) | 3.4 |
| `gopkg.in/yaml.v3` | v3.0.1 | MIT, Apache-2.0 | github.com/jackc/pgx/v5 | no | module graph only | 2022-05-27 (v3.0.1) | 3.8 |
| `honnef.co/go/tools` | v0.8.2 | MIT, BSD-3-Clause | github.com/grpc-ecosystem/grpc-gateway/v2 | no | module graph only | 2026-10-12 (v0.8.2) | 5.4 |

## npm packages of the web frontend (`web/package-lock.json`)

400 rows.

| Name | Version | Licence | Direct, or through | Critical | Used in | Last release | Scorecard |
|---|---|---|---|---|---|---|---|
| `@axe-core/playwright` | 4.14.0 | MPL-2.0 | direct | no | web, development only | 2026-10-15 (4.14.0) | 7.1 |
| `@babel/code-frame` | 8.0.6 | MIT | @babel/core | no | web, development only | 2026-09-18 (8.0.6) | 6.8 |
| `@babel/compat-data` | 8.0.5 | MIT | @babel/helper-compilation-targets | no | web, development only | 2026-11-11 (8.1.2) | 6.8 |
| `@babel/core` | 8.0.10 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/generator` | 8.0.10 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/generator` | 8.1.0 | MIT | @babel/traverse | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/helper-annotate-as-pure` | 8.0.0 | MIT | @babel/helper-create-class-features-plugin | no | web, development only | 2026-05-25 (7.29.7) | 6.8 |
| `@babel/helper-compilation-targets` | 8.0.7 | MIT | @babel/core | no | web, development only | 2026-10-07 (8.0.7) | 6.8 |
| `@babel/helper-create-class-features-plugin` | 8.0.10 | MIT | @babel/plugin-proposal-decorators | no | web, development only | 2026-10-29 (8.0.10) | 6.8 |
| `@babel/helper-globals` | 8.0.6 | MIT | @babel/traverse | no | web, development only | 2026-09-18 (8.0.6) | 6.8 |
| `@babel/helper-member-expression-to-functions` | 8.0.5 | MIT | @babel/helper-create-class-features-plugin | no | web, development only | 2026-11-11 (8.1.2) | 6.8 |
| `@babel/helper-module-imports` | 8.0.0 | MIT | @babel/plugin-transform-react-jsx | no | web, development only | 2026-05-25 (7.29.7) | 6.8 |
| `@babel/helper-module-transforms` | 8.1.0 | MIT | @babel/plugin-transform-modules-commonjs | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/helper-optimise-call-expression` | 8.0.0 | MIT | @babel/helper-create-class-features-plugin | no | web, development only | 2026-05-25 (7.29.7) | 6.8 |
| `@babel/helper-plugin-utils` | 8.0.1 | MIT | @babel/plugin-proposal-decorators | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/helper-replace-supers` | 8.0.1 | MIT | @babel/helper-create-class-features-plugin | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/helper-skip-transparent-expression-wrappers` | 8.1.0 | MIT | @babel/helper-create-class-features-plugin | no | web, development only | 2026-11-02 (8.1.0) | 6.8 |
| `@babel/helper-string-parser` | 8.0.8 | MIT | @babel/types | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/helper-validator-identifier` | 8.0.6 | MIT | @babel/code-frame | no | web, development only | 2026-09-18 (8.0.6) | 6.8 |
| `@babel/helper-validator-option` | 8.0.0 | MIT | @babel/preset-react | no | web, development only | 2026-05-25 (7.29.7) | 6.8 |
| `@babel/helpers` | 8.1.0 | MIT | @babel/core | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/parser` | 8.0.10 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/parser` | 8.1.0 | MIT | @babel/traverse | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/plugin-proposal-decorators` | 8.0.2 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-06-18 (8.0.2) | 6.8 |
| `@babel/plugin-syntax-decorators` | 8.0.1 | MIT | @babel/plugin-proposal-decorators | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/plugin-syntax-jsx` | 8.0.1 | MIT | @babel/plugin-transform-react-jsx | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/plugin-syntax-typescript` | 8.0.3 | MIT | @babel/plugin-transform-typescript | no | web, development only | 2026-06-27 (8.0.3) | 6.8 |
| `@babel/plugin-transform-destructuring` | 8.0.5 | MIT | @babel/plugin-transform-explicit-resource-management | no | web, development only | 2026-09-10 (8.0.5) | 6.8 |
| `@babel/plugin-transform-explicit-resource-management` | 8.0.5 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/plugin-transform-modules-commonjs` | 8.0.1 | MIT | @babel/preset-typescript | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/plugin-transform-react-display-name` | 8.0.1 | MIT | @babel/preset-react | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/plugin-transform-react-jsx` | 8.0.1 | MIT | @babel/preset-react | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/plugin-transform-react-jsx-development` | 8.0.1 | MIT | @babel/preset-react | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/plugin-transform-react-pure-annotations` | 8.0.1 | MIT | @babel/preset-react | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/plugin-transform-typescript` | 8.0.6 | MIT | @babel/preset-typescript | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/preset-react` | 8.0.1 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-06-17 (8.0.1) | 6.8 |
| `@babel/preset-typescript` | 8.0.7 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-10-07 (8.0.7) | 6.8 |
| `@babel/runtime` | 7.29.13 | MIT | react-i18next | no | web | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/template` | 8.0.0 | MIT | @babel/core | no | web, development only | 2026-11-11 (8.1.2) | 6.8 |
| `@babel/traverse` | 8.0.10 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/traverse` | 8.1.0 | MIT | @babel/helper-module-transforms | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@babel/types` | 8.1.0 | MIT | @babel/core | no | web, development only | 2026-11-20 (8.1.3) | 6.8 |
| `@cacheable/memory` | 2.2.0 | MIT | cacheable | no | web, development only | 2026-06-27 (2.2.0) | none |
| `@cacheable/utils` | 2.5.0 | MIT | cacheable | no | web, development only | 2026-06-27 (2.5.0) | none |
| `@eslint-community/eslint-utils` | 4.10.1 | MIT | eslint | no | web, development only | 2026-07-22 (4.10.1) | none |
| `@eslint-community/regexpp` | 4.12.2 | MIT | eslint | no | web, development only | 2026-11-08 (4.12.3) | none |
| `@eslint/config-array` | 0.23.6 | Apache-2.0 | eslint | no | web, development only | 2026-11-13 (0.23.6) | none |
| `@eslint/config-helpers` | 0.7.0 | Apache-2.0 | eslint | no | web, development only | 2026-07-21 (0.7.0) | none |
| `@eslint/core` | 1.2.1 | Apache-2.0 | eslint | no | web, development only | 2026-04-08 (1.2.1) | none |
| `@eslint/object-schema` | 3.0.5 | Apache-2.0 | @eslint/config-array | no | web, development only | 2026-04-08 (3.0.5) | none |
| `@eslint/plugin-kit` | 0.7.3 | Apache-2.0 | eslint | no | web, development only | 2026-09-03 (0.7.3) | none |
| `@floating-ui/core` | 1.8.0 | MIT | @floating-ui/dom | no | web | 2026-07-11 (1.8.0) | none |
| `@floating-ui/dom` | 1.8.0 | MIT | @tiptap/extension-bubble-menu | no | web | 2026-07-11 (1.8.0) | none |
| `@floating-ui/utils` | 0.2.12 | MIT | @floating-ui/dom | no | web | 2026-07-11 (0.2.12) | none |
| `@hocuspocus/common` | 4.9.0 | MIT | @hocuspocus/provider | security, architecture | web | 2026-11-20 (4.9.0) | none |
| `@hocuspocus/provider` | 4.9.0 | MIT | direct | security, architecture | web | 2026-11-20 (4.9.0) | none |
| `@humanfs/core` | 0.19.2 | Apache-2.0 | @humanfs/node | no | web, development only | 2026-09-10 (0.20.0) | none |
| `@humanfs/node` | 0.16.8 | Apache-2.0 | eslint | no | web, development only | 2026-09-10 (0.17.0) | none |
| `@humanfs/types` | 0.15.0 | Apache-2.0 | @humanfs/node | no | web, development only | 2026-09-10 (0.16.0) | none |
| `@humanwhocodes/module-importer` | 1.0.1 | Apache-2.0 | eslint | no | web, development only | 2022-08-18 (1.0.1) | none |
| `@humanwhocodes/retry` | 0.4.3 | Apache-2.0 | eslint | no | web, development only | 2025-05-07 (0.4.3) | none |
| `@inquirer/ansi` | 2.0.10 | MIT | @inquirer/checkbox | no | web, development only | 2026-11-22 (2.1.1) | 6 |
| `@inquirer/checkbox` | 5.2.8 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (5.3.1) | 6 |
| `@inquirer/confirm` | 6.3.5 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (6.4.1) | 6 |
| `@inquirer/core` | 12.0.6 | MIT | @inquirer/checkbox | no | web, development only | 2026-11-22 (12.1.1) | 6 |
| `@inquirer/editor` | 5.3.6 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (5.5.0) | 6 |
| `@inquirer/expand` | 5.1.8 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (5.2.1) | 6 |
| `@inquirer/external-editor` | 3.0.7 | MIT | @inquirer/editor | no | web, development only | 2026-11-22 (3.1.1) | 6 |
| `@inquirer/figures` | 2.0.10 | MIT | @inquirer/checkbox | no | web, development only | 2026-11-22 (2.1.1) | 6 |
| `@inquirer/input` | 5.1.9 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (5.2.1) | 6 |
| `@inquirer/number` | 4.2.6 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (4.3.1) | 6 |
| `@inquirer/password` | 5.2.5 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (5.3.1) | 6 |
| `@inquirer/prompts` | 8.7.5 | MIT | @stryker-mutator/core | no | web, development only | 2026-11-22 (8.8.1) | 6 |
| `@inquirer/rawlist` | 5.3.8 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (5.4.1) | 6 |
| `@inquirer/search` | 4.3.6 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (4.4.1) | 6 |
| `@inquirer/select` | 5.2.8 | MIT | @inquirer/prompts | no | web, development only | 2026-11-22 (5.3.1) | 6 |
| `@inquirer/type` | 4.2.1 | MIT | @inquirer/checkbox | no | web, development only | 2026-11-22 (4.3.1) | 6 |
| `@isaacs/nonrecursive-glob-match` | 1.1.0 | BlueOak-1.0.0 | minimatch | no | web, development only | 2026-11-05 (1.1.0) | no source repository known |
| `@jridgewell/gen-mapping` | 0.4.0-beta.0 | MIT | @babel/generator | no | web, development only | 2025-08-12 (0.3.13) | none |
| `@jridgewell/resolve-uri` | 3.1.2 | MIT | @jridgewell/trace-mapping | no | web, development only | 2026-11-13 (3.1.3) | 2.8 |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | magic-string | no | web, development only | 2026-08-28 (1.6.0) | none |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | @vitest/mocker | no | web, development only | 2025-09-10 (0.3.31) | none |
| `@keyv/bigmap` | 1.3.1 | MIT | @cacheable/memory | no | web, development only | 2026-10-06 (6.1.0) | 7 |
| `@keyv/serialize` | 1.1.1 | MIT | keyv | no | web, development only | 2025-09-10 (1.1.1) | 7 |
| `@lifeomic/attempt` | 3.1.0 | MIT | @hocuspocus/provider | no | web | 2024-03-21 (3.1.0) | 5 |
| `@oxc-project/types` | 0.156.0 | MIT | rolldown | no | web, development only | 2026-11-23 (0.160.0) | none |
| `@playwright/test` | 1.64.1 | Apache-2.0 | direct | no | web, development only | 2026-11-13 (1.65.1) | 6.5 |
| `@rolldown/binding-android-arm-eabi` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-android-arm64` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-darwin-arm64` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-darwin-x64` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-freebsd-x64` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-linux-arm-gnueabihf` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-linux-arm64-gnu` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-linux-arm64-musl` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-linux-ppc64-gnu` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-linux-s390x-gnu` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-linux-x64-gnu` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-linux-x64-musl` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-openharmony-arm64` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-win32-arm64-msvc` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/binding-win32-x64-msvc` | 1.2.16 | MIT | rolldown | no | web, development only | 2026-11-18 (1.3.3) | none |
| `@rolldown/pluginutils` | 1.0.1 | MIT | @vitejs/plugin-react | no | web, development only | 2026-11-13 (1.1.1) | none |
| `@sec-ant/readable-stream` | 0.4.1 | MIT | get-stream | no | web, development only | 2026-10-24 (0.7.1) | none |
| `@sindresorhus/merge-streams` | 4.0.0 | MIT | execa | no | web, development only | 2024-05-04 (4.0.0) | 4 |
| `@stryker-mutator/api` | 10.1.1 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2026-10-23 (10.1.1) | 3.4 |
| `@stryker-mutator/core` | 10.1.1 | Apache-2.0 | direct | no | web, development only | 2026-10-23 (10.1.1) | 3.4 |
| `@stryker-mutator/instrumenter` | 10.1.1 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2026-10-23 (10.1.1) | 3.4 |
| `@stryker-mutator/util` | 10.1.1 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2026-10-23 (10.1.1) | 3.4 |
| `@stryker-mutator/vitest-runner` | 10.1.1 | Apache-2.0 | direct | no | web, development only | 2026-10-23 (10.1.1) | 3.4 |
| `@tanstack/query-core` | 5.108.4 | MIT | @tanstack/react-query | no | web | 2026-11-23 (5.108.4) | none |
| `@tanstack/react-query` | 5.108.4 | MIT | direct | architecture | web | 2026-11-22 (5.108.3) | no source repository known |
| `@tiptap/core` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-blockquote` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-bold` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-bubble-menu` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-bullet-list` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-code` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-code-block` | 3.35.0 | MIT | @tiptap/extension-code-block-lowlight | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-code-block-lowlight` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-collaboration` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-collaboration-caret` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-document` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-dropcursor` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-floating-menu` | 3.35.0 | MIT | @tiptap/react | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-gapcursor` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-hard-break` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-heading` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-horizontal-rule` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-image` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-italic` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-link` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-list` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-list-item` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-list-keymap` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-ordered-list` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-paragraph` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-strike` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-table` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-text` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extension-underline` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/extensions` | 3.35.0 | MIT | @tiptap/starter-kit | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/pm` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/react` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/starter-kit` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/suggestion` | 3.35.0 | MIT | direct | security, architecture | web | 2026-11-20 (3.35.0) | 6.5 |
| `@tiptap/y-tiptap` | 3.3.1 | MIT | direct | security, architecture | web | 2026-11-20 (3.3.1) | 6.5 |
| `@types/chai` | 5.2.3 | MIT | vitest | no | web, development only | 2025-10-20 (5.2.3) | 6.5 |
| `@types/deep-eql` | 4.0.2 | MIT | @types/chai | no | web, development only | 2023-11-07 (4.0.2) | 6.5 |
| `@types/esrecurse` | 4.3.1 | MIT | eslint-scope | no | web, development only | 2025-07-19 (4.3.1) | 6.5 |
| `@types/estree` | 1.0.10 | MIT | eslint | no | web, development only | 2026-10-29 (1.0.10) | 6.5 |
| `@types/gensync` | 1.0.5 | MIT | @babel/core | no | web, development only | 2026-05-01 (1.0.5) | 6.5 |
| `@types/hast` | 3.0.5 | MIT | lowlight | no | web | 2026-07-09 (3.0.5) | 6.5 |
| `@types/jsesc` | 2.5.1 | MIT | @babel/generator | no | web, development only | 2023-11-07 (3.0.3) | 6.5 |
| `@types/json-schema` | 7.0.15 | MIT | @eslint/core | no | web, development only | 2023-11-07 (7.0.15) | 6.5 |
| `@types/node` | 26.6.6 | MIT | direct | no | web, development only | 2026-10-28 (26.6.6) | 6.5 |
| `@types/react` | 19.3.0 | MIT | direct | no | web | 2026-09-09 (19.3.0) | 6.5 |
| `@types/react-dom` | 19.3.0 | MIT | direct | no | web | 2026-09-09 (19.3.0) | 6.5 |
| `@types/unist` | 3.0.3 | MIT | @types/hast | no | web | 2024-08-15 (3.0.3) | 6.5 |
| `@types/use-sync-external-store` | 0.0.6 | MIT | @tiptap/react | no | web | 2026-09-09 (1.7.0) | 6.5 |
| `@typescript-eslint/eslint-plugin` | 8.74.0 | MIT | typescript-eslint | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/parser` | 8.74.0 | MIT | typescript-eslint | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/project-service` | 8.74.0 | MIT | @typescript-eslint/typescript-estree | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/scope-manager` | 8.74.0 | MIT | @typescript-eslint/eslint-plugin | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/tsconfig-utils` | 8.74.0 | MIT | @typescript-eslint/typescript-estree | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/type-utils` | 8.74.0 | MIT | @typescript-eslint/eslint-plugin | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/types` | 8.74.0 | MIT | @typescript-eslint/parser | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/typescript-estree` | 8.74.0 | MIT | typescript-eslint | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/utils` | 8.74.0 | MIT | typescript-eslint | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@typescript-eslint/visitor-keys` | 8.74.0 | MIT | @typescript-eslint/eslint-plugin | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `@vitejs/plugin-react` | 6.2.1 | MIT | direct | no | web, development only | 2026-11-09 (6.3.0) | 7.4 |
| `@vitest/mocker` | 5.1.0 | MIT | vitest | no | web, development only | 2026-11-18 (5.1.1) | none |
| `@vitest/spy` | 5.1.0 | MIT | @vitest/mocker | no | web, development only | 2026-11-18 (5.1.1) | none |
| `acorn` | 8.19.0 | MIT | espree | no | web, development only | 2026-10-05 (8.19.0) | 4.8 |
| `acorn-jsx` | 5.3.2 | MIT | espree | no | web, development only | 2021-07-09 (5.3.2) | 2.6 |
| `ajv` | 6.15.0 | MIT | eslint | no | web, development only | 2026-04-24 (8.20.0) | 4.8 |
| `ajv` | 8.20.0 | MIT | @stryker-mutator/core | no | web, development only | 2026-04-24 (8.20.0) | 4.8 |
| `angular-html-parser` | 10.11.0 | MIT | @stryker-mutator/instrumenter | no | web, development only | 2026-09-21 (10.13.0) | none |
| `assertion-error` | 2.0.1 | MIT | @types/chai | no | web, development only | 2023-10-18 (2.0.1) | 4.7 |
| `axe-core` | 4.14.0 | MPL-2.0 | @axe-core/playwright | no | web, development only | 2026-11-16 (4.14.1) | 7.1 |
| `balanced-match` | 4.0.4 | MIT | brace-expansion | no | web, development only | 2026-10-16 (5.0.0) | 5.4 |
| `baseline-browser-mapping` | 2.11.35 | Apache-2.0 | browserslist | no | web, development only | 2026-11-19 (2.11.39) | none |
| `brace-expansion` | 5.0.12 | MIT | minimatch | no | web, development only | 2026-11-23 (5.1.0) | 7.1 |
| `browserslist` | 4.29.5 | MIT | @babel/helper-compilation-targets | no | web, development only | 2026-11-16 (4.29.6) | 6.8 |
| `cacheable` | 2.5.0 | MIT | flat-cache | no | web, development only | 2026-06-27 (2.5.0) | none |
| `call-bind-apply-helpers` | 1.0.2 | MIT | call-bound | no | web, development only | 2025-02-12 (1.0.2) | none |
| `call-bound` | 1.0.4 | MIT | side-channel-map | no | web, development only | 2025-03-03 (1.0.4) | none |
| `caniuse-lite` | 1.0.30001823 | CC-BY-4.0 | browserslist | no | web, development only | 2026-11-22 (1.0.30001827) | 4.5 |
| `chai` | 6.3.0 | MIT | vitest | no | web, development only | 2026-09-30 (6.3.0) | 7 |
| `chalk` | 5.6.2 | MIT | @stryker-mutator/core | no | web, development only | 2026-09-27 (6.0.1) | 4.1 |
| `chardet` | 2.2.0 | MIT | @inquirer/external-editor | no | web, development only | 2026-06-20 (2.2.0) | 3.6 |
| `cli-width` | 4.1.0 | ISC | @inquirer/core | no | web, development only | 2023-08-05 (4.1.0) | 3.5 |
| `commander` | 14.0.3 | MIT | @stryker-mutator/core | no | web, development only | 2026-11-07 (15.1.0) | 7.7 |
| `convert-source-map` | 2.0.0 | MIT | @babel/core | no | web, development only | 2022-10-17 (2.0.0) | 3.9 |
| `cross-spawn` | 7.0.6 | MIT | eslint | no | web, development only | 2024-11-18 (7.0.6) | 3.6 |
| `csstype` | 3.2.3 | MIT | @types/react | no | web | 2026-11-17 (3.2.4) | 3.9 |
| `debug` | 4.4.3 | MIT | eslint | no | web, development only | 2025-09-13 (4.4.3) | 2.8 |
| `deep-is` | 0.1.4 | MIT | optionator | no | web, development only | 2021-09-04 (0.1.4) | 1.9 |
| `dequal` | 2.0.3 | MIT | devlop | no | web | 2022-07-11 (2.0.3) | 3 |
| `des.js` | 1.1.0 | MIT | typed-rest-client | no | web, development only | 2023-05-29 (1.1.0) | 1.6 |
| `detect-libc` | 2.1.2 | Apache-2.0 | lightningcss | no | web, development only | 2025-10-05 (2.1.2) | 3.8 |
| `devlop` | 1.1.0 | MIT | lowlight | no | web | 2023-06-29 (1.1.0) | none |
| `diff-match-patch` | 1.0.5 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2020-05-20 (1.0.5) | 3 |
| `dunder-proto` | 1.0.1 | MIT | get-proto | no | web, development only | 2024-12-17 (1.0.1) | none |
| `electron-to-chromium` | 1.5.478 | ISC | browserslist | no | web, development only | 2026-11-23 (1.5.493) | 4.5 |
| `emoji-regex` | 10.6.0 | MIT | @stryker-mutator/core | no | web, development only | 2026-09-15 (11.0.0) | 3.7 |
| `empathic` | 2.1.0 | MIT | @babel/core | no | web, development only | 2026-09-18 (2.1.0) | none |
| `es-define-property` | 1.0.1 | MIT | get-intrinsic | no | web, development only | 2024-12-06 (1.0.1) | none |
| `es-errors` | 1.3.0 | MIT | side-channel | no | web, development only | 2024-02-05 (1.3.0) | none |
| `es-module-lexer` | 2.3.2 | MIT | vitest | no | web, development only | 2026-11-16 (3.0.5) | 4.8 |
| `es-object-atoms` | 1.1.2 | MIT | get-intrinsic | no | web, development only | 2026-05-22 (1.1.2) | none |
| `escalade` | 3.2.0 | MIT | update-browserslist-db | no | web, development only | 2024-08-29 (3.2.0) | 2.9 |
| `escape-string-regexp` | 4.0.0 | MIT | eslint | no | web, development only | 2021-04-17 (5.0.0) | 3.6 |
| `eslint` | 10.15.0 | MIT | direct | no | web, development only | 2026-11-13 (10.15.0) | 6.6 |
| `eslint-scope` | 9.1.2 | BSD-2-Clause | eslint | no | web, development only | 2026-03-06 (9.1.2) | none |
| `eslint-visitor-keys` | 3.4.3 | Apache-2.0 | @eslint-community/eslint-utils | no | web, development only | 2026-02-20 (5.0.1) | 4.8 |
| `eslint-visitor-keys` | 5.0.1 | Apache-2.0 | eslint | no | web, development only | 2026-02-20 (5.0.1) | none |
| `espree` | 11.2.0 | BSD-2-Clause | eslint | no | web, development only | 2026-03-06 (11.2.0) | none |
| `esquery` | 1.7.0 | BSD-3-Clause | eslint | no | web, development only | 2025-12-31 (1.7.0) | 3.6 |
| `esrecurse` | 4.3.0 | BSD-2-Clause | eslint-scope | no | web, development only | 2020-08-31 (4.3.0) | 2.4 |
| `estraverse` | 5.3.0 | BSD-2-Clause | eslint-scope | no | web, development only | 2021-10-25 (5.3.0) | 2.8 |
| `estree-walker` | 3.0.3 | MIT | @vitest/mocker | no | web, development only | 2023-01-20 (3.0.3) | 2.1 |
| `esutils` | 2.0.3 | BSD-2-Clause | eslint | no | web, development only | 2019-07-31 (2.0.3) | 2.3 |
| `execa` | 9.6.1 | MIT | @stryker-mutator/core | no | web, development only | 2026-10-23 (10.2.1) | 4.3 |
| `expect-type` | 1.4.0 | Apache-2.0 | vitest | no | web, development only | 2026-06-25 (1.4.0) | 4.4 |
| `fast-deep-equal` | 3.1.3 | MIT | eslint | no | web, development only | 2020-06-08 (3.1.3) | 2.3 |
| `fast-equals` | 5.4.5 | MIT | @tiptap/react | no | web | 2026-11-22 (6.4.1) | 5.6 |
| `fast-json-stable-stringify` | 2.1.0 | MIT | ajv | no | web, development only | 2019-12-14 (2.1.0) | 2.2 |
| `fast-levenshtein` | 2.0.6 | MIT | optionator | no | web, development only | 2020-07-22 (3.0.0) | 4.1 |
| `fast-string-truncated-width` | 3.0.3 | MIT | fast-string-width | no | web, development only | 2025-09-30 (3.0.3) | none |
| `fast-string-width` | 3.0.2 | MIT | fast-wrap-ansi | no | web, development only | 2025-09-30 (3.0.2) | none |
| `fast-uri` | 3.1.9 | BSD-3-Clause | ajv | no | web, development only | 2026-10-19 (4.2.3) | 8.1 |
| `fast-wrap-ansi` | 0.2.2 | MIT | @inquirer/core | no | web, development only | 2026-05-19 (0.2.2) | none |
| `fdir` | 6.5.0 | MIT | tinyglobby | no | web, development only | 2025-08-14 (6.5.0) | 3.3 |
| `figures` | 6.1.0 | MIT | execa | no | web, development only | 2024-03-04 (6.1.0) | 4 |
| `file-entry-cache` | 11.1.5 | MIT | eslint | no | web, development only | 2026-06-27 (11.1.5) | none |
| `find-up` | 5.0.0 | MIT | eslint | no | web, development only | 2025-09-16 (8.0.0) | 3.6 |
| `flat-cache` | 6.1.23 | MIT | file-entry-cache | no | web, development only | 2026-06-27 (6.1.23) | none |
| `flatted` | 3.4.4 | ISC | flat-cache | no | web, development only | 2026-07-30 (3.4.4) | 4.3 |
| `flru` | 1.0.2 | MIT | @babel/helper-compilation-targets | no | web, development only | 2019-07-11 (1.0.2) | 2.1 |
| `fsevents` | 2.3.3 | MIT | vite | no | web, development only | 2023-08-21 (2.3.3) | 3.1 |
| `function-bind` | 1.1.2 | MIT | get-intrinsic | no | web, development only | 2023-10-12 (1.1.2) | 4.5 |
| `gensync` | 1.0.0-beta.2 | MIT | @babel/core | no | web, development only | 2020-10-27 (1.0.0-beta.2) | 2.1 |
| `get-intrinsic` | 1.3.0 | MIT | side-channel-map | no | web, development only | 2025-02-22 (1.3.0) | 3.8 |
| `get-proto` | 1.0.1 | MIT | get-intrinsic | no | web, development only | 2025-01-02 (1.0.1) | none |
| `get-stream` | 9.0.1 | MIT | execa | no | web, development only | 2024-03-16 (9.0.1) | 4.1 |
| `glob-parent` | 6.0.2 | ISC | eslint | no | web, development only | 2026-11-17 (7.0.0) | 5.5 |
| `gopd` | 1.2.0 | MIT | get-intrinsic | no | web, development only | 2024-12-04 (1.2.0) | 3.8 |
| `has-symbols` | 1.1.0 | MIT | get-intrinsic | no | web, development only | 2024-12-02 (1.1.0) | 3.8 |
| `hashery` | 1.5.1 | MIT | @cacheable/utils | no | web, development only | 2026-11-13 (3.0.6) | none |
| `hasown` | 2.0.4 | MIT | get-intrinsic | no | web, development only | 2026-05-28 (2.0.4) | 3.8 |
| `highlight.js` | 11.12.0 | BSD-3-Clause | @tiptap/extension-code-block-lowlight | security | web | 2026-08-12 (11.12.0) | 6.5 |
| `hookified` | 1.15.1 | MIT | flat-cache | no | web, development only | 2026-11-22 (3.2.0) | none |
| `hookified` | 2.2.0 | MIT | qified | no | web, development only | 2026-11-22 (3.2.0) | none |
| `html-parse-stringify` | 4.0.1 | MIT | react-i18next | no | web | 2026-07-22 (4.0.1) | none |
| `human-signals` | 8.0.1 | Apache-2.0 | execa | no | web, development only | 2025-03-29 (8.0.1) | 2.8 |
| `i18next` | 26.7.2 | MIT | direct | architecture | web | 2026-11-23 (27.2.6) | 4.5 |
| `iconv-lite` | 0.7.3 | MIT | @inquirer/external-editor | no | web, development only | 2026-07-03 (0.7.3) | none |
| `ignore` | 5.3.2 | MIT | eslint | no | web, development only | 2026-11-17 (7.0.16) | 3.3 |
| `ignore` | 7.0.16 | MIT | @typescript-eslint/eslint-plugin | no | web, development only | 2026-11-17 (7.0.16) | 3.3 |
| `import-meta-resolve` | 4.2.0 | MIT | @babel/core | no | web, development only | 2025-08-29 (4.2.0) | 2.8 |
| `imurmurhash` | 0.1.4 | MIT | eslint | no | web, development only | 2013-08-24 (0.1.4) | 2 |
| `inherits` | 2.0.4 | ISC | des.js | no | web, development only | 2019-06-19 (2.0.4) | 3.6 |
| `is-extglob` | 2.1.1 | MIT | is-glob | no | web, development only | 2016-12-11 (2.1.1) | 3 |
| `is-glob` | 4.0.3 | MIT | eslint | no | web, development only | 2021-09-29 (4.0.3) | 3.7 |
| `is-plain-obj` | 4.1.0 | MIT | execa | no | web, development only | 2022-06-15 (4.1.0) | 3.7 |
| `is-stream` | 4.0.1 | MIT | execa | no | web, development only | 2024-02-19 (4.0.1) | 3.6 |
| `is-unicode-supported` | 2.1.0 | MIT | figures | no | web, development only | 2024-09-09 (2.1.0) | 3.5 |
| `isexe` | 2.0.0 | ISC | which | no | web, development only | 2026-02-09 (4.0.0) | 4.5 |
| `isomorphic.js` | 0.2.5 | MIT | lib0 | no | web | 2022-03-26 (0.2.5) | 2 |
| `js-md4` | 0.3.2 | MIT | typed-rest-client | no | web, development only | 2026-11-18 (0.5.0) | 3.6 |
| `js-tokens` | 10.0.0 | MIT | @babel/code-frame | no | web, development only | 2026-11-21 (10.0.1) | 3.2 |
| `jsesc` | 3.1.0 | MIT | @babel/generator | no | web, development only | 2024-12-11 (3.1.0) | 2.1 |
| `json-rpc-2.0` | 1.8.1 | MIT | @stryker-mutator/core | no | web, development only | 2026-09-20 (1.8.1) | 3 |
| `json-schema-traverse` | 0.4.1 | MIT | ajv | no | web, development only | 2020-12-13 (1.0.0) | 3 |
| `json-schema-traverse` | 1.0.0 | MIT | ajv | no | web, development only | 2020-12-13 (1.0.0) | 3 |
| `json-stable-stringify-without-jsonify` | 1.0.1 | MIT | eslint | no | web, development only | 2016-12-15 (1.0.1) | 1.9 |
| `json5` | 2.2.3 | MIT | @babel/core | no | web, development only | 2022-12-31 (2.2.3) | 7.6 |
| `keyv` | 5.6.0 | MIT | cacheable | no | web, development only | 2026-10-06 (6.1.0) | 7 |
| `levn` | 0.4.1 | MIT | @eslint/plugin-kit | no | web, development only | 2020-04-04 (0.4.1) | 2 |
| `lib0` | 0.2.120 | MIT | @hocuspocus/provider | security | web | 2026-11-09 (0.2.120) | 5.1 |
| `lightningcss` | 1.33.0 | MPL-2.0 | vite | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-android-arm64` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-darwin-arm64` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-darwin-x64` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-freebsd-x64` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-linux-arm-gnueabihf` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-linux-arm64-gnu` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-linux-arm64-musl` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-linux-x64-gnu` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-linux-x64-musl` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-win32-arm64-msvc` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `lightningcss-win32-x64-msvc` | 1.33.0 | MPL-2.0 | lightningcss | no | web, development only | 2026-07-20 (1.33.0) | none |
| `linkifyjs` | 4.4.0 | MIT | @tiptap/extension-link | security | web | 2026-10-23 (4.4.0) | none |
| `locate-path` | 6.0.0 | MIT | find-up | no | web, development only | 2025-09-15 (8.0.0) | 3.6 |
| `lodash.groupby` | 4.6.0 | MIT | @stryker-mutator/core | no | web, development only | 2016-08-13 (4.6.0) | 6.5 |
| `lowlight` | 3.3.0 | MIT | direct | security | web | 2024-12-14 (3.3.0) | 2.8 |
| `magic-string` | 1.4.5 | MIT | vitest | no | web, development only | 2026-10-27 (1.4.5) | 5.2 |
| `math-intrinsics` | 1.1.0 | MIT | get-intrinsic | no | web, development only | 2024-12-19 (1.1.0) | none |
| `minimalistic-assert` | 1.0.1 | ISC | des.js | no | web, development only | 2018-04-11 (1.0.1) | 2.5 |
| `minimatch` | 10.2.6 | BlueOak-1.0.0 | @stryker-mutator/core | no | web, development only | 2026-11-16 (11.0.9) | 6.1 |
| `minimatch` | 11.0.9 | BlueOak-1.0.0 | @eslint/config-array | no | web, development only | 2026-11-16 (11.0.9) | 6.1 |
| `ms` | 2.1.3 | MIT | debug | no | web, development only | 2020-12-08 (2.1.3) | 5 |
| `mutation-server-protocol` | 0.4.1 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2026-01-16 (0.4.1) | none |
| `mutation-testing-elements` | 3.8.4 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2026-07-27 (3.9.0) | 4.2 |
| `mutation-testing-metrics` | 3.8.4 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2026-07-27 (3.9.0) | 4.2 |
| `mutation-testing-report-schema` | 3.8.4 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2026-07-27 (3.9.0) | 4.2 |
| `mute-stream` | 3.0.0 | ISC | @inquirer/core | no | web, development only | 2026-05-08 (4.0.0) | 5.6 |
| `nanoid` | 3.3.20 | MIT | postcss | no | web, development only | 2026-10-05 (6.0.2) | 6.5 |
| `natural-compare` | 1.4.0 | MIT | eslint | no | web, development only | 2016-07-22 (1.4.0) | 4.1 |
| `node-releases` | 2.0.63 | MIT | browserslist | no | web, development only | 2026-11-17 (2.0.65) | 4 |
| `npm-run-path` | 6.0.0 | MIT | @stryker-mutator/core | no | web, development only | 2024-08-26 (6.0.0) | 3.8 |
| `object-inspect` | 1.13.4 | MIT | side-channel | no | web, development only | 2026-11-18 (1.14.0) | 5.1 |
| `obug` | 3.0.0 | MIT | vitest | no | web, development only | 2026-09-09 (3.0.0) | none |
| `optionator` | 0.9.4 | MIT | eslint | no | web, development only | 2024-04-26 (0.9.4) | 2.1 |
| `orderedmap` | 2.1.1 | MIT | prosemirror-model | no | web | 2023-05-17 (2.1.1) | 2.3 |
| `p-limit` | 3.1.0 | MIT | p-locate | no | web, development only | 2026-09-18 (7.3.3) | 3.9 |
| `p-locate` | 5.0.0 | MIT | locate-path | no | web, development only | 2026-02-03 (7.0.0) | 3.6 |
| `parse-ms` | 4.0.0 | MIT | pretty-ms | no | web, development only | 2026-11-02 (5.0.0) | 4 |
| `path-exists` | 4.0.0 | MIT | find-up | no | web, development only | 2021-08-12 (5.0.0) | 3.6 |
| `path-key` | 3.1.1 | MIT | cross-spawn | no | web, development only | 2021-04-09 (4.0.0) | 3.6 |
| `path-key` | 4.0.0 | MIT | npm-run-path | no | web, development only | 2021-04-09 (4.0.0) | 3.6 |
| `picocolors` | 1.1.1 | ISC | postcss | no | web, development only | 2024-10-16 (1.1.1) | 3.2 |
| `picomatch` | 4.0.7 | MIT | vite | no | web, development only | 2026-08-24 (4.0.7) | 6.5 |
| `playwright` | 1.64.1 | Apache-2.0 | @playwright/test | no | web, development only | 2026-11-13 (1.65.1) | 6.5 |
| `playwright-core` | 1.64.1 | Apache-2.0 | @axe-core/playwright | no | web, development only | 2026-11-13 (1.65.1) | 6.5 |
| `postcss` | 8.5.32 | MIT | vite | no | web, development only | 2026-11-13 (8.5.33) | 7.6 |
| `prelude-ls` | 1.2.1 | MIT | optionator | no | web, development only | 2020-04-02 (1.2.1) | 2.1 |
| `prettier` | 3.9.10 | MIT | direct | no | web, development only | 2026-11-12 (3.10.1) | 6.2 |
| `pretty-ms` | 9.3.1 | MIT | execa | no | web, development only | 2026-10-14 (10.0.0) | 4.4 |
| `progress` | 2.0.3 | MIT | @stryker-mutator/core | no | web, development only | 2018-12-05 (2.0.3) | 2.9 |
| `prosemirror-changeset` | 2.4.6 | MIT | @tiptap/pm | security, architecture | web | 2026-11-02 (2.4.6) | 2.1 |
| `prosemirror-commands` | 1.7.2 | MIT | @tiptap/pm | security, architecture | web | 2026-08-05 (1.7.2) | 2 |
| `prosemirror-dropcursor` | 1.8.4 | MIT | @tiptap/pm | security, architecture | web | 2026-09-24 (1.8.4) | 2.1 |
| `prosemirror-gapcursor` | 1.4.1 | MIT | @tiptap/pm | security, architecture | web | 2026-03-10 (1.4.1) | 2 |
| `prosemirror-history` | 1.5.2 | MIT | @tiptap/pm | security, architecture | web | 2026-11-19 (1.5.2) | 2 |
| `prosemirror-inputrules` | 1.7.0 | MIT | @tiptap/pm | security, architecture | web | 2026-11-19 (1.7.0) | 2 |
| `prosemirror-keymap` | 1.2.3 | MIT | @tiptap/pm | security, architecture | web | 2025-05-04 (1.2.3) | 2 |
| `prosemirror-model` | 1.25.13 | MIT | @tiptap/pm | security, architecture | web | 2026-11-08 (1.25.13) | 2.1 |
| `prosemirror-schema-list` | 1.6.1 | MIT | @tiptap/pm | security, architecture | web | 2026-11-19 (1.6.1) | 2.1 |
| `prosemirror-state` | 1.4.4 | MIT | @tiptap/pm | security, architecture | web | 2025-10-23 (1.4.4) | 2.1 |
| `prosemirror-tables` | 1.8.5 | MIT | @tiptap/pm | security, architecture | web | 2025-12-24 (1.8.5) | 3.3 |
| `prosemirror-transform` | 1.12.7 | MIT | @tiptap/pm | security, architecture | web | 2026-11-19 (1.12.7) | 2 |
| `prosemirror-view` | 1.42.9 | MIT | @tiptap/pm | security, architecture | web | 2026-11-23 (1.43.1) | 2 |
| `punycode` | 2.3.1 | MIT | uri-js | no | web, development only | 2023-10-30 (2.3.1) | 3.2 |
| `qified` | 0.10.1 | MIT | cacheable | no | web, development only | 2026-11-16 (0.13.3) | none |
| `qs` | 6.15.1 | BSD-3-Clause | typed-rest-client | no | web, development only | 2026-10-28 (6.17.1) | 5.8 |
| `react` | 19.3.1 | MIT | direct | architecture | web | 2026-10-14 (19.3.1) | 7.3 |
| `react-dom` | 19.3.1 | MIT | direct | architecture | web | 2026-10-14 (19.3.1) | 7.3 |
| `react-i18next` | 17.1.13 | MIT | direct | architecture | web | 2026-11-19 (18.0.3) | 4.3 |
| `require-from-string` | 2.0.2 | MIT | ajv | no | web, development only | 2018-04-09 (2.0.2) | 2.3 |
| `rolldown` | 1.2.16 | MIT | vite | architecture | web, development only | 2026-11-18 (1.3.3) | none |
| `rope-sequence` | 1.3.4 | MIT | prosemirror-history | no | web | 2023-05-17 (1.3.4) | 2 |
| `rxjs` | 7.8.2 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2025-02-22 (7.8.2) | 6.5 |
| `safer-buffer` | 2.1.2 | MIT | iconv-lite | no | web, development only | 2018-04-08 (2.1.2) | 2.1 |
| `scheduler` | 0.28.0 | MIT | react-dom | no | web | 2026-09-09 (0.28.0) | 7.3 |
| `semver` | 7.8.6 | ISC | @stryker-mutator/core | no | web, development only | 2026-11-02 (7.8.6) | 5.6 |
| `shebang-command` | 2.0.0 | MIT | cross-spawn | no | web, development only | 2019-09-06 (2.0.0) | 3.1 |
| `shebang-regex` | 3.0.0 | MIT | shebang-command | no | web, development only | 2021-08-13 (4.0.0) | 3.5 |
| `side-channel` | 1.1.1 | MIT | qs | no | web, development only | 2026-06-08 (1.1.1) | 3.8 |
| `side-channel-list` | 1.0.1 | MIT | side-channel | no | web, development only | 2026-04-08 (1.0.1) | none |
| `side-channel-map` | 1.0.1 | MIT | side-channel | no | web, development only | 2024-12-11 (1.0.1) | none |
| `side-channel-weakmap` | 1.0.2 | MIT | side-channel | no | web, development only | 2024-12-11 (1.0.2) | none |
| `signal-exit` | 4.1.0 | ISC | execa | no | web, development only | 2023-07-29 (4.1.0) | 3.4 |
| `source-map` | 0.7.6 | BSD-3-Clause | @stryker-mutator/core | no | web, development only | 2026-07-20 (0.8.0) | 4.9 |
| `source-map-js` | 1.2.2 | BSD-3-Clause | postcss | no | web, development only | 2026-11-19 (1.2.4) | 4.8 |
| `std-env` | 4.3.0 | MIT | vitest | no | web, development only | 2026-09-29 (4.3.0) | none |
| `strip-final-newline` | 4.0.0 | MIT | execa | no | web, development only | 2023-12-13 (4.0.0) | 3.7 |
| `tinybench` | 6.2.3 | MIT | vitest | no | web, development only | 2026-11-23 (6.2.5) | none |
| `tinyexec` | 1.3.1 | MIT | vitest | no | web, development only | 2026-09-03 (1.3.1) | none |
| `tinyglobby` | 0.2.17 | MIT | vite | no | web, development only | 2026-05-30 (0.2.17) | none |
| `tree-kill` | 1.2.2 | MIT | @stryker-mutator/core | no | web, development only | 2019-12-11 (1.2.2) | 2.1 |
| `ts-api-utils` | 2.5.0 | MIT | @typescript-eslint/eslint-plugin | no | web, development only | 2026-03-19 (2.5.0) | 4.1 |
| `tslib` | 2.8.1 | 0BSD | @stryker-mutator/core | no | web, development only | 2026-10-30 (2.9.1) | 5.5 |
| `tunnel` | 0.0.6 | MIT | typed-rest-client | no | web, development only | 2018-09-11 (0.0.6) | 2.1 |
| `type-check` | 0.4.0 | MIT | optionator | no | web, development only | 2020-04-03 (0.4.0) | 2.3 |
| `typed-inject` | 5.0.0 | Apache-2.0 | @stryker-mutator/core | no | web, development only | 2024-12-13 (5.0.0) | 3.4 |
| `typed-rest-client` | 2.3.1 | MIT | @stryker-mutator/core | no | web, development only | 2026-11-12 (3.1.3) | 7.2 |
| `typescript` | 6.0.3 | Apache-2.0 | direct | no | web | 2026-07-08 (7.0.2) | 8.2 |
| `typescript-eslint` | 8.74.0 | MIT | direct | no | web, development only | 2026-11-23 (8.74.0) | 6.7 |
| `underscore` | 1.13.8 | MIT | typed-rest-client | no | web, development only | 2026-02-19 (1.13.8) | 6.7 |
| `undici-types` | 8.9.0 | MIT | @types/node | no | web, development only | 2026-11-20 (8.13.1) | 8.3 |
| `unicorn-magic` | 0.3.0 | MIT | npm-run-path | no | web, development only | 2026-09-24 (0.4.1) | 3.6 |
| `update-browserslist-db` | 1.3.4 | MIT | browserslist | no | web, development only | 2026-11-16 (1.4.0) | 5.6 |
| `uri-js` | 4.4.1 | BSD-2-Clause | ajv | no | web, development only | 2021-01-10 (4.4.1) | 2.4 |
| `use-sync-external-store` | 1.7.0 | MIT | @tiptap/react | no | web | 2026-09-09 (1.7.0) | none |
| `verkit` | 0.5.0 | MIT | @babel/core | no | web, development only | 2026-09-18 (0.5.0) | none |
| `vite` | 8.3.5 | MIT | direct | architecture | web, development only | 2026-11-11 (8.3.8) | 6.5 |
| `vitest` | 5.1.0 | MIT | direct | no | web, development only | 2026-11-18 (5.1.1) | none |
| `w3c-keyname` | 2.2.8 | MIT | prosemirror-keymap | no | web | 2023-06-07 (2.2.8) | 2 |
| `weapon-regex` | 2.0.6 | Apache-2.0 | @stryker-mutator/instrumenter | no | web, development only | 2026-10-03 (2.0.6) | 5.5 |
| `which` | 2.0.2 | ISC | cross-spawn | no | web, development only | 2026-05-08 (7.0.0) | 5.5 |
| `why-is-node-running` | 3.2.1 | MIT | vitest | no | web, development only | 2026-10-09 (3.2.3) | 4.7 |
| `word-wrap` | 1.2.5 | MIT | optionator | no | web, development only | 2023-07-22 (1.2.5) | 3 |
| `y-indexeddb` | 9.0.12 | MIT | direct | security | web | 2023-11-02 (9.0.12) | 3.1 |
| `y-protocols` | 1.0.7 | MIT | direct | security, architecture | web | 2025-12-16 (1.0.7) | 2 |
| `yjs` | 13.6.33 | MIT | direct | security, architecture | web | 2026-09-23 (13.6.33) | 5.4 |
| `yocto-queue` | 0.1.0 | MIT | p-limit | no | web, development only | 2025-11-11 (1.2.2) | 3.5 |
| `yoctocolors` | 2.2.0 | MIT | execa | no | web, development only | 2026-07-26 (2.2.0) | none |
| `zod` | 4.6.7 | MIT | mutation-server-protocol | no | web, development only | 2026-10-12 (4.6.7) | 5.5 |

## npm packages of the service for editing together (`collab/package-lock.json`)

10 rows.

| Name | Version | Licence | Direct, or through | Critical | Used in | Last release | Scorecard |
|---|---|---|---|---|---|---|---|
| `@hocuspocus/common` | 4.9.0 | MIT | @hocuspocus/server | security, architecture | collab | 2026-11-20 (4.9.0) | none |
| `@hocuspocus/server` | 4.9.0 | MIT | direct | security, architecture | collab | 2026-11-20 (4.9.0) | none |
| `async-mutex` | 0.5.0 | MIT | @hocuspocus/server | no | collab | 2024-03-11 (0.5.0) | 3.4 |
| `crossws` | 0.4.17 | MIT | @hocuspocus/server | security | collab | 2026-10-27 (0.4.17) | none |
| `isomorphic.js` | 0.2.5 | MIT | lib0 | no | collab | 2022-03-26 (0.2.5) | 2 |
| `kleur` | 4.1.5 | MIT | @hocuspocus/server | no | collab | 2022-06-26 (4.1.5) | 3 |
| `lib0` | 0.2.120 | MIT | @hocuspocus/server | security | collab | 2026-11-09 (0.2.120) | 5.1 |
| `tslib` | 2.9.1 | 0BSD | async-mutex | no | collab | 2026-10-30 (2.9.1) | 5.5 |
| `y-protocols` | 1.0.7 | MIT | direct | security, architecture | collab | 2025-12-16 (1.0.7) | 2 |
| `yjs` | 13.6.33 | MIT | direct | security, architecture | collab | 2026-09-23 (13.6.33) | 5.4 |

## Container images

10 rows.

| Name | Version | Licence | Direct, or through | Critical | Used in | Last release | Scorecard |
|---|---|---|---|---|---|---|---|
| `axllent/mailpit` | v1.33.0 (no digest) | MIT | direct | no | development | 2026-10-31 (tag pushed) | none |
| `gcr.io/distroless/static-debian12` | nonroot (sha256:afa5c872c891) | Apache-2.0 (Debian packages: various) | direct | security, architecture | image build | not looked up (not on Docker Hub) | 8.6 |
| `golang` | 1.26 (sha256:4165ee6bf3b7) | BSD-3-Clause (Go; Debian packages: various) | direct | architecture | image build, development | 2026-11-16 (tag pushed) | 3.9 |
| `gotenberg/gotenberg` | 9.9.3 (sha256:9731688d1b62) | MIT (Gotenberg; LibreOffice MPL-2.0, Chromium BSD-3-Clause) | direct | security | pdf image | 2026-11-22 (tag pushed) | 5.5 |
| `mcr.microsoft.com/playwright` | v1.64.1-noble (no digest) | Apache-2.0 (Ubuntu packages: various) | direct | no | development | not looked up (not on Docker Hub) | 6.5 |
| `node` | 22-bookworm-slim (sha256:e9f565d32859) | MIT (Node.js; Debian packages: various) | direct | security, architecture | image build, development | 2026-11-24 (tag pushed) | 6.9 |
| `node` | 22-slim (sha256:e9f565d32859) | MIT (Node.js; Debian packages: various) | direct | security, architecture | collab image | 2026-11-24 (tag pushed) | 6.9 |
| `postgres` | 16 (sha256:3950ad7c3148) | PostgreSQL (Debian packages: various) | direct | security, architecture | image build, reference installation, development, CI | 2026-11-24 (tag pushed) | 3.9 |
| `python` | 3.13-slim (sha256:e48f59cdba69) | PSF-2.0 (Python; Debian packages: various) | direct | no | CI | 2026-11-24 (tag pushed) | 4.1 |
| `semgrep/semgrep` | 1.186.0 (sha256:6e1b04340e60) | LGPL-2.1 | direct | no | CI | 2026-11-18 (tag pushed) | none |

## GitHub Actions

16 rows.

| Name | Version | Licence | Direct, or through | Critical | Used in | Last release | Scorecard |
|---|---|---|---|---|---|---|---|
| `actions/attest-build-provenance` | v4.2.2 | MIT | direct | security | CI | 2026-08-06 (v4.2.2) | none |
| `actions/checkout` | v7.0.1 | MIT | direct | security | CI | 2026-07-20 (v7.0.1) | 5.8 |
| `actions/setup-go` | v7.1.0 | MIT | direct | security | CI | 2026-11-17 (v7.1.0) | 6.6 |
| `actions/setup-node` | v7.1.0 | MIT | direct | security | CI | 2026-10-08 (v7.1.0) | 6.4 |
| `actions/upload-artifact` | v7.0.2 | MIT | direct | security | CI | 2026-10-07 (v7.0.2) | 5.3 |
| `anchore/sbom-action/download-syft` | v0.24.3 | Apache-2.0 | direct | security | CI | 2026-11-23 (v0.24.4) | 8.2 |
| `aquasecurity/trivy-action` | v0.36.0 | Apache-2.0 | direct | security | CI | 2026-04-22 (v0.36.0) | 6.7 |
| `docker/build-push-action` | v7.4.0 | Apache-2.0 | direct | security | CI | 2026-09-15 (v7.4.0) | 7.6 |
| `docker/login-action` | v4.8.0 | Apache-2.0 | direct | security | CI | 2026-11-05 (v4.8.0) | 8.6 |
| `docker/setup-buildx-action` | v4.4.1 | Apache-2.0 | direct | security | CI | 2026-09-16 (v4.4.1) | 8.6 |
| `docker/setup-qemu-action` | v4.4.0 | Apache-2.0 | direct | security | CI | 2026-09-15 (v4.4.0) | 8.4 |
| `github/codeql-action/analyze` | v4.39.4 | MIT | direct | security | CI | 2026-11-20 (v4.39.4) | none |
| `github/codeql-action/init` | v4.39.4 | MIT | direct | security | CI | 2026-11-20 (v4.39.4) | none |
| `goreleaser/goreleaser-action` | v7.3.0 | MIT | direct | security | CI | 2026-10-12 (v7.3.0) | 4.9 |
| `sigstore/cosign-installer` | v4.1.3 | Apache-2.0 | direct | security | CI | 2026-11-04 (v4.1.3) | 7.5 |
| `zaproxy/action-baseline` | v0.15.0 | Apache-2.0 | direct | security | CI | 2025-10-24 (Version 0.15.0) | 5.2 |

## CI tools

21 rows.

| Name | Version | Licence | Direct, or through | Critical | Used in | Last release | Scorecard |
|---|---|---|---|---|---|---|---|
| `Bicep` | v0.48.1 | MIT | direct | no | CI | 2026-11-06 (v0.49.2) | 6.4 |
| `cfn-lint` | 1.60.0 | MIT-0 | direct | no | CI | 2026-11-19 (1.61.0) | none |
| `cosign` | v3.1.4 | Apache-2.0 | direct | security | CI | 2026-10-20 (v3.1.4) | 8.6 |
| `gitleaks` | v8.30.1 | MIT | direct | security | CI | 2026-02-21 (v8.30.1) | none |
| `golangci-lint` | v2.15.0 | GPL-3.0 (separate process) | direct | no | CI | 2026-10-16 (v2.15.0) | 7.7 |
| `GoReleaser` | v2.20.3 | MIT | direct | security, architecture | CI | 2026-11-20 (v2.20.3) | 8.8 |
| `govulncheck` | v1.10.0 | BSD-3-Clause | direct | security | CI | 2026-11-17 (v1.10.0) | 3.7 |
| `Helm` | v4.3.2 | Apache-2.0 | direct | security | CI | 2026-11-13 (v4.3.2) | 9.4 |
| `jsonpatch` | 1.48 | BSD-3-Clause | cfn-lint | no | CI | 2026-11-19 (1.48.0) | 5.2 |
| `jsonpointer` | 3.12 | BSD-3-Clause | cfn-lint | no | CI | 2026-11-11 (3.12.0) | 4.5 |
| `kubeconform` | v0.8.0 | Apache-2.0 | direct | no | CI | 2026-06-04 (v0.8.0) | 2.8 |
| `mpmath` | 1.3.0 | BSD-3-Clause | cfn-lint | no | CI | 2026-03-15 (1.4.1) | 4.8 |
| `networkx` | 3.7 | BSD-3-Clause | cfn-lint | no | CI | 2026-09-21 (3.7.0) | 7.2 |
| `OpenTofu` | v1.13.8 | MPL-2.0 | direct | no | CI | 2026-11-23 (v1.13.10) | none |
| `PyYAML` | 6.0.4 | MIT | cfn-lint | no | CI | 2026-11-20 (6.0.4) | 5.1 |
| `regex` | 2026.11.7 | Apache-2.0 AND CNRI-Python | cfn-lint | no | CI | 2026-11-24 (2026.11.23) | 4.9 |
| `staticcheck` | v0.8.2 | MIT | direct | no | CI | 2026-10-12 (v0.8.2) | 5.4 |
| `syft` | v1.57.2 | Apache-2.0 | direct | security | CI | 2026-11-16 (v1.57.2) | 8.9 |
| `sympy` | 1.14.0 | non-standard | cfn-lint | no | CI | 2025-04-27 (1.14.0) | 5.4 |
| `Terraform` | v1.5.7 | MPL-2.0 (this version) | direct | no | CI | 2026-11-11 (v1.17.2) | 6.6 |
| `typing_extensions` | 4.16.0 | PSF-2.0 | cfn-lint | no | CI | 2026-07-02 (4.16.0) | 8.7 |
