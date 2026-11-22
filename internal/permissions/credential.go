// SPDX-License-Identifier: Apache-2.0

package permissions

import (
	"context"
	"slices"

	"github.com/google/uuid"
)

// RuleSpaceLimit is the check that keeps a credential inside the spaces it is limited to
// (spec 096). It decides visibility: a space outside the limit answers as if it did not exist.
const RuleSpaceLimit = "space_limit"

type credentialKey struct{}

// credentialLimit is the limit of the credential a request came with.
type credentialLimit struct {
	userID uuid.UUID
	spaces []uuid.UUID
}

// WithCredentialSpaces says that what ctx does on behalf of userID stays inside spaces. The
// HTTP layer sets it for a credential with a space limit; nil spaces sets nothing.
func WithCredentialSpaces(ctx context.Context, userID uuid.UUID, spaces []uuid.UUID) context.Context {
	if spaces == nil {
		return ctx
	}
	return context.WithValue(ctx, credentialKey{}, credentialLimit{userID: userID, spaces: slices.Clone(spaces)})
}

// CredentialSpaces is the space limit of the request's credential, for the allowed argument
// of the perm_* functions: nil is every space. Every list a request reads is narrowed by it,
// also a list about someone else, so a limited credential learns nothing of other spaces.
func CredentialSpaces(ctx context.Context) []uuid.UUID {
	limit, ok := ctx.Value(credentialKey{}).(credentialLimit)
	if !ok {
		return nil
	}
	return limit.spaces
}

// limitedTo applies the credential's limit to the facts of its own person. The facts of
// anyone else are their own: what they may do is not this credential's.
func limitedTo(ctx context.Context, u UserFacts) UserFacts {
	limit, ok := ctx.Value(credentialKey{}).(credentialLimit)
	if ok && limit.userID == u.ID {
		u.Spaces = limit.spaces
	}
	return u
}

// insideCredentialLimit says whether a space is one the person's credential may reach.
func insideCredentialLimit(u UserFacts, spaceID uuid.UUID) bool {
	return u.Spaces == nil || slices.Contains(u.Spaces, spaceID)
}
