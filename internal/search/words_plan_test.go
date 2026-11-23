// SPDX-License-Identifier: Apache-2.0

package search

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/testutil"
)

// wordIndex is the index of words that the last step of a search asks.
const wordIndex = "search_documents_tsv_idx"

// planNode is the part of a plan of EXPLAIN (FORMAT JSON) that says how often an index ran.
type planNode struct {
	IndexName   string     `json:"Index Name"`
	ActualLoops int        `json:"Actual Loops"`
	Plans       []planNode `json:"Plans"`
}

// indexRuns adds up how often a plan ran an index.
func indexRuns(n planNode, index string) int {
	runs := 0
	if n.IndexName == index {
		runs = n.ActualLoops
	}
	for _, child := range n.Plans {
		runs += indexRuns(child, index)
	}
	return runs
}

// searchTables holds one space of pages in the two tables the picking reads, and nothing
// else: the picking needs no page, so the links to pages are dropped in this throw-away
// database.
type searchTables struct {
	t  *testing.T
	tx pgx.Tx
}

func (s searchTables) exec(sql string, args ...any) {
	s.t.Helper()
	if _, err := s.tx.Exec(context.Background(), sql, args...); err != nil {
		s.t.Fatal(err)
	}
}

// add puts count pages of one title and text in a space, as old as age.
func (s searchTables) add(space uuid.UUID, count int, title, body, age string) {
	s.t.Helper()
	s.exec(`INSERT INTO search_pages (page_id, space_id, kind, title, published, archived, updated_at)
		SELECT gen_random_uuid(), $1, 'page', $2 || ' ' || n, true, false, now() - $3::interval + n * interval '1 second'
		FROM generate_series(1, $4) n`, space, title, age, count)
	s.exec(`INSERT INTO search_documents (page_id, title, body)
		SELECT w.page_id, w.title, $1 FROM search_pages w ON CONFLICT DO NOTHING`, body)
}

// importAfterStatistics gives the tables statistics that know other spaces only, then brings
// in a space of 2,101 pages at once, as an import does, and returns that space. One old page
// holds the word quartermaster.
func (s searchTables) importAfterStatistics() uuid.UUID {
	s.t.Helper()
	s.exec(`DO $$ DECLARE c record; BEGIN
		FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
			WHERE contype = 'f' AND conrelid IN ('search_pages'::regclass, 'search_documents'::regclass) LOOP
			EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
		END LOOP; END $$`)
	s.add(uuid.New(), 50, "Elsewhere", "other words", "2 years")
	s.exec("ANALYZE search_pages")
	s.exec("ANALYZE search_documents")
	space := uuid.New()
	s.add(space, 1, "Nine years old", "quartermaster", "9 years")
	s.add(space, 2100, "Newer", "filler words only", "0 seconds")
	return space
}

// The step that goes past the window asks the index of words once, whatever the planner
// believes about the tables. With the statistics of a small space, as after an import of
// many pages and before autovacuum looks again, it ran the index once for every page of the
// space: 2.2 to 2.6 s for 2,100 pages, against the 3 s a search has (statementTime), so the
// search answered that it ran out of time. A count of index runs does not depend on how
// fast the machine is.
func TestTheIndexOfWordsIsAskedOnceWhateverTheStatistics(t *testing.T) {
	ctx := context.Background()
	tdb := testutil.Database(t)
	tx, err := tdb.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	s := searchTables{t: t, tx: tx}
	space := s.importAfterStatistics()
	parsed := parse("quartermaster", false, false)
	args := wordArgs(uuid.Nil, Query{Text: "quartermaster"}, parsed)
	args["spaces"], args["hidden"], args["need"] = []uuid.UUID{space}, []uuid.UUID{}, totalLimit+1
	s.exec(wordSettings)
	s.exec(pickSettings)
	// The count is what this test checks, so the time a search has may not cut it short.
	s.exec("SET LOCAL statement_timeout = 0")
	step := sqlOf{}.every(textTier)
	for _, stats := range []string{"of a small space", "fresh"} {
		if stats == "fresh" {
			s.exec("ANALYZE search_pages")
			s.exec("ANALYZE search_documents")
		}
		var plan []struct{ Plan planNode }
		var out []byte
		if err := tx.QueryRow(ctx, "EXPLAIN (ANALYZE, FORMAT JSON) "+step, args).Scan(&out); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(out, &plan); err != nil || len(plan) != 1 {
			t.Fatalf("a plan that cannot be read: %v", err)
		}
		if runs := indexRuns(plan[0].Plan, wordIndex); runs != 1 {
			t.Errorf("with statistics %s, the index of words ran %d times for one search", stats, runs)
		}
		found, err := listOf(ctx, tx, step, args)
		if err != nil || len(found) != 1 {
			t.Fatalf("with statistics %s, the old page: %v %v", stats, found, err)
		}
	}
}
