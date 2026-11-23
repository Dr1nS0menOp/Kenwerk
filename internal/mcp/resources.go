// SPDX-License-Identifier: Apache-2.0

package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// The addresses of the resources (spec 096): a page as Markdown, and the tree of a space.
const (
	pageResourcePrefix  = "kenwerk://pages/"
	spaceResourcePrefix = "kenwerk://spaces/"
	treeResourceSuffix  = "/tree"
)

func addResources(srv *sdk.Server, s *session) {
	srv.AddResourceTemplate(&sdk.ResourceTemplate{Name: "page", Title: "A page as Markdown", MIMEType: "text/markdown",
		URITemplate: pageResourcePrefix + "{id}", Description: "A page of Kenwerk as Markdown, under the rules of the API."},
		func(ctx context.Context, req *sdk.ReadResourceRequest) (*sdk.ReadResourceResult, error) {
			return readPageResource(ctx, s, req.Params.URI)
		})
	srv.AddResourceTemplate(&sdk.ResourceTemplate{Name: "space-tree", Title: "The pages of a space", MIMEType: "application/json",
		URITemplate: spaceResourcePrefix + "{id}" + treeResourceSuffix, Description: "The tree of pages of a space of Kenwerk."},
		func(ctx context.Context, req *sdk.ReadResourceRequest) (*sdk.ReadResourceResult, error) {
			return readTreeResource(ctx, s, req.Params.URI)
		})
}

// resource is the result of reading a resource: the notice, then the content.
func resource(uri, mimeType, text string) *sdk.ReadResourceResult {
	return &sdk.ReadResourceResult{Contents: []*sdk.ResourceContents{{URI: uri, MIMEType: mimeType, Text: ContentNotice + "\n\n" + text}}}
}

func readPageResource(ctx context.Context, s *session, uri string) (*sdk.ReadResourceResult, error) {
	id := strings.TrimPrefix(uri, pageResourcePrefix)
	page, err := readPage(ctx, s, args{"page_id": id})
	if err != nil {
		return nil, notFoundOr(uri, err)
	}
	text, err := markdownOf(page.Document)
	if err != nil {
		return nil, err
	}
	return resource(uri, "text/markdown", "# "+page.Title+"\n\n"+text), nil
}

func readTreeResource(ctx context.Context, s *session, uri string) (*sdk.ReadResourceResult, error) {
	id, found := strings.CutSuffix(strings.TrimPrefix(uri, spaceResourcePrefix), treeResourceSuffix)
	space, err := pathValue(argID, id)
	if !found || err != nil {
		return nil, sdk.ResourceNotFoundError(uri)
	}
	tree, err := s.get(ctx, "/api/v1/spaces/"+space+"/tree", nil)
	if err != nil {
		return nil, notFoundOr(uri, err)
	}
	raw, err := json.MarshalIndent(withoutSecrets(tree), "", " ")
	if err != nil {
		return nil, err
	}
	return resource(uri, "application/json", string(raw)), nil
}

// notFoundOr answers a page or space the API does not give as not found, as the API does, and
// passes any other error on.
func notFoundOr(uri string, err error) error {
	var refused *apiError
	if errors.Is(err, errNotAnID) || errors.As(err, &refused) && (refused.status == http.StatusNotFound || refused.status == http.StatusForbidden) {
		return sdk.ResourceNotFoundError(uri)
	}
	return err
}
