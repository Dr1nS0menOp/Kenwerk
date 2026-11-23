// SPDX-License-Identifier: Apache-2.0

package mcp

import "github.com/kenwerk/kenwerk/internal/identity"

// Arguments that many tools share.
func pageID() arg {
	return arg{name: "page_id", kind: argID, place: inPath, field: "id", required: true, about: aboutPage}
}

func spaceID() arg {
	return arg{name: "space_id", kind: argID, place: inPath, field: "id", required: true, about: aboutSpace}
}

func commentID() arg {
	return arg{name: "comment_id", kind: argID, place: inPath, field: "id", required: true, about: aboutComment}
}

func spaceFilter() arg {
	return arg{name: "space_id", kind: argID, place: inQuery, about: "Only this space."}
}

func listLimit() arg {
	return arg{name: "limit", kind: argNumber, place: inQuery, about: aboutLimit, most: maxListLimit}
}

func listOffset() arg {
	return arg{name: "offset", kind: argNumber, place: inQuery, about: "Skip this many, for the next page of the list."}
}

// readTools are the tools that only read, each one request of one route. It is data.
var readTools = []toolSpec{
	{name: "search", description: "Search the pages the person can read, by words. Answers with titles, spaces and short excerpts.",
		routes: []string{"GET /api/v1/search"}, scopes: []string{identity.ScopeContentRead}, args: []arg{
			{name: "query", kind: argText, place: inQuery, field: "q", required: true, about: "The words to search for."},
			spaceFilter(),
			{name: "titles_only", kind: argText, place: inQuery, field: "titles", about: "1 to search only titles."}}},
	{name: "list_page_versions", description: "List the published versions of a page, newest first, with their number, author and summary.",
		routes: []string{"GET /api/v1/pages/{id}/versions"}, scopes: []string{identity.ScopeContentRead}, args: []arg{pageID()}},
	{name: "compare_versions", description: "Compare two versions of a page: what was added, removed and changed.",
		routes: []string{"GET /api/v1/pages/{id}/compare"}, scopes: []string{identity.ScopeContentRead}, args: []arg{pageID(),
			{name: "from", kind: argNumber, place: inQuery, required: true, about: "The older version number."},
			{name: "to", kind: argNumber, place: inQuery, required: true, about: "The newer version number."}}},
	{name: "list_spaces", description: "List the spaces the person can see, with their id, key and name.",
		routes: []string{"GET /api/v1/spaces"}, scopes: []string{identity.ScopeContentRead}},
	{name: "get_space", description: "Read a space: its key, name, description and home page.",
		routes: []string{"GET /api/v1/spaces/{id}"}, scopes: []string{identity.ScopeContentRead}, args: []arg{spaceID()}},
	{name: "list_space_tree", description: "List the pages of a space as a tree: each page with its id, title and parent.",
		routes: []string{"GET /api/v1/spaces/{id}/tree"}, scopes: []string{identity.ScopeContentRead}, args: []arg{spaceID()}},
	{name: "list_attachments", description: "List the files of a page, with their id, name, type and size.",
		routes: []string{"GET /api/v1/pages/{id}/attachments"}, scopes: []string{identity.ScopeContentRead}, args: []arg{pageID()}},
	{name: "get_attachment_text", description: "Read the text of a file of a page, such as a PDF or a document, as far as Kenwerk extracted it.",
		routes: []string{"GET /api/v1/attachments/{id}/text"}, scopes: []string{identity.ScopeContentRead}, args: []arg{
			{name: "attachment_id", kind: argID, place: inPath, field: "id", required: true, about: "The id of the file."}}},
	{name: "list_labels", description: "List the labels of a page.",
		routes: []string{"GET /api/v1/pages/{id}/labels"}, scopes: []string{identity.ScopeContentRead}, args: []arg{pageID()}},
	{name: "find_pages_by_label", description: "List the pages that carry a label.",
		routes: []string{"GET /api/v1/labels/{label}/pages"}, scopes: []string{identity.ScopeContentRead}, args: []arg{
			{name: "label", kind: argText, place: inPath, required: true, about: "The label."}, spaceFilter()}},
	{name: "my_tasks", description: "List the tasks assigned to the person, in every page they can read.",
		routes: []string{"GET /api/v1/me/tasks"}, scopes: []string{identity.ScopeContentRead}, args: []arg{
			{name: "status", kind: argText, place: inQuery, about: "open or done; open when left out."}}},
	{name: "recent_pages", description: "List the pages the person opened or changed lately.",
		routes: []string{"GET /api/v1/me/recent"}, scopes: []string{identity.ScopeContentRead}},
	{name: "list_templates", description: "List the templates a new page in a space can start from.",
		routes: []string{"GET /api/v1/spaces/{id}/templates"}, scopes: []string{identity.ScopeContentRead}, args: []arg{spaceID()}},
	{name: "feed", description: "List what happened lately in the spaces the person follows: new and changed pages, comments.",
		routes: []string{"GET /api/v1/feed"}, scopes: []string{identity.ScopeContentRead}, args: []arg{spaceFilter(), listLimit()}},
	{name: "find_people", description: "Find people by name or address, with their id and name.",
		routes: []string{"GET /api/v1/people"}, scopes: []string{identity.ScopePeopleRead}, args: []arg{
			{name: "query", kind: argText, place: inQuery, field: "q", about: "Part of a name or address."}, listLimit(), listOffset()}},
	{name: "get_person", description: "Read the profile of a person.",
		routes: []string{"GET /api/v1/people/{id}"}, scopes: []string{identity.ScopePeopleRead}, args: []arg{
			{name: "person_id", kind: argID, place: inPath, field: "id", required: true, about: "The id of the person."}}},
	{name: "who_am_i", description: "Read who the person of this connection is: their id, name and global permissions.",
		routes: []string{"GET /api/v1/me"}, scopes: []string{identity.ScopeAccountRead}},
	{name: "list_notifications", description: "List the person's notifications, newest first.",
		routes: []string{"GET /api/v1/me/notifications"}, scopes: []string{identity.ScopeAccountRead}, args: []arg{
			{name: "unread", kind: argFlag, place: inQuery, about: "Only those not read yet."}, listLimit()}},
	{name: "list_favourites", description: "List the pages and spaces the person marked as favourite.",
		routes: []string{"GET /api/v1/me/favourites"}, scopes: []string{identity.ScopeAccountRead}},
}
