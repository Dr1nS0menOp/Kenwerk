// SPDX-License-Identifier: Apache-2.0

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"
)

// mutationReport is the part of Stryker's JSON report (the mutation-testing-elements
// schema) that the ratchet reads.
type mutationReport struct {
	Files map[string]struct {
		Mutants []struct {
			Status string `json:"status"`
		} `json:"mutants"`
	} `json:"files"`
}

// scoreMutation gives each file its mutation score in tenths of a percent, rounded down:
// the mutants a test caught or that ran out of time, among those that ran. A mutant that
// did not compile or was ignored does not count; one that no test reached counts as missed.
func scoreMutation(r io.Reader) (map[string]int, error) {
	var report mutationReport
	if err := json.NewDecoder(r).Decode(&report); err != nil {
		return nil, fmt.Errorf("not a Stryker JSON report: %w", err)
	}
	scores := map[string]int{}
	for file, result := range report.Files {
		detected, valid := 0, 0
		for _, mutant := range result.Mutants {
			switch mutant.Status {
			case "Killed", "Timeout":
				detected++
				valid++
			case "Survived", "NoCoverage":
				valid++
			}
		}
		scores[file] = maxScoreTenths
		if valid > 0 {
			scores[file] = detected * maxScoreTenths / valid
		}
	}
	return scores, nil
}

func measureMutation(r io.Reader) (measurement, error) {
	scores, err := scoreMutation(r)
	return measurement{counts: scores}, err
}

func compareMutation(floor, scored map[string]int) outcome {
	var result outcome
	for _, file := range union(floor, scored) {
		least, listed := floor[file]
		score, measured := scored[file]
		switch {
		case !listed:
			result.failures = append(result.failures,
				fmt.Sprintf("%s: mutated but not on the list; add it with its score %s", file, formatScore(score)))
		case !measured:
			result.failures = append(result.failures,
				fmt.Sprintf("%s: on the list but no longer mutated; remove its line", file))
		case score < least:
			result.failures = append(result.failures,
				fmt.Sprintf("%s: score %s, below its floor %s", file, formatScore(score), formatScore(least)))
		case score > least:
			result.notes = append(result.notes,
				fmt.Sprintf("%s: score %s, above its floor %s; raise it with -update", file, formatScore(score), formatScore(least)))
		}
	}
	return result
}

// updateMutation takes today's scores as the new floors, unless one of them fell.
func updateMutation(floor, scored map[string]int) (map[string]int, error) {
	for file, score := range scored {
		if least, listed := floor[file]; listed && score < least {
			return nil, fmt.Errorf("%s: score %s, below its floor %s; an update never lowers a floor",
				file, formatScore(score), formatScore(least))
		}
	}
	return maps.Clone(scored), nil
}

func summariseMutation(scored map[string]int) string {
	if len(scored) == 0 {
		return "mutation: no files"
	}
	files := slices.Sorted(maps.Keys(scored))
	lowest := files[0]
	for _, file := range files {
		if scored[file] < scored[lowest] {
			lowest = file
		}
	}
	return fmt.Sprintf("mutation: %d file(s), lowest %s at %s", len(files), lowest, formatScore(scored[lowest]))
}
