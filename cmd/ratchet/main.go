// SPDX-License-Identifier: Apache-2.0

// Command ratchet holds the quality checks that the existing code does not meet yet to
// what it is today, so the debt can only shrink (spec 097). A list in the repository names
// what is still allowed; anything not on it must be clean.
//
//	go run ./cmd/ratchet lint [-update] scripts/lint-ratchet.txt golangci.json
//	go run ./cmd/ratchet mutation [-update] scripts/stryker-ratchet.txt mutation.json
//
// lint: the list holds "package linter count". More findings than the count fails, a
// finding in a package or linter off the list fails, and a listed pair that is clean now
// fails until its line is removed, which locks it to the hard rule.
//
// mutation: the list holds "file score", the floor of each file's mutation score. A score
// below its floor fails, and so does a mutated file off the list.
//
// -update writes today's numbers back, and refuses when any of them is worse than the list.
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"maps"
	"os"
	"slices"
	"strings"
)

// measurement is what one report holds: a number per key and, for lint, the findings
// behind each number, to print when the number is too high.
type measurement struct {
	counts map[string]int
	lines  map[string][]string
}

// outcome is the comparison of a list with a measurement.
type outcome struct {
	failures []string
	notes    []string
	worse    []string
}

// check is one kind of ratchet: how its list reads and writes, how its report is
// measured, and what counts as worse.
type check struct {
	parse   func(string) (int, error)
	format  func(int) string
	measure func(io.Reader) (measurement, error)
	compare func(listed, measured map[string]int) outcome
	update  func(listed, measured map[string]int) (map[string]int, error)
	summary func(measured map[string]int) string
}

var checks = map[string]check{
	"lint": {
		parse: parseCount, format: formatCount, measure: countLint,
		compare: compareLint, update: updateLint, summary: summariseLint,
	},
	"mutation": {
		parse: parseScore, format: formatScore, measure: measureMutation,
		compare: compareMutation, update: updateMutation, summary: summariseMutation,
	},
}

func run(args []string, out io.Writer) error {
	if len(args) == 0 {
		return errors.New("usage: ratchet lint|mutation [-update] <list> <report>")
	}
	c, ok := checks[args[0]]
	if !ok {
		return fmt.Errorf("unknown check %q: lint or mutation", args[0])
	}
	flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
	flags.SetOutput(out)
	update := flags.Bool("update", false, "write today's numbers to the list")
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	if flags.NArg() != 2 {
		return fmt.Errorf("usage: ratchet %s [-update] <list> <report>", args[0])
	}
	listPath, reportPath := flags.Arg(0), flags.Arg(1)
	listText, listed, err := loadList(listPath, c.parse)
	if err != nil {
		return err
	}
	measured, err := loadReport(reportPath, c.measure)
	if err != nil {
		return err
	}
	if *update {
		return writeUpdate(c, listPath, listText, listed, measured.counts, out)
	}
	return judge(c, listed, measured, out)
}

// judge prints the comparison and fails when anything is worse than the list.
func judge(c check, listed map[string]int, measured measurement, out io.Writer) error {
	result := c.compare(listed, measured.counts)
	for _, note := range result.notes {
		fmt.Fprintln(out, "note:", note)
	}
	for _, key := range result.worse {
		for _, line := range measured.lines[key] {
			fmt.Fprintln(out, "  ", line)
		}
	}
	for _, failure := range result.failures {
		fmt.Fprintln(out, "FAIL:", failure)
	}
	fmt.Fprintln(out, c.summary(measured.counts))
	if len(result.failures) > 0 {
		return fmt.Errorf("%d problem(s) against the list", len(result.failures))
	}
	return nil
}

func writeUpdate(c check, path, oldText string, listed, measured map[string]int, out io.Writer) error {
	next, err := c.update(listed, measured)
	if err != nil {
		return err
	}
	text := formatList(heading(oldText), next, c.format)
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil { // #nosec G306 G703 -- the list is a file of the repository, named by the make target
		return err
	}
	fmt.Fprintf(out, "%s: %d lines\n", path, len(next))
	return nil
}

func loadList(path string, parse func(string) (int, error)) (string, map[string]int, error) {
	raw, err := os.ReadFile(path) // #nosec G304 G703 -- the make target names the list of the repository
	if err != nil {
		return "", nil, err
	}
	values, err := readList(strings.NewReader(string(raw)), parse)
	if err != nil {
		return "", nil, fmt.Errorf("%s: %w", path, err)
	}
	return string(raw), values, nil
}

func loadReport(path string, measure func(io.Reader) (measurement, error)) (measurement, error) {
	f, err := os.Open(path) // #nosec G304 G703 -- the make target names the report the tool just wrote
	if err != nil {
		return measurement{}, err
	}
	defer func() { _ = f.Close() }()
	m, err := measure(f)
	if err != nil {
		return measurement{}, fmt.Errorf("%s: %w", path, err)
	}
	return m, nil
}

// union is every key of both maps, sorted, so output is the same on every run.
func union(a, b map[string]int) []string {
	keys := slices.Collect(maps.Keys(a))
	for key := range b {
		if _, ok := a[key]; !ok {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	return keys
}

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "ratchet:", err)
		os.Exit(1)
	}
}
