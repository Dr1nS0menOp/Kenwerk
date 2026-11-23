// SPDX-License-Identifier: Apache-2.0

package settings

import (
	"strings"
	"unicode/utf8"

	"github.com/kenwerk/kenwerk/internal/apperr"
)

// What the parts of the administration that the environment may also set share (spec 098,
// spec 101): the lock of the environment, and how a form changes a secret it never reads back.

// Lock names the setting of the environment or the configuration file that holds a part, and
// where it is written. A locked part shows what holds, read-only (spec 098, D1).
type Lock struct {
	Setting string `json:"setting"`
	Source  string `json:"source"`
}

// Sealer seals and opens a secret with the envelope keys; the keyring of the installation is one.
type Sealer interface {
	Seal(plaintext []byte, context string) ([]byte, error)
	Open(sealed []byte, context string) ([]byte, error)
}

// SecretAction says what a change does with a stored secret.
type SecretAction string

// The ways a change treats a secret.
const (
	SecretKeep   SecretAction = "keep"
	SecretSet    SecretAction = "set"
	SecretRemove SecretAction = "remove"
)

// SecretChange is the secret part of a change: Value only with SecretSet. A secret is never
// read back, so a form says only whether to keep, replace or remove it (spec 098, D2).
type SecretChange struct {
	Action SecretAction `json:"action"`
	Value  string       `json:"value"`
}

// maxSecretRunes bounds a secret a form sets: long enough for any password or token.
const maxSecretRunes = 1024

// CheckSecret refuses a change of a secret that names no action, or sets one that is empty or
// longer than one line of 1024 characters. what names the secret in the refusal.
func CheckSecret(p SecretChange, what string) error {
	switch p.Action {
	case SecretKeep, SecretRemove:
		return nil
	case SecretSet:
		if p.Value == "" || utf8.RuneCountInString(p.Value) > maxSecretRunes || strings.ContainsAny(p.Value, "\r\n\x00") {
			return apperr.Invalid("A new " + what + " is one line of at most 1024 characters.")
		}
		return nil
	}
	return apperr.Invalid("Say whether to keep, set or remove the " + what + ".")
}

// NewSealed is the sealed secret after a change: the one stored, a new one sealed for
// purpose, or none.
func NewSealed(s Sealer, stored []byte, p SecretChange, purpose string) ([]byte, error) {
	switch p.Action {
	case SecretKeep:
		return stored, nil
	case SecretRemove:
		return nil, nil
	}
	return s.Seal([]byte(p.Value), purpose)
}
