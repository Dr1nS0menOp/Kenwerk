// SPDX-License-Identifier: Apache-2.0

package pages

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/document"
	"github.com/kenwerk/kenwerk/internal/search"
)

// TextBatch is what one batch of the search text pass did.
type TextBatch struct {
	// Last is the last page of the batch, where the next batch goes on.
	Last uuid.UUID
	// Read counts the entries the batch looked at, Rewritten those whose text changed.
	Read, Rewritten int
}

// textBatchTime bounds each statement of a batch to three seconds: the pass is background work
// and gives way rather than hold a connection (spec 087, load budget).
const textBatchTime = "SET LOCAL statement_timeout = 3000"

// RefreshSearchText brings up to limit search entries after the page after, in page order, to
// the text document.Text gives now (spec 087): the readers' entry from the version readers see,
// never from the head of a controlled page (DOC-520), and a working entry, where one exists,
// from the head version. It never creates an entry. It records where the pass stands in the
// same transaction.
func (s *Service) RefreshSearchText(ctx context.Context, after uuid.UUID, limit int) (TextBatch, error) {
	out := TextBatch{Last: after}
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, textBatchTime); err != nil {
			return err
		}
		ids, err := search.EntriesAfter(ctx, tx, after, limit)
		if err != nil || len(ids) == 0 {
			return err
		}
		readers, working, err := entryTexts(ctx, tx, ids)
		if err != nil {
			return err
		}
		rewritten, err := refreshEntries(ctx, tx, readers, working)
		if err != nil {
			return err
		}
		out = TextBatch{Last: ids[len(ids)-1], Read: len(ids), Rewritten: rewritten}
		return search.AdvanceTextPass(ctx, tx, out.Last, out.Read, out.Rewritten)
	})
	if err != nil {
		return TextBatch{Last: after}, fmt.Errorf("pages: refresh search text: %v", err)
	}
	return out, nil
}

func refreshEntries(ctx context.Context, tx pgx.Tx, readers, working []search.Body) (int, error) {
	rewritten, err := search.Refresh(ctx, tx, readers)
	if err != nil {
		return 0, err
	}
	more, err := search.RefreshWorking(ctx, tx, working)
	return rewritten + more, err
}

// entryTexts reads, for each page, the text of the version readers see and, for a controlled
// page whose working version is ahead of it, the text of that version.
func entryTexts(ctx context.Context, tx pgx.Tx, ids []uuid.UUID) (readers, working []search.Body, err error) {
	rows, err := tx.Query(ctx, `SELECT p.id, v.document, w.document
		FROM pages p
		JOIN page_versions v ON v.page_id = p.id AND v.number = p.current_version
		LEFT JOIN page_control pc ON pc.page_id = p.id AND pc.head_version > p.current_version
		LEFT JOIN page_versions w ON w.page_id = p.id AND w.number = pc.head_version
		WHERE p.id = ANY($1)`, ids)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var current, head []byte
		if err := rows.Scan(&id, &current, &head); err != nil {
			return nil, nil, err
		}
		if readers, err = withText(readers, id, current); err != nil {
			return nil, nil, err
		}
		if head == nil {
			continue
		}
		if working, err = withText(working, id, head); err != nil {
			return nil, nil, err
		}
	}
	return readers, working, rows.Err()
}

func withText(bodies []search.Body, id uuid.UUID, raw []byte) ([]search.Body, error) {
	doc, err := document.Parse(raw)
	if err != nil {
		return bodies, fmt.Errorf("the document of page %s: %v", id, err)
	}
	return append(bodies, search.Body{PageID: id, Text: document.Text(doc)}), nil
}
