// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/document"
)

// attachmentScheme names a file of a page in Markdown, so a page read and written back keeps
// its files: get_attachment_text takes the id behind it.
const attachmentScheme = "attachment:"

// maxMarkdownIn is the most Markdown a tool takes. The API limits the document it becomes; this
// keeps the conversion here small as well.
const maxMarkdownIn = 512 << 10

// maxPart is the most Markdown one result of get_page holds (spec 096: a page longer than 200 kB
// comes in parts).
const maxPart = 200 << 10

var errMarkdownTooLong = errors.New("the Markdown is longer than 512 kB; split the change into smaller pages")

// markdownOf writes a stored document as Markdown, or "" for a page without one.
func markdownOf(raw json.RawMessage) (string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", nil
	}
	doc, err := document.Parse(raw)
	if err != nil {
		return "", err
	}
	return document.ToMarkdown(doc, func(id uuid.UUID) string { return attachmentScheme + id.String() }), nil
}

// documentOf turns Markdown into a document of the editor's format, with the warnings of what
// could not be kept as it was. The API checks the document again when it stores it.
func documentOf(markdown string) (json.RawMessage, []string, error) {
	if len(markdown) > maxMarkdownIn {
		return nil, nil, errMarkdownTooLong
	}
	doc, warnings := document.FromMarkdown([]byte(markdown), func(destination string) (uuid.UUID, bool) {
		id, err := uuid.Parse(strings.TrimPrefix(destination, attachmentScheme))
		return id, err == nil && strings.HasPrefix(destination, attachmentScheme)
	})
	raw, err := document.Marshal(doc)
	return raw, warnings, err
}

// parts splits Markdown into parts of at most maxPart bytes, at the end of a line where one
// fits, so a long page can be read part by part.
func parts(markdown string) []string {
	var out []string
	for len(markdown) > maxPart {
		cut := strings.LastIndexByte(markdown[:maxPart], '\n') + 1
		if cut <= 0 {
			cut = maxPart
			for cut > 0 && !isRuneStart(markdown[cut]) {
				cut--
			}
		}
		out = append(out, markdown[:cut])
		markdown = markdown[cut:]
	}
	return append(out, markdown)
}

// isRuneStart says whether b starts a character in UTF-8, so a cut never splits one.
func isRuneStart(b byte) bool { return b&0xC0 != 0x80 }
