// SPDX-License-Identifier: Apache-2.0

package headerfooter

import (
	"context"
	"testing"
	"time"

	"github.com/kenwerk/kenwerk/internal/testutil"
)

// storeFooterWords writes a footer straight into the table, as another node's save would.
func storeFooterWords(t *testing.T, tdb testutil.TestDB, words string) {
	t.Helper()
	if _, err := tdb.Pool.Exec(context.Background(), `INSERT INTO settings (key, value) VALUES ('header_footer',
		jsonb_build_object('footer', jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object(
			'type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', $1::text)))))))
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, words); err != nil {
		t.Fatal(err)
	}
}

// footerWords is what a reader of this node reads in the footer.
func footerWords(t *testing.T, s *Service) string {
	t.Helper()
	v, err := s.ForReaders(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if v.Footer == nil {
		return ""
	}
	return v.Footer.Content[0].Content[0].Text
}

// A node answers readers from its copy for half a minute, and then reads again; a change on
// another node shows within that time (spec 089, load budget).
func TestTheHeaderAndFooterAreReadOncePerHalfMinute(t *testing.T) {
	tdb := testutil.Database(t)
	s := NewService(tdb.Pool, nil)
	at := time.Now()
	s.now = func() time.Time { return at }
	storeFooterWords(t, tdb, "first")
	if got := footerWords(t, s); got != "first" {
		t.Fatalf("the first read: %q", got)
	}
	storeFooterWords(t, tdb, "second")
	at = at.Add(freshFor - time.Second)
	if got := footerWords(t, s); got != "first" {
		t.Fatalf("the copy was read again within half a minute: %q", got)
	}
	at = at.Add(time.Second)
	if got := footerWords(t, s); got != "second" {
		t.Fatalf("the copy was not read again after half a minute: %q", got)
	}
	storeFooterWords(t, tdb, "third")
	s.Forget()
	if got := footerWords(t, s); got != "third" {
		t.Fatalf("a dropped copy was not read again: %q", got)
	}
}
