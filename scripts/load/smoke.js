// SPDX-License-Identifier: Apache-2.0
// k6 load smoke test, run by the CI job load-smoke on every push (wave LT1) through
// scripts/load/smoke.sh, against an instance seeded by scripts/stress/seed.py at a small size.
//   k6 run -e BASE_URL=http://localhost:8095 -e SEED=seeded.json scripts/load/smoke.js
// It finds a read that became much slower; it does not measure capacity (blueprint 07.8,
// OPS-112). The heavy test of 5,000 people stays a manual run on a server (scripts/stress/).
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import exec from "k6/execution";
import { SharedArray } from "k6/data";

const base = __ENV.BASE_URL;
const list = (name) => new SharedArray(name, () => JSON.parse(open(__ENV.SEED))[name]);
const seed = {
  readable_pages: list("readable_pages"),
  readable_spaces: list("readable_spaces"),
  // Common, middling and rare words, as people search for all three.
  words: new SharedArray("words", () => {
    const s = JSON.parse(open(__ENV.SEED));
    return s.common_words.concat(s.mid_words, s.rare_words);
  }),
  people: new SharedArray("people", () => [JSON.parse(open(__ENV.SEED)).people])[0],
};
const password = open(__ENV.SEED + ".password").trim();
const serverErrors = new Counter("server_errors");

// The p95 budget of each main read, in milliseconds: the one place they are set. Each is the
// design target named beside it, and lies far above what was measured, so a slow shared runner
// stays inside it and only a real regression crosses it. On a GitHub hosted runner (4 CPUs,
// PostgreSQL with fsync, CI run 45437555924) this test measured p95: page 15.4 ms, bell 12.0,
// quick 42.0, search 52.2, tree 15.1, feed 20.1. Every budget is 8 to 33 times that, and a read
// slowed by 150 ms crosses the bell's (docs/reports/2026-11-24-wave-lt2.md).
const budgets = {
  // Blueprint 01: pages under 300 ms at p95. Measured: 109 ms p95 with 20 people on the 2012
  // server (stress test of 10 November), 19 to 31 ms at the model (operations/limits.md).
  page: 300,
  // ARC-199, the target of scripts/load/reading.js. Measured: 134 ms p95 with 20 people
  // (10 November); 17 to 36 ms for the largest space of 3,978 pages (limits.md).
  tree: 500,
  // ARC-200, the target of reading.js. Measured: 44 ms p95 at the model, 52 ms on a rare
  // word (limits.md).
  search: 500,
  // The quick box, the target of scripts/stress/load.js. Measured: typing 32 ms p95 at the
  // model (limits.md); spec 047 aims at 50 ms on the full setup.
  quick: 500,
  // The target of reading.js. Measured: 1.4 s p95 with 20 people before spec 061 (10 November),
  // 20 to 72 ms for the recent feed after it (limits.md), whose own test budget is 150 ms.
  feed: 500,
  // The bell's count, polled on every page view: the target of reading.js. Measured: 80 ms
  // before the fix (10 November), 5.8 ms after it (limits.md).
  bell: 100,
};

// Requests a second per read: about a tenth of the model of blueprint 07.8 (130 page reads,
// 40 searches while typing and 10 results pages a second for 5,000 people), with the bell on
// every page view and the tree and feed added. Open model: arrivals do not wait for answers,
// so a slow server cannot slow the test down and hide itself.
const rates = { page: 6, bell: 6, quick: 4, search: 1, tree: 1, feed: 1 };
const duration = __ENV.DURATION || "150s";
// The first seconds are not measured: each simulated person logs in (a password hash, on
// purpose slow) and the server's and PostgreSQL's caches fill. Their requests carry the route
// "warmup", which no budget reads; their errors still count.
const warmupSeconds = 15;

const scenarios = {};
const thresholds = {
  // Under 1% of requests fail; and none is a server error, busy (503) included: at this
  // rate a busy answer is a regression too.
  http_req_failed: ["rate<0.01"],
  server_errors: ["count<1"],
  // An iteration the tool could not start means the server held every simulated person
  // (blueprint 07.8: dropped iterations must be read).
  dropped_iterations: ["count<1"],
  checks: ["rate>0.99"],
};
for (const [route, rate] of Object.entries(rates)) {
  scenarios[route] = {
    executor: "constant-arrival-rate",
    exec: route,
    rate,
    timeUnit: "1s",
    duration: `${warmupSeconds + parseInt(duration, 10)}s`,
    preAllocatedVUs: rate * 2,
    maxVUs: rate * 10,
  };
  thresholds[`http_req_duration{route:${route}}`] = [`p(95)<${budgets[route]}`];
  // A threshold on a route with no requests passes without a word; this makes it fail.
  thresholds[`http_reqs{route:${route}}`] = [`count>${rate * 60}`];
}

export const options = {
  scenarios,
  thresholds,
  discardResponseBodies: true,
  // A person logs in once and stays logged in, as in a browser.
  noCookiesReset: true,
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)", "max"],
};

const pick = (items) => items[Math.floor(Math.random() * items.length)];

function loginOnce() {
  if (exec.vu.iterationInInstance > 0) return;
  const n = (exec.vu.idInTest - 1) % seed.people;
  const email = `person${String(n).padStart(5, "0")}@example.test`;
  const r = http.post(`${base}/api/v1/auth/login`, JSON.stringify({ email, password }), {
    headers: { "Content-Type": "application/json", Origin: base },
    tags: { route: "login", name: "login" },
  });
  if (r.status >= 500) serverErrors.add(1, { route: "login" });
  check(r, { "logged in": (x) => x.status === 200 });
}

function get(path, read) {
  loginOnce();
  const route = exec.instance.currentTestRunDuration < warmupSeconds * 1000 ? "warmup" : read;
  // The name tag groups every address of a route, so k6 keeps one series per route.
  const r = http.get(`${base}${path}`, { tags: { route, name: route } });
  if (r.status >= 500) serverErrors.add(1, { route });
  check(r, { [`${route} answered 200`]: (x) => x.status === 200 });
}

export function setup() {
  if (!base || !__ENV.SEED) throw new Error("BASE_URL and SEED are needed");
}

export function page() {
  get(`/api/v1/pages/${pick(seed.readable_pages)}`, "page");
}

export function bell() {
  get("/api/v1/me/notifications/count", "bell");
}

export function tree() {
  get(`/api/v1/spaces/${pick(seed.readable_spaces)}/tree`, "tree");
}

export function search() {
  get(`/api/v1/search?q=${encodeURIComponent(pick(seed.words))}`, "search");
}

export function quick() {
  // The quick box asks after the third letter, as the frontend does.
  const word = pick(seed.words);
  get(`/api/v1/search/quick?q=${encodeURIComponent(word.slice(0, 3 + Math.floor(Math.random() * (word.length - 2))))}`, "quick");
}

export function feed() {
  get("/api/v1/feed", "feed");
}

// The whole summary goes to a file beside the human summary, for the report and the job log.
export function handleSummary(data) {
  const out = { stdout: textSummary(data) };
  if (__ENV.SUMMARY) out[__ENV.SUMMARY] = JSON.stringify(data);
  return out;
}

// textSummary prints one line per route: p50, p95 and its budget, and the count.
function textSummary(data) {
  const lines = ["route    requests   p50 ms   p95 ms   budget"];
  for (const route of Object.keys(rates)) {
    const d = data.metrics[`http_req_duration{route:${route}}`];
    const n = data.metrics[`http_reqs{route:${route}}`];
    const v = d ? d.values : {};
    lines.push(`${route.padEnd(8)} ${String(n ? n.values.count : 0).padStart(8)} ${fmt(v["p(50)"])} ${fmt(v["p(95)"])} ${String(budgets[route]).padStart(8)}`);
  }
  const failed = data.metrics.http_req_failed ? data.metrics.http_req_failed.values.rate : 0;
  const errors = data.metrics.server_errors ? data.metrics.server_errors.values.count : 0;
  const dropped = data.metrics.dropped_iterations ? data.metrics.dropped_iterations.values.count : 0;
  lines.push(`failed ${(failed * 100).toFixed(2)}%, server errors ${errors}, dropped iterations ${dropped}`);
  const broken = Object.entries(data.metrics)
    .filter(([, m]) => m.thresholds && Object.values(m.thresholds).some((t) => !t.ok))
    .map(([name]) => name);
  lines.push(broken.length ? `thresholds crossed: ${broken.join(", ")}` : "all thresholds held");
  return lines.join("\n") + "\n";
}

function fmt(ms) {
  return (ms === undefined ? "-" : ms.toFixed(1)).padStart(8);
}
