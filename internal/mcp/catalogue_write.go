// SPDX-License-Identifier: Apache-2.0

package mcp

import "github.com/kenwerk/kenwerk/internal/identity"

func version() arg {
	return arg{name: "version", kind: argNumber, place: inPath, field: "number", required: true, about: "The version number."}
}

// writeTools are the tools that change something, each one request of one route. It is data.
// Sharing, access, publishing a site and what cannot be undone are not here: for an assistant
// they need the person's approval, which arrives in a later release.
var writeTools = []toolSpec{
	{name: "rename_page", description: "Give a page a new title.",
		routes: []string{"PATCH /api/v1/pages/{id}"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{pageID(),
			{name: "title", kind: argText, place: inBody, required: true, about: "The new title."}}},
	{name: "move_page", description: "Move a page, with every page below it, to another parent or space.",
		routes: []string{"POST /api/v1/pages/{id}/move"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{pageID(),
			{name: "space_id", kind: argID, place: inBody, about: "The space to move to; the page's own when left out."},
			{name: "parent_id", kind: argID, place: inBody, about: "The new parent page; the top of the space when left out."},
			{name: "before_id", kind: argID, place: inBody, about: "Put it before this page; last when left out."}}},
	{name: "copy_page", description: "Copy a page, and if asked the pages below it.",
		routes: []string{"POST /api/v1/pages/{id}/copy"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{pageID(),
			{name: "space_id", kind: argID, place: inBody, about: "The space to copy into; the page's own when left out."},
			{name: "parent_id", kind: argID, place: inBody, about: "The parent of the copy."},
			{name: "include_children", kind: argFlag, place: inBody, about: "Copy the pages below it too."}}},
	{name: "restore_version", description: "Make an older version of a page its newest version again. The versions in between stay in the history.",
		routes: []string{"POST /api/v1/pages/{id}/versions/{number}/restore"}, scopes: []string{identity.ScopeContentWrite},
		args: []arg{pageID(), version()}},
	{name: "delete_page", description: "Move a page, with the pages below it, to the trash of its space. An owner of the space can restore it.",
		routes: []string{"DELETE /api/v1/pages/{id}"}, scopes: []string{identity.ScopeContentDelete}, args: []arg{pageID()}},
	{name: "archive_page", description: "Archive a page: it stays readable but leaves the tree and search.",
		routes: []string{"POST /api/v1/pages/{id}/archive"}, scopes: []string{identity.ScopeContentDelete}, args: []arg{pageID()}},
	{name: "resolve_comment", description: "Mark a comment thread as resolved.",
		routes: []string{"POST /api/v1/comments/{id}/resolve"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{commentID()}},
	{name: "reopen_comment", description: "Open a resolved comment thread again.",
		routes: []string{"POST /api/v1/comments/{id}/reopen"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{commentID()}},
	{name: "delete_comment", description: "Delete a comment.",
		routes: []string{"DELETE /api/v1/comments/{id}"}, scopes: []string{identity.ScopeContentDelete}, args: []arg{commentID()}},
	{name: "complete_task", description: "Mark a task in a page as done, or as open again.",
		routes: []string{"POST /api/v1/tasks/{id}/done"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{
			{name: "task_id", kind: argID, place: inPath, field: "id", required: true, about: "The id of the task."},
			{name: "done", kind: argFlag, place: inBody, required: true, about: "true for done, false for open."}}},
	{name: "add_label", description: "Add a label to a page.",
		routes: []string{"POST /api/v1/pages/{id}/labels"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{pageID(),
			{name: "label", kind: argText, place: inBody, required: true, about: "The label."}}},
	{name: "remove_label", description: "Take a label off a page.",
		routes: []string{"DELETE /api/v1/pages/{id}/labels/{label}"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{pageID(),
			{name: "label", kind: argText, place: inPath, required: true, about: "The label."}}},
	{name: "watch_page", description: "Watch a page, so the person hears of its changes.",
		routes: []string{"PUT /api/v1/pages/{id}/watch"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{pageID()}},
	{name: "unwatch_page", description: "Stop watching a page.",
		routes: []string{"DELETE /api/v1/pages/{id}/watch"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{pageID()}},
	{name: "use_template", description: "Start a new page from a template, with answers for its fields.",
		routes: []string{"POST /api/v1/templates/{id}/use"}, scopes: []string{identity.ScopeContentWrite}, args: []arg{
			{name: "template_id", kind: argID, place: inPath, field: "id", required: true, about: "The id of the template."},
			{name: "space_id", kind: argID, place: inBody, required: true, about: aboutSpace},
			{name: "parent_id", kind: argID, place: inBody, about: "The parent page; the top of the space when left out."},
			{name: "title", kind: argText, place: inBody, required: true, about: "The title of the new page."},
			{name: "answers", kind: argObject, place: inBody, about: "Answers for the template's fields, by field name."}}},
	{name: "mark_notification_read", description: "Mark a notification as read.",
		routes: []string{"PUT /api/v1/me/notifications/{id}/read"}, scopes: []string{identity.ScopeAccountWrite}, args: []arg{
			{name: "notification_id", kind: argID, place: inPath, field: "id", required: true, about: "The id of the notification."}}},
}
