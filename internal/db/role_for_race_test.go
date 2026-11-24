// SPDX-License-Identifier: Apache-2.0

package db_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kenwerk/kenwerk/internal/testutil"
)

// newRoleSet is a set of space permissions that no built-in role holds.
const newRoleSet = "ARRAY['space.view', 'analytics.view', 'space.audit']"

// TestTwoTransactionsAskingForTheSameNewRoleGetOneRole: when two transactions need a role
// for a set of permissions that no role holds yet, the second waits for the first and
// takes the role it made. Before, both made one under the same name, and the second
// failed on the unique name: on a fresh installation, people created in parallel (by an
// administrator's script or by SCIM) failed with an internal error (wave LT2).
func TestTwoTransactionsAskingForTheSameNewRoleGetOneRole(t *testing.T) {
	tdb := testutil.Database(t)
	ctx := context.Background()
	first := begin(t, tdb.Pool)
	firstRole, err := roleForNewSet(ctx, first)
	if err != nil {
		t.Fatal(err)
	}
	second := begin(t, tdb.Pool)
	pid := backendPID(t, second)
	answer := make(chan error, 1)
	var secondRole uuid.UUID
	go func() {
		var err error
		secondRole, err = roleForNewSet(ctx, second)
		answer <- err
	}()

	// The first commits only once the second waits on it, so the second cannot simply
	// find the committed role and pass whatever the function does.
	waitUntilWaitingOnALock(t, tdb.Pool, pid)
	if err := first.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-answer; err != nil {
		t.Fatalf("the second transaction failed: %v", err)
	}
	if secondRole != firstRole {
		t.Fatalf("the second transaction got role %s, want the first's %s", secondRole, firstRole)
	}
	if err := second.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if n := rolesHoldingNewSet(t, tdb.Pool); n != 1 {
		t.Fatalf("%d roles hold the set, want 1", n)
	}
}

func roleForNewSet(ctx context.Context, tx pgx.Tx) (uuid.UUID, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, "SELECT rbac_role_for('space', "+newRoleSet+")").Scan(&id)
	return id, err
}

// begin starts a transaction that is rolled back at the end of the test unless committed.
func begin(t *testing.T, pool *pgxpool.Pool) pgx.Tx {
	t.Helper()
	tx, err := pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	return tx
}

func backendPID(t *testing.T, tx pgx.Tx) int {
	t.Helper()
	var pid int
	if err := tx.QueryRow(context.Background(), "SELECT pg_backend_pid()").Scan(&pid); err != nil {
		t.Fatal(err)
	}
	return pid
}

func rolesHoldingNewSet(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM roles WHERE scope = 'space' AND permissions @> "+
		newRoleSet+" AND cardinality(permissions) = 3").Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// waitUntilWaitingOnALock returns once the backend pid waits for a lock: of a row, an
// index entry or an advisory lock.
func waitUntilWaitingOnALock(t *testing.T, pool *pgxpool.Pool, pid int) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		var waiting bool
		if err := pool.QueryRow(context.Background(),
			"SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock')", pid).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the second transaction never waited on the first")
}
