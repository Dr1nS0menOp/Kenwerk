// SPDX-License-Identifier: Apache-2.0

// Package document owns the structured document format (ADR-004, spec 001):
// a JSON tree based on the ProseMirror model. Normalize is the security gate:
// only allow-listed nodes, marks and attributes get past it, so stored content
// can never carry scripts, event handlers or external resources.
package document

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/address"
	"github.com/kenwerk/kenwerk/internal/apperr"
)

// SchemaVersion is the current document schema. Old documents are upgraded on read.
const SchemaVersion = 1

// Limits (spec 001, spec 008).
const (
	MaxBytes   = 5 << 20
	MaxDepth   = 100
	minColumns = 2
	maxColumns = 5
)

// Node is one element of a document.
type Node struct {
	Type    string         `json:"type"`
	Attrs   map[string]any `json:"attrs,omitempty"`
	Content []Node         `json:"content,omitempty"`
	Marks   []Mark         `json:"marks,omitempty"`
	Text    string         `json:"text,omitempty"`
}

// Mark is inline formatting on a text node.
type Mark struct {
	Type  string         `json:"type"`
	Attrs map[string]any `json:"attrs,omitempty"`
}

// Node types.
const (
	TypeDoc            = "doc"
	TypeParagraph      = "paragraph"
	TypeHeading        = "heading"
	TypeBulletList     = "bulletList"
	TypeOrderedList    = "orderedList"
	TypeListItem       = "listItem"
	TypeTaskList       = "taskList"
	TypeTaskItem       = "taskItem"
	TypeBlockquote     = "blockquote"
	TypeCodeBlock      = "codeBlock"
	TypeHorizontalRule = "horizontalRule"
	TypeHardBreak      = "hardBreak"
	TypeImage          = "image"
	TypeInlineImage    = "inlineImage"
	TypeSpotlight      = "spotlight"
	TypeUnknownBlock   = "unknownBlock"
	TypeFile           = "file"
	TypePanel          = "panel"
	TypeExpand         = "expand"
	TypeColumns        = "columns"
	TypeColumn         = "column"
	TypeDecision       = "decision"
	TypeStatus         = "status"
	TypeDate           = "date"
	TypeTemplateField  = "templateField"
	TypeInstruction    = "instruction"
	TypeTemplateValue  = "templateValue"
	TypeConditional    = "conditional"
	TypeMention        = "mention"
	TypeTable          = "table"
	TypeTableRow       = "tableRow"
	TypeTableCell      = "tableCell"
	TypeTableHeader    = "tableHeader"
	TypeText           = "text"
)

// Mark types.
const (
	MarkBold        = "bold"
	MarkItalic      = "italic"
	MarkUnderline   = "underline"
	MarkStrike      = "strike"
	MarkCode        = "code"
	MarkLink        = "link"
	MarkSubscript   = "subscript"
	MarkSuperscript = "superscript"
	MarkTextColor   = "textColor"
	MarkHighlight   = "highlight"
)

var (
	blockTypes  = []string{TypeParagraph, TypeHeading, TypeBulletList, TypeOrderedList, TypeTaskList, TypeBlockquote, TypeCodeBlock, TypeHorizontalRule, TypeImage, TypeFile, TypeTable, TypePanel, TypeExpand, TypeColumns, TypeDecision, TypeDynamic, TypePageFacts, TypeExcerpt, TypeChart, TypeMedia, TypePageCard, TypeSpotlight, TypeUnknownBlock, TypeConditional}
	inlineTypes = []string{TypeText, TypeHardBreak, TypeStatus, TypeDate, TypeMention, TypeTemplateField, TypeTemplateValue, TypeInstruction, TypeAnchor, TypePageLink, TypePlaceholderLink, TypeInlineImage}
)

// children says which node types may appear inside each node type.
var children = map[string][]string{
	TypeDoc:             append(slices.Clone(blockTypes), TypeSheet),
	TypeParagraph:       inlineTypes,
	TypeHeading:         inlineTypes,
	TypeBulletList:      {TypeListItem},
	TypeOrderedList:     {TypeListItem},
	TypeListItem:        blockTypes,
	TypeTaskList:        {TypeTaskItem},
	TypeTaskItem:        blockTypes,
	TypeBlockquote:      blockTypes,
	TypeCodeBlock:       {TypeText},
	TypeHorizontalRule:  {},
	TypeHardBreak:       {},
	TypeImage:           {},
	TypeInlineImage:     {},
	TypeUnknownBlock:    {},
	TypeSpotlight:       blockTypes,
	TypeFile:            {},
	TypePanel:           blockTypes,
	TypeExpand:          blockTypes,
	TypeColumns:         {TypeColumn},
	TypeColumn:          blockTypes,
	TypeDecision:        inlineTypes,
	TypeStatus:          {},
	TypeDate:            {},
	TypeTemplateField:   {},
	TypeInstruction:     {},
	TypeTemplateValue:   {},
	TypeConditional:     blockTypes,
	TypeMention:         {},
	TypeDynamic:         {},
	TypePageFacts:       {TypeTable},
	TypeExcerpt:         blockTypes,
	TypeAnchor:          {},
	TypeChart:           {},
	TypeSheet:           {},
	TypeMedia:           {},
	TypePageLink:        {},
	TypePageCard:        {},
	TypePlaceholderLink: {},
	TypeTable:           {TypeTableRow},
	TypeTableRow:        {TypeTableCell, TypeTableHeader},
	TypeTableCell:       blockTypes,
	TypeTableHeader:     blockTypes,
	TypeText:            {},
}

// NodeTypes lists every node a document can hold.
func NodeTypes() []string {
	out := make([]string, 0, len(children))
	for name := range children {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

// MarkTypes lists every mark a text can have.
func MarkTypes() []string {
	return []string{MarkBold, MarkItalic, MarkUnderline, MarkStrike, MarkCode, MarkLink,
		MarkSubscript, MarkSuperscript, MarkTextColor, MarkHighlight}
}

var languagePattern = regexp.MustCompile(`^[a-zA-Z0-9_+#.-]{1,32}$`)

// Empty returns a document with one empty paragraph.
func Empty() Node {
	return Node{Type: TypeDoc, Content: []Node{{Type: TypeParagraph}}}
}

// Normalize parses and checks a document. Unknown nodes and marks are refused,
// unknown attributes are dropped, and the result is safe to store.
func Normalize(raw []byte) (Node, error) {
	if len(raw) > MaxBytes {
		return Node{}, apperr.TooLarge("The document is larger than the limit of 5 MiB.")
	}
	var n Node
	dec := json.NewDecoder(bytes.NewReader(raw))
	if err := dec.Decode(&n); err != nil {
		return Node{}, apperr.Invalid("The document is not valid JSON.")
	}
	if n.Type != TypeDoc {
		return Node{}, apperr.Invalid("A document must have type doc at the top.")
	}
	if err := clean(&n, 0); err != nil {
		return Node{}, apperr.Invalid(err.Error())
	}
	liftNestedTables(&n, false)
	if err := checkConditionalDepth(n, 0); err != nil {
		return Node{}, apperr.Invalid(err.Error())
	}
	if len(n.Content) == 0 {
		n.Content = []Node{{Type: TypeParagraph}}
	}
	return n, nil
}

func clean(n *Node, depth int) error {
	if depth > MaxDepth {
		return fmt.Errorf("the document is nested more than %d levels deep", MaxDepth)
	}
	allowed, known := children[n.Type]
	if !known {
		return fmt.Errorf("unknown node type %q", truncate(n.Type, 40))
	}
	if !utf8.ValidString(n.Text) {
		return errors.New("text is not valid UTF-8")
	}
	if n.Type != TypeText {
		n.Text = ""
		n.Marks = nil
	}
	if err := cleanAttrs(n); err != nil {
		return err
	}
	if n.Type == TypeConditional && len(n.Content) == 0 {
		return errors.New("a section shown when a condition holds needs some text")
	}
	if n.Type == TypeColumns && (len(n.Content) < minColumns || len(n.Content) > maxColumns) {
		return fmt.Errorf("columns need %d to %d columns", minColumns, maxColumns)
	}
	if n.Type == TypeText {
		n.Content = nil
		marks, err := cleanMarks(n.Marks)
		if err != nil {
			return err
		}
		n.Marks = marks
		return nil
	}
	kept := n.Content[:0]
	for i := range n.Content {
		child := &n.Content[i]
		if !contains(allowed, child.Type) {
			return fmt.Errorf("%q cannot contain %q", n.Type, truncate(child.Type, 40))
		}
		if child.Type == TypeText && child.Text == "" {
			continue // ProseMirror refuses empty text nodes
		}
		if err := clean(child, depth+1); err != nil {
			return err
		}
		if n.Type == TypeCodeBlock {
			child.Marks = nil
		}
		kept = append(kept, *child)
	}
	n.Content = kept
	return nil
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// SafeHref allows http, https and mailto links and relative paths. Everything
// else is refused, including javascript: and data: in any spelling.
func SafeHref(href string) (string, error) {
	href = strings.TrimSpace(href)
	bad := errors.New("links must use http, https or mailto, or be a relative path")
	if href == "" || len(href) > 2048 || strings.Contains(href, "\\") {
		return "", bad
	}
	for _, r := range href {
		if r < 0x20 || r == 0x7f {
			return "", bad
		}
	}
	if strings.HasPrefix(href, "//") {
		return "", bad // protocol-relative: leaves the site without saying so
	}
	u, err := url.Parse(href)
	if err != nil {
		return "", bad
	}
	switch strings.ToLower(u.Scheme) {
	case "http", "https":
		if u.Host == "" {
			return "", bad
		}
	case "mailto":
	case "":
		if u.Host != "" || !(strings.HasPrefix(href, "/") || strings.HasPrefix(href, "#")) {
			return "", bad
		}
	default:
		return "", bad
	}
	return href, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}

// Marshal encodes a document for storage.
func Marshal(n Node) ([]byte, error) { return json.Marshal(n) }

// Parse decodes a stored document. Stored documents were normalized on the way in.
func Parse(raw []byte) (Node, error) {
	var n Node
	err := json.Unmarshal(raw, &n)
	return n, err
}

// Walk visits n and everything below it.
func Walk(n Node, visit func(Node)) {
	visit(n)
	for _, c := range n.Content {
		Walk(c, visit)
	}
}

// searchedAttr names the attributes of one type of node whose words search reads.
type searchedAttr struct {
	// own holds what the node itself says. It is read as part of the text of its block, as
	// the words of a status mark are read with the line around them.
	own string
	// line holds words shown on a block outside its content, such as a caption or a title.
	// Text writes them on a line of their own where the block starts.
	line []string
}

// searchedAttrs is every attribute whose words a reader sees as text on the page, by type of
// node: what search reads from a node besides its children (spec 087, EDT-155). Tooltips,
// names that serve as addresses and the settings of dynamic blocks stay out (D2).
// TestEveryTextAttributeIsSearchedOrNamedAsNotRead holds every other text attribute of the
// gate to a reason. A change here that changes Text for existing documents raises
// search.TextVersion.
var searchedAttrs = map[string]searchedAttr{
	TypeFile:            {own: "filename"},
	TypeStatus:          {own: "text"},
	TypeDate:            {own: "value"},
	TypeInlineImage:     {own: "alt"},
	TypePlaceholderLink: {own: "title"},
	TypeImage:           {own: "caption", line: []string{"alt", "caption"}},
	TypeExpand:          {own: "title", line: []string{"title"}},
	TypeTable:           {line: []string{"caption"}},
	TypeCodeBlock:       {line: []string{"title"}},
	TypeChart:           {line: []string{"title", "x_title", "y_title"}},
	TypeMedia:           {line: []string{"caption"}},
	TypeSpotlight:       {line: []string{"button_text"}},
}

// wordsOf returns what a node itself says, apart from its children.
func wordsOf(n Node) string {
	switch n.Type {
	case TypeText:
		return n.Text
	case TypeHardBreak:
		return " "
	case TypeMention:
		return mentionText(n)
	case TypeSheet:
		return sheetText(n)
	}
	s, _ := n.Attrs[searchedAttrs[n.Type].own].(string)
	return s
}

// lineWords gives the words a block shows outside its content, on one line.
func lineWords(n Node) string {
	words := make([]string, 0, len(searchedAttrs[n.Type].line))
	for _, key := range searchedAttrs[n.Type].line {
		s, _ := n.Attrs[key].(string)
		words = append(words, s)
	}
	return strings.TrimSpace(strings.Join(words, " "))
}

func inlineText(n Node, b *strings.Builder) {
	b.WriteString(wordsOf(n))
	for i, c := range n.Content {
		// Blocks are separate things: without a space, two list items become one word.
		startsBlock := !contains(inlineTypes, c.Type) && (i > 0 || b.Len() > 0)
		if startsBlock && !strings.HasSuffix(b.String(), " ") {
			b.WriteByte(' ')
		}
		inlineText(c, b)
	}
}

// BlockText returns the plain text of one node.
func BlockText(n Node) string {
	var b strings.Builder
	inlineText(n, &b)
	return b.String()
}

// textBlocks are the blocks whose text is a line of Text.
var textBlocks = []string{TypeParagraph, TypeHeading, TypeCodeBlock, TypeFile, TypeDecision, TypeSheet}

// Text returns the plain text of a document, one line per text block, for search. The words a
// block shows outside its content come first, on a line of their own (searchedAttrs).
func Text(n Node) string {
	var b strings.Builder
	writeLine := func(t string) {
		if t != "" {
			b.WriteString(t)
			b.WriteByte('\n')
		}
	}
	Walk(n, func(c Node) {
		writeLine(lineWords(c))
		if contains(textBlocks, c.Type) {
			writeLine(BlockText(c))
		}
	})
	return b.String()
}

// LinkedPages lists the pages a document links to, each once.
func LinkedPages(n Node) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	out := []uuid.UUID{}
	add := func(id uuid.UUID) {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	Walk(n, func(c Node) {
		if id, ok := linkedPageOf(c); ok {
			add(id)
		}
		for _, m := range c.Marks {
			href, _ := m.Attrs["href"].(string)
			if id, _, found := address.PageOf(href); m.Type == MarkLink && found {
				add(id)
			}
		}
	})
	return out
}

func pointsToAttachment(n Node) bool {
	return n.Type == TypeImage || n.Type == TypeInlineImage || n.Type == TypeFile
}

// AttachmentIDs lists the attachments a document shows.
func AttachmentIDs(n Node) []uuid.UUID {
	var out []uuid.UUID
	Walk(n, func(c Node) {
		if pointsToAttachment(c) {
			if s, ok := c.Attrs["attachment_id"].(string); ok {
				if id, err := uuid.Parse(s); err == nil {
					out = append(out, id)
				}
			}
		}
	})
	return out
}

// FilesShown lists every attachment a document points at, once each, whatever kind of
// block shows it.
func FilesShown(n Node) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	var out []uuid.UUID
	Walk(n, func(c Node) {
		s, _ := c.Attrs["attachment_id"].(string)
		if id, err := uuid.Parse(s); err == nil && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	})
	return out
}

// RemapAttachments points images and files at new attachments, after copying a page.
func RemapAttachments(n *Node, mapping map[uuid.UUID]uuid.UUID) {
	if pointsToAttachment(*n) {
		if s, ok := n.Attrs["attachment_id"].(string); ok {
			if id, err := uuid.Parse(s); err == nil {
				if to, found := mapping[id]; found {
					n.Attrs["attachment_id"] = to.String()
				}
			}
		}
	}
	for i := range n.Content {
		RemapAttachments(&n.Content[i], mapping)
	}
}
