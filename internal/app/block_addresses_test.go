// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/kenwerk/kenwerk/internal/identity"
)

// addressRefused is the reason the gate gives for an address it does not allow.
const addressRefused = "links must use http, https or mailto, or be a relative path"

// codeAddresses lead a browser to run code or to open a document of its own, in the
// spellings that slip past a simple check: case, space and control characters around or
// inside the scheme, and entities and escapes in place of the colon or a letter.
var codeAddresses = []string{
	"javascript:alert(1)",
	"JaVaScRiPt:alert(1)",
	" javascript:alert(1)",
	"\t\njavascript:alert(1)",
	" javascript:alert(1)",
	"\x01javascript:alert(1)",
	"java\tscript:alert(1)",
	"java\x00script:alert(1)",
	"data:text/html,<script>alert(1)</script>",
	"DATA:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
	"vbscript:msgbox(1)",
	"javascript&#58;alert(1)",
	"javascript&colon;alert(1)",
	"&#106;avascript:alert(1)",
	"&#x6A;avascript:alert(1)",
	"%6Aavascript:alert(1)",
}

// linkedBlocks gives a document whose only block carries the address where a reader sees a
// link: on an image or on the button of a spotlight.
func linkedBlocks(attachment, href string) map[string]map[string]any {
	doc := func(block map[string]any) map[string]any {
		return map[string]any{"type": "doc", "content": []any{block}}
	}
	return map[string]map[string]any{
		"image": doc(map[string]any{"type": "image", "attrs": map[string]any{"attachment_id": attachment, "href": href}}),
		"spotlight": doc(map[string]any{"type": "spotlight", "attrs": map[string]any{"button_text": "Go", "button_href": href},
			"content": []any{map[string]any{"type": "paragraph", "content": []any{map[string]any{"type": "text", "text": "Read"}}}}}),
	}
}

// wantAddressRefused fails unless the answer is the gate's refusal of the address.
func wantAddressRefused(t *testing.T, writer, href string, status int, out string) {
	t.Helper()
	if status != http.StatusBadRequest || !strings.Contains(out, "invalid_input") || !strings.Contains(out, addressRefused) {
		t.Errorf("%s took %q: %d %s", writer, href, status, out)
	}
}

// storedWithCode counts the stored texts of pages and drafts that hold the code of
// codeAddresses, whatever the spelling.
func storedWithCode(t *testing.T, e *env) int {
	t.Helper()
	var n int
	err := e.app.Pool().QueryRow(context.Background(), `SELECT
		(SELECT count(*) FROM page_versions WHERE document::text ~* '(alert|msgbox)\(1\)|PHNjcmlwdD5')
		+ (SELECT count(*) FROM drafts WHERE document::text ~* '(alert|msgbox)\(1\)|PHNjcmlwdD5')`).Scan(&n)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

// uploadedPicture adds a picture to a page and gives its id.
func uploadedPicture(t *testing.T, owner *user, page string) string {
	t.Helper()
	_, uploaded := owner.upload(page, "a.png", pngHeader)
	var file struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(uploaded), &file); err != nil || file.ID == "" {
		t.Fatalf("upload: %s %v", uploaded, err)
	}
	return file.ID
}

// documentWriter writes a document through one route of the API; i keeps a key unique.
type documentWriter func(i int, doc map[string]any) (int, string)

// documentWriters are the routes of the API that store a document a person sends.
func documentWriters(owner *user, space, page string) map[string]documentWriter {
	return map[string]documentWriter{
		"publish": func(_ int, doc map[string]any) (int, string) {
			return owner.do("POST", "/api/v1/pages/"+page+"/publish", map[string]any{"title": "Target", "document": doc, "base_version": 1})
		},
		"draft": func(_ int, doc map[string]any) (int, string) {
			return owner.do("PUT", "/api/v1/pages/"+page+"/draft", map[string]any{"title": "Target", "document": doc, "base_version": 1})
		},
		"new space": func(i int, doc map[string]any) (int, string) {
			return owner.do("POST", "/api/v1/spaces", map[string]any{"key": fmt.Sprintf("BAD%d", i), "name": "Bad", "document": doc})
		},
		"template": func(_ int, doc map[string]any) (int, string) {
			return owner.do("POST", "/api/v1/spaces/"+space+"/templates", map[string]any{"name": "Bad", "document": doc})
		},
		"template file": func(_ int, doc map[string]any) (int, string) {
			return owner.do("POST", "/api/v1/spaces/"+space+"/templates/import", map[string]any{"name": "Bad", "document": doc})
		},
		"saved block": func(_ int, doc map[string]any) (int, string) {
			return owner.do("POST", "/api/v1/saved-blocks", map[string]any{"name": "Bad", "document": doc})
		},
	}
}

func TestEveryWriterRefusesAnImageLinkOrButtonThatRunsCode(t *testing.T) {
	e := newEnv(t)
	owner := e.user("owner@example.com", identity.PermUseProduct, identity.PermCreateSpace)
	space, _ := owner.space("ADDR")
	page := owner.page(space, nil, "Target", "first")
	picture := uploadedPicture(t, owner, page)
	i := 0
	for writer, write := range documentWriters(owner, space, page) {
		for _, href := range codeAddresses {
			for block, doc := range linkedBlocks(picture, href) {
				i++
				status, out := write(i, doc)
				wantAddressRefused(t, writer+" of an "+block, href, status, out)
			}
		}
	}
	if n := storedWithCode(t, e); n != 0 {
		t.Fatalf("%d stored texts hold an address that runs code", n)
	}
	// The same blocks with an ordinary address are kept: the refusal is about the address.
	for _, doc := range linkedBlocks(picture, "https://example.org/a") {
		owner.ok("PUT", "/api/v1/pages/"+page+"/draft", map[string]any{"title": "Target", "document": doc, "base_version": 1})
	}
}

func TestAnImportedWebPageKeepsNoLinkThatRunsCode(t *testing.T) {
	e, owner, space := importSetup(t)
	page := `<title>Linked</title><p><a href="JaVaScRiPt:alert(1)"><img src="pic.png" alt="picture"></a></p>
		<p><a href=" java&#x09;script:alert(1)">tab</a> <a href="data:text/html,x">data</a> <a href="vbscript:msgbox(1)">vb</a></p>`
	job := owner.importFile(space, "site.zip", zipOf(t, map[string]string{"page.html": page, "pic.png": pngHeader}))
	if job["status"] != "done" {
		t.Fatalf("%+v", job)
	}
	got := strings.ToLower(documentOf(t, e, "Linked"))
	for _, bad := range []string{"script:", "data:", "alert", "msgbox"} {
		if strings.Contains(got, bad) {
			t.Errorf("%s survived the import: %s", bad, got)
		}
	}
	if !strings.Contains(got, "tab") || !strings.Contains(got, "vb") {
		t.Errorf("the words of the links are gone: %s", got)
	}
}

// plantLinkedBlocks writes an image link and a button that run code into every version of a
// page past the gate, as a value restored from a backup or changed in the database would be.
func plantLinkedBlocks(t *testing.T, e *env, page string) {
	t.Helper()
	var attachment string
	if err := e.app.Pool().QueryRow(context.Background(), `SELECT id FROM attachments WHERE page_id = $1`, page).Scan(&attachment); err != nil {
		t.Fatal(err)
	}
	blocks := linkedBlocks(attachment, "javascript:alert(1)")
	planted := map[string]any{"type": "doc", "content": []any{
		blocks["image"]["content"].([]any)[0], blocks["spotlight"]["content"].([]any)[0]}}
	raw, err := json.Marshal(planted)
	if err != nil {
		t.Fatal(err)
	}
	e.sql("ALTER TABLE page_versions DISABLE TRIGGER page_versions_no_update")
	e.sql(`UPDATE page_versions SET document = $2 WHERE page_id = $1`, page, raw)
	e.sql("ALTER TABLE page_versions ENABLE TRIGGER page_versions_no_update")
}

func TestABundleWithAStoredImageLinkOrButtonThatRunsCodeIsRefused(t *testing.T) {
	e, admin, owner, space := bundleSetup(t)
	plantLinkedBlocks(t, e, pageID(t, e, "Bundled"))
	status, got := admin.post("/api/v1/admin/bundles?filename=b.zip", bundleOf(t, owner, space))
	if status != http.StatusAccepted {
		t.Fatalf("%d %v", status, got)
	}
	e.runJobs()
	id := got["id"].(string)
	// The gate may stop the bundle while it is read, or when it is carried out.
	run := admin.ok("GET", "/api/v1/imports/"+id, nil)
	if run["state"] == "ready" {
		admin.ok("PUT", "/api/v1/imports/"+id+"/mapping", map[string]any{"space_key": "COPY"})
		run = admin.carryOut(id)
	}
	if run["state"] != "failed" || !strings.Contains(mustJSON(t, run), addressRefused) {
		t.Fatalf("a bundle with an address that runs code was not refused for it: %+v", run)
	}
	var copied int
	if err := e.app.Pool().QueryRow(context.Background(), `SELECT count(*) FROM page_versions v JOIN pages p ON p.id = v.page_id
		JOIN spaces s ON s.id = p.space_id WHERE s.key = 'COPY' AND v.document::text LIKE '%alert(1)%'`).Scan(&copied); err != nil {
		t.Fatal(err)
	}
	if copied != 0 {
		t.Fatalf("%d imported versions hold the address", copied)
	}
}
