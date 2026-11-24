// SPDX-License-Identifier: Apache-2.0

package db

import (
	"context"
	"fmt"
)

// RoleFacts are what the catalogue says of the role a connection uses: whether it is a
// superuser, and whether it owns a table of the schema public. The application's role should be
// neither (ADR-019): the owner of the tables migrates, the application only reads and writes.
type RoleFacts struct {
	Superuser bool
	OwnsTable bool
}

// roleFactsSQL reads the catalogue only, which holds a few hundred tables.
const roleFactsSQL = `SELECT
	COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false),
	EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user)`

// CurrentRole reads the RoleFacts of the role q connects as.
func CurrentRole(ctx context.Context, q Querier) (RoleFacts, error) {
	var r RoleFacts
	if err := q.QueryRow(ctx, roleFactsSQL).Scan(&r.Superuser, &r.OwnsTable); err != nil {
		return r, fmt.Errorf("db: read the role of the connection: %w", err)
	}
	return r, nil
}
