#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Writes docs/dependency-inventory.md: every dependency of Kenwerk, direct and transitive,
// with its licence, its parent, whether it is critical, its last release and its OpenSSF
// Scorecard (wave DA2). Go modules, npm packages of web and collab, container images,
// GitHub Actions and the pinned CI tools.
//
// Run it in the development toolbox, which has Go, Node and the network:
//   scripts/dev node scripts/dependency-inventory.mjs
// It sends only package names, versions and public repository names, to api.deps.dev,
// api.securityscorecards.dev, hub.docker.com and github.com (the release feeds of actions).
// It needs no token.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const OUTPUT = 'docs/dependency-inventory.md';
const PARALLEL = 8;
const SELF = 'github.com/kenwerk/kenwerk';

// Which dependencies are critical, and why, is argued in
// docs/reports/2026-11-24-dependency-review.md. A name matches an entry exactly, or by
// prefix when the entry ends in '/' or '-'.
const CRITICAL = {
  'github.com/coreos/go-oidc/v3': 'security',
  'golang.org/x/oauth2': 'security',
  'github.com/go-jose/go-jose/v4': 'security',
  'github.com/golang-jwt/jwt/v5': 'security',
  'github.com/go-webauthn/webauthn': 'security',
  'github.com/go-webauthn/x': 'security',
  'github.com/fxamacker/cbor/v2': 'security',
  'github.com/google/go-tpm': 'security',
  'github.com/creachadair/otp': 'security',
  'github.com/boombuler/barcode': 'security',
  'golang.org/x/crypto': 'security',
  'golang.org/x/net': 'security',
  'golang.org/x/text': 'security',
  'github.com/yuin/goldmark': 'security',
  'go.yaml.in/yaml/v3': 'security',
  'github.com/jackc/pgx/v5': 'security, architecture',
  'github.com/nats-io/nats-server/v2': 'security, architecture',
  'github.com/nats-io/nats.go': 'security, architecture',
  'github.com/nats-io/jwt/v2': 'security',
  'github.com/nats-io/nkeys': 'security',
  'github.com/modelcontextprotocol/go-sdk': 'security, architecture',
  'github.com/google/jsonschema-go': 'security',
  'github.com/segmentio/encoding': 'security',
  'github.com/google/uuid': 'architecture',
  'go.opentelemetry.io/otel': 'architecture',
  'go.opentelemetry.io/otel/': 'architecture',
  '@tiptap/': 'security, architecture',
  'prosemirror-': 'security, architecture',
  yjs: 'security, architecture',
  'y-protocols': 'security, architecture',
  lib0: 'security',
  '@hocuspocus/': 'security, architecture',
  crossws: 'security',
  linkifyjs: 'security',
  lowlight: 'security',
  'highlight.js': 'security',
  react: 'architecture',
  'react-dom': 'architecture',
  '@tanstack/react-query': 'architecture',
  i18next: 'architecture',
  'react-i18next': 'architecture',
};
// Development packages that build the web assets of a release: critical although no line of
// them ships.
const CRITICAL_BUILD = {
  vite: 'architecture',
  rolldown: 'architecture',
};

// Source repositories deps.dev does not name, or names under a moved organisation that has no
// Scorecard yet.
const REPO_OVERRIDES = [
  [/^golang\.org\/x\/([a-z0-9]+)$/, (m) => `golang/${m[1]}`],
  [/^(prosemirror-[a-z-]+)$/, (m) => `ProseMirror/${m[1]}`],
  [/^crossws$/, () => 'h3js/crossws'],
  [/^std-env$/, () => 'unjs/std-env'],
  [/^google\.golang\.org\/protobuf$/, () => 'protocolbuffers/protobuf-go'],
  [/^gopkg\.in\/yaml\.v3$/, () => 'go-yaml/yaml'],
  [/^gopkg\.in\/check\.v1$/, () => 'go-check/check'],
  [/^(react|react-dom|scheduler)$/, () => 'facebook/react'],
];

function repoOverride(name) {
  for (const [pattern, repo] of REPO_OVERRIDES) {
    const m = name.match(pattern);
    if (m) return repo(m);
  }
  return undefined;
}

// The licence of the software an image carries, not of each operating system package in it.
const IMAGE_FACTS = {
  'gcr.io/distroless/static-debian13': { licence: 'Apache-2.0 (Debian packages: various)', repo: 'GoogleContainerTools/distroless' },
  node: { licence: 'MIT (Node.js; Debian packages: various)', repo: 'nodejs/docker-node', hub: 'library/node' },
  golang: { licence: 'BSD-3-Clause (Go; Debian packages: various)', repo: 'docker-library/golang', hub: 'library/golang' },
  postgres: { licence: 'PostgreSQL (Debian packages: various)', repo: 'docker-library/postgres', hub: 'library/postgres' },
  python: { licence: 'PSF-2.0 (Python; Debian packages: various)', repo: 'docker-library/python', hub: 'library/python' },
  'gotenberg/gotenberg': { licence: 'MIT (Gotenberg; LibreOffice MPL-2.0, Chromium BSD-3-Clause)', repo: 'gotenberg/gotenberg', hub: 'gotenberg/gotenberg' },
  'mcr.microsoft.com/playwright': { licence: 'Apache-2.0 (Ubuntu packages: various)', repo: 'microsoft/playwright' },
  'axllent/mailpit': { licence: 'MIT', repo: 'axllent/mailpit', hub: 'axllent/mailpit' },
  'semgrep/semgrep': { licence: 'LGPL-2.1', repo: 'semgrep/semgrep', hub: 'semgrep/semgrep' },
};
const CRITICAL_IMAGES = {
  'gcr.io/distroless/static-debian13': 'security, architecture',
  node: 'security, architecture',
  postgres: 'security, architecture',
  'gotenberg/gotenberg': 'security',
  golang: 'architecture',
};

// CI tools pinned outside a lock file: where the pin is, and where to look them up.
const TOOLS = [
  { name: 'staticcheck', file: 'Makefile', pattern: /honnef\.co\/go\/tools\/cmd\/staticcheck@(v[\d.]+)/, go: 'honnef.co/go/tools', repo: 'dominikh/go-tools', licence: 'MIT' },
  { name: 'govulncheck', file: 'Makefile', pattern: /golang\.org\/x\/vuln\/cmd\/govulncheck@(v[\d.]+)/, go: 'golang.org/x/vuln', repo: 'golang/vuln', licence: 'BSD-3-Clause', critical: 'security' },
  { name: 'golangci-lint', file: 'Makefile', pattern: /golangci-lint@(v[\d.]+)/, go: 'github.com/golangci/golangci-lint/v2', repo: 'golangci/golangci-lint', licence: 'GPL-3.0 (separate process)' },
  { name: 'gitleaks', file: 'Makefile', pattern: /gitleaks\/v8@(v[\d.]+)/, go: 'github.com/zricethezav/gitleaks/v8', repo: 'gitleaks/gitleaks', licence: 'MIT', critical: 'security' },
  { name: 'GoReleaser', file: '.github/workflows/release.yml', pattern: /GORELEASER_VERSION: (v[\d.]+)/, go: 'github.com/goreleaser/goreleaser/v2', repo: 'goreleaser/goreleaser', licence: 'MIT', critical: 'security, architecture' },
  { name: 'cosign', file: '.github/workflows/release.yml', pattern: /COSIGN_VERSION: (v[\d.]+)/, go: 'github.com/sigstore/cosign/v3', repo: 'sigstore/cosign', licence: 'Apache-2.0', critical: 'security' },
  { name: 'syft', file: '.github/workflows/release.yml', pattern: /SYFT_VERSION: (v[\d.]+)/, go: 'github.com/anchore/syft', repo: 'anchore/syft', licence: 'Apache-2.0', critical: 'security' },
  { name: 'Helm', file: 'scripts/deploy-check.sh', pattern: /HELM_VERSION=(v[\d.]+)/, go: 'helm.sh/helm/v4', repo: 'helm/helm', licence: 'Apache-2.0', critical: 'security' },
  { name: 'kubeconform', file: 'scripts/deploy-check.sh', pattern: /KUBECONFORM_VERSION=(v[\d.]+)/, go: 'github.com/yannh/kubeconform', repo: 'yannh/kubeconform', licence: 'Apache-2.0' },
  { name: 'OpenTofu', file: 'scripts/deploy-check.sh', pattern: /TOFU_VERSION=([\d.]+)/, go: 'github.com/opentofu/opentofu', repo: 'opentofu/opentofu', licence: 'MPL-2.0', prefixV: true },
  { name: 'Terraform', file: 'scripts/deploy-check.sh', pattern: /TERRAFORM_VERSION=([\d.]+)/, go: 'github.com/hashicorp/terraform', repo: 'hashicorp/terraform', licence: 'MPL-2.0 (this version)', prefixV: true },
  { name: 'Bicep', file: 'scripts/deploy-check.sh', pattern: /BICEP_VERSION=(v[\d.]+)/, repo: 'Azure/bicep', licence: 'MIT' },
  { name: 'k6', file: 'scripts/load/smoke.sh', pattern: /K6_VERSION=(v[\d.]+)/, repo: 'grafana/k6', licence: 'AGPL-3.0 (separate process)' },
];

const stats = { calls: 0, failed: 0 };

async function getJSON(url) {
  stats.calls++;
  const res = await fetch(url, { headers: { 'User-Agent': 'kenwerk-dependency-inventory' } });
  if (!res.ok) throw Object.assign(new Error(`${res.status} from ${new URL(url).host}`), { status: res.status });
  return res.json();
}

// Runs fn over items, PARALLEL at a time, and keeps the order.
async function mapLimited(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return out;
}

function matchCritical(name, table) {
  for (const [key, why] of Object.entries(table)) {
    if (name === key || ((key.endsWith('/') || key.endsWith('-')) && name.startsWith(key))) return why;
  }
  return 'no';
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
}

// `go list -m -json all` prints one JSON object after another, not an array.
function parseJSONStream(text) {
  return JSON.parse('[' + text.replace(/}\s*{/g, '},{') + ']');
}

function modulesUsedBy(args) {
  return new Set(run('go', ['list', '-deps', ...args, '-f', '{{with .Module}}{{.Path}}{{end}}', './...']).split('\n').filter(Boolean));
}

// For each indirect module, the module through which Kenwerk's direct requirements reach it
// first. The main module's own edges are left out: go.mod lists every indirect module too.
function goParents(direct) {
  const edges = new Map();
  for (const line of run('go', ['mod', 'graph']).split('\n')) {
    const [from, to] = line.split(' ');
    if (!to) continue;
    const parent = from.split('@')[0];
    if (!edges.has(parent)) edges.set(parent, []);
    edges.get(parent).push(to.split('@')[0]);
  }
  const parents = new Map(direct.map((mod) => [mod, 'direct']));
  const queue = [...direct];
  while (queue.length) {
    const mod = queue.shift();
    for (const child of edges.get(mod) ?? []) {
      if (child === SELF || parents.has(child)) continue;
      parents.set(child, mod);
      queue.push(child);
    }
  }
  return parents;
}

function collectGo() {
  const modules = parseJSONStream(run('go', ['list', '-m', '-json', 'all'])).filter((m) => !m.Main);
  const binary = new Set(run('go', ['list', '-deps', '-f', '{{with .Module}}{{.Path}}{{end}}', './cmd/kenwerk']).split('\n').filter(Boolean));
  const tests = modulesUsedBy(['-test']);
  const parents = goParents(modules.filter((m) => !m.Indirect).map((m) => m.Path));
  const rows = modules.map((m) => ({
    ecosystem: 'go',
    name: m.Path,
    version: m.Replace?.Version ?? m.Version,
    parent: parents.get(m.Path) ?? 'module graph',
    used: binary.has(m.Path) ? 'binary' : tests.has(m.Path) ? 'tests and tools' : 'module graph only',
    critical: binary.has(m.Path) ? matchCritical(m.Path, CRITICAL) : 'no',
    repo: repoOverride(m.Path),
  }));
  const toolchain = run('go', ['env', 'GOVERSION']).trim();
  rows.unshift({
    ecosystem: 'toolchain', name: 'Go toolchain and standard library', version: toolchain, parent: 'direct',
    used: 'binary', critical: 'security, architecture', licence: 'BSD-3-Clause', repo: 'golang/go',
    lastRelease: 'see go.dev/doc/devel/release',
  });
  return rows;
}

// npm resolves a dependency from the nearest node_modules folder upwards.
function resolveNpm(packages, fromPath, name) {
  let base = fromPath;
  for (;;) {
    const candidate = (base ? base + '/' : '') + 'node_modules/' + name;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const cut = base.lastIndexOf('/node_modules/');
    base = cut === -1 ? '' : base.slice(0, cut);
  }
}

function npmParents(packages) {
  const parents = new Map();
  const queue = [''];
  while (queue.length) {
    const path = queue.shift();
    const entry = packages[path];
    const names = Object.keys({ ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies, ...(path === '' ? entry.devDependencies : {}) });
    for (const name of names) {
      const child = resolveNpm(packages, path, name);
      if (!child || parents.has(child)) continue;
      parents.set(child, path === '' ? 'direct' : packages[path].name ?? path.slice(path.lastIndexOf('node_modules/') + 13));
      queue.push(child);
    }
  }
  return parents;
}

function collectNpm(lockFile, where) {
  const { packages } = JSON.parse(readFileSync(lockFile, 'utf8'));
  const parents = npmParents(packages);
  const seen = new Set();
  const rows = [];
  for (const [path, entry] of Object.entries(packages)) {
    if (!path.includes('node_modules/') || entry.link) continue;
    const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 13);
    if (seen.has(name + '@' + entry.version)) continue;
    seen.add(name + '@' + entry.version);
    rows.push({
      ecosystem: 'npm', name, version: entry.version, licence: entry.license,
      parent: parents.get(path) ?? 'not reached from the root',
      used: entry.dev ? `${where}, development only` : where,
      critical: entry.dev ? matchCritical(name, CRITICAL_BUILD) : matchCritical(name, CRITICAL),
      repo: repoOverride(name),
    });
  }
  return rows;
}

function collectImages() {
  const files = ['Dockerfile', 'collab/Dockerfile', 'deploy/pdf/Dockerfile', 'Dockerfile.dev', 'compose.yaml', 'compose.dev.yaml', '.github/workflows/ci.yml', 'scripts/deploy-check.sh'];
  const roles = { Dockerfile: 'image build', 'collab/Dockerfile': 'collab image', 'deploy/pdf/Dockerfile': 'pdf image', 'Dockerfile.dev': 'development', 'compose.yaml': 'reference installation', 'compose.dev.yaml': 'development', '.github/workflows/ci.yml': 'CI', 'scripts/deploy-check.sh': 'CI' };
  const found = new Map();
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/(?:^FROM\s+|image:\s+|_IMAGE=)([a-z0-9./-]+):([\w.-]+)(@sha256:[0-9a-f]{12})?/gm)) {
      const [, image, tag, digest] = m;
      const key = `${image}:${tag}`;
      if (!found.has(key)) found.set(key, { image, tag, digest: digest ? digest.slice(1) : 'no digest', files: new Set() });
      found.get(key).files.add(roles[file]);
    }
  }
  return [...found.values()].map(({ image, tag, digest, files }) => {
    const facts = IMAGE_FACTS[image] ?? {};
    // Only an image that runs Kenwerk or builds its release can be critical.
    const shipsOrBuilds = files.has('reference installation') || files.has('image build') || files.has('collab image') || files.has('pdf image');
    return {
      ecosystem: 'image', name: image, version: `${tag} (${digest})`, tag, licence: facts.licence, repo: facts.repo, hub: facts.hub,
      parent: 'direct', used: [...files].join(', '),
      critical: shipsOrBuilds ? matchCritical(image, CRITICAL_IMAGES) : 'no',
    };
  });
}

function collectActions() {
  const found = new Map();
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
    for (const m of readFileSync(file, 'utf8').matchAll(/uses:\s+([\w.-]+\/[\w.-]+)(\/[\w./-]+)?@([0-9a-f]{40})\s+#\s+(v[\d.]+)/g)) {
      const [, repo, sub, , version] = m;
      const name = repo + (sub ?? '');
      if (!found.has(name)) found.set(name, { ecosystem: 'action', name, version, repo, parent: 'direct', used: 'CI', critical: 'security' });
    }
  }
  return [...found.values()];
}

function collectTools() {
  const rows = TOOLS.map((tool) => {
    const m = readFileSync(tool.file, 'utf8').match(tool.pattern);
    if (!m) throw new Error(`no pin for ${tool.name} in ${tool.file}: update TOOLS in this script`);
    const version = tool.prefixV ? 'v' + m[1] : m[1];
    return { ecosystem: 'tool', name: tool.name, version, licence: tool.licence, goModule: tool.go, repo: tool.repo, parent: 'direct', used: 'CI', critical: tool.critical ?? 'no' };
  });
  for (const m of readFileSync('scripts/deploy-check/cfn-lint.txt', 'utf8').matchAll(/^([\w.-]+)==([\w.]+)/gm)) {
    rows.push({ ecosystem: 'pypi', name: m[1], version: m[2], parent: m[1] === 'cfn-lint' ? 'direct' : 'cfn-lint', used: 'CI', critical: 'no' });
  }
  return rows;
}

const scorecards = new Map();

// The Scorecard of a source repository: the OpenSSF API first, then deps.dev's copy.
function scorecardOf(projectId) {
  if (!scorecards.has(projectId)) {
    scorecards.set(projectId, (async () => {
      try {
        const sc = await getJSON(`https://api.securityscorecards.dev/projects/${projectId}`);
        return String(sc.score);
      } catch {
        // No Scorecard at the OpenSSF API for this repository; deps.dev may still hold one.
      }
      try {
        const p = await getJSON(`https://api.deps.dev/v3/projects/${encodeURIComponent(projectId)}`);
        return p.scorecard ? String(p.scorecard.overallScore) : 'none';
      } catch (err) {
        if (err.status === 404) return 'none';
        stats.failed++;
        return `not measured (${err.message})`;
      }
    })());
  }
  return scorecards.get(projectId);
}

const DEPSDEV_SYSTEM = { go: 'go', npm: 'npm', pypi: 'pypi' };

async function enrichFromDepsDev(row, system, name, version) {
  const base = `https://api.deps.dev/v3/systems/${system}/packages/${encodeURIComponent(name)}`;
  const pkg = await getJSON(base);
  const latest = pkg.versions.find((v) => v.isDefault);
  if (latest) row.lastRelease = `${(latest.publishedAt ?? '').slice(0, 10)} (${latest.versionKey.version})`;
  if (!version) return;
  const ver = await getJSON(`${base}/versions/${encodeURIComponent(version)}`);
  row.licence ??= (ver.licenses ?? []).join(', ') || undefined;
  const source = (ver.relatedProjects ?? []).find((p) => p.relationType === 'SOURCE_REPO');
  if (source && !row.repo) row.projectId = source.projectKey.id;
}

async function enrichImage(row) {
  if (!row.hub) {
    row.lastRelease = 'not looked up (not on Docker Hub)';
    return;
  }
  const tag = await getJSON(`https://hub.docker.com/v2/repositories/${row.hub}/tags/${encodeURIComponent(row.tag)}`);
  row.lastRelease = `${tag.last_updated.slice(0, 10)} (tag pushed)`;
}

// The newest entry of the repository's release feed. The feed is a public page, so it is not
// held to the API's limit of 60 calls an hour.
async function enrichAction(row) {
  const p = await getJSON(`https://api.deps.dev/v3/projects/${encodeURIComponent('github.com/' + row.repo)}`);
  row.licence ??= p.license;
  stats.calls++;
  const res = await fetch(`https://github.com/${row.repo}/releases.atom`, { headers: { 'User-Agent': 'kenwerk-dependency-inventory' } });
  if (!res.ok) throw new Error(`${res.status} from github.com`);
  const entry = (await res.text()).match(/<entry>[\s\S]*?<updated>([^<]+)<\/updated>[\s\S]*?<title>([^<]+)<\/title>/);
  if (!entry) throw new Error('no release in the feed of github.com');
  row.lastRelease = `${entry[1].slice(0, 10)} (${entry[2].trim()})`;
}

async function enrich(row) {
  try {
    if (DEPSDEV_SYSTEM[row.ecosystem]) await enrichFromDepsDev(row, DEPSDEV_SYSTEM[row.ecosystem], row.name, row.version);
    else if (row.ecosystem === 'tool' && row.goModule) await enrichFromDepsDev(row, 'go', row.goModule, null);
    else if (row.ecosystem === 'image') await enrichImage(row);
    else if (row.ecosystem === 'action' || row.ecosystem === 'tool') await enrichAction(row);
  } catch (err) {
    stats.failed++;
    row.lastRelease ??= `not measured (${err.message})`;
  }
  const projectId = row.repo ? 'github.com/' + row.repo : row.projectId;
  row.scorecard = projectId ? await scorecardOf(projectId) : 'no source repository known';
  return row;
}

// A Markdown table cell: backslashes are escaped first, so a value ending in one cannot
// unescape the pipe after it, then pipes; a line break would end the row, so it becomes a space.
function cell(value) {
  return String(value ?? 'unknown')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');
}

function table(rows) {
  const lines = ['| Name | Version | Licence | Direct, or through | Critical | Used in | Last release | Scorecard |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    lines.push(`| \`${cell(r.name)}\` | ${cell(r.version)} | ${cell(r.licence)} | ${cell(r.parent)} | ${cell(r.critical)} | ${cell(r.used)} | ${cell(r.lastRelease)} | ${cell(r.scorecard)} |`);
  }
  return lines.join('\n');
}

const SECTIONS = [
  ['Go modules', (r) => r.ecosystem === 'go' || r.ecosystem === 'toolchain'],
  ['npm packages of the web frontend (`web/package-lock.json`)', (r) => r.ecosystem === 'npm' && r.used.startsWith('web')],
  ['npm packages of the service for editing together (`collab/package-lock.json`)', (r) => r.ecosystem === 'npm' && r.used.startsWith('collab')],
  ['Container images', (r) => r.ecosystem === 'image'],
  ['GitHub Actions', (r) => r.ecosystem === 'action'],
  ['CI tools', (r) => r.ecosystem === 'tool' || r.ecosystem === 'pypi'],
];

function render(rows, measured) {
  const critical = rows.filter((r) => r.critical !== 'no').length;
  const parts = [
    '# Dependency inventory',
    '',
    'Written for: the product owner, operators and auditors who want to see every dependency of Kenwerk in one place.',
    '',
    `Every dependency, direct and transitive: Go modules, the npm packages of the web frontend and of the service for editing together, container images, GitHub Actions and the CI tools. ${rows.length} rows, ${critical} of them critical. Measured on ${measured}.`,
    '',
    'This file is generated. Do not edit it by hand: run `scripts/dev node scripts/dependency-inventory.mjs` in the development toolbox, which needs the network, and commit the result. How each critical dependency is judged, and the verdict on each, is in [the dependency review of 2026-11-24](reports/2026-11-24-dependency-review.md); why each direct dependency exists is in [dependencies.md](dependencies.md).',
    '',
    'The columns:',
    '',
    '- **Direct, or through**: `direct` when Kenwerk names it itself, otherwise the dependency that brings it in first (for npm, the package that requires it; for Go, the first module on the shortest path in `go mod graph`).',
    '- **Critical**: `security` for code that handles logins, sessions, tokens, cryptography, untrusted input, user content, the database, the queue or secrets in CI; `architecture` for what is hard to replace once built in. Only what ships or builds a release can be critical; development tools are `no`.',
    '- **Used in**: `binary` is compiled into `kenwerk`; `tests and tools` is built only for tests or a command under `cmd/`; `module graph only` is named in the Go module graph and never built. `development only` npm packages never reach a build.',
    '- **Last release**: the date and version of the newest release (deps.dev, Docker Hub for an image tag, GitHub for an action), which may be newer than the version used.',
    '- **Scorecard**: the OpenSSF Scorecard of the source repository, from api.securityscorecards.dev, or from deps.dev when the first has none; `none` when neither has one. A score is of the repository, so packages from one repository share it.',
    '- Licences come from deps.dev and the npm lock files; `scripts/check-licenses.mjs` is the gate that holds them to the allow-list.',
    '',
    'This file lists no advisories. Known vulnerabilities are checked on every change by govulncheck and `npm audit` (`make check` and CI), and the images by Trivy in CI.',
  ];
  for (const [title, test] of SECTIONS) {
    const section = rows.filter(test).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
    parts.push('', `## ${title}`, '', `${section.length} rows.`, '', table(section));
  }
  return parts.join('\n') + '\n';
}

async function main() {
  const rows = [
    ...collectGo(),
    ...collectNpm('web/package-lock.json', 'web'),
    ...collectNpm('collab/package-lock.json', 'collab'),
    ...collectImages(),
    ...collectActions(),
    ...collectTools(),
  ];
  await mapLimited(rows, enrich);
  const measured = new Date().toISOString().slice(0, 10);
  writeFileSync(OUTPUT, render(rows, measured));
  console.log(`${OUTPUT}: ${rows.length} rows, ${stats.calls} calls, ${stats.failed} lookups failed`);
  if (stats.failed > 0) console.error('Some cells say "not measured": run it again, or look up those rows by hand.');
}

await main();
