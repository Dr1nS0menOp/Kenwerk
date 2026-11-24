// SPDX-License-Identifier: Apache-2.0

package db_test

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/db"
	"github.com/kenwerk/kenwerk/internal/testutil"
)

// The security overview asks whether the application's role owns a table or is a superuser
// (spec 088, ADR-019): the owner who migrated says yes, an application role made as the
// installation guide says no.
func TestTheApplicationRoleOwnsNoTableAndTheOwnerDoes(t *testing.T) {
	tdb := testutil.Database(t)
	ctx := context.Background()
	role := "dfl_app_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	if _, err := tdb.Pool.Exec(ctx, "CREATE ROLE "+role); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = tdb.Pool.Exec(ctx, "DROP OWNED BY "+role)
		_, _ = tdb.Pool.Exec(ctx, "DROP ROLE "+role)
	})
	if err := db.GrantApp(ctx, tdb.Pool, role); err != nil {
		t.Fatal(err)
	}
	owner, err := db.CurrentRole(ctx, tdb.Pool)
	if err != nil || !owner.OwnsTable {
		t.Fatalf("the role that migrated: %+v %v", owner, err)
	}
	var app db.RoleFacts
	err = pgx.BeginFunc(ctx, tdb.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+role); err != nil {
			return err
		}
		app, err = db.CurrentRole(ctx, tx)
		return err
	})
	if err != nil || app.OwnsTable || app.Superuser {
		t.Fatalf("the application role: %+v %v", app, err)
	}
}
