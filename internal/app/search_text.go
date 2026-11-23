// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/audit"
	"github.com/kenwerk/kenwerk/internal/search"
)

// textPassRun bounds one run of the pass that brings search entries up to date (spec 087).
type textPassRun struct {
	// budget is how long a run may work; the next run goes on from the cursor.
	budget time.Duration
	// batch is how many entries one transaction rewrites.
	batch int
}

// The pass keeps to a twentieth of one connection: a batch of 50 entries, then a rest 19 times
// as long as the batch took, and two minutes a run. Resting only as long as the batch, as
// planned, made reading and saving beside it half as slow again at the 95th percentile, past
// the 10 % that spec 087 allows (its load budget).
const (
	textPassBudget = 2 * time.Minute
	textPassBatch  = 50
	textPassRest   = 19
)

// refreshSearchText brings the search entries written before this release up to the text it
// writes, once, after an upgrade that raised search.TextVersion (spec 087).
func (a *App) refreshSearchText(ctx context.Context) error {
	return a.refreshSearchTextWithin(ctx, textPassRun{budget: textPassBudget, batch: textPassBatch})
}

// refreshSearchTextWithin is one run with limits of its own. It always finishes at least one
// batch, so a run with a short budget still moves on.
func (a *App) refreshSearchTextWithin(ctx context.Context, run textPassRun) error {
	pass, err := search.ReadTextPass(ctx, a.pool)
	if err != nil || pass.Version >= search.TextVersion {
		return err
	}
	if ready, err := a.textPassMayRun(ctx, pass); err != nil || !ready {
		return err
	}
	deadline := time.Now().Add(run.budget)
	for cursor := pass.Cursor; ; {
		began := time.Now()
		batch, err := a.pages.RefreshSearchText(ctx, cursor, run.batch)
		if err != nil {
			return err
		}
		if batch.Read < run.batch {
			return a.finishTextPass(ctx)
		}
		cursor = batch.Last
		if time.Now().After(deadline) {
			a.log.Info("search text pass paused", "stopped_after", cursor)
			return nil
		}
		if err := rest(ctx, textPassRest*time.Since(began)); err != nil {
			return err
		}
	}
}

// textPassMayRun holds the pass while a node of an older release is alive, because it would
// write the old text again behind the cursor. A pass that had started goes back to the first
// entry, since the older node may have written behind it already.
func (a *App) textPassMayRun(ctx context.Context, pass search.TextPass) (bool, error) {
	older, err := a.olderReleaseRuns(ctx)
	if err != nil || !older {
		return err == nil, err
	}
	if pass.Cursor != uuid.Nil {
		return false, search.RestartTextPass(ctx, a.pool)
	}
	return false, nil
}

// finishTextPass records the new text version, and that the pass is through in the audit log,
// with its counts and nothing of any page.
func (a *App) finishTextPass(ctx context.Context) error {
	var pass search.TextPass
	err := pgx.BeginFunc(ctx, a.pool, func(tx pgx.Tx) error {
		var err error
		if pass, err = search.FinishTextPass(ctx, tx); err != nil {
			return err
		}
		_, err = audit.Record(ctx, tx, audit.Event{ActorType: audit.ActorSystem, ActorID: "worker",
			Action: "search.text_refreshed", ObjectType: "search", Result: audit.ResultSuccess,
			Details: map[string]any{"text_version": pass.Version, "read": pass.Read, "rewritten": pass.Rewritten}})
		return err
	})
	if err == nil {
		a.log.Info("search text pass through", "text_version", pass.Version, "read", pass.Read, "rewritten", pass.Rewritten)
	}
	return err
}

// rest waits before the next batch, so the pass leaves the connection and the core to others.
func rest(ctx context.Context, d time.Duration) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(d):
		return nil
	}
}
