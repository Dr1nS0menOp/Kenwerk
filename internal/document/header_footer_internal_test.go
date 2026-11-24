// SPDX-License-Identifier: Apache-2.0

package document

import "testing"

// The link rule of the header and footer stands on its own, also for what the gate of every
// document refuses first, so it still holds if that gate ever lets one through (spec 089, D3).
func TestTheLinkRuleOfTheBandRefusesWhatTheGateAlsoRefuses(t *testing.T) {
	for _, href := range []string{"//other.example/", "/\\other.example/", "///other.example/", "javascript:alert(1)",
		"https://", "https://other.example\\@intranet.example/", "data:text/html,x", "http://intranet.example/",
		"https://help.example.org/a\u00a0b", "mailto:a@example.org#x", "mailto:a@example.org?subject=x"} {
		if isNoteLink(href) {
			t.Errorf("%q passed the link rule of the band", href)
		}
	}
	for _, href := range []string{"/", "/spaces/HR", "https://help.example.org", "mailto:help@example.org"} {
		if !isNoteLink(href) {
			t.Errorf("%q was refused", href)
		}
	}
}
