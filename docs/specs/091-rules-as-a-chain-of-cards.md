# 091: Rules as a chain of cards

Status: stages 1 to 6 and 8 built in wave AR1 (2026-11-23); stage 7 waits for a wave of its own (E1). "Updated for main on 2026-11-23" below says what changed since the study, and wins where it differs from the text before it
Phase: a new part before 1.0, allowed by the product owner on 2026-11-15 as an exception to the feature freeze of ADR-043, on the condition that it is experimental and off by default (wave AR1)

## Problem

A rule today is a long form of native fields under three headings, When, If and Then, with a test run and the log below it (spec 015, H5). It works, but a reader cannot see at a glance what a rule does, in which order, and which step still needs something: the messages sit in a box at the top and beside fields far down the page. Blueprint 03 rewrote how a rule is built (chapter 12, section 12.9, PLT-129 to PLT-152, with PLT-160 and PLT-161 in the same section): its own screen in the settings frame, the steps as a chain of cards from top to bottom, and a panel beside the chain that shows the rule's summary and details, the list of types to choose from, or the settings of one step. This spec plans that screen. It writes no code: the screen sits in the settings frame as waves SC4 and SC5 rebuild it, and neither has landed yet.

The look stays ours: colours, icons, fonts and every value come from `tokens.css` (ADR-021, ADR-045). Only the arrangement follows the lines.

## Study

### What each line asks

| Line | Asks | Notes from the study |
|---|---|---|
| PLT-129 | Its own screen in the large area of the settings frame: a header strip, a canvas, a panel over the end third of the canvas | Inside the Settings frame of the space (SC5) or of the administration (SC4), full width (spec 083, D13) |
| PLT-130 | Header: boxed back button, automation icon, the name in small text, on or off and saved or not in words; at the end the primary button and a boxed More | |
| PLT-131 | The primary button is split: save and switch on, or save switched off. Unavailable until a trigger is chosen, available while a later step is unfinished | A rule that is not ready cannot be switched on (PLT-078), so "save and switch on" must save it off and say why (D6) |
| PLT-132 | More: turn off, copy, export, delete; there before the first save too | Today the test run and the run log sit below the form; they need a place (D9) |
| PLT-133 | A default name; no save without a trigger | Today a new rule is stored the moment it is started; the server takes any trigger kind and stores the rule off |
| PLT-134 | A top-to-bottom chain joined by thin lines, at the start side, fixed card width, a quiet dot pattern behind | Lines and dots are CSS: only three files may hold SVG (ADR-026) |
| PLT-135 | A card: icon tile, title, second line, nothing else; the kind by icon colour and in words for screen readers | When, If, For each, Then |
| PLT-136 | Selected card: accent border; focus adds a pale halo; a new rule opens with its trigger placeholder selected | |
| PLT-137 | A small add button after every step and at the end of every inner part; kind first, then a placeholder card and the list of types; nothing follows a placeholder | Today's model keeps every condition before every action (see below) |
| PLT-138 | A step that holds steps is an indented arm with a tag; the arm does not rejoin | Needs *for each* (PLT-071, new) or if / else (PLT-070, later); neither exists |
| PLT-139 | The chain is a list in reading order; each card a button; Move up and Move down | WCAG 2.5.7 |
| PLT-140 | A zoom control at the bottom centre: out, percentage, in | No inline styles, so each zoom step is a class |
| PLT-141 | Each second line is the step's settings as one sentence, never blank, from the translation files, right to left as well | Sentences are whole translated strings with placeholders, never joined fragments (NAV-076) |
| PLT-142 | A step that does not fit, or still needs a choice: coloured outline, warning triangle with a number, the number in words | The warning colour only for this |
| PLT-143 | Its settings start with a tinted warning: icon, bold heading, advice (PLT-077), help link, no close | SC4's `Notice`, warning kind |
| PLT-144 | No step selected: the summary (icon tiles, name, a mark for a template, how many steps need input), then a framed card of details; no save in the panel | Details exist only in part (PLT-079 to PLT-082 are new) |
| PLT-145 | The list of triggers: search, a filter by group, suggestions first, groups by source, alphabetical, bold headings with counts, a help pointer last | Groups: the rule engine, Diffluence, each app (apps do not exist) |
| PLT-146 | Rows of the type lists: a tinted tile with an icon and one label; the condition types in alphabetical order | Today's condition kinds differ from the list (see below) |
| PLT-147 | A long list keeps its heading and search in view and scrolls its rows; a short list shrinks the panel; never sideways scrolling | |
| PLT-148 | A step's settings: heading row with icon, name and the icon buttons of PLT-085; one or two sentences with a help link; the form; Back and Next at the bottom, half width each | |
| PLT-149 | Labels above fields, small and bold; required in words and by an asterisk; criteria rows with a lead word and remove at the end; a quiet text button adds one; Next available with a value missing, which shows beside its field and on the card | Needs to know what is missing while the person types, not only after a save (D5) |
| PLT-150 | (later) An if / else part's all-or-any as two toggle buttons | Stays later with PLT-070 |
| PLT-151 | In an open list of choices the current option has a tint, a start bar and accent text | |
| PLT-152 | The value picker: a floating card beside the panel, explanation and close, search and a kind filter in view, earlier steps first, Escape back to the field | Today it is a native list of six placeholders that appends at the end |
| PLT-160 | The *for each* list ends with the help pointer; every help link opens the help panel beside the rule | The help panel (NAV-115, NAV-116) is not built |
| PLT-161 | A step that needs more than two sentences gets a collapsible explanation with an example | |

### Today's rule model

`internal/automation/definition.go` holds what a rule does as JSON in `automation_rules.definition`:

- `trigger`: a `kind` (22 events, `schedule`, `manual`, `incoming`) and for a schedule `every` and `at` (D14 of spec 015).
- `conditions`: one optional tree. A group is `all`, `any` or `not` with `items`; a leaf is one of `in_space`, `below_page`, `has_label`, `has_status`, `title_contains`, `text_contains`, `created_by`, `older_than`, `member_of`. At most five deep and 50 in all. The tree is tested once, against the page of the trigger, before any action runs.
- `actions`: an ordered list of up to 50 steps of 19 types. `find_pages` is a lookup: every page step after it acts on each page it found (up to 100), while steps that need no page run once.
- `spaces`: for a rule of the instance, the spaces it acts in (spec 033).

`Definition.Problems` lists what must be fixed before a rule can be on, each with a `step` (the action's index, `-1` for the trigger, `-2` for the whole tree of conditions) and an English message; `goneThings` adds groups and hosts that no longer exist. A rule with problems is stored, stays off, and a run of it stops with `rule_has_problems`. An unknown condition kind or action type is a problem.

A rule runs as its account (`account_id`), which is its owner or a service account an administrator chose (PLT-023, D10 of spec 015): `callerFor` makes the caller of every step, and every step goes through the module method a person would use. The action that makes a page from a template calls `templates.UseForRule` with that caller, which uses the version approved when the rule runs (spec 074, TPL-604). Nothing in this spec changes who a rule acts as.

**So:** every card the lines describe for today's steps can be shown and edited on today's model, through today's routes. Four things are not in it:

1. **A condition after an action** (PLT-137: the add button follows every step and offers a condition). Today every condition is one gate before the first action.
2. ***For each*** with inner steps (PLT-071, PLT-138). Today's `find_pages` is an implicit loop to the end of the rule.
3. **If / else** (PLT-070, PLT-150), which blueprint 03 keeps for later.
4. **The new condition types** of PLT-146: compare two values (PLT-064), page condition with criteria (PLT-067), person condition (PLT-068), search query (PLT-069, later), the AI condition (PLT-104, later). Each is a line of section 12.4 with its own open questions (PLT-065 and PLT-067 each say "needs its own study").

Section 12.9 itself says "the behaviour of section 12.4 stays as it is". This spec therefore builds the screen on today's model first (stages 1 to 6), and adds exactly one new rule feature, the condition after an action, because PLT-137 asks for it on every add button (stage 7, D3). *For each*, if / else and the new condition types each come with their own wave and study; this spec fixes the rules of the format they must follow, so that each can be added without breaking a node of the previous release.

### Today's editor

`web/src/views/rules.tsx` (915 lines) holds the list of rules (`RuleList`, `RuleTable`, `RuleRow`), the start of a new rule from empty or from one of five templates in `RULE_TEMPLATES` (stored at once, off), the import from a JSON file, and the screen of one rule (`RuleView`, `RuleForm`): name; for a rule of the instance the spaces (`ScopePart`); the trigger (`TriggerPart`); one group of conditions with all or any (`ConditionPart`, one level only, five of the nine leaf kinds); the actions with Move up, Move down and Remove (`ActionPart`, 15 of the 19 types); a checkbox for on; one Save; for an incoming webhook the address (`HookAddress`); a test run on a typed page id (`TestRun`); the last 100 runs (`RunLog`). `moveStep` is the one tested helper. The screen renders in the frame of its space, or in the plain frame for a rule of the instance. Its picture is `rule` in `web/e2e/0-design.spec.ts`; the list is `rules`.

The routes (`internal/httpapi/handlers_rules.go`), all behind the experimental part `automation` (spec 069): list and create under `/spaces/{id}/rules` (`space.automation`) and `/admin/rules` (administrator); `GET`, `PUT`, `DELETE /rules/{id}`, `POST /rules/{id}/test`, `GET /rules/{id}/runs` and the session-only `POST /rules/{id}/hook`, each `Object(space.automation)`, with `mayManage` in the module deciding (administrator for a rule of the instance).

### What waves SC4 and SC5 give this screen

- **SC5** puts `/spaces/:key/settings/automation` inside the Settings frame of the space, full width, with Automation a pinned entry that carries the Experimental mark (spec 083, step 3 and D13), and keeps lines PLT-105 to PLT-152 for the wave of their section.
- **SC4** puts the automation of the instance in the administration's tool tier (`automation`), gives `SettingsSection`, `Notice` with an information, warning and error kind, the Experimental mark, and the table rule (spec 081, steps 2, 5 to 7).
- Neither builds the Automation screen of PLT-105 to PLT-128 (its tabs, filters and run log). This spec does not need it: the back button returns to the list of rules as it exists when AR1 is built.

## Lines in scope

Status now, and after this wave. Lines of section 12.4 that the screen shows keep their status unless named.

| Line | Now | After AR1 | Notes |
|---|---|---|---|
| PLT-129 | new | built | Behind the part `rule_cards` (D1) |
| PLT-130 | new | built | |
| PLT-131 | new | built | Save and switch on saves off a rule that is not ready, and says so (D6) |
| PLT-132 | new | built | Before the first save: export and delete (D8) |
| PLT-133 | new | built | The server refuses a rule without a trigger (D7) |
| PLT-134 | new | built | |
| PLT-135 | new | built | |
| PLT-136 | new | built | |
| PLT-137 | new | partly | Condition and action; *for each* waits for PLT-071 |
| PLT-138 | new | not this wave | Nothing holds steps until *for each* or if / else exists; the arm is drawn by their wave |
| PLT-139 | new | built | Move up and Move down in the step's heading row, and Alt with an arrow key on a card (D11) |
| PLT-140 | new | built | 50 to 150 percent in steps of 25 (D12) |
| PLT-141 | new | built | |
| PLT-142 | new | built | |
| PLT-143 | new | built | |
| PLT-144 | new | partly | The details that exist (D10); the template mark only on a rule not saved yet (D13) |
| PLT-145 | new | partly | Suggestions, the rule engine and Diffluence; no apps exist |
| PLT-146 | new | partly | Today's condition kinds and actions; the new condition types wait for their lines |
| PLT-147 | new | built | |
| PLT-148 | new | built | |
| PLT-149 | new | built | Through the live check (D5) |
| PLT-150 | later | later | With PLT-070 |
| PLT-151 | new | built | In every list of this screen |
| PLT-152 | new | built | Over today's six values (D14) |
| PLT-160 | new | partly | The pointer ends the list of triggers; links open the documentation address, the help panel waits for NAV-115 |
| PLT-161 | new | built | For a schedule, Find pages and a webhook's body |
| PLT-075 | new | partly | The picker of PLT-152 over today's values; the values of PLT-076 wait |
| PLT-077 | new | partly | Shown for every problem of fit the server reports; the trigger states what it gives in its card's second line |
| PLT-078 | new | built | The server already refuses; the screen now shows it (D6) |
| PLT-079 | new | partly | Name, owner with picture and name, the line on failures; the description waits |
| PLT-081 | new | built | Where it acts, the account and the trigger's settings sit in the trigger's settings (D10) |
| PLT-085 | new | built | |
| PLT-026 | partly | partly | Stage 7 adds a condition after an action; the kinds stay as they are |

## Behaviour

### The part

1. **One experimental part, `rule_cards`, off by default** (D1). While it is off, or while `automation` is off, everything is as today: the form of `RuleForm` and its picture. While both are on, every rule opens on the screen below, in space settings and in the administration alike. There is no choice per person.
2. **Organising** lists the part with the words "Rules as a chain of cards" and a line that it needs Automation. Turning it on while Automation is off is allowed and does nothing until Automation is on; the capabilities answer `rule_cards: true` only when both are on.

### The screen

3. **Where.** `/rules/:id` renders the screen inside the Settings frame of the rule's space (SC5) or of the administration (SC4), with Automation marked as the current entry, at full width. A new rule has its own addresses, `/spaces/:key/settings/automation/new` and `/admin/automation/new`, with `?template=` for one of the five templates; after its first save the address is replaced by `/rules/:id`, so Back does not return to an empty draft.
4. **The header strip** (PLT-130): at the start a boxed back button to the list of rules, the automation icon, the name in small regular text, then in words "On" or "Off" and "Saved", "Not saved yet" or "Changes not saved", and the Experimental mark of SC4. At the end the split primary button and a boxed More.
5. **The canvas** (PLT-134): an ordered list at the start side, on a quiet pattern of dots, one fixed card width; thin lines join the cards and run to each add button. The room between the chain and the panel stays empty. The canvas scrolls by itself in both directions, so the page never scrolls sideways.
6. **The panel** (PLT-129): a region over the end side of the canvas, about a third of its width and never narrower than `--size-panel`. Below 50rem it becomes a sheet over the lower part of the canvas, and the chain stays first in reading order.
7. **The zoom control** (PLT-140) at the bottom centre of the canvas, centred in the room the panel leaves: zoom out, the percentage in fixed-width figures, zoom in; 50 to 150 percent in steps of 25, 100 by default, each step a class. The zoom is not kept.

### The cards

8. **Mapping.** The chain is the trigger, then one card per condition, then one card per action, in the order of the definition. When the tree of conditions is an `all` group, each of its items is a card; any other tree (an `any` or `not` group, or a single leaf saved by another client) is one group card (D4). Saving writes the conditions back as an `all` group, as today's form does. Turning a definition into cards and back gives the same definition, for every definition today's form, the templates and the import can make.
9. **A card** (PLT-135): an icon tile in the colour of its kind, a title and a second line. The title is the type in words ("Page published", "Has the label", "Add a label"). The name for screen readers is "When: …", "If: …" or "Then: …" followed by the title, the second line and, if any, "2 problems". The card is a `button` that opens its settings.
10. **The second line** (PLT-141) is one translated sentence per type with the step's values filled in:
    - a placeholder: a muted line on what its kind does ("Checks something before the steps after it", "Does something");
    - a trigger: a muted line on when it runs and what it gives ("Runs when a page is published. Gives the page.", "Runs every week on Monday at 09:00 UTC. Gives no page.");
    - a step not fully set up: a dark line that names what is missing ("Choose the label");
    - a condition: a muted lead-in and the comparison in bold ("If the title contains **release**");
    - a page step after Find pages starts with "On each page found:".
    Every type has its sentence in `en.json`, as one string with named placeholders, so a translation can order its words freely; a unit test proves none is blank, and the right-to-left pictures show them.
11. **Selection and focus** (PLT-136): the selected card has the accent border; a halo only while it has keyboard focus. Selecting a card opens its settings in the panel and moves the focus to the panel's heading; Escape in the panel returns the focus to the card. With nothing selected, the panel shows the summary.
12. **Warnings** (PLT-142): a card with a problem has the warning outline and a triangle with the number of its problems on its title line, the number also in words ("2 problems") for screen readers. The warning colour is used for nothing else on the screen.

### Adding, removing, copying and moving

13. **Add** (PLT-137): a small square add button after every step. It opens a `Menu` with the kinds that can go there: after the trigger and after a condition, Condition and Action; after an action, Action, and from stage 7 Condition too. Choosing a kind puts a placeholder card after the step, selects it, and shows the list of its types in the panel. The add button under a placeholder is pale, unavailable, and says why to screen readers ("Choose a type for the step above first").
14. **Type lists** (PLT-145 to PLT-147): the list of triggers has a search field that narrows while typing, a filter button for one group, then the suggestions (on a schedule, page published, page edited) without a count, then the groups by source: the rule engine (incoming webhook, on a schedule) and Diffluence (every event and by hand from a page), each with a bold heading and a small count, groups and rows in alphabetical order of their words, and the help pointer last (PLT-160). A rule of a space is not offered the triggers it never hears (a group member added or removed, a space created). The list of condition types and of actions has the same rows: a tinted tile with an icon and one label. Choosing a row gives the placeholder its type and opens its form.
15. **The settings of a step** (PLT-148, PLT-085): a heading row with the step's icon and name and, at its end, the icon buttons Move up, Move down, Copy, Remove and Help (Help only where the step has documentation; the trigger has none of the first four, a placeholder only Remove); one or two sentences on what the step does with a help link; the form; then Back and Next, each half the width, Back without a border. Back returns to the list of types, keeping the values that still apply; Next closes the step and selects nothing, so the summary shows.
16. **Remove** takes the step away at once and says so in the live region with Undo for a few seconds (`useToast`). The trigger cannot be removed; it is changed through Back.
17. **Copy** puts a copy with the same settings right after the step and selects it.
18. **Move** (PLT-139): Move up and Move down move a step one place. A condition moves among the conditions and an action among the actions; from stage 7 a condition may also move between actions (D3). A move that is not possible leaves its button unavailable with the reason in its description. Alt with Arrow up or Arrow down on a focused card moves it too. The focus stays on the moved card, and the live region says "Add a label moved to place 3 of 5".

### The panel without a selection

19. **Summary** (PLT-144) at the top, unframed and level with the top of the canvas: the icon tiles of the trigger and the actions, the name in bold, "From a template" as a bordered word on a rule not saved yet that started from one, and "2 steps need input" when that is so.
20. **Details** in a framed card under it: a sentence on how required fields are marked; the name (required); the owner with picture and name and the muted line that the owner is told when the rule fails; the place it lives (this space, or the instance); and last the note that where the rule acts, the account it acts as and the settings of its trigger are in the trigger's settings, with a button that selects the trigger and a help link (PLT-081).

### The trigger's settings

21. The trigger's form as today (the kind, for a schedule how often and at what time in UTC, with the collapsible explanation of PLT-161); for a rule of the instance, where it acts, in every space or in chosen spaces as chips (spec 033); the account it acts as, in words, read-only, because the screen offers no choice of account, as today's form offers none; for an incoming webhook, Make an address or Make a new address, with the address shown once (the session-only route of today).

### The forms

22. Labels sit above their fields, small and bold; a required field says "required" in words beside its asterisk (PLT-149). The fields of each type are those of today's form, plus the ones the model holds and the form left out: the five missing condition kinds (in a space, below a page, created by, member of a group; each with a picker for the space, page, person or group), and the four missing actions (new page from a template, move, restrict, set owner), each with its picker.
23. **The group card** (D4) shows its items as criteria rows: a short lead word ("and", "or", "not") before each row's list, the value field under it, its remove button at the end of its first row, and a quiet text button with a plus to add another. All or any is chosen by two toggle buttons, each as wide as its words. A group nested inside it is shown as one read-only row with the sentence of PLT-141 and a remove button, because the screen does not edit groups inside groups.
24. **The value picker** (PLT-152): a button at the end of every field that takes values opens a floating card beside the panel, with a heading, an explanation button and a close button; under it the search field and a filter for the kind of value (text, link, person; all by default) stay in view above a line, and only the list scrolls. The list starts with the earlier steps: the trigger, when it gives a page (title, address, author, owner), and each Find pages step before this one (the title of the page found); then "This rule" (its name). Each section opens its values and has a way back. Choosing a value puts its placeholder at the cursor, says in the live region which field it went into, closes the card and returns the focus to the field. Escape does the same without a value.
25. **Lists of choices** (PLT-151): in an open list the current option has the tint, a bar at its start edge and accent text; the closed field keeps showing the current choice.

### Validation and errors

26. **One judge.** What a rule still needs comes only from the server's `Problems`, never from a second set of rules in the browser (D5). Each problem now also says where it is (`where`), what kind it is (`input` or `fit`) and a `code` the screen translates; the `step` and `message` of today stay, so the form and other clients keep working.
27. **While editing**, the screen asks the server to check the definition 400 milliseconds after the last change and when Next is pressed, through a route that stores nothing. The problems land on their cards (outline and number), beside their fields in the open step (PLT-149), and in the summary's count. A placeholder counts as a step that needs input. If the check cannot be reached, the cards keep their last answer and the summary says the check is not up to date; saving still works and the server decides.
28. **A step that may not fit** (problems of kind `fit`, such as a page step under a trigger that gives no page) starts its settings with SC4's `Notice` of the warning kind: its icon, the bold heading "This step may not fit its trigger", the advice (choose another trigger, or add a Find pages step before it) and a help link, with no close button (PLT-143).
29. **A failed save** shows `ErrorNote` under the header strip; the edits stay on screen.

### Saving

30. **Save and switch on** (the main part, PLT-131): unavailable until the trigger has a type, available from then on. If the last check found problems, the rule is saved off and the status says "Saved, but off: 2 steps need input". Otherwise it is saved on; if the server still refuses to switch it on (`rule_not_ready`, see API), it is saved off with the same status.
31. **Save switched off** (the arrow part): saves and switches the rule off.
32. **Placeholders are not saved**; they stay on the screen, and the status keeps "Changes not saved".
33. **Unsaved changes.** The back button asks first through `ConfirmDialog` when there are changes, and so do links inside the app, through a small guard the router consults (D15). Closing or reloading the tab is warned by the browser.

### More

34. **More** (PLT-132): Turn off (while on; switches off the saved rule and leaves unsaved edits on the screen), Copy (stores a copy, off, and offers a link to it), Export (the saved rule as JSON, as today), Test this rule and Run log (D9), and Delete (asks first, then returns to the list). Before the first save: Export (the draft) and Delete (discards the draft, after asking).

### A condition after an action (stage 7)

35. A condition placed after an action is a step of its own, `check`. When the run reaches it, it loads the page of the trigger again as the account sees it, so it sees what the steps before it changed, and tests its condition. If it holds, the run goes on; if not, the steps after it do not run, the run log shows the check as skipped with "conditions not met", and the run ends as done with the steps it did.
36. A check tests the page of the trigger, never the pages a Find pages step found; its sentence says so ("If the page of the trigger has the label **approved**"). Filtering found pages is the work of *for each* (PLT-071).
37. A check counts toward the 50 steps of a rule and not toward the 50 actions a run may take, because it changes nothing.
38. Conditions that come before every action stay in `conditions`, as today; a check moved above every action becomes one of them again. So a rule uses the new format only while it really has a condition after an action.

## Permissions and audit

- **Deny by default.** The screen, the check route and every save go through today's rule on rules: `space.automation` on the space, or administrator for a rule of the instance, checked in the module by `mayManage` behind the route's `Access` rule. The browser decides nothing; the capabilities only spare a person a screen that would fail. No new permission is added.
- **A rule acts as its account.** The screen sends no `account_id`, so the server's rules for the account apply unchanged; every step still goes through the module method a person would use, and the template step still uses `UseForRule` (spec 074). A check loads the page as the account sees it (D11 of spec 015), so a condition can never reveal a page the account cannot see.
- **Part off.** The check route answers `404 experimental_off` while `rule_cards` or `automation` is off; a definition with a `check` step is refused while `rule_cards` is off, and a stored rule with one has a problem, so it does not run (stage 7).
- **Audit and outbox.** Saving writes `rule.created` or `rule.changed`, deleting `rule.deleted`, as today, in the same transaction. Checking stores nothing and writes no event, like every read.

## API

All changes are additions; no route changes its rule, and every field of today keeps its meaning.

- **`Problem`** gains `where` (`trigger`, `conditions`, `condition/<n>` for the n-th item of an `all` tree, `step/<n>` for the n-th action, `steps` for the list as a whole), `kind` (`input` or `fit`) and `code` (such as `choose_trigger`, `needs_value`, `needs_page`, `group_gone`, `host_not_allowed`, `too_many_steps`). For an `all` tree each item is checked on its own, so each card gets its own problem; `step` stays `-2` for all of them.
- **`POST /api/v1/spaces/{id}/rules/check`** (`Object(space.automation)`) and **`POST /api/v1/admin/rules/check`** (`Permission(administrator)`): body `{"definition": …}`, answer `{"problems": […], "format": 1}`. Stores nothing. Both behind `automation` and `rule_cards`, with an entry in the API description (spec 015, D19). Being a `POST` under `/api/v1/admin/`, the administration's route is session-only by spec 085, which suits a check that only the screen calls.
- **Create and update** refuse a definition whose trigger has no kind: `400 invalid_input`, "Choose when this rule runs." Today's form always sends one.
- **Switching on a rule that is not ready** answers `400 rule_not_ready` with the problems as fields (`apperr.InvalidFields`), instead of today's `invalid_input` with the same message. The changelog names the new code.
- **Stage 7:** the action type `check` with a field `when` holding one condition tree; `GET /rules/{id}` and the export gain `format` (1 or 2), which the server works out from the definition and never takes from a client; the import refuses a file whose `format` is higher than it knows, whole.

## The format of a rule, and the previous release

Two releases run side by side during a rolling upgrade, and a node of the previous release reads the same rows. It decodes a definition into its own types, so it **drops any field it does not know**, both when it runs a rule and when it saves one through its form. It treats an **unknown condition kind or action type as a problem**: it neither switches such a rule on nor runs it (`rule_has_problems`).

From that follow the rules every change to the rule format keeps, this one and those of *for each* and if / else:

1. **A new meaning is always a new kind or type.** An existing kind never gets a field that changes what it does, because the previous release would drop the field and run the step with the old meaning. A new field may only refine something the previous release can safely ignore, and a test lists each such field with its reason.
2. **A rule stays in format 1 whenever it can.** The server works out the format from what the definition holds. Only a rule that uses a kind of a newer release is format 2.
3. **No format-2 rule exists while a node of the previous release runs.** Saving or importing a format-2 definition is refused with `409 older_release_running` while such a node was seen in the last minute (`features.RefuseWhileOlderReleaseRuns`, spec 074, TPL-1103), and `rule_cards` joins `partsHeldForOlderReleases`. That check tells releases apart by their highest migration, so stage 7 brings an expand migration (number given at landing): `automation_rules.format smallint NOT NULL DEFAULT 1`, with a check that it is 1 or 2. The column also lets the upgrade guide and support count format-2 rules with one query; the definition stays the truth, and a node reads the format from it.
4. **If the previous release meets a format-2 rule anyway** (after a step back to it), it refuses to run it and shows "Choose what this step does." on the check; saving it there would lose the check's condition. The upgrade guide says to remove the checks, or turn those rules off, before going back.
5. **Stages 1 to 6 change no format:** the cards save exactly what the form saves, so nothing is held and no migration is needed for them.

## Where the code goes

- `internal/features/experimental.go`: `ExperimentalRuleCards = "rule_cards"` in `ExperimentalParts`; from stage 7 in `partsHeldForOlderReleases`. `internal/testutil` and `scripts/e2e` turn it on with the others.
- `internal/automation/definition.go`: `Problem.Where`, `Kind`, `Code`; the check of every item of an `all` tree; stage 7: `ActCheck`, `Action.When`, `Definition.Format()`.
- `internal/automation/service.go`: `Check(ctx, c, spaceID, d)`; the refusal of a rule without a trigger; `rule_not_ready`; stage 7: the format column, the hold, the refusal while the part is off.
- `internal/automation/run.go`: stage 7, the check step in `runSteps` and in the test run.
- `internal/httpapi/handlers_rules.go`: the two check routes; the capabilities answer gains `rule_cards`.
- `web/src/views/rule-chain/`: `chain-model.ts` (pure: definition to cards and back, add, remove, copy, move, placeholders), `sentences.ts` (pure: the second line of every type), `rule-screen.tsx` (route, header strip, More, saving, the guard), `chain.tsx` (canvas, cards, add buttons, zoom), `panel.tsx` (summary, details, type lists, a step's settings), `step-forms.tsx` (the form of each type), `value-picker.tsx`.
- `web/src/components/`: `SplitButton` (also wanted by PLT-106, built here if that wave has not), `StepCard`, `ZoomControl`, each added to the components table of the design standard. Icons for the four kinds, the warning triangle and zoom in and out in `components/icons.tsx`, our own line drawings.
- `web/src/router.ts`: one leave guard that `navigate` and `Link` consult.
- `web/src/design/chain.css`: the canvas, the dots, the lines, the cards, the zoom classes, the panel and the sheet below 50rem, logical properties only. Colours: the four kinds use the existing mark tints for their tiles with one new icon colour per kind, and the warning uses the warning colour of SC4's `Notice`, or a new pair `--color-warning` and `--color-warning-tint` if SC4 adds none; each new token has both themes and a contrast pair in `check-design.mjs` (3:1 for icons and outlines, 4.5:1 for text).
- `web/src/locales/en.json`: every word under `ruleChain.*`.

## Load budget

Nothing is claimed for 5,000 people until it is measured (step 8).

- **Class:** settings (ARC-233). Nothing on saving pages, reading pages or search.
- **Opening a rule:** the same `GET /rules/{id}` as today, plus the capabilities answer already cached. Pickers load their lists when opened, as `SubjectPicker` does.
- **The check:** at most one call per 400 milliseconds of typing per person editing a rule. It runs the pure `Problems`, one indexed lookup per group the rule names and one read of the allowed hosts per outward step, the same work `GET /rules/{id}` does. Budget in `internal/app/query_budget_test.go`: `rule check` at the session and permission statements plus 3, for a rule naming one group and one host.
- **Saving:** the same statements as today's `PUT`.
- **Running (stage 7):** a check step adds one page read as the account and its two relation queries (ancestors, groups of the author), so at most 3 statements per check, and a rule holds at most 50 steps. Nothing else on the run path changes; a rule without checks runs exactly as today.
- **Steady state:** none. No worker job, no cache, no new table in stages 1 to 6.

## Tests to write first

Failure paths first, then boundaries, then the happy path (CLAUDE.md, "Tests").

### `internal/automation` (pure, table tests)

- `TestEachProblemSaysWhereItIsWhatKindAndItsCode`: every branch of `Problems` and `goneThings` gives `where`, `kind` and `code`, and keeps today's `step` and `message`.
- `TestEachItemOfAnAllTreeHasItsOwnProblem`: two empty leaves give two problems, at `condition/0` and `condition/1`; an `any` tree gives one at `conditions`.
- `TestAPageStepUnderATriggerWithoutAPageIsAProblemOfFit`.
- Stage 7: `TestALeadingCheckIsAConditionAndKeepsFormatOne`; `TestFormatTwoOnlyWhenACheckFollowsAnAction`; `TestACheckCountsAsAStepAndNotAsAnAction`; `TestEveryNewMeaningIsANewKind`, which holds the kinds, types and fields of the previous release in `testdata/previous-release.json` and fails when an existing kind gains a field not listed with its reason, or a new kind is missing from the format rules.

### `internal/app` (integration, a fresh database each)

- `TestTheRuleCardsAreOffOnANewInstallation`: the capabilities say `rule_cards: false`, the check routes answer `404 experimental_off`, and the form's rules are unchanged.
- `TestOnlyThoseWhoManageRulesMayCheckOne`: a member, a reader and a token without `write` are refused on a space's route; a space automation holder is refused on the instance's route; the service's `Check` refuses when called directly without the right.
- `TestCheckingARuleStoresNothing`: no row, no audit event, no outbox event.
- `TestARuleWithoutATriggerCannotBeSaved`, by create, update and import.
- `TestSwitchingOnARuleThatIsNotReadyNamesItsProblems`: `400 rule_not_ready` with fields; nothing stored; saving off then works.
- `TestTheCardsSaveWhatTheFormSaves`: every template and a fixture of every type, saved through the routes the screen calls, reads back the same definition.
- `TestARuleSavedThroughTheCardsActsAsItsAccount`: a rule with the step "new page from a template", saved through the cards' routes, makes the page through `UseForRule` as its owner, and a step the account may not do fails as it does today.
- Stage 7: `TestACheckThatDoesNotHoldStopsTheStepsAfterIt`; `TestACheckSeesWhatTheStepsBeforeItChanged`; `TestACheckCannotSeeWhatItsAccountCannot` (a page the account cannot see ends the run as `not_visible`); `TestTheFormatIsWorkedOutNotTaken` (a client's `format` is ignored); `TestAFormatTwoRuleWaitsForTheOlderReleaseToStop` (a node row with a lower `max_migration` gives `409 older_release_running` for save and import, and format-1 saves still work); `TestAFormatTwoRuleDoesNotRunWhileTheCardsAreOff`; `TestAFileOfAnUnknownFormatIsRefusedWhole`.
- `TestTheTestDatabaseTurnsOnEveryExperimentalPart` fails until `rule_cards` is in `testutil.AllExperimentalOn` and in `scripts/e2e`.

### Browser unit tests (vitest)

- `chain-model`: to cards and back is the identity for every template, every type and a nested group; an `any` tree is one group card; Move up on the first condition and Move down on the last action are unavailable; a condition does not move below an action before stage 7, and does after it, turning into a check and back; Copy places the copy after; Remove of the trigger is refused; nothing can be added under a placeholder; placeholders are left out of the definition.
- `sentences`: every trigger, condition kind and action type has a sentence when empty and when filled, none blank, each one translation key with named placeholders; a page step after Find pages starts with its lead-in.
- The live region's words for add, remove, copy, move and a value put into a field.
- The zoom never leaves 50 to 150.

## Mutation lines

Each in `scripts/mutation-check.sh`, with the test that catches it:

| Mutation | Caught by |
|---|---|
| the check routes work while `rule_cards` is off | `TestTheRuleCardsAreOffOnANewInstallation` |
| `Check` skips `mayManage` | `TestOnlyThoseWhoManageRulesMayCheckOne`, calling the service directly |
| checking stores the rule | `TestCheckingARuleStoresNothing` |
| a rule without a trigger is stored | `TestARuleWithoutATriggerCannotBeSaved` |
| a rule that is not ready is switched on | `TestSwitchingOnARuleThatIsNotReadyNamesItsProblems` |
| stage 7: a check that does not hold lets the next step run | `TestACheckThatDoesNotHoldStopsTheStepsAfterIt` |
| stage 7: a check loads the page with another caller than the account | `TestACheckCannotSeeWhatItsAccountCannot` |
| stage 7: the format is taken from the client | `TestTheFormatIsWorkedOutNotTaken` |
| stage 7: the hold for the previous release is skipped | `TestAFormatTwoRuleWaitsForTheOlderReleaseToStop` |
| stage 7: a format-2 rule runs while the part is off | `TestAFormatTwoRuleDoesNotRunWhileTheCardsAreOff` |

## End-to-end tests and design pictures

### End-to-end, new `web/e2e/rule-chain.spec.ts`

- With `rule_cards` off, a rule opens as the form; turned on in Organising, it opens as the chain.
- A new rule, from the keyboard only: the trigger placeholder is selected and the list of triggers is in the panel; the split button is unavailable; search narrows the list; choosing "Page published" makes the button available; the add button opens its menu with the arrow keys; a condition placeholder and its list; "Has the label" with its value missing shows the message beside the field and the number on the card; Next leaves it unfinished; an action "Notify" with a value from the picker put at the cursor, Escape returning the focus to the field; Save and switch on saves it off and says why; filling the label and saving again switches it on.
- Move up and Move down, by the buttons and by Alt with the arrow keys: the order changes, the focus stays on the card, the live region says where it went.
- Copy and Remove with Undo; the trigger has no Remove.
- A page step under a schedule shows the warning outline, the number, and the warning notice with its advice.
- More: Export downloads the definition the server holds; Delete asks first; Test this rule and Run log open their dialogs.
- Leaving with changes asks first; reloading the saved rule shows the same chain.
- A space administrator without `space.automation` cannot open the screen; a member gets "does not exist, or you cannot see it".
- axe on each state; at 360 pixels wide (the panel as a sheet); right to left; zoom at 50 and 150.
- Stage 7: a condition after an action, saved, runs and stops the step after it, shown in the run log.

### New pictures in `web/e2e/0-design.spec.ts`

Each under a test named `RuleChainView: …`:

- a new rule with the trigger placeholder selected and the list of triggers (`rule-chain-new`);
- a saved rule with a trigger, two conditions and three actions, one after Find pages, nothing selected: summary and details (`rule-chain`);
- an action selected, its form, a missing value, and the value picker open (`rule-chain-step`);
- a step that may not fit, with its warning notice (`rule-chain-warning`);
- the add menu open over a placeholder (`rule-chain-add`);
- a group card open with its criteria rows and the two toggle buttons (`rule-chain-group`);
- stage 7: a condition after an action (`rule-chain-check`).

The form's picture `rule` stays, taken with `rule_cards` off; because the e2e run turns every part on, that test turns the part off for itself in a serial group and on again after, and the builder checks that no other test of the run depends on it at that moment. The product owner sees every new picture, in light, dark, narrow and right to left, before it is committed.

## Upgrade notes

- **Stages 1 to 6: no migration.** The part is a new name in the list under the key `experimental`; an upgraded installation starts without it. The rules are stored exactly as today.
- **Mixed releases, stages 1 to 6.** A node of the previous release ignores the part it does not know. An administrator who saves the experimental parts through the previous release's screen sends a list without it and turns it off again; turning it on once more is all it takes. A browser served by a new node may call the check route on an old node, which does not know it: the screen then says the check is not up to date and the server decides on save. Nothing is damaged, so nothing is held.
- **Stage 7: one expand migration** (the `format` column, number given at landing), the hold of `rule_cards` and of every format-2 save while a node of the previous release runs, the safe refusal of that release described above, and in `docs/operations/upgrade.md` the advice to remove checks, or turn those rules off, before going back a release.
- **Turning the part off** brings back the form for every rule. Rules of format 1 are unchanged. A rule of format 2 shows a problem on its check and does not run until the part is on again or the check is removed; the form shows it read-only, with a note that only the chain can edit it.
- **Restore.** A restored backup brings its own list of parts and its own rules; nothing else is stored.

## Build plan

SC4 and SC5 must have landed on `main` first (and so SC1, which they build on): the Settings frame of both places, `SettingsSection`, `Notice` with its warning kind, the Experimental mark, the registry entries for Automation. Each step below is one builder's work, ends with `make check` green, and commits its pictures. Sizes as in spec 081: S up to about 200 changed lines, M up to about 500, L more.

| Step | What | Lines | Size | Pictures |
|---|---|---|---|---|
| 0 | Rebase `wave-ar1` on `main` once SC4 and SC5 have landed. Check the addresses of Automation in both frames, `Notice`'s warning kind and its colour, and whether the Automation screen wave has built `SplitButton` | | XS | none |
| 1 | **The part.** `rule_cards` in `ExperimentalParts`, `testutil.AllExperimentalOn`, `scripts/e2e`, the capabilities answer and type, Organising and `en.json`. Tests first: off on a new installation, on only with Automation | | S | Organising |
| 2 | **The judge says where.** `Problem.Where`, `Kind`, `Code`; each item of an `all` tree on its own; the refusal of a rule without a trigger; `rule_not_ready`; the two check routes with their rule, the module's check, the API description, the route walker and the query budget; their mutation lines. Tests first | PLT-133, PLT-149 | M | none |
| 3 | **The model in the browser.** `chain-model.ts` and `sentences.ts` with every unit test above, every sentence in `en.json`, before any screen | PLT-137, PLT-139, PLT-141 | M | none |
| 4 | **The screen.** The addresses, the Settings frame, the header strip with `SplitButton` and More, the draft of a new rule and its templates, the leave guard, the canvas with dots, lines and cards, the add buttons and their menu, the zoom; the icons and tokens; the form stays for the part off | PLT-129 to PLT-136, PLT-140, PLT-142 | L | `rule-chain-new`, `rule-chain`, `rule-chain-add` |
| 5 | **The panel.** Summary and details; the type lists with search, filter and groups; a step's settings with its heading row, Back and Next; the forms of every type the model holds, the group card; the warning notice; the live check; the value picker; Test this rule and Run log in dialogs | PLT-143 to PLT-149, PLT-151, PLT-152, PLT-160, PLT-161 | L | `rule-chain-step`, `rule-chain-warning`, `rule-chain-group` |
| 6 | **Keyboard and screen reader.** Move by buttons and Alt with arrows, the live region, the focus between card and panel, the unavailable add button and its reason; the e2e file; axe, 360 pixels, right to left | PLT-139 | M | the narrow and right-to-left variants |
| 7 | **(waits for its own wave, E1)** **A condition after an action.** `check` and `when`, the run and the test run, `Format()`, the migration, the hold, the refusal while the part is off, export and import with `format`, the frozen previous release in `testdata`, the mutation lines; in the browser, conditions that move between actions and back | PLT-137, PLT-026 | L | `rule-chain-check` |
| 8 | **Measure and document.** The check and a run with checks on the dump of wave PF and on generated rules, the numbers into `limits.md` and this load budget; `docs/operations/upgrade.md`; the design standard (the rule "A rule is a form…" in Insight and automation now describes the form with the part off, and the components table gains `SplitButton`, `StepCard`, `ZoomControl`); the changelog; the status lines of blueprint 03; the report with every new picture; the handoff | | M | none new |

Steps 2 and 3 may start before SC4 and SC5 land; everything that renders waits for them. Step 7 may wait for a later release than steps 1 to 6 if the product owner wants the screen first (see "Open for the product owner").

## Acceptance criteria

- [ ] A new installation and an upgraded one have the part off: rules open as the form, the check routes answer `404 experimental_off`.
- [ ] With the part on, every rule today's form can make opens as a chain and saves back the same definition, proved for every template and every type.
- [ ] Everything on the screen works from the keyboard alone, every change is announced, nothing depends on dragging, and axe finds nothing, also at 360 pixels and right to left.
- [ ] What a rule still needs shows on its card, in its settings and in the summary, from the server's check alone.
- [ ] A rule without a trigger cannot be saved; Save and switch on saves a rule that is not ready switched off and says why.
- [ ] Only those who may manage a rule can open, check or save it; a saved rule acts as its account exactly as before.
- [ ] Stage 7: a condition after an action stops the steps after it; no format-2 rule can be saved while a node of the previous release runs, and that release never runs one.
- [ ] `make check`, the whole e2e suite once and `0-design.spec.ts` twice in a row are green; the product owner has seen every new picture.

## How the product owner tests it

1. Log in as an administrator, turn on Automation in Organising, and open a space's settings, Automation. Open a rule: it is the form of today.
2. Turn on "Rules as a chain of cards" in Organising. Open the same rule: its steps now stand as cards from top to bottom, with a panel beside them that shows its name and details.
3. Press Create rule. The first card is empty and selected, and the panel lists triggers. The save button at the top is grey. Pick "Page published": the button can be pressed.
4. Press the small plus under the card, pick Condition, then "Has the label". Leave the label empty and press Next: the card gets an outline and a triangle with 1.
5. Press the plus under it, pick Action, then "Notify". In its text, press the button at the end of the field and pick the page's title: it is put where the cursor was.
6. Press Save and switch on: the rule is saved, but stays off, and the top says one step needs input. Fill in the label and save again: it is on.
7. Without the mouse: press Tab to a card and Alt with Arrow down. The card moves down, and a screen reader says where it went.
8. Make a scheduled rule with "Add a label" and no Find pages step: that card warns that it may not fit, and its settings say how to fix it.
9. Log in as a member and type the address of the rule: the page says it does not exist.
10. Turn the part off again: the rule is the form again, unchanged.

## Updated for main on 2026-11-23

Since the study, `main` gained the name Kenwerk (spec 095), the rebuilt administration and space settings (SC4, SC5, ADR-045), the shared tool row and the empty block of Automation (spec 100), a scope for every route (spec 096, `internal/httpapi/scopes.go`), a lint ratchet (spec 097), and two security waves on rules: RV12 (spec 092) and RV13 (spec 093). This section brings the plan up to date. Where it differs from the text above, it wins.

### What RV12 and RV13 settled, and how the screen keeps it

The study found that a rule edited by someone other than its owner ran with the owner's rights, and that conditions were skipped when a run had no page. Specs 092 and 093 fixed both on the server. The screen adds no way around them and shows them:

1. **Only the holder changes a rule.** A person who may manage a rule but does not hold it (spec 092) sees the chain, with an information notice under the header: "This rule acts as {owner}. You can switch it off; to change it, take it over." They may still edit on the screen, but saving asks first in a `ConfirmDialog` ("Take over and save"), which says that the rule will act as them, will be switched off, and that its incoming address ends. Only then does the screen send `take_over: true`. A non-holder never saves silently, and the server still refuses a save without `take_over` (`409 rule_held`).
2. **Switching off needs no take-over.** More, Turn off sends the saved rule unchanged with `enabled: false`, which spec 092 D2 allows anyone who manages the rule.
3. **Only the holder makes an incoming address** (spec 093 D1). The trigger's settings show Make an address only to the holder; anyone else reads "Only the person this rule acts as can make its address." The server refuses anyway.
4. **Starting by hand is not on this screen.** Rules with a manual trigger start from a page's More menu, as spec 093 built it.
5. **Conditions need a page** (spec 092 D5). The problem "Conditions look at a page, and this trigger brings none" is now of kind `fit` with the code `conditions_need_page`, so it shows on the condition cards with the warning notice of point 28 and its advice: choose a trigger that brings a page, or remove the conditions. It stays a problem, so such a rule cannot be switched on.
6. **A test run runs as the caller** unless the caller holds the rule (spec 092 D4); Test this rule in More calls the same route and says so in its dialog.

The rule answer gains `you_hold` (true when the caller holds the rule), so the screen knows which of these to show; the server decides either way.

### Changed decisions (E)

Decided on the product owner's behalf on 2026-11-23, may be overruled:

- **E1. Stage 7 waits for a wave of its own.** The open question of D3 is answered: the screen ships first, on today's model, with no migration and no format change. The add button after an action offers Action only, and conditions move only among the conditions. The format rules of "The format of a rule, and the previous release" stay the plan for that wave. So this wave answers no `format` field and holds nothing for older releases.
- **E2. The frames.** A rule of a space opens inside the space's Settings frame through `SpaceToolFrame` with the entry `automation` (SC5); a rule of the instance inside the administration's frame with the section `automation` current (SC4), at full width in both. The administration's frame is the one `AdminView` draws, made reusable as `AdminFrame`, never a second frame.
- **E3. The list keeps its empty block and gets no tool row.** Automation is one of the short lists of spec 100 D1, so it has no `ToolRow`; while it is empty it shows the `EmptyState` block of spec 100, whose button now opens the new screen's draft while the part is on.
- **E4. Names on cards come from the server, as the viewer may see them.** A card names pages, spaces, people, groups and templates by id in the definition. The check answer carries `names`: for each id the definition holds, its title or name, only when the caller may see it (a page through `page.view`, a space through its own rule, a template through the template module's rule; people and groups by name, as the directory shows them). An id that is missing from `names` shows as "a page you cannot see", "a space you cannot see", and so on, never as its title. The browser never asks for a title by itself. This is also what an MCP client reads.
- **E5. No new colour values.** ADR-045 keeps every colour; the four kinds use existing tints (`--color-mark-*`) for their tiles with the icon in `--color-ink`, and the kind is also in words and by its icon. A card that needs input uses the warning colours of `Notice`. No token value is added, so the product owner's choice of D21's colours is not needed.
- **E6. The value picker is a floating `Menu`.** Today's six values fit a menu grouped by where they come from (the page of the trigger, the pages Find pages found, this rule), which brings the arrow keys, letters and Escape back to the field. The search and the kind filter of PLT-152 wait until there are more values (PLT-076), when the picker becomes a card.
- **E7. Scopes.** The check of a space's rule takes `content:read`: it stores nothing and tells no more than reading the rule and its pages does. The check of an instance rule takes `admin:read`, and is `session-only` like every `POST` under `/api/v1/admin/` (spec 085).
- **E8. Lint.** New Go code passes `make lint` with no line added to `scripts/lint-ratchet.txt`.

### Through the API

Every feature of this screen is reachable through the API, and so by MCP: the screen sends nothing an API client cannot send. A rule as cards is the same JSON as a rule as a form: the cards are only a view of `definition`, and a client creates or edits the very definition the screen shows. Paths are relative to `/api/v1`; rules and scopes are those of `docs/api/routes.txt`.

| What | Route | Rule | Scope |
|---|---|---|---|
| List the rules of a space | `GET /spaces/{id}/rules` | `object:space.automation` | `content:read` |
| Make a rule in a space | `POST /spaces/{id}/rules` | `object:space.automation` | `spaces:manage` |
| **Check a rule of a space** (new) | `POST /spaces/{id}/rules/check` | `object:space.automation` | `content:read` |
| List the rules of the instance | `GET /admin/rules` | `permission:administrator` | `admin:read` |
| Make a rule of the instance | `POST /admin/rules` | `session-only permission:administrator` | `admin:write` |
| **Check a rule of the instance** (new) | `POST /admin/rules/check` | `session-only permission:administrator` | `admin:read` |
| Read one rule | `GET /rules/{id}` | `object:space.automation` | `content:read` |
| Change, switch off or take over | `PUT /rules/{id}` | `object:space.automation` | `spaces:manage` |
| Delete | `DELETE /rules/{id}` | `object:space.automation` | `spaces:manage` |
| Test run | `POST /rules/{id}/test` | `object:space.automation` | `spaces:manage` |
| Run log | `GET /rules/{id}/runs` | `object:space.automation` | `content:read` |
| Incoming address | `POST /rules/{id}/hook` | `session-only object:space.automation` | `spaces:manage` |

An MCP client reaches every route of this table through `describe_api` and `call_api` (spec 096), under the same rules and scopes; a connection that may only read sends `GET` alone, so it reads rules and their log, and does not check or change them. The check takes `{"definition": {...}}` and answers `{"problems": [...], "names": {"<id>": "<title or name>"}}`. Each problem has `step` and `message` as before, and now `where`, `kind` and `code`. Saving is `POST` (new) or `PUT` (existing) with `{"name", "enabled", "definition"}`, plus `"take_over": true` to take a rule over (spec 092). Export is `GET /rules/{id}`, keeping `name` and `definition`; import is the `POST` of the same JSON. A copy is a `POST` of the saved rule under a new name, off.

Every route keeps its rule and scope, except that create and update now refuse a definition without a trigger (`400 invalid_input`), and switching on a rule that is not ready answers `400 rule_not_ready` with its problems as fields, where it answered `invalid_input`. Both are in the changelog under "Upgrade impact".

### Pictures and tests that changed with main

- Pictures are taken in the Settings frames of SC4 and SC5, so `rule-chain*` show the settings sidebar. The form's picture `rule` keeps its name and is taken with the part off for that one page: the e2e helper `rulesAsTheForm` changes only that page's capabilities answer, so no test turns the part off for the others running beside it (in place of the serial group of the plan). The form's own e2e tests in `platform.spec.ts` use the same helper.
- `TestARuleCardNeverNamesWhatItsViewerMayNotSee` (new, first): a page restricted to its owner, named by a condition, is in `names` for the owner and not for a second manager; the same for a template the second manager cannot use.
- `TestTheCardsKeepTheHolderRules` (new): a non-holder's check works, their save without `take_over` is `409 rule_held`, with it the rule is theirs and off, and the check answers `you_hold` truthfully.
- `TestConditionsWithoutAPageAreAProblemOfFit` (new): the RV12 problem is of kind `fit` with its code, on the conditions.
- Stage 7's tests and mutation lines move to its wave (E1).

## Decided on the product owner's behalf on 2026-11-16, may be overruled

- **D1. One experimental part, `rule_cards`, that replaces the form while on, without a choice per person.** It is how ADR-043 adds an optional part. Two editors side by side for the same rules would be two ways to do one thing; the form stays only for installations that leave the part off.
- **D2. The screen first, on today's model.** Every card the lines describe for today's steps fits the model as it is, so stages 1 to 6 are only a new editor on the same routes, with no migration and nothing to hold during an upgrade.
- **D3. One new rule feature: a condition after an action, as a step `check`.** PLT-137 puts an add button after every step and offers a condition there; without it the button after an action would offer less than the line asks. It is the smallest change that gives the chain its meaning, and it sets the format rules that *for each* and if / else will follow. *For each*, if / else and the new condition types stay with their own lines and studies.
- **D4. An `all` tree is one card per item; any other tree is one group card.** Today's form makes an `all` or `any` group of leaves, and the templates make none. One card per item is what the chain shows best; an `any` or `not` group is one idea that reads as one card, and its panel edits it as today's form does. Groups inside groups, which only the API can make, show read-only inside their card.
- **D5. The server is the one judge, through a check route that stores nothing.** PLT-149 wants missing values shown while typing; copying `Problems` into the browser would make two judges that drift apart. The check costs what opening a rule costs, at most every 400 milliseconds per person editing.
- **D6. Save and switch on saves a rule that is not ready switched off, and says so.** PLT-131 keeps the button available while a step is unfinished, and PLT-078 forbids switching such a rule on. Refusing the save would lose work; saving it off keeps the work and tells the truth.
- **D7. The server refuses a rule without a trigger.** PLT-133 says it cannot be saved; only the server can make that true for every client.
- **D8. A new rule is a draft in the browser until its first save.** PLT-131 and PLT-133 describe saving; today's list stores a rule the moment it starts, which leaves empty rules behind. Before the first save More holds Export and Delete, which discards the draft after asking; Turn off and Copy have nothing to act on yet.
- **D9. The test run and the run log move into More, as dialogs.** They are built (PLT-031) and must not be lost, and the panel has no room for them. When the Automation screen's Run log tab exists (PLT-118), Run log leads there, filtered to the rule.
- **D10. "The rule's settings" of PLT-081 are the trigger's settings.** Where it acts, the account and the trigger all say when and as whom the rule runs; the trigger card is where a reader looks for that. The details hold the rest, and say where these went. Description, failure notices, who may change and labels wait for PLT-079 to PLT-084.
- **D11. Moving by buttons in the step's heading row, and Alt with an arrow key on a card.** PLT-135 forbids anything on the card but its tile and two lines, so the buttons live in the step's settings beside Copy and Remove (PLT-085); the keys make a move quick without leaving the chain.
- **D12. Zoom in steps of 25 between 50 and 150, not kept.** Every value is a class, because the design check forbids inline styles; five steps are enough to see a long rule whole or read a small screen. The zoom is a way of looking, not a preference worth storing.
- **D13. The template mark shows only before the first save.** PLT-088 makes the mark a stored fact; nothing stores the origin of a rule today. The mark comes with PLT-088.
- **D14. The value picker shows today's values, grouped by the step that gives them.** PLT-076's values for comments, tasks and the rest wait for their line; the picker's sections are built so that each step can add its own.
- **D15. A leave guard in the router.** The router has none, and a rule edited for ten minutes should not vanish on a stray click in the sidebar. One guard at a time, consulted by `navigate` and `Link`, is small and serves the editor of other screens later too.
- **D16. A rule of a space is not offered triggers it never hears.** Group membership and new spaces have no space, so such a rule would never run.

## Open for the product owner

- Should stage 7, the condition after an action, ship with the screen, or in a later release once the screen has been used (D3)?
- Should the form disappear for good once the part leaves experimental, or stay as a plain alternative (D1)?
- The four kind colours and the warning colour are new token values; their pictures come with step 4 for your choice.

## Supersedes

For rules, while the part is on: the rule "A rule is a form of native fields in When, If and Then, with each message beside its field, a summary at the top, and Move up and Move down instead of dragging" of the design standard, as ADR-045 already lists. Nothing else.

## Provenance

Own words, from blueprint 03 chapter 12 (PLT-021 to PLT-035, PLT-064 to PLT-088, PLT-104, PLT-129 to PLT-152, PLT-160, PLT-161) as written in the study of 2026-11-14 (ADR-045, 02 "One exception"), the built code on `main` (`internal/automation`, `internal/features`, `internal/httpapi/handlers_rules.go`, `web/src/views/rules.tsx`), specs 015, 033, 036, 069, 074, 081, 083 and 088, and WCAG 2.2 success criterion 2.5.7 (Dragging Movements). No pictures, inventories or other product were consulted in writing this spec.
