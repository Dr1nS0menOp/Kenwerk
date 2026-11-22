// SPDX-License-Identifier: Apache-2.0

package permissions_test

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kenwerk/kenwerk/internal/ids"
	"github.com/kenwerk/kenwerk/internal/permissions"
	"github.com/kenwerk/kenwerk/internal/testutil"
)

// oldArity finds a call of a list function without the spaces of the credential (spec 096).
// The old signatures stay for the previous release only; code of this one always passes the
// limit, or NULL where the comment beside it says why none applies.
var oldArity = regexp.MustCompile(`perm_(visible_pages|listed_pages|editable_pages|visible_comments|review_pages|template_notice_pages)\(\s*[^,()]+\)|perm_spaces\(\s*[^,()]+,\s*[^,()]+\)`)

func TestEveryListPassesTheSpacesOfTheCredential(t *testing.T) {
	code := os.DirFS(filepath.Join(".."))
	err := fs.WalkDir(code, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		src, err := fs.ReadFile(code, path)
		if err != nil {
			return err
		}
		for _, call := range oldArity.FindAll(src, -1) {
			t.Errorf("%s calls %s without the spaces of the credential", path, call)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// spacesLoaded loads the facts of a person in ctx and says which spaces they are limited to.
func spacesLoaded(ctx context.Context, t *testing.T, svc *permissions.Service, pool *pgxpool.Pool, id uuid.UUID) []uuid.UUID {
	t.Helper()
	facts, err := svc.LoadUser(ctx, pool, id)
	if err != nil {
		t.Fatal(err)
	}
	return facts.Spaces
}

func TestTheLimitOfACredentialIsItsOwnPersonsAlone(t *testing.T) {
	tdb := testutil.Database(t)
	svc := permissions.NewService(tdb.Pool)
	me, someone, space := ids.New(), ids.New(), ids.New()
	ctx := permissions.WithCredentialSpaces(context.Background(), me, []uuid.UUID{space})
	if got := permissions.CredentialSpaces(ctx); len(got) != 1 || got[0] != space {
		t.Fatalf("the request's limit is %v", got)
	}
	if mine := spacesLoaded(ctx, t, svc, tdb.Pool, me); len(mine) != 1 || mine[0] != space {
		t.Fatalf("the person of the credential has the limit %v", mine)
	}
	if theirs := spacesLoaded(ctx, t, svc, tdb.Pool, someone); theirs != nil {
		t.Fatalf("someone else got the credential's limit: %v", theirs)
	}
	if plain := spacesLoaded(context.Background(), t, svc, tdb.Pool, me); plain != nil {
		t.Fatal("a request without a limit has one")
	}
}

func TestNoLimitIsNeverALimitToNoSpace(t *testing.T) {
	if permissions.CredentialSpaces(context.Background()) != nil {
		t.Fatal("a request without a limit has one")
	}
	if permissions.CredentialSpaces(permissions.WithCredentialSpaces(context.Background(), ids.New(), nil)) != nil {
		t.Fatal("no limit became a limit to no space")
	}
}
func TestAUserOutsideTheLimitIsNotFound(t *testing.T) {
	me, inside, outside := ids.New(), ids.New(), ids.New()
	user := permissions.UserFacts{ID: me, Type: "member", Active: true, Global: []string{"use_product"}, Spaces: []uuid.UUID{inside}}
	grants := []permissions.Grant{{Subject: permissions.Subject{Type: permissions.SubjectUser, ID: me}, Permission: permissions.SpaceView}}
	d := permissions.Evaluate(permissions.Input{User: user, Space: permissions.SpaceFacts{ID: outside, Status: "active", Grants: grants}, Action: permissions.SpaceView})
	if d.Allowed || d.Visible {
		t.Fatalf("a space outside the limit: %+v", d)
	}
	d = permissions.Evaluate(permissions.Input{User: user, Space: permissions.SpaceFacts{ID: inside, Status: "active", Grants: grants}, Action: permissions.SpaceView})
	if !d.Allowed {
		t.Fatalf("a space inside the limit: %+v", d)
	}
}

// twoSpacesOf makes a person who views two spaces, "in" and "out", each with a page and a comment
// on it, and returns the person and the spaces.
func twoSpacesOf(t *testing.T, pool *pgxpool.Pool) (uuid.UUID, map[string]uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	inst, me := ids.New(), ids.New()
	exec(`INSERT INTO users (id, origin_instance_id, type, status, email, display_name) VALUES ($1, $2, 'member', 'active', 'me@example.com', 'me')`, me, inst)
	exec("INSERT INTO global_grants (subject_type, subject_id, permission) VALUES ('user', $1, 'use_product')", me)
	spaces := map[string]uuid.UUID{}
	for _, name := range []string{"in", "out"} {
		space, page := ids.New(), ids.New()
		spaces[name] = space
		exec(`INSERT INTO spaces (id, origin_instance_id, key, name, status, created_by) VALUES ($1, $2, $3, 's', 'active', $4)`, space, inst, name, me)
		exec("INSERT INTO space_grants (space_id, subject_type, subject_id, permission) VALUES ($1, 'user', $2, 'space.view')", space, me)
		exec(`INSERT INTO pages (id, origin_instance_id, space_id, title, status, created_by, updated_by, kind)
			VALUES ($1, $2, $3, 't', 'published', $4, $4, 'page')`, page, inst, space, me)
		exec("INSERT INTO page_tree (ancestor_id, descendant_id, depth) VALUES ($1, $1, 0)", page)
		exec(`INSERT INTO comments (id, origin_instance_id, space_id, page_id, author_id, body) VALUES ($1, $2, $3, $4, $5, '{}')`,
			ids.New(), inst, space, page, me)
	}
	return me, spaces
}

// TestTheSmallerListsKeepToTheLimit covers two lists the matrix does not, spaces and comments,
// and the old signature the previous release calls.
func TestTheSmallerListsKeepToTheLimit(t *testing.T) {
	tdb := testutil.Database(t)
	ctx, pool := context.Background(), tdb.Pool
	me, spaces := twoSpacesOf(t, pool)
	limit := []uuid.UUID{spaces["in"]}
	count := func(sql string, allowed []uuid.UUID) int {
		t.Helper()
		var n int
		if err := pool.QueryRow(ctx, sql, me, allowed).Scan(&n); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		return n
	}
	for _, sql := range []string{
		"SELECT count(*) FROM perm_spaces($1, 'space.view', $2)",
		"SELECT count(*) FROM perm_visible_comments($1, $2)",
		"SELECT count(*) FROM perm_visible_pages($1, $2)",
	} {
		if all, limited := count(sql, nil), count(sql, limit); all != 2 || limited != 1 {
			t.Errorf("%s: %d without a limit, %d with one; want 2 and 1", sql, all, limited)
		}
	}
	var old int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM perm_spaces($1, 'space.view')", me).Scan(&old); err != nil || old != 2 {
		t.Fatalf("the old signature of the previous release: %d %v", old, err)
	}
}
