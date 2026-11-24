// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"net/http"
	"os"
	"strings"
	"testing"
)

// pdfMagic is how every PDF file starts.
const pdfMagic = "%PDF-"

// The real helper image, not a stand-in: an export becomes a PDF, and a Word and an RTF
// file open as one. It runs only where KENWERK_TEST_PDF_URL points to the image
// of deploy/pdf, as CI's container job starts it; KENWERK_TEST_PDF_PASSWORD is its password.
func TestTheRealPDFHelperMakesAnExportAndOpensOfficeFiles(t *testing.T) {
	address := os.Getenv("KENWERK_TEST_PDF_URL")
	if address == "" {
		t.Skip("KENWERK_TEST_PDF_URL is not set: no real PDF helper to try")
	}
	e, owner, space, parent, _ := exportSetup(t)
	e.app.Exchange().SetPDFHelper(address)
	defer e.app.Exchange().SetPDFHelper("")
	e.app.Exchange().SetPDFPassword(os.Getenv("KENWERK_TEST_PDF_PASSWORD"))
	defer e.app.Exchange().SetPDFPassword("")

	// Every field Kenwerk sends: contents, paper in inches, orientation, header and footer.
	owner.want(http.StatusNoContent, "PUT", "/api/v1/spaces/"+space+"/pdf-design", map[string]any{
		"cover_title": "Cover", "header": "{title}", "footer": "Page {page} of {pages}"})
	for _, paper := range []string{"A4", "Letter"} {
		run := owner.export(map[string]any{"space_id": space, "format": "pdf", "root_id": parent,
			"options": map[string]any{"contents": true, "paper": paper, "orientation": "landscape"}})
		if run["state"] != "done" {
			t.Fatalf("PDF on %s: %+v", paper, run)
		}
		if got := owner.exportFile(run["id"].(string)); !strings.HasPrefix(string(got), pdfMagic) {
			t.Fatalf("PDF on %s is not a PDF: %q", paper, got[:min(len(got), 40)])
		}
	}

	// Kenwerk's own Word export is a real office file to open, and RTF one written by hand.
	run := owner.export(map[string]any{"space_id": space, "format": "docx", "root_id": parent})
	if run["state"] != "done" {
		t.Fatalf("docx export: %+v", run)
	}
	files := map[string]string{
		"report.docx": string(owner.exportFile(run["id"].(string))),
		"notes.rtf":   `{\rtf1\ansi Notes in rich text\par}`,
	}
	for name, content := range files {
		file := owner.file(parent, name, content)
		resp, body := e.do(owner.c, http.MethodGet, "/api/v1/attachments/"+file+"/preview.pdf", "")
		if resp.StatusCode != http.StatusOK || !strings.HasPrefix(body, pdfMagic) {
			t.Fatalf("%s preview: %d %q", name, resp.StatusCode, body[:min(len(body), 200)])
		}
	}
}
