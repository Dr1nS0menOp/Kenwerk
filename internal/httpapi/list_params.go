// SPDX-License-Identifier: Apache-2.0

package httpapi

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
)

// listSort is the order a list was asked for: one of its columns, and whether reversed.
type listSort struct {
	Column  string
	Reverse bool
}

// parseListSort reads the parameter sort of a list (spec 100, D7): a column the list knows,
// with a leading "-" for the reverse order. Empty means the list's first column.
func parseListSort(raw string, columns ...string) (listSort, error) {
	if raw == "" {
		return listSort{Column: columns[0]}, nil
	}
	column, reverse := strings.CutPrefix(raw, "-")
	if !slices.Contains(columns, column) {
		return listSort{}, fmt.Errorf("sort must be one of %s, with - before it for the reverse", strings.Join(columns, ", "))
	}
	return listSort{Column: column, Reverse: reverse}, nil
}

// parseCount reads a parameter that counts something, such as at least so many pages. Empty
// is zero.
func parseCount(raw, name string) (int, error) {
	if raw == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("%s must be a whole number of at least 0", name)
	}
	return n, nil
}

// oneOf checks a parameter whose value comes from a fixed list. Empty does not filter.
func oneOf(raw, name string, values ...string) error {
	if raw == "" || slices.Contains(values, raw) {
		return nil
	}
	return fmt.Errorf("%s must be one of %s", name, strings.Join(values, ", "))
}
