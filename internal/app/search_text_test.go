// SPDX-License-Identifier: Apache-2.0

package app_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

func block(typ string, attrs map[string]any, content ...any) map[string]any {
	b := map[string]any{"type": typ, "attrs": attrs}
	if len(content) > 0 {
		b["content"] = content
	}
	return b
}

func textPara(text string) map[string]any {
	return map[string]any{"type": "paragraph", "content": []any{map[string]any{"type": "text", "text": text}}}
}

// captionedTable is a document of one table whose caption holds the word, and whose one cell
// says "cell".
func captionedTable(caption string) map[string]any {
	cell := block("tableCell", nil, textPara("cell"))
	return docOf(block("table", map[string]any{"caption": caption, "block_id": "abcdefgh"}, block("tableRow", nil, cell)))
}

func chartTitled(title string) map[string]any {
	table := captionedTable("")["content"].([]any)[0].(map[string]any)
	return docOf(table, block("chart", map[string]any{"table": "abcdefgh", "title": title}))
}

func spotlightButton(words string) map[string]any {
	return docOf(block("spotlight", map[string]any{"button_text": words, "button_href": "https://example.com/"}, textPara("Read on")))
}

// publishedDoc creates a page and publishes the document as its first version.
func (u *user) publishedDoc(space, title string, doc map[string]any) string {
	u.e.t.Helper()
	page := u.ok("POST", "/api/v1/pages", map[string]any{"space_id": space, "title": title})["id"].(string)
	u.publish(page, title, 0, doc)
	return page
}

// foundOnlyByItsReaders checks that a word that stands only in the document finds its page for
// a reader of the space, and that once a restriction keeps that reader out, the page is
// neither found nor counted. It gives the reader's row.
func foundOnlyByItsReaders(t *testing.T, doc map[string]any, word string) map[string]any {
	t.Helper()
	e := newEnv(t)
	owner, _, viewer, space := e.team("ENG")
	page := owner.publishedDoc(space, "Plain title", doc)
	found, row := searchFinds(viewer, page, word)
	if !found {
		t.Fatalf("a reader does not find the page by %q", word)
	}
	owner.restrict(page, "view", owner.id)
	out := viewer.ok("GET", "/api/v1/search?q="+word, nil)
	if len(out["results"].([]any)) != 0 || out["total"].(float64) != 0 {
		t.Fatalf("a restriction does not keep %q out: %v", word, out)
	}
	if found, _ := searchFinds(owner, page, word); !found {
		t.Fatalf("the owner no longer finds the page by %q", word)
	}
	return row
}

func TestSearchFindsAWordThatStandsOnlyInATableCaption(t *testing.T) {
	row := foundOnlyByItsReaders(t, captionedTable("zebracaption"), "zebracaption")
	if !strings.Contains(fmt.Sprint(row["snippet"]), "zebracaption") {
		t.Fatalf("the excerpt does not show the caption: %v", row)
	}
}

func TestSearchFindsAWordThatStandsOnlyInAChartTitle(t *testing.T) {
	foundOnlyByItsReaders(t, chartTitled("okapichart"), "okapichart")
}

func TestSearchFindsAWordThatStandsOnlyInASpotlightButton(t *testing.T) {
	foundOnlyByItsReaders(t, spotlightButton("narwhalbutton"), "narwhalbutton")
}

// writtenBefore makes the readers' entry of a page hold what the release before wrote: the
// cell, without the caption. The state then says entries hold that text.
func (e *env) writtenBefore(page string) {
	e.t.Helper()
	e.sql("UPDATE search_documents SET body = 'cell' WHERE page_id = $1", page)
	e.sql("UPDATE search_state SET text_version = 1")
}

func (e *env) textPass() {
	e.t.Helper()
	if err := e.app.RefreshSearchTextNowForTest(context.Background()); err != nil {
		e.t.Fatal(err)
	}
}

func (e *env) textVersion() int {
	e.t.Helper()
	return e.count("SELECT text_version FROM search_state")
}

func TestTheTextPassBringsPagesPublishedBeforeUpToDate(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("ENG")
	page := owner.publishedDoc(space, "Plain title", captionedTable("zebracaption"))
	e.writtenBefore(page)
	if found, _ := searchFinds(viewer, page, "zebracaption"); found {
		t.Fatal("the entry still holds the caption; the test sets nothing up")
	}
	e.textPass()
	if found, _ := searchFinds(viewer, page, "zebracaption"); !found {
		t.Fatal("after the pass the caption does not find the page")
	}
	if e.textVersion() != 2 || e.count("SELECT count(*) FROM search_state WHERE refreshed_at IS NOT NULL AND text_cursor IS NULL") != 1 {
		t.Fatalf("the state does not say the pass is through: version %d", e.textVersion())
	}
}

func TestTheTextPassNeverPutsAWorkingVersionInTheReadersEntry(t *testing.T) {
	e := newEnv(t)
	w := newControlWorld(e, "DCS")
	page := w.controlled("Calibration", "approved words")
	w.approve(page)
	w.publishDoc(page, "Calibration", captionedTable("okapicaption"))
	e.sql("UPDATE search_working SET body = 'cell' WHERE page_id = $1", page)
	e.writtenBefore(page)
	e.textPass()
	if found, row := searchFinds(w.reader, page, "okapicaption"); found {
		t.Fatalf("a reader finds a word of the working version: %v", row)
	}
	if found, _ := searchFinds(w.reader, page, "approved"); !found {
		t.Fatal("a reader no longer finds the approved version")
	}
	if found, _ := searchFinds(w.author, page, "okapicaption"); !found {
		t.Fatal("the author does not find the caption of the working version")
	}
}

func TestTheTextPassCreatesNoEntry(t *testing.T) {
	e := newEnv(t)
	owner, _, _, space := e.team("ENG")
	draft := owner.ok("POST", "/api/v1/pages", map[string]any{"space_id": space, "title": "Never published"})["id"].(string)
	// A template has versions and never an entry (makeCurrent).
	template := owner.page(space, nil, "Template", "template words")
	e.sql("DELETE FROM search_documents WHERE page_id = $1", template)
	e.sql("UPDATE pages SET kind = 'template' WHERE id = $1", template)
	w := newControlWorld(e, "DCS")
	dropped := w.workingPage("Calibration", "approved words", "Calibration", "working words")
	e.sql("DELETE FROM search_working WHERE page_id = $1", dropped)
	e.sql("UPDATE search_state SET text_version = 1")
	e.textPass()
	if n := e.count("SELECT count(*) FROM search_documents WHERE page_id = ANY($1::uuid[])", []string{draft, template}); n != 0 {
		t.Fatalf("the pass created %d readers' entries", n)
	}
	if n := e.count("SELECT count(*) FROM search_working WHERE page_id = $1", dropped); n != 0 {
		t.Fatal("the pass brought back a working entry that was dropped")
	}
}

func TestTheTextPassLeavesAnUnchangedEntryAlone(t *testing.T) {
	e := newEnv(t)
	owner, _, _, space := e.team("ENG")
	steady := owner.page(space, nil, "Steady", "steady words")
	changed := owner.publishedDoc(space, "Changed", captionedTable("zebracaption"))
	e.writtenBefore(changed)
	e.sql("UPDATE search_documents SET updated_at = '2020-01-01' WHERE page_id = ANY($1::uuid[])", []string{steady, changed})
	e.textPass()
	if n := e.count("SELECT count(*) FROM search_documents WHERE page_id = $1 AND updated_at = '2020-01-01'", steady); n != 1 {
		t.Fatal("the pass wrote an entry whose text did not change")
	}
	if n := e.count("SELECT count(*) FROM search_documents WHERE page_id = $1 AND updated_at = '2020-01-01'", changed); n != 0 {
		t.Fatal("the pass did not write the entry whose text changed")
	}
}

func TestTheTextPassWaitsWhileANodeOfAnOlderReleaseRuns(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("ENG")
	page := owner.publishedDoc(space, "Plain title", captionedTable("zebracaption"))
	e.writtenBefore(page)
	e.sql(`INSERT INTO nodes (id, role, version, max_migration, last_seen_at) VALUES (gen_random_uuid(), 'all', 'older', 57, now())`)
	// A pass that had started goes back to the first entry: the older node may write behind it.
	e.sql("UPDATE search_state SET text_cursor = $1, entries_read = 7", page)
	e.textPass()
	if found, _ := searchFinds(viewer, page, "zebracaption"); found || e.textVersion() != 1 {
		t.Fatalf("the pass ran beside an older release: version %d", e.textVersion())
	}
	if n := e.count("SELECT count(*) FROM search_state WHERE text_cursor IS NULL AND entries_read = 0"); n != 1 {
		t.Fatal("a pass that met an older release did not start again from the first entry")
	}
	e.sql(`UPDATE nodes SET last_seen_at = now() - interval '1 hour' WHERE version = 'older'`)
	e.textPass()
	if found, _ := searchFinds(viewer, page, "zebracaption"); !found || e.textVersion() != 2 {
		t.Fatalf("once the older node is gone the pass does not run: version %d", e.textVersion())
	}
}

func TestTheTextPassGoesOnFromItsCursorAfterItsBudget(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("ENG")
	pages := map[string]string{}
	for _, word := range []string{"zebracaption", "okapicaption", "narwhalcaption"} {
		pages[word] = owner.publishedDoc(space, "Plain title", captionedTable(word))
		e.writtenBefore(pages[word])
	}
	ctx := context.Background()
	if err := e.app.RefreshSearchTextForTest(ctx, 0, 1); err != nil {
		t.Fatal(err)
	}
	if e.textVersion() != 1 || e.count("SELECT count(*) FROM search_state WHERE text_cursor IS NOT NULL") != 1 {
		t.Fatalf("a run stopped by its budget marked the pass through, or kept no cursor: version %d", e.textVersion())
	}
	if err := e.app.RefreshSearchTextForTest(ctx, time.Minute, 1); err != nil {
		t.Fatal(err)
	}
	for word, page := range pages {
		if found, _ := searchFinds(viewer, page, word); !found {
			t.Fatalf("after the second run %s does not find its page", word)
		}
	}
	if e.textVersion() != 2 {
		t.Fatalf("the pass is through, yet the version is %d", e.textVersion())
	}
}

func TestTheTextPassRunsOnceForEachTextVersion(t *testing.T) {
	e := newEnv(t)
	if e.textVersion() != 2 {
		t.Fatalf("an installation without entries holds no old text, yet starts at version %d", e.textVersion())
	}
	owner, _, viewer, space := e.team("ENG")
	page := owner.publishedDoc(space, "Plain title", captionedTable("zebracaption"))
	e.sql("UPDATE search_documents SET body = 'cell' WHERE page_id = $1", page)
	e.textPass()
	if found, _ := searchFinds(viewer, page, "zebracaption"); found {
		t.Fatal("a pass ran while the text was current")
	}
	if n := e.audited("action = 'search.text_refreshed'"); n != 0 {
		t.Fatalf("a run with nothing to do recorded %d events", n)
	}
}

func TestTheTextPassRecordsItsEndWithoutText(t *testing.T) {
	e := newEnv(t)
	owner, _, _, space := e.team("ENG")
	page := owner.publishedDoc(space, "Merger notes", captionedTable("zebracaption"))
	e.writtenBefore(page)
	e.textPass()
	e.textPass()
	if n := e.audited("action = 'search.text_refreshed'"); n != 1 {
		t.Fatalf("the end of the pass is recorded %d times", n)
	}
	got := e.scalar(`SELECT payload::text FROM (SELECT action, payload FROM audit_events
		UNION ALL SELECT action, payload FROM audit_pending) a WHERE action = 'search.text_refreshed'`)
	for _, want := range []string{`"text_version":2`, `"rewritten":1`, `"read":`} {
		if !strings.Contains(got, want) {
			t.Errorf("the event lacks %s: %s", want, got)
		}
	}
	for _, never := range []string{page, "Merger", "zebracaption", "cell"} {
		if strings.Contains(got, never) {
			t.Errorf("the event holds %q: %s", never, got)
		}
	}
}

// postWithWord makes a blog post whose text holds the word, in a space whose blog is then
// turned off.
func postWithWord(owner *user, space, word string) string {
	owner.e.t.Helper()
	post := owner.ok("POST", "/api/v1/pages", map[string]any{"space_id": space, "title": "News", "kind": "post"})["id"].(string)
	owner.publish(post, "News", 0, para(word))
	owner.ok("PUT", "/api/v1/spaces/"+space+"/features", map[string]any{"blog": false})
	return post
}

func TestAPostIsStillFoundWhenItsSpaceTurnsTheBlogOff(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("ENG")
	post := postWithWord(owner, space, "walrusword")
	if found, _ := searchFinds(viewer, post, "walrusword"); !found {
		t.Fatal("turning the blog off hid a post from search")
	}
	owner.restrict(post, "view", owner.id)
	if out := viewer.ok("GET", "/api/v1/search?q=walrusword", nil); out["total"].(float64) != 0 {
		t.Fatalf("a post behind a restriction is counted: %v", out)
	}
}

func TestACommentIsStillFoundWhenItsSpaceTurnsCommentsOff(t *testing.T) {
	e := newEnv(t)
	owner, _, viewer, space := e.team("ENG")
	page := owner.page(space, nil, "Discussed", "x")
	owner.comment(page, "walrusword")
	owner.ok("PUT", "/api/v1/spaces/"+space+"/features", map[string]any{"comments": false})
	if got := searchComments(viewer, "walrusword"); len(got) != 1 {
		t.Fatalf("turning comments off hid a comment from search: %v", got)
	}
	owner.restrict(page, "view", owner.id)
	if got := searchComments(viewer, "walrusword"); len(got) != 0 {
		t.Fatalf("a comment behind a restriction is found: %v", got)
	}
}
