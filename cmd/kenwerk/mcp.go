// SPDX-License-Identifier: Apache-2.0

package main

import (
	"context"
	"errors"
	"fmt"
	"io"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/kenwerk/kenwerk/internal/mcp"
	"github.com/kenwerk/kenwerk/internal/version"
)

const mcpUsage = `Usage: kenwerk mcp

Serves Kenwerk to an assistant over the Model Context Protocol, on standard input and
output: the assistant starts this command and talks to it. Every tool calls the API of the
server at KENWERK_URL with a token, under every rule of the API.

Make the token in Kenwerk under Your account, Tokens, with For an assistant ticked, and give
it only the scopes and spaces the assistant needs. Put it in KENWERK_TOKEN, or in a file
named by KENWERK_TOKEN_FILE. Messages go to standard error; standard output carries only
the protocol. See docs/operations/mcp.md.
`

// errNotForAnAssistant refuses a token that does not carry the limits of an assistant.
var errNotForAnAssistant = errors.New("this token is not for an assistant: make one in Your account, Tokens, with For an assistant ticked, so Kenwerk applies the limits for assistants")

// cmdMCP runs kenwerk mcp until the assistant closes standard input, and answers with its exit
// code.
func cmdMCP(ctx context.Context, args []string, env func(string) string, stdin io.ReadCloser, stdout io.WriteCloser, stderr io.Writer) int {
	if len(args) > 0 {
		fmt.Fprint(stderr, mcpUsage)
		return exitUsage
	}
	c, err := newAPIClient(env)
	if err != nil {
		fmt.Fprintln(stderr, "kenwerk mcp:", err)
		fmt.Fprint(stderr, mcpUsage)
		return exitUsage
	}
	srv, err := mcpServer(ctx, mcp.NewHTTPCaller(c.base, c.token, "kenwerk-mcp/"+version.Version), stderr)
	if err != nil {
		fmt.Fprintln(stderr, "kenwerk mcp:", err)
		return exitRefused
	}
	if err := srv.Run(ctx, &sdk.IOTransport{Reader: stdin, Writer: stdout}); err != nil && ctx.Err() == nil && !errors.Is(err, io.EOF) {
		fmt.Fprintln(stderr, "kenwerk mcp:", err)
		return exitFailed
	}
	return exitDone
}

// mcpServer asks the server what the token holds and makes the server of its tools.
func mcpServer(ctx context.Context, caller mcp.Caller, stderr io.Writer) (*sdk.Server, error) {
	credential, err := mcp.ReadCredential(ctx, caller)
	if err != nil {
		return nil, fmt.Errorf("ask the server about this token: %w", err)
	}
	if credential.Kind != "token" || !credential.Assistant {
		return nil, errNotForAnAssistant
	}
	srv, err := mcp.NewServer(mcp.Options{Caller: caller, Scopes: credential.Scopes, Version: version.Version})
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(stderr, "kenwerk mcp: %d tools for scopes %v\n", len(mcp.ToolsFor(credential.Scopes)), credential.Scopes)
	return srv, nil
}
