// SPDX-License-Identifier: Apache-2.0

package document

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/kenwerk/kenwerk/internal/apperr"
)

// The installation's header and footer (spec 089) are documents that every reader sees on every
// page, written by an administrator. They pass the gate of every document and then this stricter
// check: text and links only, links that cannot hide where they go, and small limits (D2, D3, D11).

// The limits of one field, after normalising (D11).
const (
	headerFooterMaxCharacters = 600
	headerFooterMaxParagraphs = 5
	headerFooterMaxLinks      = 5
	headerFooterMaxStatuses   = 3
	headerFooterMaxBytes      = 8 << 10
)

// What a refusal names: a node or mark outside the subset, a link, the text, or a limit.
const (
	ProblemNotAllowed     = "not_allowed"
	ProblemLinkNotAllowed = "link_not_allowed"
	ProblemTextNotAllowed = "text_not_allowed"
	ProblemTooLong        = "too_long"
)

// HeaderFooterLimits are the limits of one field, as the administration shows them.
type HeaderFooterLimits struct {
	Characters int `json:"characters"`
	Paragraphs int `json:"paragraphs"`
	Links      int `json:"links"`
	Statuses   int `json:"statuses"`
	Bytes      int `json:"bytes"`
}

// HeaderFooterLimitsInForce gives the limits of one field.
func HeaderFooterLimitsInForce() HeaderFooterLimits {
	return HeaderFooterLimits{Characters: headerFooterMaxCharacters, Paragraphs: headerFooterMaxParagraphs,
		Links: headerFooterMaxLinks, Statuses: headerFooterMaxStatuses, Bytes: headerFooterMaxBytes}
}

// HeaderFooterRefusal says why a header or footer cannot be stored.
type HeaderFooterRefusal struct {
	// Problem is one of the Problem names.
	Problem string
	// Reason is a sentence for the administrator, without the content itself.
	Reason string
}

func (r *HeaderFooterRefusal) Error() string { return r.Problem + ": " + r.Reason }

func refuse(problem, reason string) *HeaderFooterRefusal {
	return &HeaderFooterRefusal{Problem: problem, Reason: reason}
}

// The nodes and marks a header or footer may hold (D2).
var (
	headerFooterNodes = choices(TypeDoc, TypeParagraph, TypeText, TypeHardBreak, TypeStatus)
	headerFooterMarks = choices(MarkBold, MarkItalic, MarkUnderline, MarkTextColor, MarkLink)
)

// asciiHost is a host name in ASCII letters, digits, dots and hyphens; an international name is
// written in its xn-- form, so no letter can look like another's (D3).
var asciiHost = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$`)

// mailAddress is one address and nothing after it.
var mailAddress = regexp.MustCompile(`^[^@\s,;?&/]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$`)

// HeaderFooterContent checks raw as the content of the installation's header or footer, and
// gives what to store: nil when the field is empty. Anything outside the subset is refused, never
// quietly dropped, so an administrator never stores something other than what they saw.
func HeaderFooterContent(raw []byte) (*Node, error) {
	n, err := Normalize(raw)
	if err != nil {
		var gate *apperr.Error
		if errors.As(err, &gate) && gate.Kind == apperr.KindTooLarge {
			return nil, refuse(ProblemTooLong, "It is larger than a header or footer may be.")
		}
		return nil, refuse(ProblemNotAllowed, "It holds something a document may not hold.")
	}
	dropIndent(&n)
	if isEmptyNote(n) {
		return nil, nil
	}
	if err := checkHeaderFooter(n); err != nil {
		return nil, err
	}
	stored, err := Marshal(n)
	if err != nil {
		return nil, err
	}
	if len(stored) > headerFooterMaxBytes {
		return nil, refuse(ProblemTooLong, fmt.Sprintf("It is larger than %d bytes.", headerFooterMaxBytes))
	}
	return &n, nil
}

// dropIndent leaves out the indent of a paragraph, which a line of the band does not need.
func dropIndent(n *Node) {
	for i := range n.Content {
		p := &n.Content[i]
		delete(p.Attrs, "indent")
		if len(p.Attrs) == 0 {
			p.Attrs = nil
		}
	}
}

// isEmptyNote reports whether a document says nothing: paragraphs of white space and line breaks.
// Anything else, such as an image, is not nothing, so the check refuses it rather than dropping it.
func isEmptyNote(n Node) bool {
	empty := true
	Walk(n, func(c Node) {
		switch c.Type {
		case TypeDoc, TypeParagraph, TypeHardBreak:
		case TypeText:
			empty = empty && strings.TrimSpace(c.Text) == ""
		default:
			empty = false
		}
	})
	return empty
}

// noteCount is what the limits count in one field.
type noteCount struct {
	characters, paragraphs, links, statuses int
}

// checkHeaderFooter walks a normalised document and refuses what the subset does not hold.
func checkHeaderFooter(n Node) error {
	var count noteCount
	var refused error
	Walk(n, func(c Node) {
		if refused == nil {
			refused = checkNoteNode(c, &count)
		}
	})
	if refused != nil {
		return refused
	}
	limits := []struct {
		got, max int
		what     string
	}{
		{count.characters, headerFooterMaxCharacters, "characters"},
		{count.paragraphs, headerFooterMaxParagraphs, "paragraphs"},
		{count.links, headerFooterMaxLinks, "links"},
		{count.statuses, headerFooterMaxStatuses, "status marks"},
	}
	for _, l := range limits {
		if l.got > l.max {
			return refuse(ProblemTooLong, fmt.Sprintf("It holds more than %d %s.", l.max, l.what))
		}
	}
	return nil
}

func checkNoteNode(c Node, count *noteCount) error {
	if !headerFooterNodes[c.Type] {
		return refuse(ProblemNotAllowed, "It may hold only text, links and status marks in paragraphs.")
	}
	switch c.Type {
	case TypeParagraph:
		count.paragraphs++
	case TypeStatus:
		count.statuses++
		words, _ := c.Attrs["text"].(string)
		count.characters += utf8.RuneCountInString(words)
		return checkNoteText(words)
	case TypeText:
		count.characters += utf8.RuneCountInString(c.Text)
		if err := checkNoteText(c.Text); err != nil {
			return err
		}
		return checkNoteMarks(c.Marks, count)
	}
	return nil
}

func checkNoteMarks(marks []Mark, count *noteCount) error {
	for _, m := range marks {
		if !headerFooterMarks[m.Type] {
			return refuse(ProblemNotAllowed, "Its text may be bold, italic, underlined, coloured or a link, and nothing else.")
		}
		if m.Type != MarkLink {
			continue
		}
		count.links++
		href, _ := m.Attrs["href"].(string)
		if err := checkNoteLink(href); err != nil {
			return err
		}
	}
	return nil
}

// isTurningCharacter reports a character that overrides or isolates the direction of text, which
// can turn an address or a word around on screen (D3).
func isTurningCharacter(r rune) bool {
	return (r >= 0x202A && r <= 0x202E) || (r >= 0x2066 && r <= 0x2069)
}

func checkNoteText(s string) error {
	for _, r := range s {
		if unicode.IsControl(r) || isTurningCharacter(r) {
			return refuse(ProblemTextNotAllowed, "Its text holds a control character or one that turns text around.")
		}
	}
	return nil
}

// checkNoteLink allows https to an ASCII host without a user part, one mail address, and a path
// inside the installation. Everything else is refused, plain http included (D3).
func checkNoteLink(href string) error {
	if isNoteLink(href) {
		return nil
	}
	return refuse(ProblemLinkNotAllowed,
		"A link must be https to a plain host name, one mail address, or a path inside this installation.")
}

func isNoteLink(href string) bool {
	if strings.ContainsFunc(href, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) || r == '\\' }) {
		return false
	}
	if strings.HasPrefix(href, "/") {
		return !strings.HasPrefix(href, "//")
	}
	u, err := url.Parse(href)
	if err != nil {
		return false
	}
	switch strings.ToLower(u.Scheme) {
	case "https":
		return isPlainHTTPS(u)
	case "mailto":
		return isOneMailAddress(u)
	}
	return false
}

// isPlainHTTPS reports an https address with a host name in plain letters and no user part, which
// could name a trusted host before the @ (D3).
func isPlainHTTPS(u *url.URL) bool {
	return u.User == nil && u.Opaque == "" && asciiHost.MatchString(u.Hostname()) && allDigits(u.Port())
}

func isOneMailAddress(u *url.URL) bool {
	return u.RawQuery == "" && u.Fragment == "" && mailAddress.MatchString(u.Opaque)
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
