// SPDX-License-Identifier: Apache-2.0

package httpapi

import "testing"

func TestASortNamesAColumnTheListKnowsWithAMinusForTheReverse(t *testing.T) {
	for raw, want := range map[string]listSort{
		"":       {Column: "name"},
		"name":   {Column: "name"},
		"-name":  {Column: "name", Reverse: true},
		"email":  {Column: "email"},
		"-email": {Column: "email", Reverse: true},
	} {
		got, err := parseListSort(raw, "name", "email")
		if err != nil || got != want {
			t.Errorf("%q: got %+v, %v", raw, got, err)
		}
	}
	for _, raw := range []string{"secret", "--name", "name-", "+name", "-", " name"} {
		if _, err := parseListSort(raw, "name", "email"); err == nil {
			t.Errorf("%q was taken", raw)
		}
	}
}

func TestACountIsAWholeNumberOfAtLeastZero(t *testing.T) {
	for raw, want := range map[string]int{"": 0, "0": 0, "12": 12} {
		if got, err := parseCount(raw, "n"); err != nil || got != want {
			t.Errorf("%q: got %d, %v", raw, got, err)
		}
	}
	for _, raw := range []string{"-1", "1.5", "many", " 3"} {
		if _, err := parseCount(raw, "n"); err == nil {
			t.Errorf("%q was taken", raw)
		}
	}
}

func TestAValueFromAFixedListIsOneOfItOrEmpty(t *testing.T) {
	if oneOf("", "state", "a") != nil || oneOf("a", "state", "a", "b") != nil {
		t.Fatal("an empty value or a known one is refused")
	}
	if oneOf("c", "state", "a", "b") == nil {
		t.Fatal("an unknown value is taken")
	}
}
