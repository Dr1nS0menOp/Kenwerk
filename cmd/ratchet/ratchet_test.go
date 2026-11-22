// SPDX-License-Identifier: Apache-2.0

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const lintJSON = `{"Issues":[
 {"FromLinter":"gocyclo","Text":"too complex","Pos":{"Filename":"internal/pages/pages.go","Line":10}},
 {"FromLinter":"gocyclo","Text":"too complex","Pos":{"Filename":"internal/pages/tree.go","Line":20}},
 {"FromLinter":"funlen","Text":"too long","Pos":{"Filename":"internal/pages/pages_test.go","Line":30}},
 {"FromLinter":"gosec","Text":"G304","Pos":{"Filename":"cmd/kenwerk/main.go","Line":40}}
]}`

func TestLintCountsFindingsPerPackageAndLinter(t *testing.T) {
	found, err := countLint(strings.NewReader(lintJSON))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]int{"internal/pages gocyclo": 2, "internal/pages funlen": 1, "cmd/kenwerk gosec": 1}
	if len(found.counts) != len(want) {
		t.Fatalf("counts %v, want %v", found.counts, want)
	}
	for key, n := range want {
		if found.counts[key] != n {
			t.Errorf("%s: %d, want %d", key, found.counts[key], n)
		}
	}
	if got := found.lines["cmd/kenwerk gosec"]; len(got) != 1 || got[0] != "cmd/kenwerk/main.go:40: G304" {
		t.Errorf("lines %q", got)
	}
}

func TestLintReportWithoutIssuesCountsNothing(t *testing.T) {
	found, err := countLint(strings.NewReader(`{"Issues":null}`))
	if err != nil || len(found.counts) != 0 {
		t.Fatalf("counts %v, err %v", found.counts, err)
	}
}

func TestLintReportThatIsNotJSONIsAnError(t *testing.T) {
	if _, err := countLint(strings.NewReader(`golangci-lint crashed`)); err == nil {
		t.Fatal("no error")
	}
}

func TestAFindingInAPackageOffTheListFails(t *testing.T) {
	got := compareLint(map[string]int{}, map[string]int{"internal/ids gocyclo": 1})
	if len(got.failures) != 1 || !strings.Contains(got.failures[0], "internal/ids gocyclo") {
		t.Fatalf("failures %q", got.failures)
	}
}

func TestMoreFindingsThanTheListAllowsFails(t *testing.T) {
	got := compareLint(map[string]int{"internal/pages gocyclo": 2}, map[string]int{"internal/pages gocyclo": 3})
	if len(got.failures) != 1 || !strings.Contains(got.failures[0], "3") {
		t.Fatalf("failures %q", got.failures)
	}
}

func TestAListedPackageThatIsCleanNowFailsUntilItsLineIsRemoved(t *testing.T) {
	got := compareLint(map[string]int{"internal/pages gocyclo": 2}, map[string]int{})
	if len(got.failures) != 1 || !strings.Contains(got.failures[0], "remove") {
		t.Fatalf("failures %q", got.failures)
	}
}

func TestFewerFindingsThanAllowedPassesWithANote(t *testing.T) {
	got := compareLint(map[string]int{"internal/pages gocyclo": 5}, map[string]int{"internal/pages gocyclo": 4})
	if len(got.failures) != 0 || len(got.notes) != 1 {
		t.Fatalf("failures %q notes %q", got.failures, got.notes)
	}
}

func TestExactlyTheAllowedFindingsPassesQuietly(t *testing.T) {
	got := compareLint(map[string]int{"internal/pages gocyclo": 5}, map[string]int{"internal/pages gocyclo": 5})
	if len(got.failures) != 0 || len(got.notes) != 0 {
		t.Fatalf("failures %q notes %q", got.failures, got.notes)
	}
}

const mutationJSON = `{"files":{
 "src/a.ts":{"mutants":[{"status":"Killed"},{"status":"Timeout"},{"status":"Survived"},{"status":"NoCoverage"},{"status":"CompileError"},{"status":"Ignored"}]},
 "src/b.ts":{"mutants":[{"status":"Killed"},{"status":"Killed"},{"status":"Killed"}]},
 "src/c.ts":{"mutants":[{"status":"Killed"},{"status":"Survived"},{"status":"Survived"}]},
 "src/d.ts":{"mutants":[]}
}}`

func TestMutationScoreCountsKilledAndTimedOutAmongValidMutants(t *testing.T) {
	scores, err := scoreMutation(strings.NewReader(mutationJSON))
	if err != nil {
		t.Fatal(err)
	}
	// a: 2 detected of 4 valid; b: all; c: 1 of 3 is 33.3, rounded down; d: nothing to catch.
	want := map[string]int{"src/a.ts": 500, "src/b.ts": 1000, "src/c.ts": 333, "src/d.ts": 1000}
	for file, n := range want {
		if scores[file] != n {
			t.Errorf("%s: %d, want %d", file, scores[file], n)
		}
	}
}

func TestMutationReportThatIsNotJSONIsAnError(t *testing.T) {
	if _, err := scoreMutation(strings.NewReader(`{`)); err == nil {
		t.Fatal("no error")
	}
}

func TestAMutatedFileOffTheListFails(t *testing.T) {
	got := compareMutation(map[string]int{}, map[string]int{"src/a.ts": 900})
	if len(got.failures) != 1 || !strings.Contains(got.failures[0], "src/a.ts") {
		t.Fatalf("failures %q", got.failures)
	}
}

func TestAScoreBelowItsFloorFails(t *testing.T) {
	got := compareMutation(map[string]int{"src/a.ts": 800}, map[string]int{"src/a.ts": 799})
	if len(got.failures) != 1 || !strings.Contains(got.failures[0], "79.9") {
		t.Fatalf("failures %q", got.failures)
	}
}

func TestAListedFileThatIsNoLongerMutatedFails(t *testing.T) {
	got := compareMutation(map[string]int{"src/gone.ts": 800}, map[string]int{})
	if len(got.failures) != 1 || !strings.Contains(got.failures[0], "src/gone.ts") {
		t.Fatalf("failures %q", got.failures)
	}
}

func TestAScoreAboveItsFloorPassesWithANote(t *testing.T) {
	got := compareMutation(map[string]int{"src/a.ts": 800}, map[string]int{"src/a.ts": 850})
	if len(got.failures) != 0 || len(got.notes) != 1 {
		t.Fatalf("failures %q notes %q", got.failures, got.notes)
	}
}

func TestListReadsKeysOfSeveralWordsAndSkipsComments(t *testing.T) {
	values, err := readList(strings.NewReader("# a comment\n\ninternal/pages gocyclo 12\n"), parseCount)
	if err != nil {
		t.Fatal(err)
	}
	if len(values) != 1 || values["internal/pages gocyclo"] != 12 {
		t.Fatalf("values %v", values)
	}
}

func TestListLineWithoutANumberIsAnError(t *testing.T) {
	if _, err := readList(strings.NewReader("internal/pages gocyclo many\n"), parseCount); err == nil {
		t.Fatal("no error")
	}
	if _, err := readList(strings.NewReader("internal/pages\n"), parseCount); err == nil {
		t.Fatal("no error for a line with one field")
	}
}

func TestListKeyTwiceIsAnError(t *testing.T) {
	if _, err := readList(strings.NewReader("a x 1\na x 2\n"), parseCount); err == nil {
		t.Fatal("no error")
	}
}

func TestScoresReadAndWriteWithOneDecimal(t *testing.T) {
	values, err := readList(strings.NewReader("src/a.ts 87.5\nsrc/b.ts 100\n"), parseScore)
	if err != nil {
		t.Fatal(err)
	}
	if values["src/a.ts"] != 875 || values["src/b.ts"] != 1000 {
		t.Fatalf("values %v", values)
	}
	if formatScore(875) != "87.5" || formatScore(1000) != "100.0" || formatScore(5) != "0.5" {
		t.Fatalf("format %s %s %s", formatScore(875), formatScore(1000), formatScore(5))
	}
	for _, bad := range []string{"101", "-1", "8.75", "x"} {
		if _, err := parseScore(bad); err == nil {
			t.Errorf("%s: no error", bad)
		}
	}
}

func TestWrittenListKeepsItsHeadingAndSortsTheLines(t *testing.T) {
	got := formatList("# heading\n# second\n", map[string]int{"b x": 2, "a x": 1}, formatCount)
	want := "# heading\n# second\na x 1\nb x 2\n"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
	if heading("# one\n# two\nline 1\n# later\n") != "# one\n# two\n" {
		t.Fatal("heading")
	}
}

func writeFile(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestRunLintFailsOnNewDebtAndPassesOnTheList(t *testing.T) {
	report := writeFile(t, "lint.json", lintJSON)
	full := writeFile(t, "full.txt", "# h\ninternal/pages gocyclo 2\ninternal/pages funlen 1\ncmd/kenwerk gosec 1\n")
	var out strings.Builder
	if err := run([]string{"lint", full, report}, &out); err != nil {
		t.Fatalf("%v\n%s", err, out.String())
	}
	short := writeFile(t, "short.txt", "internal/pages gocyclo 2\ninternal/pages funlen 1\n")
	out.Reset()
	if err := run([]string{"lint", short, report}, &out); err == nil || !strings.Contains(out.String(), "cmd/kenwerk/main.go:40") {
		t.Fatalf("err %v, out %s", err, out.String())
	}
}

func TestUpdateLowersTheListButNeverRaisesIt(t *testing.T) {
	report := writeFile(t, "lint.json", lintJSON)
	list := writeFile(t, "list.txt", "# h\ninternal/pages gocyclo 9\ninternal/pages funlen 1\ncmd/kenwerk gosec 1\ninternal/ids dupl 3\n")
	var out strings.Builder
	if err := run([]string{"lint", "-update", list, report}, &out); err != nil {
		t.Fatalf("%v\n%s", err, out.String())
	}
	raw, err := os.ReadFile(list) // #nosec G304 -- a file this test wrote into its own temporary folder
	if err != nil {
		t.Fatal(err)
	}
	want := "# h\ncmd/kenwerk gosec 1\ninternal/pages funlen 1\ninternal/pages gocyclo 2\n"
	if string(raw) != want {
		t.Fatalf("list %q, want %q", raw, want)
	}
	tight := writeFile(t, "tight.txt", "internal/pages gocyclo 1\n")
	if err := run([]string{"lint", "-update", tight, report}, &out); err == nil {
		t.Fatal("update raised the list")
	}
}

func TestRunMutationRecordsNewFilesOnUpdate(t *testing.T) {
	report := writeFile(t, "mutation.json", mutationJSON)
	list := writeFile(t, "list.txt", "# h\nsrc/a.ts 40.0\n")
	var out strings.Builder
	if err := run([]string{"mutation", list, report}, &out); err == nil {
		t.Fatal("files off the list passed")
	}
	if err := run([]string{"mutation", "-update", list, report}, &out); err != nil {
		t.Fatalf("%v\n%s", err, out.String())
	}
	if err := run([]string{"mutation", list, report}, &out); err != nil {
		t.Fatalf("after update: %v\n%s", err, out.String())
	}
}

func TestRunRefusesUnknownCommandsAndMissingFiles(t *testing.T) {
	var out strings.Builder
	for _, args := range [][]string{nil, {"lint"}, {"other", "a", "b"}, {"lint", "/no/such/list", "/no/such/report"}} {
		if err := run(args, &out); err == nil {
			t.Errorf("%q: no error", args)
		}
	}
}
