// SPDX-License-Identifier: Apache-2.0

package settings

import (
	"context"
	"strings"

	"github.com/kenwerk/kenwerk/internal/apperr"
)

// The name of the instance is one name (spec 101, D7): the name of the environment or the
// configuration file when one is set there, which then locks the field of Look; else the name
// of Look; else the configured default. Mail, authenticator apps and the screens use it.

// defaultInstanceName is the name when nothing names the instance.
const defaultInstanceName = "Kenwerk"

// Where the name in force comes from.
const (
	NameFromEnvironment = "environment"
	NameFromLook        = "look"
	NameFromDefault     = "default"
)

// instanceName is the name of the configuration, and the lock when the configuration sets it
// on purpose rather than by its default.
type instanceName struct {
	configured string
	lock       *Lock
}

// NameView is the name in force, where it comes from, and what locks it.
type NameView struct {
	Name   string `json:"name"`
	Source string `json:"source"`
	Locked *Lock  `json:"locked"`
}

// UseInstanceName gives the service the name of the configuration, and the lock when the
// environment or the configuration file sets it. It is called once, before any request.
func (s *Service) UseInstanceName(configured string, lock *Lock) {
	s.name = instanceName{configured: configured, lock: lock}
}

// InstanceNameView is the name in force, where it comes from and what locks it.
func (s *Service) InstanceNameView(ctx context.Context) (NameView, error) {
	if s.name.lock != nil {
		return NameView{Name: s.name.configured, Source: NameFromEnvironment, Locked: s.name.lock}, nil
	}
	a, err := s.Appearance(ctx)
	if err != nil {
		return NameView{}, err
	}
	if name := strings.TrimSpace(a.Look.InstanceName); name != "" {
		return NameView{Name: name, Source: NameFromLook}, nil
	}
	if s.name.configured != "" {
		return NameView{Name: s.name.configured, Source: NameFromDefault}, nil
	}
	return NameView{Name: defaultInstanceName, Source: NameFromDefault}, nil
}

// InstanceName is the name in force. It may be up to appearanceFreshFor old on another node.
func (s *Service) InstanceName(ctx context.Context) (string, error) {
	v, err := s.InstanceNameView(ctx)
	return v.Name, err
}

// lockName shows the locked name in look, so every reader of Look sees the name in force.
func (s *Service) lockName(look *Look) {
	if s.name.lock != nil {
		look.InstanceName = s.name.configured
	}
}

// refuseLockedName refuses a Look whose name differs from the locked one; the rest of Look
// saves as before.
func (s *Service) refuseLockedName(section string, v any) error {
	look, ok := v.(*Look)
	if !ok || section != SectionLook || s.name.lock == nil || strings.TrimSpace(look.InstanceName) == s.name.configured {
		return nil
	}
	return apperr.Conflict("instance_name_locked", "The name is set by "+s.name.lock.Setting+
		". Change it there, or remove it there to set the name here.")
}
