// SPDX-License-Identifier: Apache-2.0

package exchange

import "net/http"

// HelperTimeout is the longest a call to a helper may take: a PDF of a long space or a large
// office file takes minutes.
const HelperTimeout = pdfTimeout

// Helpers are the helper services in force (spec 101): from the environment, or as a system
// administrator set them. A client, when set, is the only way to reach its helper; a helper of
// the administration gets one of internal/outward. Nil is the client of the environment's
// helpers, http.DefaultClient.
type Helpers struct {
	PDFURL string
	// PDFPassword is sent to the PDF helper, never to Collabora. Empty = none.
	PDFPassword string
	// CollaboraURL is an office service. Empty = none.
	CollaboraURL string
	PDFClient    *http.Client
	OfficeClient *http.Client
}

// UseHelpers puts the helpers in force from the next call on; a call that runs finishes with
// the helpers it started with.
func (s *Service) UseHelpers(h Helpers) { s.helpers.Store(&h) }

// inForce is a copy of the helpers in force, so one call uses one set of them.
func (s *Service) inForce() Helpers { return *s.helpers.Load() }

// SetPDFHelper points to the helper process. Tests use it to fit a fake one.
func (s *Service) SetPDFHelper(url string) {
	h := s.inForce()
	h.PDFURL = url
	s.UseHelpers(h)
}

// SetPDFPassword sets what the helper asks for. Tests use it with a fake helper.
func (s *Service) SetPDFPassword(password string) {
	h := s.inForce()
	h.PDFPassword = password
	s.UseHelpers(h)
}

// clientOr is client, or the default one when there is none.
func clientOr(client *http.Client) *http.Client {
	if client == nil {
		return http.DefaultClient
	}
	return client
}

// askPDF sends a request to the PDF helper of h, with its password when one is set.
func (h Helpers) askPDF(req *http.Request) (*http.Response, error) {
	if h.PDFPassword != "" {
		req.SetBasicAuth(helperUser, h.PDFPassword)
	}
	// G704: the address is the helper in force, from the environment or a system administrator;
	// one of the administration goes through internal/outward (spec 101, D4).
	return clientOr(h.PDFClient).Do(req) //nolint:gosec // G704: see above
}

// askOffice sends a request to the office service of h. Collabora checks the host of the
// caller instead (post_allow), so it gets no password.
func (h Helpers) askOffice(req *http.Request) (*http.Response, error) {
	return clientOr(h.OfficeClient).Do(req) //nolint:gosec // G704: as askPDF
}
