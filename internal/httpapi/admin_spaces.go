// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"cmp"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/console"
	"github.com/kenwerk/kenwerk/internal/spaces"
)

const mebibyte = 1 << 20

// adminSpaceQuery is what the administration's list of spaces is asked for (spec 100): every
// filter narrows the whole list, which an administrator reads in full anyway.
type adminSpaceQuery struct {
	Text     string
	Status   string
	MinPages int
	MinMiB   int
	// QuietMonths keeps spaces without any change for this many months; zero keeps all.
	QuietMonths int
	Sort        listSort
}

// parseAdminSpaceQuery reads the parameters of GET /admin/spaces, refusing a value it does not know.
func parseAdminSpaceQuery(q url.Values) (adminSpaceQuery, error) {
	out := adminSpaceQuery{Text: strings.TrimSpace(q.Get("q")), Status: q.Get("status")}
	if err := oneOf(out.Status, "status", spaces.StatusActive, spaces.StatusArchived); err != nil {
		return out, err
	}
	var err error
	if out.MinPages, err = parseCount(q.Get("min_pages"), "min_pages"); err != nil {
		return out, err
	}
	if out.MinMiB, err = parseCount(q.Get("min_mib"), "min_mib"); err != nil {
		return out, err
	}
	if out.QuietMonths, err = parseCount(q.Get("quiet_months"), "quiet_months"); err != nil {
		return out, err
	}
	out.Sort, err = parseListSort(q.Get("sort"), "name", "key", "pages", "storage", "activity")
	return out, err
}

// keeps says whether a space passes every filter. A space without any change counts as quiet.
func (q adminSpaceQuery) keeps(s spaces.Space, total console.SpaceTotal, now time.Time) bool {
	if q.Text != "" {
		text := strings.ToLower(q.Text)
		if !strings.Contains(strings.ToLower(s.Name), text) && !strings.Contains(strings.ToLower(s.Key), text) {
			return false
		}
	}
	if q.Status != "" && s.Status != q.Status {
		return false
	}
	if total.Pages < q.MinPages || total.Bytes < int64(q.MinMiB)*mebibyte {
		return false
	}
	if q.QuietMonths == 0 || total.LastActivity == nil {
		return true
	}
	return total.LastActivity.Before(now.AddDate(0, -q.QuietMonths, 0))
}

// compare orders two spaces by the column asked for, and those that tie by name from A, so
// the order is stable whichever way the column runs.
func (q adminSpaceQuery) compare(a, b spaces.Space, ta, tb console.SpaceTotal) int {
	byName := cmp.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	order := byName
	switch q.Sort.Column {
	case "key":
		order = cmp.Compare(strings.ToLower(a.Key), strings.ToLower(b.Key))
	case "pages":
		order = cmp.Compare(ta.Pages, tb.Pages)
	case "storage":
		order = cmp.Compare(ta.Bytes, tb.Bytes)
	case "activity":
		order = cmp.Compare(activityOf(ta), activityOf(tb))
	}
	if q.Sort.Reverse {
		order = -order
	}
	if order == 0 {
		return byName
	}
	return order
}

// activityOf is the last change of a space, and the start of time for one without any.
func activityOf(t console.SpaceTotal) int64 {
	if t.LastActivity == nil {
		return 0
	}
	return t.LastActivity.UnixNano()
}

// filterAdminSpaces keeps the spaces the query asks for, in its order, with the totals of
// those spaces only.
func filterAdminSpaces(list []spaces.Space, totals []console.SpaceTotal, q adminSpaceQuery, now time.Time) ([]spaces.Space, []console.SpaceTotal) {
	byID := make(map[uuid.UUID]console.SpaceTotal, len(totals))
	for _, t := range totals {
		byID[t.ID] = t
	}
	kept := []spaces.Space{}
	for _, s := range list {
		if q.keeps(s, byID[s.ID], now) {
			kept = append(kept, s)
		}
	}
	slices.SortStableFunc(kept, func(a, b spaces.Space) int { return q.compare(a, b, byID[a.ID], byID[b.ID]) })
	keptTotals := make([]console.SpaceTotal, 0, len(kept))
	for _, s := range kept {
		if t, ok := byID[s.ID]; ok {
			keptTotals = append(keptTotals, t)
		}
	}
	return kept, keptTotals
}
