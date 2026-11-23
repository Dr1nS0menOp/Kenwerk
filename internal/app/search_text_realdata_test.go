// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"os"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/app"
	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/permissions"
)

// textPassShare is how much slower spec 087 lets reading and saving be while the pass runs.
const textPassShare = 1.10

// textPassSamples is how many times a request runs for one percentile: enough that the 95th
// rests on ten slow requests rather than two.
const textPassSamples = 200

// TestTheTextPassOnRealData measures the pass of spec 087 on a restored dump of the seeded data
// (scripts/stress/real-data.sh), whose entries were all written with the text before it: each
// batch, the whole pass, the share rewritten and the WAL it wrote, and the 95th percentile of
// reading and saving a page beside it, against the same without it.
func TestTheTextPassOnRealData(t *testing.T) {
	e := openRealData(t)
	markControlled(t, e)
	e.sql("UPDATE search_state SET text_version = 1, text_cursor = NULL, entries_read = 0, entries_rewritten = 0")
	stamp := time.Now().Format("150405")
	writer := e.user("sr3-writer-"+stamp+"@example.com", identity.PermUseProduct)
	space := e.scalar(`SELECT space_id::text FROM pages GROUP BY space_id ORDER BY count(*) DESC LIMIT 1`)
	e.sql("SELECT rbac_set_exact($1::uuid, 'user', $2::uuid, $3::text[])", space, writer.id, permissions.Templates[permissions.TemplateEditor])
	page := e.scalar(`SELECT id::text FROM pages WHERE space_id = $1 AND status = 'published' AND kind = 'page'
		AND id NOT IN (SELECT page_id FROM page_control) ORDER BY id LIMIT 1`, space)
	measurePass(t, e, pageWork(writer, page))
}

// measurePass runs the pass beside the work and logs what spec 087 asks to measure: each batch,
// the whole pass, the share rewritten, the WAL, and the 95th percentiles of the work beside the
// pass and alone, before and after it. The work alone is measured twice because on a shared
// machine two runs alone differ by more than the budget; beside the pass it may be at most
// textPassShare over the slower of the two.
func measurePass(t *testing.T, e *env, requests work) {
	t.Helper()
	before := requests.p95s(t)
	wal := e.scalar("SELECT pg_current_wal_lsn()::text")
	batches, beside := passBesideWork(t, e, requests)
	t.Logf("WAL written by the pass and the work beside it: %s bytes", e.scalar("SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn)::bigint::text", wal))
	after := requests.p95s(t)
	logBatches(t, batches)
	t.Logf("entries %s, rewritten %s", e.scalar("SELECT entries_read::text FROM search_state"), e.scalar("SELECT entries_rewritten::text FROM search_state"))
	for name, took := range beside {
		alone := max(before[name], after[name])
		t.Logf("%-8s p95 %v alone before, %v beside the pass, %v alone after", name,
			before[name].Round(time.Millisecond/10), took.Round(time.Millisecond/10), after[name].Round(time.Millisecond/10))
		if float64(took) > float64(alone)*textPassShare {
			t.Errorf("%s: p95 %v beside the pass, more than %.0f%% over %v alone", name, took, (textPassShare-1)*100, alone)
		}
	}
	if err := e.app.RefreshSearchTextNowForTest(context.Background()); err != nil || e.textVersion() != 2 {
		t.Fatalf("the pass is not through: %v, version %d", err, e.textVersion())
	}
}

// work is the requests whose 95th percentile the pass must leave alone.
type work map[string]func() int

func pageWork(u *user, page string) work {
	base := u.ok("GET", "/api/v1/pages/"+page, nil)["current_version"]
	return work{
		"reading": func() int { status, _ := u.do("GET", "/api/v1/pages/"+page, nil); return status },
		"saving": func() int {
			status, _ := u.do("PUT", "/api/v1/pages/"+page+"/draft", map[string]any{"title": "Draft", "document": para("draft words"), "base_version": base})
			return status
		},
	}
}

// p95s runs each request textPassSamples times and gives its 95th percentile.
func (w work) p95s(t *testing.T) map[string]time.Duration {
	t.Helper()
	out := map[string]time.Duration{}
	for name, do := range w {
		took := make([]time.Duration, 0, textPassSamples)
		for range textPassSamples {
			started := time.Now()
			if status := do(); status >= 300 {
				t.Fatalf("%s: the request failed with %d", name, status)
			}
			took = append(took, time.Since(started))
		}
		slices.Sort(took)
		out[name] = took[len(took)*95/100]
	}
	return out
}

// passBesideWork runs the pass as the worker does, batch and rest with the worker's sizes, while
// the work runs beside it, and gives the time of each batch and the percentiles of the work.
func passBesideWork(t *testing.T, e *env, w work) ([]time.Duration, map[string]time.Duration) {
	t.Helper()
	done := make(chan []time.Duration)
	failed := make(chan error, 1)
	go func() {
		var took []time.Duration
		for cursor := uuid.Nil; ; {
			began := time.Now()
			batch, err := e.app.Pages().RefreshSearchText(context.Background(), cursor, app.TextPassBatchForTest)
			if err != nil {
				failed <- err
				break
			}
			took = append(took, time.Since(began))
			if batch.Read < app.TextPassBatchForTest {
				break
			}
			cursor = batch.Last
			time.Sleep(app.TextPassRestForTest * time.Since(began))
		}
		done <- took
	}()
	beside := w.p95s(t)
	batches := <-done
	select {
	case err := <-failed:
		t.Fatal(err)
	default:
	}
	return batches, beside
}

func logBatches(t *testing.T, batches []time.Duration) {
	t.Helper()
	if len(batches) == 0 {
		t.Fatal("the pass ran no batch")
	}
	var total time.Duration
	for _, b := range batches {
		total += b
	}
	sorted := slices.Clone(batches)
	slices.Sort(sorted)
	t.Logf("batches %d, median %v, slowest %v, work %v, whole pass with rests about %v", len(batches),
		sorted[len(sorted)/2].Round(time.Millisecond/10), sorted[len(sorted)-1].Round(time.Millisecond/10),
		total.Round(time.Millisecond), ((app.TextPassRestForTest + 1) * total).Round(time.Millisecond))
}

// TestTheTextPassOnGeneratedPages measures the same on generated pages, for a machine without
// the seeded dump: KENWERK_TEXT_PASS_PAGES pages of about two kilobytes of text and a table
// with a caption, every entry written with the text before spec 087. Generated data is more
// even than real data, so it stands in for the real-data run and does not replace it.
func TestTheTextPassOnGeneratedPages(t *testing.T) {
	count, err := strconv.Atoi(os.Getenv("KENWERK_TEXT_PASS_PAGES"))
	if err != nil || count <= 0 {
		t.Skip("KENWERK_TEXT_PASS_PAGES is not set")
	}
	e := newEnv(t)
	owner, _, _, space := e.team("GEN")
	words := strings.Repeat("the quarterly figures of the harbour office and their notes ", 35)
	model := owner.publishedDoc(space, "Model", docOf(textPara(words), captionedTable("zebracaption")["content"].([]any)[0].(map[string]any)))
	e.sql(`INSERT INTO pages (id, origin_instance_id, space_id, parent_id, position, title, status, current_version,
			created_by, updated_by, kind)
		SELECT gen_random_uuid(), p.origin_instance_id, p.space_id, p.parent_id, 1000 + n, 'Generated ' || n, 'published', 1,
			p.created_by, p.updated_by, 'page'
		FROM pages p, generate_series(1, $2) n WHERE p.id = $1`, model, count)
	e.sql(`INSERT INTO page_versions (id, origin_instance_id, page_id, number, title, document, schema_version, author_id)
		SELECT gen_random_uuid(), v.origin_instance_id, p.id, 1, p.title, v.document, v.schema_version, v.author_id
		FROM pages p JOIN page_versions v ON v.page_id = $1 AND v.number = 1 WHERE p.title LIKE 'Generated %'`, model)
	e.sql(`INSERT INTO search_documents (page_id, title, body)
		SELECT p.id, p.title, $1 FROM pages p WHERE p.title LIKE 'Generated %'`, words+"\ncell\n")
	e.sql("ANALYZE")
	e.writtenBefore(model)
	measurePass(t, e, pageWork(owner, model))
}
