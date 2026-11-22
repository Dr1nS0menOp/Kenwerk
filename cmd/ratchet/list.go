// SPDX-License-Identifier: Apache-2.0

package main

import (
	"bufio"
	"fmt"
	"io"
	"maps"
	"slices"
	"strconv"
	"strings"
)

// maxScoreTenths is a mutation score of 100%, as scores are kept in tenths of a percent.
const maxScoreTenths = 1000

// readList reads one entry per line: the last field is the number, the fields before it
// are the key. Empty lines and lines starting with # are skipped.
func readList(r io.Reader, parse func(string) (int, error)) (map[string]int, error) {
	values := map[string]int{}
	scan := bufio.NewScanner(r)
	for n := 1; scan.Scan(); n++ {
		line := strings.TrimSpace(scan.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return nil, fmt.Errorf("line %d: want a key and a number", n)
		}
		key := strings.Join(fields[:len(fields)-1], " ")
		value, err := parse(fields[len(fields)-1])
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", n, err)
		}
		if _, twice := values[key]; twice {
			return nil, fmt.Errorf("line %d: %s is listed twice", n, key)
		}
		values[key] = value
	}
	return values, scan.Err()
}

// heading is the comment at the top of a list, which an update keeps.
func heading(text string) string {
	var kept strings.Builder
	for line := range strings.Lines(text) {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			break
		}
		kept.WriteString(line)
	}
	return kept.String()
}

// formatList writes the heading and then one sorted line per key.
func formatList(head string, values map[string]int, format func(int) string) string {
	var out strings.Builder
	out.WriteString(head)
	for _, key := range slices.Sorted(maps.Keys(values)) {
		fmt.Fprintf(&out, "%s %s\n", key, format(values[key]))
	}
	return out.String()
}

func parseCount(text string) (int, error) {
	n, err := strconv.Atoi(text)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("%q is not a count", text)
	}
	return n, nil
}

func formatCount(n int) string { return strconv.Itoa(n) }

// parseScore reads a percentage with at most one decimal, such as 87.5, as tenths.
func parseScore(text string) (int, error) {
	whole, fraction, hasFraction := strings.Cut(text, ".")
	if hasFraction && len(fraction) != 1 {
		return 0, fmt.Errorf("%q: a score has one decimal", text)
	}
	if !hasFraction {
		fraction = "0"
	}
	w, errWhole := strconv.Atoi(whole)
	f, errFraction := strconv.Atoi(fraction)
	tenths := w*10 + f
	if errWhole != nil || errFraction != nil || w < 0 || f < 0 || tenths > maxScoreTenths {
		return 0, fmt.Errorf("%q is not a score from 0 to 100", text)
	}
	return tenths, nil
}

func formatScore(tenths int) string { return fmt.Sprintf("%d.%d", tenths/10, tenths%10) }
