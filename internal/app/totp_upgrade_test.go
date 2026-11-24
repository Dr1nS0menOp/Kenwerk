// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/kenwerk/kenwerk/internal/app"
	"github.com/kenwerk/kenwerk/internal/config"
	"github.com/kenwerk/kenwerk/internal/identity"
)

// An authenticator app set up before the move from pquerna/otp to creachadair/otp keeps
// working: its seed stays sealed as the old library wrote it, and nobody enrols again (wave DA3).
func TestAnAuthenticatorSetUpBeforeTheChangeOfLibraryStillLogsIn(t *testing.T) {
	var cfg config.Config
	e := newEnvWith(t, func(c *config.Config) { cfg = *c })
	u := e.user("before@example.com", identity.PermUseProduct)
	tools, err := app.OpenKeyTools(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	// The old library made 20 random bytes into upper-case base32 without padding.
	const oldSeed = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	sealed, err := tools.Keyring.Seal([]byte(oldSeed), identity.TOTPContext(uuid.MustParse(u.id)))
	tools.Close()
	if err != nil {
		t.Fatal(err)
	}
	e.sql(`INSERT INTO totp_credentials (user_id, secret_sealed, confirmed_at, last_step)
		VALUES ($1, $2, now() - interval '1 year', 0)`, u.id, sealed)

	c := e.client()
	first := e.loginBody(c, "before@example.com")
	if first["mfa_required"] != true {
		t.Fatalf("the password alone was enough: %+v", first)
	}
	token := first["mfa_token"].(string)
	code := totpCode(t, oldSeed, 0)
	if got := e.secondStep(c, token, code); got != 200 {
		t.Fatalf("the code of the old seed: %d", got)
	}

	// The step it used still bars the same code from a second login.
	c2 := e.client()
	again := e.loginBody(c2, "before@example.com")["mfa_token"].(string)
	if got := e.secondStep(c2, again, code); got != 401 {
		t.Fatalf("the code was taken twice: %d", got)
	}
}
