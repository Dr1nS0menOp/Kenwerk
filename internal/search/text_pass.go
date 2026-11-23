// SPDX-License-Identifier: Apache-2.0

package search

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/db"
)

// TextVersion is the text of documents this release writes into search entries. Raise it
// whenever document.Text gives something else for a document that already exists: the worker
// then brings every entry written before up to date, once (spec 087). Version 1 is the text
// before spec 087; version 2 adds the words of captions, code titles, chart titles and buttons.
const TextVersion = 2

// TextPass is where the pass that brings entries up to TextVersion stands.
type TextPass struct {
	// Version is the text every entry holds; a pass runs while it is below TextVersion.
	Version int
	// Cursor is the last page the pass has done, or uuid.Nil before its first batch.
	Cursor uuid.UUID
	// Read and Rewritten count the entries of this pass so far.
	Read, Rewritten int64
}

// ReadTextPass reads where the pass stands.
func ReadTextPass(ctx context.Context, q db.Querier) (TextPass, error) {
	var p TextPass
	var cursor *uuid.UUID
	err := q.QueryRow(ctx, "SELECT text_version, text_cursor, entries_read, entries_rewritten FROM search_state").
		Scan(&p.Version, &cursor, &p.Read, &p.Rewritten)
	if err != nil {
		return p, fmt.Errorf("search: text pass: %v", err)
	}
	if cursor != nil {
		p.Cursor = *cursor
	}
	return p, nil
}

// EntriesAfter lists the pages that have an entry readers match, after the page after, in
// page order: the pass works on entries that exist, and never on pages without one.
func EntriesAfter(ctx context.Context, q db.Querier, after uuid.UUID, limit int) ([]uuid.UUID, error) {
	rows, err := q.Query(ctx, "SELECT page_id FROM search_documents WHERE page_id > $1 ORDER BY page_id LIMIT $2", after, limit)
	if err != nil {
		return nil, fmt.Errorf("search: entries: %v", err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return nil, fmt.Errorf("search: entries: %v", err)
	}
	return ids, nil
}

// Body is the text of a document for the entry of one page.
type Body struct {
	PageID uuid.UUID
	Text   string
}

// Refresh rewrites the text of the entries readers match, for pages that have one and whose
// text differs; it never creates an entry. It gives the number of entries it rewrote.
func Refresh(ctx context.Context, q db.Querier, bodies []Body) (int, error) {
	return refreshTable(ctx, q, `UPDATE search_documents d SET body = n.body, updated_at = now()
		FROM unnest($1::uuid[], $2::text[]) AS n(page_id, body)
		WHERE d.page_id = n.page_id AND d.body IS DISTINCT FROM n.body`, bodies)
}

// RefreshWorking does the same for the working entries of controlled pages (DOC-520): only a
// page that has one gets its text, so a working entry that was dropped stays dropped.
func RefreshWorking(ctx context.Context, q db.Querier, bodies []Body) (int, error) {
	return refreshTable(ctx, q, `UPDATE search_working d SET body = n.body, updated_at = now()
		FROM unnest($1::uuid[], $2::text[]) AS n(page_id, body)
		WHERE d.page_id = n.page_id AND d.body IS DISTINCT FROM n.body`, bodies)
}

func refreshTable(ctx context.Context, q db.Querier, query string, bodies []Body) (int, error) {
	if len(bodies) == 0 {
		return 0, nil
	}
	ids := make([]uuid.UUID, len(bodies))
	texts := make([]string, len(bodies))
	for i, b := range bodies {
		ids[i], texts[i] = b.PageID, truncate(b.Text, maxBodyBytes)
	}
	tag, err := q.Exec(ctx, query, ids, texts)
	if err != nil {
		return 0, fmt.Errorf("search: refresh text: %v", err)
	}
	return int(tag.RowsAffected()), nil
}

// AdvanceTextPass records a batch of the pass: the last page it did and what it counted. It
// runs in the transaction of the batch, so the cursor never runs ahead of the entries.
func AdvanceTextPass(ctx context.Context, q db.Querier, last uuid.UUID, read, rewritten int) error {
	_, err := q.Exec(ctx, `UPDATE search_state SET text_cursor = $1, entries_read = entries_read + $2,
		entries_rewritten = entries_rewritten + $3`, last, read, rewritten)
	if err != nil {
		return fmt.Errorf("search: advance text pass: %v", err)
	}
	return nil
}

// RestartTextPass sends the pass back to the first entry, as when a node of an older release
// came back while it ran and may have written old text behind it.
func RestartTextPass(ctx context.Context, q db.Querier) error {
	_, err := q.Exec(ctx, "UPDATE search_state SET text_cursor = NULL, entries_read = 0, entries_rewritten = 0")
	if err != nil {
		return fmt.Errorf("search: restart text pass: %v", err)
	}
	return nil
}

// FinishTextPass records that every entry holds TextVersion, and gives the counts of the pass
// it ends.
func FinishTextPass(ctx context.Context, q db.Querier) (TextPass, error) {
	var p TextPass
	err := q.QueryRow(ctx, `UPDATE search_state s SET text_version = $1, text_cursor = NULL, entries_read = 0,
			entries_rewritten = 0, refreshed_at = now()
		FROM (SELECT entries_read, entries_rewritten FROM search_state) old
		RETURNING s.text_version, old.entries_read, old.entries_rewritten`, TextVersion).Scan(&p.Version, &p.Read, &p.Rewritten)
	if err != nil {
		return p, fmt.Errorf("search: finish text pass: %v", err)
	}
	return p, nil
}
