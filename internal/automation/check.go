// SPDX-License-Identifier: Apache-2.0

package automation

import (
	"context"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/apperr"
	"github.com/kenwerk/kenwerk/internal/identity"
)

// Checked is what the screen of cards learns about a definition while it is edited
// (spec 091): what it still needs, and the names of what it refers to.
type Checked struct {
	Problems []Problem `json:"problems"`
	// Names holds, for each id the definition refers to, its title or name, only when the
	// person checking may see it. A missing id is something they may not see, or that is gone.
	Names map[string]string `json:"names"`
}

// Check judges a definition for a rule of a space, or of the instance when spaceID is nil,
// for someone who may manage rules there. It stores nothing and writes no event: it is the
// one judge the screen asks while editing, so the browser keeps no rules of its own (D5).
func (s *Service) Check(ctx context.Context, c identity.Caller, spaceID *uuid.UUID, d Definition) (Checked, error) {
	if err := s.mayManage(ctx, c, spaceID); err != nil {
		return Checked{}, err
	}
	problems := d.Problems()
	gone, err := s.goneThings(ctx, Rule{SpaceID: spaceID, Definition: d})
	if err != nil {
		return Checked{}, err
	}
	names, err := s.namesFor(ctx, c, d.references())
	if err != nil {
		return Checked{}, err
	}
	return Checked{Problems: append(problems, gone...), Names: names}, nil
}

// namesFor names what a definition refers to, each through the module that owns it and as
// the caller may see it, so a card never shows the title of a page, space or template its
// viewer could not open (spec 091, E4). People and groups are named as the directory names
// them to everyone signed in.
func (s *Service) namesFor(ctx context.Context, c identity.Caller, refs references) (map[string]string, error) {
	names := map[string]string{}
	for _, lookup := range s.nameLookups(ctx, c, refs) {
		for _, id := range lookup.ids {
			name, err := lookup.name(id)
			if e, ok := apperr.As(err); ok && (e.Kind == apperr.KindNotFound || e.Kind == apperr.KindForbidden) {
				// Not found, not allowed or gone: the card says it cannot name it.
				continue
			}
			if err != nil {
				return nil, err
			}
			names[id.String()] = name
		}
	}
	return names, nil
}

// nameLookup names ids of one kind through the module that owns them.
type nameLookup struct {
	ids  []uuid.UUID
	name func(uuid.UUID) (string, error)
}

func (s *Service) nameLookups(ctx context.Context, c identity.Caller, refs references) []nameLookup {
	return []nameLookup{
		{refs.pages, func(id uuid.UUID) (string, error) {
			p, err := s.Pages.ChosenPage(ctx, c, id)
			return p.Title, err
		}},
		{refs.spaces, func(id uuid.UUID) (string, error) { return s.Spaces.NameFor(ctx, c, id) }},
		{refs.templates, func(id uuid.UUID) (string, error) {
			t, err := s.Templates.Get(ctx, c, id)
			return t.Name, err
		}},
		{refs.people, func(id uuid.UUID) (string, error) {
			u, err := s.Identity.GetUser(ctx, s.Pool, id)
			return u.DisplayName, err
		}},
		{refs.groups, func(id uuid.UUID) (string, error) {
			g, err := s.Identity.GetGroup(ctx, s.Pool, id)
			return g.Name, err
		}},
	}
}
