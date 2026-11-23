// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"net/url"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/console"
	"github.com/kenwerk/kenwerk/internal/spaces"
)

func namesOfSpaces(list []spaces.Space) []string {
	out := []string{}
	for _, s := range list {
		out = append(out, s.Name)
	}
	return out
}

func TestTheSpaceQueryRefusesWhatItDoesNotKnow(t *testing.T) {
	for _, raw := range []string{"sort=owner", "sort=--name", "status=trashed", "min_pages=-2", "min_mib=lots", "quiet_months=1.5"} {
		q, _ := url.ParseQuery(raw)
		if _, err := parseAdminSpaceQuery(q); err == nil {
			t.Errorf("%s was taken", raw)
		}
	}
	q, _ := url.ParseQuery("q=+Eng+&status=archived&min_pages=3&min_mib=2&quiet_months=6&sort=-activity")
	got, err := parseAdminSpaceQuery(q)
	want := adminSpaceQuery{Text: "Eng", Status: "archived", MinPages: 3, MinMiB: 2, QuietMonths: 6, Sort: listSort{Column: "activity", Reverse: true}}
	if err != nil || got != want {
		t.Fatalf("got %+v, %v", got, err)
	}
	if empty, _ := parseAdminSpaceQuery(url.Values{}); empty.Sort.Column != "name" || empty.Sort.Reverse {
		t.Fatalf("the list starts by name: %+v", empty)
	}
}

// fourSpaces is a list of spaces and their totals that every filter of the list can tell apart.
func fourSpaces(now time.Time) ([]spaces.Space, []console.SpaceTotal) {
	longAgo, lately := now.AddDate(-1, 0, 0), now.AddDate(0, 0, -3)
	eng, ops, old, empty := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	list := []spaces.Space{
		{ID: empty, Key: "EMPTY", Name: "Empty", Status: spaces.StatusActive},
		{ID: eng, Key: "ENG", Name: "Engineering", Status: spaces.StatusActive},
		{ID: old, Key: "OLD", Name: "old projects", Status: spaces.StatusArchived},
		{ID: ops, Key: "OPS", Name: "Operations", Status: spaces.StatusActive},
	}
	totals := []console.SpaceTotal{
		{ID: eng, Pages: 40, Bytes: 5 * mebibyte, LastActivity: &lately},
		{ID: ops, Pages: 4, Bytes: mebibyte, LastActivity: &lately},
		{ID: old, Pages: 12, Bytes: 9 * mebibyte, LastActivity: &longAgo},
		{ID: empty, Pages: 1},
	}
	return list, totals
}

// spaceFilterCases are the queries of the test below and the names they keep, in order.
var spaceFilterCases = []struct {
	name  string
	query adminSpaceQuery
	want  []string
}{
	{"nothing set keeps all by name, whatever the case", adminSpaceQuery{}, []string{"Empty", "Engineering", "old projects", "Operations"}},
	{"search by name or key ignores case", adminSpaceQuery{Text: "OP"}, []string{"Operations"}},
	{"search by key", adminSpaceQuery{Text: "eng"}, []string{"Engineering"}},
	{"status", adminSpaceQuery{Status: spaces.StatusArchived}, []string{"old projects"}},
	{"pages at least, the bound included", adminSpaceQuery{MinPages: 12}, []string{"Engineering", "old projects"}},
	{"size at least", adminSpaceQuery{MinMiB: 5}, []string{"Engineering", "old projects"}},
	{"quiet keeps a space without any change", adminSpaceQuery{QuietMonths: 6}, []string{"Empty", "old projects"}},
	{"filters add up", adminSpaceQuery{QuietMonths: 6, MinPages: 2}, []string{"old projects"}},
	{"most pages first", adminSpaceQuery{Sort: listSort{Column: "pages", Reverse: true}}, []string{"Engineering", "old projects", "Operations", "Empty"}},
	{"newest change first, none last", adminSpaceQuery{Sort: listSort{Column: "activity", Reverse: true}}, []string{"Engineering", "Operations", "old projects", "Empty"}},
	{"by key backwards", adminSpaceQuery{Sort: listSort{Column: "key", Reverse: true}}, []string{"Operations", "old projects", "Engineering", "Empty"}},
	{"storage", adminSpaceQuery{Sort: listSort{Column: "storage"}}, []string{"Empty", "Operations", "Engineering", "old projects"}},
}

func TestTheSpaceListKeepsOnlyWhatPassesEveryFilter(t *testing.T) {
	now := time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)
	list, totals := fourSpaces(now)
	for _, c := range spaceFilterCases {
		t.Run(c.name, func(t *testing.T) {
			if c.query.Sort.Column == "" {
				c.query.Sort.Column = "name"
			}
			kept, keptTotals := filterAdminSpaces(list, totals, c.query, now)
			if got := namesOfSpaces(kept); !slices.Equal(got, c.want) {
				t.Fatalf("got %v, want %v", got, c.want)
			}
			if len(keptTotals) != len(kept) {
				t.Fatalf("%d totals for %d spaces", len(keptTotals), len(kept))
			}
			for i, s := range kept {
				if keptTotals[i].ID != s.ID {
					t.Fatalf("the totals are not those of the spaces kept, in their order")
				}
			}
		})
	}
}
