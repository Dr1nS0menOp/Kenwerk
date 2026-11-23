// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"net/url"
	"slices"
	"strings"
	"testing"

	"github.com/kenwerk/kenwerk/internal/identity"
	"github.com/kenwerk/kenwerk/internal/permissions"
)

// The tool rows of spec 100: every search, filter and sort a list offers on screen is a
// parameter of its route, and a parameter only ever narrows what the list without it shows.

// testNamesOf reads the display names of the people made by the tests from a list of users.
func testNamesOf(m map[string]any) []string {
	out := []string{}
	for _, item := range m["users"].([]any) {
		if name := item.(map[string]any)["display_name"].(string); strings.HasPrefix(name, "Test ") {
			out = append(out, name)
		}
	}
	return out
}

func TestTheUserListSortsByAColumnInBothDirections(t *testing.T) {
	e := newEnv(t)
	root := e.user("root@example.com", identity.AllGlobalPermissions...)
	e.user("anna@example.com", identity.PermUseProduct)
	e.user("zoe@example.com", identity.PermUseProduct)

	root.want(400, "GET", "/api/v1/admin/users?sort=password", nil)
	byEmail := testNamesOf(root.ok("GET", "/api/v1/admin/users?sort=email", nil))
	if !slices.IsSorted(byEmail) || len(byEmail) != 3 {
		t.Fatalf("sorted by e-mail: %v", byEmail)
	}
	reversed := testNamesOf(root.ok("GET", "/api/v1/admin/users?sort=-email", nil))
	slices.Reverse(reversed)
	if !slices.Equal(reversed, byEmail) {
		t.Fatalf("the reverse of %v is %v", byEmail, reversed)
	}
	// The person who logged in last comes first when sorted newest login first.
	if first := testNamesOf(root.ok("GET", "/api/v1/admin/users?sort=-last_login", nil))[0]; first != "Test zoe@example.com" {
		t.Fatalf("newest login first: %v", first)
	}
}

// bigAndSmall makes two spaces, BIG with three pages and SMALL with its home page alone, and
// returns an administrator and a person without administration.
func bigAndSmall(t *testing.T) (root, reader *user) {
	e := newEnv(t)
	root = e.user("root@example.com", identity.AllGlobalPermissions...)
	reader = e.user("reader@example.com", identity.PermUseProduct)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	big, _ := owner.space("BIG")
	owner.space("SMALL")
	owner.page(big, nil, "One", "x")
	owner.page(big, nil, "Two", "x")
	return root, reader
}

func TestTheSpaceListFiltersOnTheServer(t *testing.T) {
	root, reader := bigAndSmall(t)
	reader.want(403, "GET", "/api/v1/admin/spaces?q=big", nil)
	for _, bad := range []string{"sort=secret", "status=trashed", "min_pages=-1", "quiet_months=x"} {
		root.want(400, "GET", "/api/v1/admin/spaces?"+bad, nil)
	}
	all := root.ok("GET", "/api/v1/admin/spaces", nil)
	whole := all["total"].(float64)
	if int(whole) != len(all["spaces"].([]any)) {
		t.Fatalf("without filters the list is whole: %v", all)
	}
	found := root.ok("GET", "/api/v1/admin/spaces?q=big", nil)
	if got := titlesIn(found, "spaces"); !slices.Equal(got, []string{"Space BIG"}) || found["total"].(float64) != whole {
		t.Fatalf("search by key: %v", found)
	}
	if got := len(found["totals"].([]any)); got != 1 {
		t.Fatalf("totals only for the spaces listed: %d", got)
	}
	// The home page counts too: BIG has three pages, SMALL one.
	if got := titlesIn(root.ok("GET", "/api/v1/admin/spaces?min_pages=3", nil), "spaces"); !slices.Equal(got, []string{"Space BIG"}) {
		t.Fatalf("at least three pages: %v", got)
	}
	if got := titlesIn(root.ok("GET", "/api/v1/admin/spaces?status=archived", nil), "spaces"); len(got) != 0 {
		t.Fatalf("no space is archived: %v", got)
	}
}

func TestTheSpaceListSortsOnTheServer(t *testing.T) {
	root, _ := bigAndSmall(t)
	byPages := titlesIn(root.ok("GET", "/api/v1/admin/spaces?sort=-pages&q=space", nil), "spaces")
	if len(byPages) < 2 || byPages[0] != "Space BIG" {
		t.Fatalf("most pages first: %v", byPages)
	}
	byName := titlesIn(root.ok("GET", "/api/v1/admin/spaces?sort=-name&q=space", nil), "spaces")
	if !slices.IsSortedFunc(byName, func(a, b string) int { return strings.Compare(strings.ToLower(b), strings.ToLower(a)) }) {
		t.Fatalf("names backwards: %v", byName)
	}
}

// holderNames reads the names of the holders in a list of role assignments.
func holderNames(m map[string]any) []string {
	out := []string{}
	for _, item := range m["assignments"].([]any) {
		out = append(out, item.(map[string]any)["name"].(string))
	}
	return out
}

// holders is a space whose holders are of every kind, and what a test needs to ask about them.
type holders struct {
	e      *env
	f      finerSpace
	viewer *user
	assign string // the path of the space's holders
	editor string // the id of the editor role, which the group and the service account hold
}

// holdersOfAllKinds gives a space a viewer, the group Writers and the service account Robot,
// the last two as editors.
func holdersOfAllKinds(t *testing.T) holders {
	e, f := newFinerSpace(t)
	viewer := f.holder(e, "viewer@example.com", permissions.SpaceView)
	var editor string
	robot := f.admin.ok("POST", "/api/v1/admin/service-accounts", map[string]any{"name": "Robot"})["id"].(string)
	group := f.admin.ok("POST", "/api/v1/admin/groups", map[string]any{"name": "Writers"})["id"].(string)
	for _, item := range f.owner.ok("GET", "/api/v1/roles?scope=space", nil)["roles"].([]any) {
		if role := item.(map[string]any); role["built_in"] == permissions.TemplateEditor {
			editor = role["id"].(string)
		}
	}
	assign := "/api/v1/spaces/" + f.space + "/role-assignments"
	for _, subject := range []map[string]any{
		{"type": permissions.SubjectGroup, "id": group},
		{"type": permissions.SubjectUser, "id": robot},
	} {
		f.owner.ok("PUT", assign, map[string]any{"subject": subject, "roles": []string{editor}})
	}
	return holders{e: e, f: f, viewer: viewer, assign: assign, editor: editor}
}

func TestAFilterOfPeopleIsNoWayAroundTheRule(t *testing.T) {
	h := holdersOfAllKinds(t)
	f, viewer, assign := h.f, h.viewer, h.assign
	stranger := h.e.user("stranger@example.com", identity.PermUseProduct)
	// Whoever may not manage access gets no list at all, with or without filters.
	viewer.want(403, "GET", assign+"?kind=group", nil)
	stranger.want(404, "GET", assign+"?q=writers", nil)
	for _, bad := range []string{"kind=robot", "role=not-an-id"} {
		f.owner.want(400, "GET", assign+"?"+bad, nil)
	}
}

func TestPeopleOfASpaceFilterByNameAndKind(t *testing.T) {
	h := holdersOfAllKinds(t)
	f, assign := h.f, h.assign
	if got := holderNames(f.owner.ok("GET", assign+"?kind=group", nil)); !slices.Equal(got, []string{"Writers"}) {
		t.Fatalf("groups: %v", got)
	}
	services := f.owner.ok("GET", assign+"?kind=service", nil)
	if got := holderNames(services); !slices.Equal(got, []string{"Robot"}) {
		t.Fatalf("service accounts: %v", got)
	}
	if row := services["assignments"].([]any)[0].(map[string]any); row["user_type"] != identity.TypeService {
		t.Fatalf("a service account says what it is: %v", row)
	}
	people := holderNames(f.owner.ok("GET", assign+"?kind=person", nil))
	if slices.Contains(people, "Robot") || !slices.Contains(people, "Test viewer@example.com") {
		t.Fatalf("people without service accounts: %v", people)
	}
	if got := holderNames(f.owner.ok("GET", assign+"?q=VIEWER", nil)); !slices.Equal(got, []string{"Test viewer@example.com"}) {
		t.Fatalf("search ignores case: %v", got)
	}
}

func TestARoleFilterOfPeopleStaysInsideItsSpace(t *testing.T) {
	h := holdersOfAllKinds(t)
	f, assign, editor := h.f, h.assign, h.editor
	withEditor := holderNames(f.owner.ok("GET", assign+"?role="+editor, nil))
	slices.Sort(withEditor)
	if !slices.Equal(withEditor, []string{"Robot", "Writers"}) {
		t.Fatalf("holders of the editor role: %v", withEditor)
	}
	// Only holders of this space: a role filter never reaches another space's holders.
	other, _ := f.owner.space("OTHER")
	if got := holderNames(f.owner.ok("GET", "/api/v1/spaces/"+other+"/role-assignments?role="+editor, nil)); len(got) != 0 {
		t.Fatalf("another space: %v", got)
	}
}

func TestTheContentSearchFindsOnlyPagesThePersonMaySee(t *testing.T) {
	e := newEnv(t)
	owner, editor, _, space := e.team("ENG")
	owner.page(space, nil, "Budget for spring", "x")
	secret := editor.page(space, nil, "Budget kept apart", "x")
	e.hideFromAllBut(secret, editor)
	owner.page(space, nil, "Holidays", "x")

	editor.want(403, "GET", "/api/v1/spaces/"+space+"/content?q=budget", nil)
	got := owner.ok("GET", "/api/v1/spaces/"+space+"/content?q="+url.QueryEscape("BUDGET"), nil)
	if titles := titlesIn(got, "pages"); !slices.Equal(titles, []string{"Budget for spring"}) || got["total"].(float64) != 1 {
		t.Fatalf("search of content: %v", got)
	}
}

func TestTemplatesFilterByNameAndStateOnTheServer(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("ENG")
	owner.ok("POST", "/api/v1/spaces/"+space+"/templates", map[string]any{"name": "Meeting notes", "document": para("x")})
	owner.ok("POST", "/api/v1/spaces/"+space+"/templates", map[string]any{"name": "Decision", "document": para("x")})
	list := "/api/v1/spaces/" + space + "/manage-templates"

	viewer.want(403, "GET", list+"?q=meeting", nil)
	owner.want(400, "GET", list+"?state=lost", nil)
	if got := titlesIn(owner.ok("GET", list+"?q=MEETING", nil), "templates"); !slices.Equal(got, []string{"Meeting notes"}) {
		t.Fatalf("search by name: %v", got)
	}
	states := map[string]int{}
	for _, item := range owner.ok("GET", list, nil)["templates"].([]any) {
		states[item.(map[string]any)["state"].(string)]++
	}
	for state, want := range states {
		if got := len(owner.ok("GET", list+"?state="+state, nil)["templates"].([]any)); got != want {
			t.Fatalf("state %s: %d, want %d", state, got, want)
		}
	}
	if got := len(owner.ok("GET", list+"?state=withdrawn", nil)["templates"].([]any)); got != states["withdrawn"] {
		t.Fatalf("withdrawn: %d", got)
	}
}
