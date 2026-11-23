// SPDX-License-Identifier: Apache-2.0

package connections

import (
	"context"
	"fmt"

	"github.com/kenwerk/kenwerk/internal/config"
)

// opened are the secrets of the row, open, for the parts the environment does not hold.
type opened struct {
	clientSecret string
	pdfPassword  string
	metricsToken string
}

// Reload reads the row again and puts it in force from now on. It opens the secrets only when
// the row changed. Every node calls it every few seconds (spec 101, behaviour 6).
func (s *Service) Reload(ctx context.Context) error {
	s.reloading.Lock()
	defer s.reloading.Unlock()
	r, err := readRow(ctx, s.pool, selectRow)
	if err != nil {
		return err
	}
	if current := s.state.Load(); current.read && current.updatedAt.Equal(r.updatedAt) {
		return nil
	}
	secrets, err := s.open(r)
	if err != nil {
		return err
	}
	s.publish(&state{values: s.merge(r, secrets), updatedAt: r.updatedAt, read: true})
	return nil
}

// publish puts values in force on this node and hands them to the modules that connect.
func (s *Service) publish(st *state) {
	s.state.Store(st)
	if s.o.Apply != nil {
		s.o.Apply(st.values)
	}
}

func (s *Service) open(r row) (opened, error) {
	var o opened
	var err error
	if o.clientSecret, err = s.openFor(PartIdentityProvider, r.clientSecret, ClientSecretContext); err != nil {
		return o, err
	}
	if o.pdfPassword, err = s.openFor(PartPDF, r.pdfPassword, PDFPasswordContext); err != nil {
		return o, err
	}
	o.metricsToken, err = s.openFor(PartMetrics, r.metricsToken, MetricsTokenContext)
	return o, err
}

// openFor opens one secret of a part the administration holds. The error names the secret,
// never its value.
func (s *Service) openFor(part string, sealed []byte, purpose string) (string, error) {
	if sealed == nil || s.locked(part) != nil {
		return "", nil
	}
	plain, err := s.o.Sealer.Open(sealed, purpose)
	if err != nil {
		return "", fmt.Errorf("connections: open the %s: %w", purpose, err)
	}
	return string(plain), nil
}

// merge is what is in force: per part what the environment holds, else what the row holds.
func (s *Service) merge(r row, secrets opened) Values {
	var v Values
	s.mergeProvider(&v, r, secrets.clientSecret)
	s.mergeHelpers(&v, r, secrets.pdfPassword)
	env := s.o.Environment
	v.DrawingOrigin, v.MetricsToken = r.drawing.URL, secrets.metricsToken
	if s.locked(PartDrawing) != nil {
		v.DrawingOrigin = env.DrawingOrigin()
	}
	if s.locked(PartMetrics) != nil {
		v.MetricsToken = env.MetricsToken
	}
	return v
}

func (s *Service) mergeProvider(v *Values, r row, secret string) {
	if s.locked(PartIdentityProvider) != nil {
		v.OIDC = s.o.Environment.OIDC
		return
	}
	p := r.provider
	if p.Issuer == "" {
		return
	}
	button := p.DisplayName
	if button == "" {
		button = defaultButton
	}
	v.OIDC = config.OIDC{Issuer: p.Issuer, ClientID: p.ClientID, ClientSecret: secret, DisplayName: button,
		AutoCreate: p.AutoCreate, AllowUnverifiedEmail: p.AllowUnverifiedEmail, GroupsClaim: p.GroupsClaim}
	v.OIDCStored = true
}

func (s *Service) mergeHelpers(v *Values, r row, password string) {
	env := s.o.Environment
	if s.locked(PartPDF) != nil {
		v.PDFURL, v.PDFPassword = env.PDFURL, env.PDFPassword
	} else if r.pdf.URL != "" {
		v.PDFURL, v.PDFPassword, v.PDFStored = r.pdf.URL, password, true
	}
	if s.locked(PartOffice) != nil {
		v.CollaboraURL = env.CollaboraURL
	} else if r.office.URL != "" {
		v.CollaboraURL, v.OfficeStored = r.office.URL, true
	}
}
