// SPDX-License-Identifier: Apache-2.0

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"path"
	"path/filepath"
	"slices"
	"strings"
)

// lintReport is the part of golangci-lint's JSON output that the ratchet reads.
type lintReport struct {
	Issues []struct {
		FromLinter string
		Text       string
		Pos        struct {
			Filename string
			Line     int
		}
	}
}

// countLint counts the findings per package folder and linter, keyed "folder linter".
func countLint(r io.Reader) (measurement, error) {
	var report lintReport
	if err := json.NewDecoder(r).Decode(&report); err != nil {
		return measurement{}, fmt.Errorf("not a golangci-lint JSON report: %w", err)
	}
	found := measurement{counts: map[string]int{}, lines: map[string][]string{}}
	for _, issue := range report.Issues {
		file := filepath.ToSlash(issue.Pos.Filename)
		key := path.Dir(file) + " " + issue.FromLinter
		found.counts[key]++
		found.lines[key] = append(found.lines[key], fmt.Sprintf("%s:%d: %s", file, issue.Pos.Line, issue.Text))
	}
	return found, nil
}

func compareLint(allowed, found map[string]int) outcome {
	var result outcome
	for _, key := range union(allowed, found) {
		limit, listed := allowed[key]
		n := found[key]
		switch {
		case n > limit:
			result.failures = append(result.failures, fmt.Sprintf("%s: %d finding(s), the list allows %d", key, n, limit))
			result.worse = append(result.worse, key)
		case listed && n == 0:
			result.failures = append(result.failures,
				fmt.Sprintf("%s: clean now; remove its line from the list, so it stays clean", key))
		case n < limit:
			result.notes = append(result.notes,
				fmt.Sprintf("%s: %d finding(s), the list allows %d; lower it with -update", key, n, limit))
		}
	}
	return result
}

// updateLint takes today's counts as the new list, unless one of them is higher.
func updateLint(allowed, found map[string]int) (map[string]int, error) {
	for key, n := range found {
		if n > allowed[key] {
			return nil, fmt.Errorf("%s: %d finding(s), the list allows %d; an update never raises the list", key, n, allowed[key])
		}
	}
	return maps.Clone(found), nil
}

// summariseLint is the report for the debt that is still listed.
func summariseLint(found map[string]int) string {
	perLinter := map[string]int{}
	packages := map[string]bool{}
	for key, n := range found {
		folder, linter, _ := strings.Cut(key, " ")
		perLinter[linter] += n
		packages[folder] = true
	}
	if len(packages) == 0 {
		return "lint: no findings"
	}
	var parts []string
	for _, linter := range slices.Sorted(maps.Keys(perLinter)) {
		parts = append(parts, fmt.Sprintf("%s %d", linter, perLinter[linter]))
	}
	return fmt.Sprintf("lint: still listed in %d package(s): %s", len(packages), strings.Join(parts, ", "))
}
