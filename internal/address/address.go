// SPDX-License-Identifier: Apache-2.0

// Package address builds and reads the addresses of a space's content (spec 094): the home page
// of a space at /spaces/<key>, every other page at /spaces/<key>/pages/<id>, and the older form
// /pages/<id>, which keeps working forever. The id decides which page an address opens; the key
// only names the space.
package address

import (
	"net/url"
	"regexp"

	"github.com/google/uuid"
)

// Space is the address of a space, which shows its home page.
func Space(spaceKey string) string {
	return "/spaces/" + url.PathEscape(spaceKey)
}

// Page is the canonical address of a page: its space's address for the home page, and the page
// under its space's key otherwise. The key is used as stored, in its own case (D3).
func Page(spaceKey string, page uuid.UUID, isHome bool) string {
	if isHome {
		return Space(spaceKey)
	}
	return Space(spaceKey) + "/pages/" + page.String()
}

// pageHref finds a page in an address inside this installation, in either form. What follows
// the id, such as a screen, a query or a heading, belongs to that page.
var pageHref = regexp.MustCompile(`^(?:/spaces/[^/?#]+)?/pages/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})([/?#].*)?$`)

// PageOf reads the page an address inside this installation leads to, and what follows its id.
func PageOf(href string) (page uuid.UUID, rest string, ok bool) {
	found := pageHref.FindStringSubmatch(href)
	if found == nil {
		return uuid.Nil, "", false
	}
	id, err := uuid.Parse(found[1])
	if err != nil {
		return uuid.Nil, "", false
	}
	return id, found[2], true
}

// KeyFree is the form a document stores: an address of a page under a key becomes /pages/<id>
// with what followed, so no key is ever stored and a change of key changes no content (D7).
// Any other address comes back as it was.
func KeyFree(href string) string {
	id, rest, ok := PageOf(href)
	if !ok {
		return href
	}
	return "/pages/" + id.String() + rest
}
