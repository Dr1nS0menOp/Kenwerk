// SPDX-License-Identifier: Apache-2.0

package settings

import "github.com/kenwerk/kenwerk/internal/apperr"

// SectionAssistants holds what assistants may do on the instance (spec 096).
const SectionAssistants = "assistants"

// What assistants may do: everything their credential allows, only read, or nothing.
const (
	AssistantsOn       = "on"
	AssistantsReadOnly = "read_only"
	AssistantsOff      = "off"
)

// Assistants is the instance's switch for assistants (spec 096, D10). It applies to every
// credential made for an assistant, whatever its scopes; it never adds a right. Assistants for
// content are on by default.
type Assistants struct {
	Mode string `json:"mode"`
}

// DefaultAssistants is the switch of an instance where nobody set it.
var DefaultAssistants = Assistants{Mode: AssistantsOn}

// InForce is the mode that holds: a section stored without a mode is on, as the default.
func (a Assistants) InForce() string {
	if a.Mode == "" {
		return AssistantsOn
	}
	return a.Mode
}

func (a *Assistants) validate() error {
	switch a.Mode {
	case AssistantsOn, AssistantsReadOnly, AssistantsOff:
		return nil
	}
	return apperr.Invalid("Assistants are on, read only or off.")
}
