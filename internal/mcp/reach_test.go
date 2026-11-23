// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"strings"
	"testing"
)

func TestEachRouteHasTheReachOfItsList(t *testing.T) {
	for _, c := range []struct {
		method, path string
		want         Class
	}{
		{"POST", "/api/v1/me/password", ClassNever},
		{"DELETE", "/api/v1/me/tokens/" + pageID1, ClassNever},
		{"POST", "/api/v1/pages/" + pageID1 + "/signing", ClassNever},
		{"POST", "/api/v1/admin/backups/schedule/code", ClassNever},
		{"POST", "/api/v1/auth/login", ClassNever},
		{"POST", "/api/v1/pages/" + pageID1 + "/share", ClassApproval},
		{"GET", "/api/v1/spaces/" + pageID1 + "/export.zip", ClassApproval},
		{"PUT", "/api/v1/admin/features", ClassApproval},
		{"DELETE", "/api/v1/admin/groups/" + pageID1, ClassApproval},
		{"GET", "/api/v1/admin/features", ClassCallAPI},
		{"PATCH", "/api/v1/pages/" + pageID1, ClassCallAPI},
		{"GET", "/api/v1/me/tasks", ClassCallAPI},
		{"GET", "/scim/v2/Users", ClassOutside},
		{"POST", "/hooks/x", ClassOutside},
	} {
		got := Classify(c.method, c.path)
		if got.Class != c.want || (c.want != ClassCallAPI && got.Reason == "") {
			t.Errorf("%s %s: %+v, want %s with a reason", c.method, c.path, got, c.want)
		}
	}
}

func TestTheReasonsHoldNoPlaceholder(t *testing.T) {
	for pattern, reason := range NeverPatterns() {
		if strings.ContainsAny(reason, "{}%") || !strings.HasSuffix(reason, ".") {
			t.Errorf("%s: %q", pattern, reason)
		}
	}
}
