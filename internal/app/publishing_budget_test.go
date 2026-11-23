// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/kenwerk/kenwerk/internal/db"
)

// The load budget of wave PB2 (spec 073, PUB-1103 to PUB-1106), measured on generated data:
// a whole-space release of 2,000 pages in batches and of 1,000 pages in one transaction, the
// release screen at 5,000 pages, a preview of 2,000 pages and a second run with nothing to do.
// The queries are bounded on every run. The times are logged, and bounded only with
// KENWERK_LOAD_BUDGET set (timeBudgets): on a loaded test machine they say more about the
// machine than about the release. The numbers go in the report.

// manyDraftPages adds sections of pages below the home page of a draft space, with one version
// each, faster than the API could: sections times perSection pages, plus the sections.
func (w pubWorld) manyDraftPages(prefix string, sections, perSection int) {
	w.e.t.Helper()
	doc := `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"` +
		"A page of the handbook with a few sentences of ordinary text, as a page of a guide has. " +
		"It explains one step, names the people to ask, and says what to do when the step fails." + `"}]}]}`
	insert := func(parentFilter string, count int) {
		w.e.sql(`WITH made AS (
				INSERT INTO pages (id, origin_instance_id, space_id, parent_id, position, title, status, current_version,
					created_by, updated_by, owner_id, kind, published_at)
				SELECT gen_random_uuid(), p.origin_instance_id, p.space_id, p.id, n, $3 || ' ' || p.position || '.' || n, 'published', 1,
					p.created_by, p.created_by, p.created_by, 'page', now()
				FROM pages p, generate_series(1, $2) n WHERE `+parentFilter+`
				RETURNING id, parent_id)
			INSERT INTO page_tree (ancestor_id, descendant_id, depth)
			SELECT t.ancestor_id, m.id, t.depth + 1 FROM made m JOIN page_tree t ON t.descendant_id = m.parent_id
			UNION ALL SELECT m.id, m.id, 0 FROM made m`, w.draftHome, count, prefix)
	}
	insert("p.id = $1", sections)
	insert(fmt.Sprintf("p.parent_id = $1 AND p.title LIKE '%s %%'", prefix), perSection)
	w.e.sql(`INSERT INTO page_versions (id, origin_instance_id, page_id, number, title, document, schema_version, author_id, summary)
		SELECT gen_random_uuid(), p.origin_instance_id, p.id, 1, p.title, $2::jsonb,
			(SELECT schema_version FROM page_versions WHERE page_id = $1 LIMIT 1), p.created_by, ''
		FROM pages p WHERE p.space_id = (SELECT space_id FROM pages WHERE id = $1) AND p.current_version = 1
		  AND NOT EXISTS (SELECT 1 FROM page_versions v WHERE v.page_id = p.id)`, w.draftHome, doc)
}

// measuredRun is one release run: how long its preview and run took, the queries of the run,
// and the run as the release screen shows it afterwards.
type measuredRun struct {
	preview, run time.Duration
	queries      int64
	out          map[string]any
}

func (w pubWorld) timedRun(scope runBody) measuredRun {
	w.e.t.Helper()
	var m measuredRun
	start := time.Now()
	p := w.previewRun(w.admin, scope)
	m.preview = time.Since(start)
	id := p["id"].(string)
	w.admin.want(http.StatusAccepted, "POST", "/api/v1/spaces/"+w.draft+"/releases/"+id+"/start", map[string]any{"note": "measured"})
	start = time.Now()
	before := db.Queries(w.e.app.Pool())
	w.e.runJobs()
	m.queries = db.Queries(w.e.app.Pool()) - before
	m.run = time.Since(start)
	m.out = w.admin.ok("GET", "/api/v1/spaces/"+w.draft+"/releases/"+id, nil)
	return m
}

// maxRunQueriesPerPage bounds the work of a release run by what does not depend on the
// machine: the queries it sends, the same number on every run. A run of 2,001 pages in
// batches sent 130,637 (wave FX10), 65.3 a page, so one query more for each page fails here.
// A run that costs less should get a lower bound.
const maxRunQueriesPerPage = 66

// releaseScreenQueries is what the release screen costs at 5,001 pages, 3,000 of them not
// released yet: 9 queries (wave FX10). With every page released it costs 8, as no page waits.
// A query for each page would cost thousands.
const releaseScreenQueries = 9

// timeBudgets says whether the bounds on time are checked. They are only meaningful on a
// machine that does nothing else and outside the race detector, as for the other load tests.
// The times are logged on every run, and the bounds on queries are always checked.
func timeBudgets() bool { return os.Getenv("KENWERK_LOAD_BUDGET") != "" }

func TestAWholeSpaceReleaseFitsItsBudget(t *testing.T) {
	if testing.Short() {
		t.Skip("a measurement")
	}
	e := newEnv(t)
	w := newPubWorld(e, "LOAD")
	w.manyDraftPages("Section", 40, 49) // 40 sections of 49 pages and the home page: 2,001 pages
	pages := e.count("SELECT count(*) FROM pages WHERE space_id = $1", w.draft)
	m := w.timedRun(runBody{"scope": "space"})
	if m.out["status"] != "done" || m.out["batches"].(float64) < 1 {
		t.Fatalf("a whole-space release of %d pages: %v", pages, m.out)
	}
	rate := float64(pages) / m.run.Seconds()
	t.Logf("whole space, %d pages in %d batches: preview %v, run %v, %.0f pages a second, %d queries",
		pages, int(m.out["batches"].(float64)), m.preview, m.run, rate, m.queries)
	if m.queries > maxRunQueriesPerPage*int64(pages) {
		t.Fatalf("a whole-space release of %d pages sent %d queries", pages, m.queries)
	}
	if timeBudgets() && rate < 10 {
		t.Fatalf("a whole-space release ran at %.0f pages a second", rate)
	}
	// A second run with nothing to do answers at once (PUB-1108: within 2 s).
	start := time.Now()
	w.admin.want(http.StatusConflict, "POST", "/api/v1/spaces/"+w.draft+"/releases/preview", runBody{"scope": "space"})
	t.Logf("a second whole-space preview with nothing to do: %v", time.Since(start))
	w.checkLargeReleaseScreen(t)
	checkOneTransactionRun(t, e)
}

// checkLargeReleaseScreen measures the release screen at 5,000 pages, 3,000 of them not
// released yet (PUB-1103: 100 ms).
func (w pubWorld) checkLargeReleaseScreen(t *testing.T) {
	t.Helper()
	screen := "/api/v1/spaces/" + w.draft + "/releases"
	w.manyDraftPages("Annex", 60, 49)
	total := w.e.count("SELECT count(*) FROM pages WHERE space_id = $1", w.draft)
	queries := queriesOf(t, w.e, w.admin, screen)
	if queries > releaseScreenQueries {
		t.Fatalf("the release screen costs %d queries at %d pages, over its %d", queries, total, releaseScreenQueries)
	}
	var screens []time.Duration
	for range 10 {
		start := time.Now()
		w.admin.ok("GET", screen, nil)
		screens = append(screens, time.Since(start))
	}
	t.Logf("the release screen at %d pages over HTTP: %d queries, first %v, best %v", total, queries, screens[0], minDuration(screens))
	if best := minDuration(screens); timeBudgets() && best > 2*time.Second {
		t.Fatalf("the release screen took %v at %d pages", best, total)
	}
}

// checkOneTransactionRun measures a release of 1,000 pages in one transaction, in a pair of
// its own (PUB-450, PUB-1106: 30 s at most).
func checkOneTransactionRun(t *testing.T, e *env) {
	t.Helper()
	one := newPubWorld(e, "LOADONE")
	one.manyDraftPages("Part", 20, 48) // 980 pages, with the sections and the home page 1,001 at most
	count := e.count("SELECT count(*) FROM pages WHERE space_id = $1", one.draft)
	m := one.timedRun(runBody{"scope": "space"})
	if m.out["status"] != "done" || m.out["batches"] != 0.0 {
		t.Fatalf("a release of %d pages in one transaction: %v", count, m.out)
	}
	t.Logf("whole space, %d pages in one transaction: preview %v, run %v, %.0f pages a second, %d queries",
		count, m.preview, m.run, float64(count)/m.run.Seconds(), m.queries)
	if m.queries > maxRunQueriesPerPage*int64(count) {
		t.Fatalf("a release of %d pages in one transaction sent %d queries", count, m.queries)
	}
}

// TestAStartAndASpaceWideVerificationFitTheirBudget measures wave PB4 (spec 073, PUB-1309,
// PUB-920) on generated data: a draft space started from a space of about 1,000 pages, and the
// verification of every published page after it. The bounds are wide; the numbers go in the report.
func TestAStartAndASpaceWideVerificationFitTheirBudget(t *testing.T) {
	if testing.Short() {
		t.Skip("a measurement")
	}
	e := newEnv(t)
	s := newStartWorld(e, "SLOAD")
	pubWorld{e: e, draftHome: s.home}.manyDraftPages("Chapter", 20, 49) // 1,000 pages more
	pages := e.count("SELECT count(*) FROM pages WHERE space_id = $1 AND kind = 'page' AND status = 'published'", s.space)
	start := time.Now()
	preview := s.admin.ok("POST", "/api/v1/spaces/"+s.space+"/publishing/start-preview", s.startBody())
	previewed := time.Since(start)
	start = time.Now()
	s.start()
	started := time.Since(start)
	t.Logf("a start of %d pages: preview %v (estimated %v s), start %v, %.0f pages a second", pages, previewed, preview["seconds"],
		started, float64(pages)/started.Seconds())
	if rate := float64(pages) / started.Seconds(); rate < 5 {
		t.Fatalf("a start ran at %.0f pages a second", rate)
	}
	start = time.Now()
	job := s.admin.want(http.StatusAccepted, "POST", "/api/v1/spaces/"+s.draft+"/releases/verify", nil)
	e.runJobs()
	verified := time.Since(start)
	id := job[len(`{"job_id":"`) : len(`{"job_id":"`)+36]
	report := s.admin.ok("GET", "/api/v1/jobs/"+id, nil)["result"].(map[string]any)["counts"].(map[string]any)
	t.Logf("the verification of every published page: %v for %v", verified, report)
	if report["verified"] != float64(pages) {
		t.Fatalf("after a start, %v of %d pages verified", report["verified"], pages)
	}
}

func minDuration(list []time.Duration) time.Duration {
	best := list[0]
	for _, d := range list[1:] {
		best = min(best, d)
	}
	return best
}
