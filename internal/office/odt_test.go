// SPDX-License-Identifier: Apache-2.0

package office

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// everyBlock holds every block and mark the exporters know, the awkward places too: a table
// and a panel inside a list item, a list inside a table cell, empty rows and columns.
const everyBlock = `{"type":"doc","content":[
	{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"One"}]},
	{"type":"heading","attrs":{"level":6},"content":[{"type":"text","text":"Six"}]},
	{"type":"heading","content":[]},
	{"type":"paragraph","content":[
		{"type":"text","text":"bold","marks":[{"type":"bold"}]},
		{"type":"text","text":"all","marks":[{"type":"bold"},{"type":"italic"},{"type":"underline"},{"type":"strike"},{"type":"code"}]},
		{"type":"text","text":"low","marks":[{"type":"subscript"}]},
		{"type":"text","text":"high","marks":[{"type":"superscript"}]},
		{"type":"text","text":"red","marks":[{"type":"textColor","attrs":{"color":"red"}},{"type":"highlight","attrs":{"color":"yellow"}}]},
		{"type":"text","text":"odd","marks":[{"type":"textColor","attrs":{"color":"nope"}}]},
		{"type":"text","text":" site","marks":[{"type":"link","attrs":{"href":"https://example.com/a?b=1&c=2"}},{"type":"bold"}]},
		{"type":"text","text":" mail","marks":[{"type":"link","attrs":{"href":"mailto:a@example.com"}}]},
		{"type":"text","text":" inside","marks":[{"type":"link","attrs":{"href":"/pages/secret"}}]},
		{"type":"hardBreak"},
		{"type":"status","attrs":{"text":"Done","color":"green"}},
		{"type":"date","attrs":{"value":"2026-11-24"}},
		{"type":"mention","attrs":{"label":"Someone"}},
		{"type":"mention","attrs":{}},
		{"type":"pageLink","attrs":{"title":"Other page"}},
		{"type":"templateField","attrs":{"name":"field"}},
		{"type":"text","text":"  spaced\ttabbed  "}]},
	{"type":"paragraph","attrs":{"align":"center"},"content":[{"type":"text","text":"middle"}]},
	{"type":"paragraph","attrs":{"align":"end"},"content":[{"type":"text","text":"end"}]},
	{"type":"paragraph"},
	{"type":"bulletList","content":[
		{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"item"}]},
			{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"nested"}]}]}]},
			{"type":"codeBlock","content":[{"type":"text","text":"in a list"}]},
			{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"table in a list"}]}]}]}]},
			{"type":"panel","attrs":{"kind":"note"},"content":[{"type":"paragraph","content":[{"type":"text","text":"panel in a list"}]}]},
			{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"quote in a list"}]}]}]},
		{"type":"listItem","content":[]}]},
	{"type":"taskList","content":[
		{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"done"}]}]},
		{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"open"}]}]}]},
	{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"quoted"}]},
		{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"listed quote"}]}]}]}]},
	{"type":"codeBlock","attrs":{"language":"go"},"content":[{"type":"text","text":"func main() {\n\tif a < b && c > d {\n\t}\n}"}]},
	{"type":"horizontalRule"},
	{"type":"image","attrs":{"attachment_id":"IMG","alt":"A map","caption":"The map"}},
	{"type":"image","attrs":{"attachment_id":"` + "00000000-0000-0000-0000-000000000001" + `","alt":"Gone"}},
	{"type":"file","attrs":{"filename":"report.pdf"}},
	{"type":"panel","attrs":{"kind":"warning"},"content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Mind"}]},
		{"type":"paragraph","content":[{"type":"text","text":"Mind this"}]}]},
	{"type":"panel","attrs":{},"content":[]},
	{"type":"expand","attrs":{"title":"More"},"content":[{"type":"paragraph","content":[{"type":"text","text":"hidden"}]}]},
	{"type":"columns","content":[
		{"type":"column","content":[{"type":"paragraph","content":[{"type":"text","text":"left"}]}]},
		{"type":"column","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"right"}]}]}]}]}]},
	{"type":"columns","content":[]},
	{"type":"decision","attrs":{"state":"decided"},"content":[{"type":"text","text":"We go"}]},
	{"type":"table","attrs":{"caption":"Above"},"content":[
		{"type":"tableRow","content":[
			{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Name"}]}]},
			{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Role"}]}]}]},
		{"type":"tableRow","content":[
			{"type":"tableCell","attrs":{"colspan":2,"background":"blue"},"content":[{"type":"paragraph","content":[{"type":"text","text":"wide"}]}]}]},
		{"type":"tableRow","content":[
			{"type":"tableCell","attrs":{"background":"nope"},"content":[]},
			{"type":"tableCell","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"cell list"}]}]}]}]}]},
		{"type":"tableRow","content":[]}]},
	{"type":"table","attrs":{"caption":"Below","caption_below":true},"content":[]},
	{"type":"chart","attrs":{"title":"A chart"}},
	{"type":"excerpt","attrs":{}},
	{"type":"unknownBlock","attrs":{"text":"kept words"}}
]}`

// zipDataDescriptor is bit 3 of a zip entry's flags: its sizes and checksum follow its data.
const zipDataDescriptor = 0x8

// onePixelPNG is a real image, so LibreOffice and the schema see what a real export holds.
const onePixelPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

// everyBlockODT writes everyBlock, below a branch of three pages, as an OpenDocument file.
func everyBlockODT(t *testing.T) []byte {
	t.Helper()
	id := uuid.New()
	doc := parse(t, strings.ReplaceAll(everyBlock, "IMG", id.String()))
	png, err := base64.StdEncoding.DecodeString(onePixelPNG)
	if err != nil {
		t.Fatal(err)
	}
	o := Options{Image: func(got uuid.UUID) (Image, bool) { return Image{Data: png, Ext: "png"}, got == id }}
	sections := []Section{{Title: "Top <&>", Document: doc}, {Title: "Child", Depth: 1, Document: doc}, {Title: "", Depth: 7, Document: doc}}
	var b bytes.Buffer
	if err := WriteODT(&b, sections, o); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// The rules of an OpenDocument package (ODF 1.3 part 2, section 3.3): a reader finds the
// kind of file in its first bytes, so the mimetype entry comes first, is not compressed and
// carries no extra field and no data descriptor after its bytes.
func TestODTStartsWithAPlainMimetypeEntry(t *testing.T) {
	data := everyBlockODT(t)
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	first := zr.File[0]
	if first.Name != "mimetype" || first.Method != zip.Store {
		t.Fatalf("first entry is %q with method %d", first.Name, first.Method)
	}
	if len(first.Extra) != 0 {
		t.Errorf("the mimetype entry has an extra field of %d bytes", len(first.Extra))
	}
	if first.Flags&zipDataDescriptor != 0 {
		t.Error("the sizes of the mimetype entry follow its data instead of standing in its header")
	}
	// The local header is what a reader that sniffs the file sees, at fixed offsets.
	const localHeader, nameAt = 30, 30
	if !bytes.HasPrefix(data, []byte("PK\x03\x04")) || string(data[nameAt:nameAt+len("mimetype")]) != "mimetype" {
		t.Fatalf("the file does not start with the mimetype entry: %q", data[:localHeader+len("mimetype")])
	}
	if got := string(data[localHeader+len("mimetype"):][:len(odtMime)]); got != odtMime {
		t.Errorf("the bytes at offset 38 are %q, want %q", got, odtMime)
	}
	if got := string(unzip(t, data)["mimetype"]); got != odtMime {
		t.Errorf("mimetype holds %q", got)
	}
}

type manifestEntry struct {
	Path    string `xml:"full-path,attr"`
	Type    string `xml:"media-type,attr"`
	Version string `xml:"version,attr"`
}

type manifestFile struct {
	XMLName xml.Name        `xml:"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0 manifest"`
	Version string          `xml:"version,attr"`
	Entries []manifestEntry `xml:"file-entry"`
}

// readManifest returns the files of an ODT and the entries of its manifest, by path.
func readManifest(t *testing.T, data []byte) (files map[string]string, m manifestFile, listed map[string]string) {
	t.Helper()
	files = unzip(t, data)
	if err := xml.Unmarshal([]byte(files["META-INF/manifest.xml"]), &m); err != nil {
		t.Fatalf("manifest: %v", err)
	}
	listed = map[string]string{}
	for _, e := range m.Entries {
		listed[e.Path] = e.Type
	}
	return files, m, listed
}

func TestODTManifestGivesThePackageItsTypeAndVersion(t *testing.T) {
	_, m, _ := readManifest(t, everyBlockODT(t))
	if m.Version != odfVersion {
		t.Errorf("manifest version %q, want %q", m.Version, odfVersion)
	}
	root := slices.IndexFunc(m.Entries, func(e manifestEntry) bool { return e.Path == "/" })
	if root < 0 {
		t.Fatal("the manifest has no entry for the package itself")
	}
	if e := m.Entries[root]; e.Type != odtMime || e.Version != odfVersion {
		t.Errorf("the root entry is %+v", e)
	}
}

func TestODTManifestListsEveryFileInThePackage(t *testing.T) {
	files, _, listed := readManifest(t, everyBlockODT(t))
	// The mimetype and the manifest are not listed, and the package itself is no file in it.
	delete(files, "mimetype")
	delete(files, "META-INF/manifest.xml")
	delete(listed, "/")
	for name := range files {
		if listed[name] == "" {
			t.Errorf("%s is in the package but not in the manifest", name)
		}
	}
	pictures := 0
	for path, kind := range listed {
		if _, ok := files[path]; !ok {
			t.Errorf("the manifest lists %s, which is not in the package", path)
		}
		if strings.HasPrefix(path, "Pictures/") {
			pictures++
			if kind != "image/png" {
				t.Errorf("%s is listed as %s", path, kind)
			}
		}
	}
	if pictures == 0 {
		t.Error("the image is not in the package")
	}
}

func TestODTContentDeclaresTheOpenDocumentNamespacesAndVersion(t *testing.T) {
	body := unzip(t, everyBlockODT(t))["content.xml"]
	wellFormed(t, "content.xml", body)
	root, err := rootElement(body)
	if err != nil {
		t.Fatal(err)
	}
	const officeNS = "urn:oasis:names:tc:opendocument:xmlns:office:1.0"
	if root.Name.Space != officeNS || root.Name.Local != "document-content" {
		t.Errorf("the root is {%s}%s", root.Name.Space, root.Name.Local)
	}
	version := ""
	for _, a := range root.Attr {
		if a.Name.Space == officeNS && a.Name.Local == "version" {
			version = a.Value
		}
	}
	if version != odfVersion {
		t.Errorf("office:version is %q, want %q", version, odfVersion)
	}
}

func rootElement(body string) (xml.StartElement, error) {
	dec := xml.NewDecoder(strings.NewReader(body))
	for {
		tok, err := dec.Token()
		if err != nil {
			return xml.StartElement{}, err
		}
		if start, ok := tok.(xml.StartElement); ok {
			return start, nil
		}
	}
}

// LibreOffice in the real PDF helper opens the file and makes a PDF of it. It runs only where
// KENWERK_TEST_PDF_URL points to the image of deploy/pdf, as CI's container job starts it;
// KENWERK_TEST_PDF_PASSWORD is its password.
func TestLibreOfficeOpensTheODTOfEveryBlock(t *testing.T) {
	address := os.Getenv("KENWERK_TEST_PDF_URL")
	if address == "" {
		t.Skip("KENWERK_TEST_PDF_URL is not set: no real PDF helper to try")
	}
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, err := form.CreateFormFile("files", "every.odt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(everyBlockODT(t)); err != nil {
		t.Fatal(err)
	}
	if err := form.Close(); err != nil {
		t.Fatal(err)
	}
	url := address + "/forms/libreoffice/convert"
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, url, &body) //nolint:gosec // G704: the helper the test run names
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.SetBasicAuth("kenwerk", os.Getenv("KENWERK_TEST_PDF_PASSWORD"))
	resp, err := http.DefaultClient.Do(req) //nolint:gosec // G704: the helper the test run names
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	got, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK || !bytes.HasPrefix(got, []byte("%PDF-")) {
		t.Fatalf("LibreOffice answered %d: %q", resp.StatusCode, got[:min(len(got), 300)])
	}
}

// The schema of OpenDocument 1.3, from OASIS, checked with xmllint. On a machine without
// xmllint the test skips, except in CI, where a skip would hide that it never ran.
func TestODTMatchesTheOpenDocumentSchema(t *testing.T) {
	xmllint, err := exec.LookPath("xmllint")
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatal("xmllint is not installed, so the OpenDocument schema cannot be checked")
		}
		t.Skip("xmllint is not installed")
	}
	dir := t.TempDir()
	files := unzip(t, everyBlockODT(t))
	for name, schema := range map[string]string{
		"content.xml":           "OpenDocument-v1.3-schema.rng",
		"META-INF/manifest.xml": "OpenDocument-v1.3-manifest-schema.rng",
	} {
		path := filepath.Join(dir, strings.ReplaceAll(name, "/", "-"))
		if err := os.WriteFile(path, []byte(files[name]), 0o600); err != nil {
			t.Fatal(err)
		}
		out, err := exec.Command(xmllint, //nolint:gosec // G204: xmllint from PATH, on files this test wrote
			"--noout", "--nonet", "--relaxng", filepath.Join("testdata", "odf", schema), path).CombinedOutput()
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			t.Errorf("%s does not match the OpenDocument 1.3 schema:\n%s", name, out)
		} else if err != nil {
			t.Fatalf("xmllint: %v", err)
		}
	}
}
