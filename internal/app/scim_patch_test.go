// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"fmt"
	"net/url"
	"testing"

	"github.com/kenwerk/kenwerk/internal/identity"
)

// scimGroupWithTwo makes two SCIM users and a SCIM group without members.
func scimGroupWithTwo(t *testing.T) (s *scimClient, gid, ann, bob string) {
	t.Helper()
	e := newEnv(t)
	s, _ = newScim(t, e, e.user("admin@example.com", identity.AllGlobalPermissions...))
	newUser := func(name string) string {
		u := s.want(201, "POST", "/Users", map[string]any{"userName": name + "@example.com", "displayName": name, "active": true,
			"emails": []any{map[string]any{"value": name + "@example.com"}}})
		return u["id"].(string)
	}
	ann, bob = newUser("ann"), newUser("bob")
	gid = s.want(201, "POST", "/Groups", map[string]any{"displayName": "Team"})["id"].(string)
	return s, gid, ann, bob
}

func patchOps(ops ...map[string]any) map[string]any { return map[string]any{"Operations": ops} }

func membersOf(s *scimClient, gid string) int {
	return len(s.want(200, "GET", "/Groups/"+gid, nil)["members"].([]any))
}

func TestSCIMGroupMembersCanBeReplacedAndRemoved(t *testing.T) {
	s, gid, ann, bob := scimGroupWithTwo(t)
	both := []any{map[string]any{"value": ann}, map[string]any{"value": bob}}
	s.want(200, "PATCH", "/Groups/"+gid, patchOps(map[string]any{"op": "replace", "path": "members", "value": both}))
	if n := membersOf(s, gid); n != 2 {
		t.Fatalf("after replace: %d members", n)
	}
	s.want(200, "PATCH", "/Groups/"+gid, patchOps(map[string]any{"op": "remove", "path": "members", "value": []any{map[string]any{"value": ann}}}))
	if n := membersOf(s, gid); n != 1 {
		t.Fatalf("after removing one: %d members", n)
	}
	s.want(200, "PATCH", "/Groups/"+gid, patchOps(map[string]any{"op": "remove", "path": "members"}))
	if n := membersOf(s, gid); n != 0 {
		t.Fatalf("after removing all: %d members", n)
	}
}

func TestSCIMGroupPatchWithoutAPathRenamesAndAdds(t *testing.T) {
	s, gid, ann, _ := scimGroupWithTwo(t)
	s.want(200, "PATCH", "/Groups/"+gid, patchOps(map[string]any{"op": "add",
		"value": map[string]any{"displayName": "Renamed", "members": []any{map[string]any{"value": ann}}}}))
	got := s.want(200, "GET", "/Groups/"+gid, nil)
	if got["displayName"] != "Renamed" || len(got["members"].([]any)) != 1 {
		t.Fatalf("after a patch without a path: %+v", got)
	}
}

func TestSCIMPatchRefusesValuesItCannotRead(t *testing.T) {
	s, gid, ann, _ := scimGroupWithTwo(t)
	for _, op := range []map[string]any{
		{"op": "add", "path": "members", "value": "not a list"},
		{"op": "add", "path": "members", "value": []any{map[string]any{"value": "not-an-id"}}},
		{"op": "remove", "path": `members[value eq "not-an-id"]`},
		{"op": "add", "value": "not an object"},
		{"op": "add", "value": map[string]any{"members": []any{map[string]any{"value": "not-an-id"}}}},
	} {
		s.want(400, "PATCH", "/Groups/"+gid, patchOps(op))
	}
	s.want(400, "PATCH", "/Users/"+ann, patchOps(map[string]any{"op": "replace", "path": "active", "value": []any{}}))
	s.want(400, "PATCH", "/Users/"+ann, patchOps(map[string]any{"op": "replace", "value": "not an object"}))
	s.want(400, "PATCH", "/Users/"+ann, patchOps(map[string]any{"op": "replace", "value": map[string]any{"active": []any{}}}))
	if n := membersOf(s, gid); n != 0 {
		t.Fatalf("a refused patch changed the group: %d members", n)
	}
}

func TestSCIMMembershipCheckFindsNoGroupForAStrangerOrAnUnknownGroup(t *testing.T) {
	s, gid, ann, bob := scimGroupWithTwo(t)
	s.want(200, "PATCH", "/Groups/"+gid, patchOps(map[string]any{"op": "add", "path": "members", "value": []any{map[string]any{"value": ann}}}))
	check := func(group, member string) any {
		f := fmt.Sprintf(`id eq "%s" and members.value eq "%s"`, group, member)
		return s.want(200, "GET", "/Groups?filter="+url.QueryEscape(f), nil)["totalResults"]
	}
	if got := check(gid, bob); got != float64(0) {
		t.Fatalf("a stranger is a member: %v", got)
	}
	if got := check("01938f2e-7b3a-7cde-8f00-0123456789ab", ann); got != float64(0) {
		t.Fatalf("an unknown group: %v", got)
	}
	if got := check("not-an-id", ann); got != float64(0) {
		t.Fatalf("an id that is none: %v", got)
	}
}
