VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
# The date of the commit, not of the build, so two builds of one commit are the same (spec 051).
BUILD_DATE ?= $(shell git log -1 --format=%cs 2>/dev/null)
LDFLAGS := -s -w -X github.com/kenwerk/kenwerk/internal/version.Version=$(VERSION) \
	-X github.com/kenwerk/kenwerk/internal/version.Date=$(BUILD_DATE)
STATICCHECK := honnef.co/go/tools/cmd/staticcheck@v0.8.2
GOVULNCHECK := golang.org/x/vuln/cmd/govulncheck@v1.9.0
# Spec 097. Run as separate programs, never linked into Kenwerk; golangci-lint is GPL-3.0,
# which blueprint 02 allows for a tool called as a separate process.
GOLANGCI_LINT := github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0
GITLEAKS := github.com/zricethezav/gitleaks/v8@v8.30.1

.PHONY: all build web run test test-race fmt fmt-check vet staticcheck vuln lint secrets secrets-history audit licenses web-check collab-check mutation mutation-web reproducible fuzz check clean

all: web build

build:
	CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/kenwerk ./cmd/kenwerk

web:
	cd web && npm ci --no-fund --no-audit && npx vite build

run: build
	./bin/kenwerk serve

test:
	go test ./...

test-race:
	# internal/app alone took over 20 minutes under the race detector on a hosted runner once
	# document control and publishing added their tests, one after another; the script deals its
	# tests over TEST_SHARDS processes beside the other packages. A real hang still ends at 45m.
	bash scripts/test-race.sh

fmt:
	gofmt -w .

fmt-check:
	@test -z "$$(gofmt -l cmd internal)" || (echo "gofmt needed on:"; gofmt -l cmd internal; exit 1)

vet:
	go vet ./...

staticcheck:
	go run $(STATICCHECK) ./...

vuln:
	go run $(GOVULNCHECK) ./...

# Complexity, length, copies and security patterns (spec 097). A package listed in
# scripts/lint-ratchet.txt may not get worse; every other package must be clean.
lint:
	@mkdir -p bin
	go run $(GOLANGCI_LINT) run --issues-exit-code=0 --output.json.path=bin/golangci.json --output.text.path=/dev/null ./...
	go run ./cmd/ratchet lint scripts/lint-ratchet.txt bin/golangci.json

# No secret in the working tree (fast), or in any commit (CI).
secrets:
	GITLEAKS=$(GITLEAKS) bash scripts/secret-scan.sh tree

secrets-history:
	GITLEAKS=$(GITLEAKS) bash scripts/secret-scan.sh history

# Known vulnerabilities of high or critical severity in any package, development ones too.
audit:
	cd web && npm audit --audit-level=high
	cd collab && npm audit --audit-level=high

licenses:
	node scripts/check-licenses.mjs

collab-check:
	cd collab && npm ci --no-fund --no-audit && node --test

web-check:
	cd web && npx tsc --noEmit && npx eslint src e2e && npx prettier --check src e2e && npm run -s strings && npm run -s design && npx vitest run

# Do two builds of the binary and the web assets match byte for byte? (spec 057)
reproducible:
	bash scripts/reproducible.sh

# Do the tests catch real bugs? Slow, so not part of every check.
mutation:
	bash scripts/mutation-check.sh

# The same for the frontend logic, with Stryker; no file's score may fall (spec 097).
mutation-web:
	cd web && KENWERK_REPO=$(CURDIR) npx stryker run
	go run ./cmd/ratchet mutation scripts/stryker-ratchet.txt web/reports/mutation/mutation.json

fuzz:
	go test ./internal/document/ -run '^$$' -fuzz FuzzFromMarkdown -fuzztime 60s
	go test ./internal/office/ -run '^$$' -fuzz FuzzReadDOCX -fuzztime 60s
	go test ./internal/exchange/ -run '^$$' -fuzz FuzzFrontMatter -fuzztime 30s
	go test ./internal/exchange/ -run '^$$' -fuzz FuzzVerifyBundle -fuzztime 60s
	go test ./internal/document/ -run '^$$' -fuzz FuzzNormalize -fuzztime 60s
	go test ./internal/exchange/ -run '^$$' -fuzz FuzzHTMLImport -fuzztime 60s
	go test ./internal/scim/ -run '^$$' -fuzz FuzzParseFilter -fuzztime 30s
	go test ./internal/search/ -run '^$$' -fuzz FuzzParseQuery -fuzztime 30s

check: fmt-check vet staticcheck vuln lint secrets audit licenses web-check collab-check test-race

clean:
	rm -rf bin dist
