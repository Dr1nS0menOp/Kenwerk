// SPDX-License-Identifier: Apache-2.0

package settings

import (
	"strings"
	"testing"
)

func TestTheSwitchForAssistantsRefusesAnUnknownPosition(t *testing.T) {
	for _, body := range []string{`{"mode":"sometimes"}`, `{"mode":""}`, `{"mode":"on","admin":true}`} {
		if _, err := DecodeSection(SectionAssistants, strings.NewReader(body)); err == nil {
			t.Errorf("%s was taken", body)
		}
	}
	for _, mode := range []string{AssistantsOn, AssistantsReadOnly, AssistantsOff} {
		if _, err := DecodeSection(SectionAssistants, strings.NewReader(`{"mode":"`+mode+`"}`)); err != nil {
			t.Errorf("%s was refused: %v", mode, err)
		}
	}
}

func TestAssistantsAreOnWhereNobodySetTheSwitch(t *testing.T) {
	v, err := sectionValue(SectionAssistants)
	if err != nil {
		t.Fatal(err)
	}
	if got := v.(*Assistants).InForce(); got != AssistantsOn {
		t.Fatalf("the default is %q", got)
	}
	if got := (Assistants{}).InForce(); got != AssistantsOn {
		t.Fatalf("a section stored without a mode is %q", got)
	}
}
