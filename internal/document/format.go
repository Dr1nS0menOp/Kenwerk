// SPDX-License-Identifier: Apache-2.0

package document

import (
	"slices"
	"sort"
)

// Description is the document format as the gate accepts it, for clients of the API that
// write documents themselves (spec 082 D23).
type Description struct {
	SchemaVersion int          `json:"schema_version"`
	MaxBytes      int          `json:"max_bytes"`
	MaxDepth      int          `json:"max_depth"`
	Nodes         []NodeFormat `json:"nodes"`
	Marks         []string     `json:"marks"`
}

// NodeFormat is one node type and the node types it may hold.
type NodeFormat struct {
	Type     string   `json:"type"`
	Children []string `json:"children"`
}

// Format describes the format from the same lists Normalize checks against, so the
// description can never allow what the gate refuses. Each call returns fresh copies.
func Format() Description {
	nodes := make([]NodeFormat, 0, len(children))
	for _, name := range NodeTypes() {
		allowed := slices.Clone(children[name])
		sort.Strings(allowed)
		nodes = append(nodes, NodeFormat{Type: name, Children: allowed})
	}
	return Description{SchemaVersion: SchemaVersion, MaxBytes: MaxBytes, MaxDepth: MaxDepth,
		Nodes: nodes, Marks: MarkTypes()}
}
