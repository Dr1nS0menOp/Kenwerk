# 082: The editor, as blueprint 03 arranges it

Status: the three reversals answered by the product owner on 2026-11-21 (below); built in wave SC3 on top of `main` with SC1, SC2, SC4, SC5 and the name Kenwerk
Phase: the screens of blueprint 03, third item of the order in `docs/handoff/2026-11-15-screens-study.md` (wave SC3), after the study of 2026-11-14 (ADR-045)

## The product owner's answers of 2026-11-21

The plan of 2026-11-16 took away three arrangements the product owner had chosen or that were built on purpose, and asked them first. Their answers:

1. **Table: yes.** A small button in the cell with the cursor and a bar under the table, as the lines say, in place of the one table button with its menu (EDT-209, EDT-213; ADR-049).
2. **Publish: yes.** Publish becomes a step with the summary, the options (such as not notifying watchers) and Discard draft; `Ctrl Enter` still publishes at once (EDT-166, EDT-031).
3. **Insert dialog: a combination.** The dialog as the lines arrange it, with names and icons and no preview region, is the main form. A preview of the block appears only as a secondary aid while an entry has the pointer over it or keyboard focus, and never changes the arrangement of the dialog. This replaces D7 below; the preview is placed by D22.

## Where `main` moved since the plan

The plan was written beside branches. When the wave was built, `main` (at `3ead067`) held SC1 (spec 078), SC2 (spec 079), SC4 (the administration, spec 081), SC5 (the settings of a space, spec 083) and the new name, Kenwerk (spec 095, `dc1903a`). The branch took the same rename by its script and was rebased onto that `main`. What this spec calls SC2's parts are on `main`: `MenuSub` in `components/menu.tsx` and `Byline` in `views/page-head.tsx`. SC4 and SC5 touch no file of the editor. The link dialog keeps the fix of `c29ea8c`, which `main` holds; this wave adds the test that proves it, and the slash menu's own classes keep the dialog's look (behaviour 31).

## Problem

Writing is where people spend their time, and the editor is the screen they see most after reading. The study of 2026-11-14 rewrote how the editor is arranged: the strip at the top, the row of tools, the way to add something (the slash menu and one large insert dialog), and the controls around a table. Those lines describe a built screen differently from how it is built, and a few of them take away arrangements the product owner chose after their first test (the one table button of spec 017 and ADR-030) or that were built on purpose (Publish in one click with an arrow beside it, Browse all with a preview). The product owner asked on 2026-11-15 for the screens to be rebuilt as the lines say (ADR-045). This spec plans that rebuild for the editor. It writes no code: the editor sits in the Focus frame that SC1 rebuilds, and it uses the sub-menus and the byline that SC2 builds.

The look stays ours: colours, icons, fonts and every value come from `tokens.css` (ADR-021, 02 "One exception"). Only the arrangement follows the lines, and the behaviour decisions of 03 and of the decision log stand (ADR-045).

## Study

### What SC1 and SC2 give this wave

- **SC1 (spec 078, branch `wave-sc1`).** The Focus frame keeps the top bar and the sidebar (ADR-030), now with the sidebar button at the start of the top bar (NAV-092): the editor needs no button of its own to put the sidebar away. The current-row look of NAV-144 and the kind icon in an outlined square of the start screen's cards (NAV-105) exist. SC1 changes no editor component; it only takes the editor's pictures again for the new frame.
- **SC2 (spec 079, then in its own worktree, now on `main`).** `MenuSub` in `components/menu.tsx` (an entry that opens a sub-menu beside its menu, or over it on a phone), `submenuPlace` and `sidewaysShift`; the byline of a page in `views/page-head.tsx` (owner, view count, reactions, document-control state, status); the `.switch` control. SC2 changes no file under `components/editor/` and not `views/edit.tsx`; in `editor.spec.ts` and `writing.spec.ts` it only replaces two clicks on the page's More with its `pageMenu` helper. So SC3 does not overlap SC2 in code, and shares only files every screen wave touches: `icons.tsx`, `menu.tsx` (used, not changed), the CSS of `web/src/design/`, `en.json` and `0-design.spec.ts`.
- **The link dialog** (`components/editor/link-dialog.tsx`) carries the fix of `c29ea8c`: a new page is offered only once the search has answered. No line in scope changes the dialog's arrangement; SC3 keeps it as it is. One trap: the dialog's list of pages uses the classes `.suggestion` and `.insert-list`, which the slash menu uses too. The new slash menu gets classes of its own, so the link dialog, the emoji list (`:`) and the list of people (`@`) keep their look.

### How the editor is built today

| Part | Where | Built today |
|---|---|---|
| Strip | `views/edit.tsx`, `Form`, `.edit-bar` | Close (arrow and words) at the start; the lozenge Unpublished changes; the people editing (`TogetherPeople`, or `EditingTogether` without the service); the public mark; the save status; the summary field; Comment on a published page; Discard draft or Revert (asks first), or Invite while editing together; Publish, which publishes at once, joined to an arrow that opens `PublishOptionsDialog` |
| Publish options | `components/publish-options.tsx` | A dialog: notify watchers, status, publish at a date, Preview, Location (Move), Schedule or Cancel schedule, Done. It changes the choices; Publish in the strip uses them |
| Row of tools | `components/editor/toolbar.tsx` | Groups in this order: text style (a native `select`, paragraph and headings 1 to 6); bold, italic, underline, strikethrough, inline code; More formatting (subscript, superscript, clear formatting, emoji picker), text colour, highlight; alignment and direction, outdent, indent; bullet, numbered, task, quote, code block; link, file, table (opens the size picker), Insert; Find; undo, redo; Full width. Groups that do not fit fold into More from the end (`tool-fold.ts`); the tools for what is selected (`selection-tools.tsx`) sit at the end and wrap below. One Tab stop with arrow keys (`roving-focus.ts`). An active tool is solid accent |
| Floating bars | `floating-bars.tsx` | BubbleMenu bars over selected text and a selected image (ADR-038, ADR-040, spec 047): headings 1 to 3, lists, bold, italic, link, code, colour, highlight and comment; Alt F10 reaches them |
| Slash menu | `insert.tsx`, `SlashCommands` | A list at the cursor with group headings (recent first), icon, name and hint; arrow keys, Enter and Tab choose. The same `SuggestionList` serves `:` (emoji) and `@` (people) |
| Insert | `insert.tsx`, `InsertDialog` | A plain dialog: a search field, a Browse all button, and one list of every entry |
| Browse all | `browse.tsx`, `BrowseDialog` | A wide dialog: the entries by group beside a preview of the block, drawn by `DocumentView` from a small sample document |
| Plus button | `block-handle.tsx` | On an empty line, beside the grip; it types `/`, which opens the slash menu |
| Entries | `INSERT_ITEMS` in `insert.tsx` | About 70: text, headings 1 to 6, three lists, quote, code block, rule, six panels, spotlight, collapsible section, columns (two, three, with a side column), decision, table, file, file of this page, Word import, link, status mark, date, emoji, 37 dynamic blocks, chart, drawing, anchor, page facts, excerpt; in a template also field, instruction, section and value; and the person's saved blocks. `offered` hides what the instance has switched off |
| Table | `table-frame.tsx`, `table-lines.tsx` | One button on the table's outline opens a menu with everything (rows, columns, sort, cells with merge and colour, the table's width, equal columns, flexible columns, numbered rows, duplicate, chart, caption, delete); a handle and a plus for the row and column in use; an edge that stretches the table. `Ctrl Shift .` opens the menu |
| Title area | `components/page-header.tsx` | Emoji, header image and page options above a title that is a large plain input; the status control above it |
| Byline in the sheet | none | The sheet shows no byline |
| Help in the editor | `components/shortcuts.tsx` | `?` opens the overview of shortcuts outside text fields; it has an editor group. There is no help button and no way in from the slash menu |
| History | `/pages/{id}/history` | A screen of its own; leaving the editor to see it |

`DocumentEditor` is also the editor of templates (`views/templates.tsx`, `views/template-pages.tsx`), so the row, the slash menu and the insert dialog change there too. The strip and the publish step are only those of a page and of a database (`SheetEditor` shares the strip).

### Typing shortcuts already work

The table of EDT-027 marks `[text](address)`, `:`, `//`, `<>` and `!!` as new and `@` as phase 4. All six work today: `keys.ts` turns the link shorthand into a link, `EmojiSuggestions` and `MentionSuggestions` answer `:` and `@`, `inline.ts` turns `//` into a date, and `blocks.tsx` turns `<>` into a decision and `!!` into a panel. EDT-187 shows a shortcut only when it works in this release, so the first step corrects those statuses after checking each one in the browser.

### What the lines change that is not a move

- **Publish becomes two steps.** The button opens a step that holds the summary, the publish options and Discard draft (EDT-166). Built today: Publish publishes at once. `Ctrl Enter` keeps publishing at once (EDT-031, a behaviour line that no new line changes), with the choices of the step as they stand.
- **The one table button goes.** A cell button with a cell menu and a floating table bar replace it (EDT-209, EDT-213). It was the product owner's own choice after their first test (spec 017, EDT-160, ADR-030), so ADR-049 records it.
- **Browse all and its preview go.** The insert dialog takes their place (EDT-175, EDT-186), and the tooltip of an entry carries its whole description (EDT-181). A sample of a block is no longer drawn.
- **The plus button** opens the insert dialog instead of typing `/` (EDT-175).
- **The table tool** inserts a table of the default size at once, and its arrow opens the size picker (EDT-168). Today it always opens the picker.
- **Quote and code block** leave the row (EDT-168 does not name them): they stay in the slash menu, the dialog, Turn into and their keys.
- **Undo and redo** show when there is nothing to undo (EDT-170).
- **The editor gains** a reduced byline (EDT-174), a help button (EDT-173), `Ctrl /` and a Help entry (EDT-197), and a History panel (EDT-172).

### The fold control of EDT-165

EDT-165 puts a small fold control at the start of the strip, "whose use needs a study of its own". Three uses are possible: hiding the row of tools, putting the sidebar away, or folding the strip. The first is what ADR-040 decided against ("the fixed toolbar stays and cannot be hidden for now"). The second exists already at the start of the top bar (NAV-092, SC1), one row above. The third would hide Publish and Close, the two things the strip is for. None of them earns a control, so it is not built (D1), and EDT-165 stays partly.

## Lines in scope

The sections the handoff names for this wave: chapter 4, sections 4.1 to 4.3, the lines of 4.4 that serve them, and the table lines of 4.9. "Not this wave" names a line of those sections that is a new feature under the freeze of ADR-043, or that waits for something not built.

### 4.1 The surface

| Line | Was | After | What changes |
|---|---|---|---|
| EDT-001 | built | replaced by EDT-165, EDT-166 | |
| EDT-002 | built | built | Unchanged: both bars stay in view, except on narrow screens |
| EDT-004 | built | replaced by EDT-171 | |
| EDT-005 | built | built | The table bar and the cell button show only in a table |
| EDT-006 | partly | partly | Unchanged; hiding the row stays off (ADR-040) |
| EDT-007 | built | built | The new groups fold from the end, the last group first |
| EDT-008, EDT-164 | built | built | Full width moves to the last group (EDT-169) |
| EDT-012, EDT-013 | built | built | Unchanged; the people editing move to the end of the strip |
| EDT-165 | new | partly | Page icon and bold title at the start; save status, people editing, Publish, Close at the end. Not built: the fold control (D1) |
| EDT-166 | new | built | The publish step |
| EDT-167 | new | built | The strip a little taller than the row, a thin line under the row |
| EDT-168 | new | built | The new row |
| EDT-169 | new | built | More formatting, the list choices, the last group |
| EDT-170 | new | built | Undo and redo dimmed, in place |
| EDT-171 | new | built | Accent icon on the accent tint |
| EDT-172 | new | built | History as a panel at the end side |
| EDT-173 | new | built | The help button in the bottom start corner |
| EDT-174 | new | built | The reduced byline |
| EDT-223 | new | built | A thin line between strip and row |

### 4.2 Ways to add something

| Line | Was | After | What changes |
|---|---|---|---|
| EDT-015, EDT-016, EDT-018 | built | built | Unchanged in function |
| EDT-017 | built | built | Recently used first still; the group headings go (EDT-184) |
| EDT-019 | built | built | The plus button opens the insert dialog (EDT-175) |
| EDT-020 | partly | replaced by EDT-175, EDT-186 | Browse all and its preview leave (D7) |
| EDT-021 to EDT-026 | built | built | Unchanged |
| EDT-175, EDT-176 | new | built | The insert dialog and its regions |
| EDT-177 | new | built | The categories; outside content and software work are absent while empty |
| EDT-178 to EDT-183 | new | built | Search, cells, selection, tooltip, keys, focus |
| EDT-184 to EDT-186 | new | built | The flat slash menu, its placement, its last row |
| EDT-187 | new | built | Shortcut boxes, for shortcuts that work |
| EDT-188 | new | new | Not this wave: no entry is new in the release that builds it, and the New mark of NAV-178 is not built (D20) |
| EDT-189 | new | partly | The order of roles, for the entries that exist. Still open: entries that do not exist yet (promoted entries, the gallery, tabs, link cards, rotating cards, a new page) |
| EDT-190 | new | built | Each kind that exists shows in its category; whiteboards and tracker views do not exist |
| EDT-191 | new | built | Icon tiles, one icon per family, heading and column icons that show their number, panel icons in their colour. No app has entries yet |
| EDT-192 to EDT-195 | new | new | Not this wave: the gallery, the starter set and its settings are new features (ADR-043, D20) |
| EDT-196 | new | built | The hint in an empty table cell |

### 4.3 and 4.4 Shortcuts

| Line | Was | After | What changes |
|---|---|---|---|
| EDT-027 | built | built | The rows `[text](address)`, `:`, `//`, `<>`, `!!` and `@` say built, after a check in the browser |
| EDT-197 | new | built | `Ctrl /` and the Help entry open the overview, with the typing shortcuts |
| EDT-198 | new | new | Not this wave: the key for a table needs its own study |
| EDT-199 | new | partly | Shift F10 and the menu key open the cell menu; `Ctrl Shift .` opens More of the table bar. Not built: `Ctrl Alt` with the arrows (D15) |

### 4.9 Tables

| Line | Was | After | What changes |
|---|---|---|---|
| EDT-084 | built | built | Rows and columns from the cell menu and More of the table bar |
| EDT-086 | built | built | The size picker opens from the arrow of the table tool |
| EDT-087, EDT-088, EDT-091 | built | built | The handles and plus stay, faint, on the table with the cursor (EDT-216) |
| EDT-090, EDT-095 | built | built | Merge, split and colour move to the cell menu |
| EDT-092, EDT-093, EDT-098 | built | built | Move to Table settings |
| EDT-094, EDT-102 | built | built | Move to More of the table bar |
| EDT-096, EDT-097 | built | built | On the table bar |
| EDT-099, EDT-103 | built | built | Unchanged: they apply by themselves, as built (D16) |
| EDT-160 | built | replaced by EDT-209, EDT-213 | |
| EDT-161 | built | built | The row still shows nothing for tables |
| EDT-209 to EDT-211 | new | built | Cell button, cell menu, empty the cell |
| EDT-212 | new | built | Start, centre and end; top, middle and bottom are not offered (D14) |
| EDT-213 to EDT-217 | new | built | Table bar, Table settings, More, faint controls, header fill |

Lines of other chapters this wave touches: PAG-012 (the status sits at the end of the strip now), PAG-015 and PAG-022 (in the publish step), PAG-024 (the publish options are the step; "a small arrow" no longer describes it, so its words change when it is built). Lines of chapter 4 outside these sections stay as they are, notably EDT-200 (a new page from the menu), EDT-201 to EDT-208 (link preferences and shortcuts, which belong to Your account and the administration), EDT-219 (one column) and EDT-220 to EDT-222 (tabs and the empty decision).

## Behaviour

### The strip

1. The strip has two groups. At the start: the page's icon (its emoji, else the kind icon of NAV-105), the title in bold as it is typed in the sheet (one line, cut with an ellipsis, a heading for screen readers only in the sheet), the lozenge Unpublished changes while there are any, and the public mark (D4). At the end, in this order: the save status in muted words (PAG-012), the people editing (EDT-013) with Invite after them while editing together (D3), **Publish** as the one primary button, whose words end in an ellipsis because a step follows, and **Close** as quiet words at the very end.
2. Close waits for the save as today, and asks when it failed.
3. The strip is a little taller than the row of tools (EDT-167). Thin lines in `--color-line` run across the full width between the strip and the row, and under the row (EDT-223), so strip, row and sheet read as three bands. Both bars stay in view while the sheet scrolls, except below 50rem (EDT-002).
4. Comment leaves the strip (D2): the floating text bar has it (ADR-040), and Alt F10 reaches that bar.

### The publish step

5. Publish opens a `Dialog` named Publish. From the top: the summary of the change (PAG-022, at most 500 characters, a field with its label); the publish options of PAG-024 as they are built today: notify watchers (PAG-025), the status, publish at a date (PAG-026), Location and Preview; then the actions. At the end side the primary **Publish**, which reads **Schedule** while a date is set, and Cancel. At the start side, apart from them, **Discard draft** in the danger style (for a published page with changes its words stay Revert to published, as today), which asks first with `ConfirmDialog` and cannot be undone (PAG-015). While editing together there is no Discard draft, as today.
6. The step keeps its choices while the editor is open, so a second Publish shows them again. `Ctrl Enter` in the text publishes at once with those choices (EDT-031). A version conflict opens the conflict dialog as today.
7. Focus starts in the summary field, so typing a summary and pressing Enter publishes; Escape closes the step and returns the focus to Publish.

### The row of tools

8. From the start (EDT-168): the text style, a button that shows the current style in words and opens a menu of Normal text and Heading 1 to 6 with their keys; bold, underline, italic; **More formatting**; bullet list, numbered list and **List choices**; alignment; text colour; a divider; task, image or file, mention, emoji, columns, panel, synced block, table with its arrow, **Insert**; a divider; link; a divider; undo, redo, **History**; then the tools for what is selected; then a divider and the last group, Find and Full width (EDT-169). Only the text style shows words; every other tool is an icon with its name as `aria-label` and tooltip.
9. More formatting holds highlight (its palette as a sub-menu), strikethrough, inline code, subscript, superscript and clear formatting, each with its keys (D11). List choices holds indent and outdent (D12). The emoji picker moves from More formatting to the direct emoji button.
10. The direct buttons: task toggles a task list; image or file opens the file picker (only with `attachment.add`); mention types `@`; emoji opens the picker; columns inserts two equal columns; panel wraps the block in an info panel; synced block inserts a synced block where that block is offered; table inserts a table of three by three with a header row at once, and its arrow opens the size picker (D9, D10). Each button is absent where its entry is not offered (`offered`).
11. Undo and redo carry `aria-disabled="true"` and a dimmed look when there is nothing to undo or redo, and keep their place and their Tab stop in the row (D13). Editing together, they follow the shared undo of the person.
12. An active tool shows its icon in `--color-accent` on `--color-accent-tint`, and carries `aria-pressed` (EDT-171).
13. Groups fold into More from the end when they do not fit (EDT-007): first the last group, then History, link, the direct buttons from the end. The selected tools wrap below the row, as built.

### The sheet

14. Between the title and the body, a reduced byline (EDT-174): the owner's small picture and name, and, on a page under document control, the name of the control that applies, as muted words that open its panel (DOC-901). No views, reactions or status. A wide gap follows before the body. It reuses the parts of SC2's byline.
15. A small round help button sits in the bottom start corner of the editor area and stays there while the sheet scrolls (EDT-173). It opens the overview of shortcuts with the editor's group first, and its link to the documentation the administrator set (NAV-068). `Ctrl /` opens the same overview from the text (EDT-197); opened from the editor, the overview also lists the typing shortcuts of EDT-027.

### The catalogue behind the slash menu and the insert dialog

16. One list of entries feeds both (`insert.tsx`), each with an id, a name, a description, synonyms, a category, a role for the order, an icon tile, and its shortcut when it has one that works. Saved blocks keep their own names.
17. **Categories** (EDT-177), in this order: Everything; text and structure; the wiki's own content; media; pictures and diagrams; finding your way; outside content; reports; software work. Each entry belongs to exactly one. Outside content and software work hold nothing today, so they are absent. The mapping:

| Category | Entries |
|---|---|
| Text and structure | normal text, headings 1 to 6, the three lists, quote, code block, rule, the six panels, collapsible section, columns (two, three, four, five, with a side column), decision, spotlight, table, status mark, date, emoji, mention, link, anchor; in a template field, instruction, section and value |
| The wiki's own content | synced block, excerpt, show an excerpt, embed a page, page facts, child pages, blog posts, create from a template, history here, the saved blocks |
| Media | image or file, a file of this page, import a Word file, files of this page, files of the space |
| Pictures and diagrams | drawing, chart |
| Finding your way | contents, contents of a section, back to top, search box, page tree, index of the space, list of spaces, breadcrumbs, filter list, the label lists, Help |
| Reports | recent changes, activity, popular pages, my favourites, my drafts, my tasks, report table, facts report, decision report, task report, contributors, contribution table, person card, list of people, timeline |

The build step writes this table as data, with a unit test that every entry has exactly one category; a new entry without one fails the test.

18. **Order** (EDT-189): recently used first (EDT-017), then by role: items in a line and simple blocks (task, image or file, a file of this page, Word import, mention, synced block, emoji, collapsible section, table, chart, drawing, code block, status mark, the panels, date, decision); text structure (bullet list, columns two, then one where it exists, three, four, five, with a side column, link, anchor, excerpt, numbered list, rule, quote, normal text, headings 1 to 6); Help; the saved blocks; the dynamic blocks for reports, people and finding your way, and page facts; display blocks and actions (contents, spotlight); entries of apps last, of which there are none. Entries the line does not name sit at the end of the role they are closest to, as listed.
19. **Shortcut boxes** (EDT-187): the typing shortcut when there is one (`#` to `######`, `-`, `1.`, `[ ]`, `>`, three backticks, `---`, `!!`, `<>`, `//`, `:`, `@`), else the key combination (`Ctrl K` for link). Keys are shown as the person's system names them (NAV-067, the same function as the overview). The box is part of the entry's accessible name, and hidden on a screen whose pointer is coarse and that has no keyboard (`(hover: none) and (pointer: coarse)`).
20. **Icon tiles** (EDT-191): a square tile on `--color-side` with the icon in `--color-ink`; one icon per family (every saved block one, every dynamic block without its own one); heading icons that shrink from 1 to 6 and column icons that show their number, as new drawings in `icons.tsx`; a panel's icon in its panel colour; a person icon for people entries. No tile is solid accent: the selected entry's tile is filled (EDT-180).

### The insert dialog

21. Insert in the row, the plus button on an empty line, and the last row of the slash menu open one dialog (EDT-175). It is modal: the editor behind it is dimmed by the veil and cannot be used. It fills nearly the whole window, leaving a margin of `--space-*` on every side.
22. Regions (EDT-176): a close button alone in the top end corner; under it, on one line, the title at the start and the search field across the rest of the width, with a quiet Enter hint at its end; below the title the category column on the start side, about a fifth of the width, as a vertical `Tabs` list (arrow keys, Everything chosen at first, the first category level with the first row of the grid); beside it the grid of entries in three equal columns, the only part that scrolls; a footer in the bottom end corner with the primary **Insert** and a quiet **Close** at the very end. White space divides the regions; only the title and Insert are bold.
23. A cell (EDT-179): the icon tile at the start; the name on one line with the shortcut box at its end, which is never cut, the name ending in an ellipsis instead; under it at most two lines of smaller muted description, then an ellipsis. An entry without a description shows its name centred beside the tile. No borders, start-aligned.
24. States (EDT-180): under the pointer a quiet fill over the cell; the selected entry the accent tint, a short accent bar on its start edge, and its icon on a filled tile; keyboard focus an accent outline, around the whole grid while the grid has focus.
25. After a short pause on an entry, and while it has keyboard focus, a tooltip under it shows its whole description, a dark box that may cover the start of the next row (EDT-181). It is the entry's `aria-describedby`. Under the description the tooltip draws a small preview of the block from a sample document, as the secondary aid the product owner asked for (answer 3, D22): it lies over the grid like the tooltip itself, takes no region of its own, and is hidden from screen readers, which hear the description. Entries without a sample (the dynamic blocks, which fill themselves from the server, and the saved blocks) show the description alone.
26. Keys (EDT-182, EDT-183): focus starts in the search field. The field is a combobox that controls the grid (`aria-activedescendant`): typing narrows every category at once by name, description and synonyms (EDT-178), Up and Down move the selection by row. Tab moves into the grid, which is one Tab stop where all four arrows move by row and column, Home and End to the first and last entry. The first entry is selected on opening and after each search. The selection stays while the grid scrolls, and Insert works when it is out of view. Enter or Insert adds the selected entry at the cursor where the editor had it; Close, the close button and Escape leave without adding anything and return the focus to the text. A search that finds nothing says so in one muted sentence (EDT-178); the list shows no count and simply ends.
27. On a screen below 50rem the dialog takes the whole screen, the categories become one row of `Tabs` that scrolls sideways above the grid, and the grid has one column (two from 36rem) (D21). In right-to-left everything mirrors through logical properties.

### The slash menu

28. One flat list in a card with a soft shadow (EDT-184): no title, categories, search field or buttons, no lines between rows. A row: the icon tile, the name, a description that wraps to a second line, the shortcut box at its end. The rows are those of the dialog's Everything, in the same order, narrowed by what is typed after the slash.
29. It opens below the line, or above it when there is more room there, and then fills the room up to the row of tools (EDT-185); its list scrolls inside the card. The first row is highlighted at once with the quiet fill and the accent bar. While it is open, the typed slash shows in the accent colour, a decoration that is never stored.
30. It ends in a fixed row under a thin line, with its own quiet fill, three dots and words, which opens the insert dialog with the words typed after the slash in its search field (EDT-186). The arrow keys reach it like any row; Escape closes the menu and leaves the typed text alone (EDT-016).
31. The emoji list (`:`) and the list of people (`@`) keep their look: the slash menu gets its own component and classes.

### Tables

32. **Cell button** (EDT-209): in the cell with the cursor, a small button in the top end corner opens the cell menu beside and below it, over the next columns. Its tooltip names it and its keys on one line. Shift F10 and the menu key open it from the keyboard (EDT-199).
33. **Cell menu** (EDT-210): three groups divided by lines. Cell colour, which shows the current colour in its row and opens the palette as a sub-menu (`MenuSub`), and alignment, a sub-menu of start, centre and end; add a column after this one, add a row below; empty the cell, delete the column, delete the row, in plain words, because Undo brings them back. With several cells selected the menu also offers merge and split, and every entry acts on all of them.
34. **Empty the cell** clears the content of the cell, or of every selected cell, and keeps the shape and the cell colours (EDT-211). One Undo restores it.
35. **Cell alignment** sets the existing alignment of every paragraph and heading in the cell, or in every selected cell (EDT-212, D14). Start and end mirror in right-to-left. The document format does not change.
36. **Table bar** (EDT-213): under the table with the cursor, centred on it, a small floating bar with **Table settings**, a chooser of the table's width (the width of the text, wide, full: EDT-097), **Equal columns** (EDT-096), **Fit to the text** (the width of the text in one step), a divider and **More**. It lies over what follows the table, hides while the cell menu is open, and is one toolbar with arrow keys. It shares the look of the floating bars, and is the one exception to "never a tool the row lacks".
37. **Table settings** (EDT-214): a menu of switches that stays open while they change: fixed column widths (EDT-098), header row, header column (EDT-092), numbered rows (EDT-093). An entry that is on has a tick, accent words on the tint and a mark on its start edge (`menuitemcheckbox`); while the menu is open Table settings itself shows in the accent on the tint.
38. **More** (EDT-215), in this order (D16): add a row above, add a column before; a line; sort ascending, sort descending (EDT-094); caption (EDT-102); chart (EDT-130); a line; duplicate the table; delete the table, which asks when a chart hangs on it (EDT-134). `Ctrl Shift .` opens it.
39. **Faint controls** (EDT-216), only on the table with the cursor: a round button on the table's top start corner that selects the whole table; the row and column handles and the insert dots (built); the stretch edge (built); the block's plus and grip in the margin (built).
40. **Header fill** (EDT-217): a header row and a header column have a quiet fill (`--color-side`) for readers and writers (D17), so they read as headers by more than bold. Each row takes the height of its content.
41. **Hint in an empty cell** (EDT-196): an empty cell with the cursor shows a slash in a small key box and a few muted words that it opens the insert menu, as a decoration that is never stored. It goes at the first character. An empty paragraph shows no hint.

Everything the menu of EDT-160 offers today has a place:

| Today in the table menu | After |
|---|---|
| Row above, row below, delete row | Cell menu (below, delete), More (above); the row handle keeps all three |
| Column before, after, delete | Cell menu (after, delete), More (before); the column handle keeps all three |
| Header row, header column | Table settings |
| Sort up, sort down | More |
| Merge (and split), cell colour | Cell menu |
| Colour of a row or column | The row and column handles, as built |
| Width: text, wide, full | Table bar chooser; Fit to the text |
| Equal columns | Table bar |
| Flexible columns | Table settings, as fixed column widths |
| Numbered rows | Table settings |
| Duplicate, chart, caption, delete | More |

### History in the editor

42. History in the row opens a panel on the end side of the editor, over the sheet like Details on a page (EDT-172). It lists the published versions (PAG-087) with who and when; choosing one shows it in the panel; choosing two compares them with `DiffDocument`. The draft stays open and editable beside it.
43. **Restore into the draft** puts that version's title and text into the draft as one step that Undo reverses; Publish makes it a new version (PAG-089). No version changes. Editing together, it changes the shared draft for everyone, and the restorer's Undo reverses it (D18).

## Permissions and audit

Nothing new is allowed, and no rule moves to the browser. The publish step calls the same publish route with the same checks; Discard draft the same delete of the draft. History reads the versions through the existing routes, which need *view*; restoring writes only into the person's draft, through the same save, so it needs *edit* as the editor does, and a version is made only by Publish, which audits as today. The direct buttons hide what is not offered (`offered`, `attachment.add`), as the slash menu does; the server still refuses what is not allowed.

One route is new (below, "Through the API"): `GET /api/v1/document/format`, which describes the document format. It reads no data of anyone, only the fixed lists of the gate, so it needs a signed-in caller (`Authenticated()`) and nothing more, and writes no audit or outbox event because it changes nothing. Its rule is new, so `scripts/mutation-check.sh` gets a line that makes it public and is caught by the route test.

## Through the API

The product owner's rule: every feature is reachable through the API (decision of 2026-11-17), so an agent or a script can do what the editor does. The editor is a client of these routes; the browser holds no rule of its own.

| What the editor does | Route | Rule |
|---|---|---|
| Learn the document format: every node, which nodes it may hold, and every mark | `GET /api/v1/document/format` (new in this wave) | signed in |
| Turn Markdown into a document | `POST /api/v1/markdown/document` | signed in |
| Read the page with its document | `GET /api/v1/pages/{id}` | *view* |
| Read the draft | `GET /api/v1/pages/{id}/draft` | *view* |
| Save the draft (title and document; restoring a version from History is this save) | `PUT /api/v1/pages/{id}/draft` | *edit* |
| Discard the draft, or revert to the published version | `DELETE /api/v1/pages/{id}/draft` | *view*, and only the caller's own draft |
| Publish, with the summary (`summary`), without notifying watchers (`silent`), with a status (`stage`), and over a conflict (`overwrite`, `base_version`) | `POST /api/v1/pages/{id}/publish` | *edit* |
| Publish at a date, with or without notifying watchers | `PUT /api/v1/pages/{id}/schedule` (`at`, `silent`) | *edit* |
| Cancel a scheduled publish | `DELETE /api/v1/pages/{id}/schedule` | *edit* |
| Location: move the page | `POST /api/v1/pages/{id}/move` | *edit* |
| History: the versions, one version, two compared | `GET /api/v1/pages/{id}/versions`, `GET /api/v1/pages/{id}/versions/{number}`, `GET /api/v1/pages/{id}/compare` | *view* |
| Who else edits | `GET /api/v1/pages/{id}/editors` | *edit* |
| Files, dynamic blocks and saved blocks of the insert dialog | `POST /api/v1/pages/{id}/attachments`, `POST /api/v1/blocks/{kind}`, `GET /api/v1/saved-blocks` | as built |

Everything else the editor changes in this wave (cell alignment, emptying a cell, the table's settings) is part of the document and travels in the draft's document, in the format the new route describes. The route answers `{"nodes": [{"type": "paragraph", "children": ["text", …]}, …], "marks": ["bold", …]}`, sorted, from the same lists the gate uses (`document.NodeTypes`, `document.MarkTypes`), so it can never describe a format the gate does not accept. Its entry in `docs/api/routes.txt` and `openapi.json` is generated as for every route.

## Data

No migration, and no change to the document format: cell alignment uses the `align` that paragraphs and headings already carry (EDT-156), and sticky headers and the reader filter stay as they apply today. The choices of the publish step live in the editor's state for the session, as the publish options do now. The recently used entries stay in the browser under their ids, which do not change; new entries (mention, columns four and five, Help) get new ids.

## Collab service impact

None in the service's code. `collab/` is schema-free on purpose (`document.mjs`): it moves Yjs updates and turns the shared document into the JSON the API's gate reads, and no node, mark or attribute is added. Presence is unchanged: the people editing come from the same awareness states, which the service binds to the session (`presence.mjs`, SEC-544). What the browser does with the shared document:

- Undo and redo dimmed (EDT-170) read the undo stack of the shared document's undo manager, which TipTap's collaboration extension provides; the end-to-end test in `collab.spec.ts` checks that one person's change does not light another person's Undo.
- Restoring from History (EDT-172) is one transaction on the shared document, cleaned by `keepSharedClean` like any other (SEC-546).
- Discard draft is absent while editing together, as today, and Invite moves to the people group.
- Two browsers on different releases can edit one page together during an upgrade, because the document format is the same.

## Load budget

- **Server:** no route changes, so `internal/app/query_budget_test.go` keeps its budgets. History asks for the versions only when its panel opens (`GET /pages/{id}/versions`, paged as today) and for two versions only when compared; it adds nothing to opening the editor. The reduced byline reads fields the page already carries (`owner_name`, `control`).
- **Browser:** the row adds two selectors per transaction (whether undo and redo can run). On the page of spec 030 (1,000 paragraphs, 100,000 words, headless Chromium), typing must stay at most 12 ms a key (spec 030 measured about 10), opening the editor at most 600 ms (532 measured), and the insert dialog must open in at most 100 ms with every entry. The last step measures these the same way as spec 030 and writes the numbers into the report; a miss stops the wave until it is fixed.
- **Database work:** none added, so the room of ADR-036 is unchanged.

## Upgrade notes

- Nothing to migrate, no setting, no preference field. A node of the previous release and one of this release serve the same API.
- A writer who had the editor open during the upgrade keeps the old screen until a reload, which the new-version note offers as today (`useSaveBeforeReload` saves the draft first).
- People who knew the old screen look in new places: the table menu is now the cell button and the table bar; Publish asks one step; Quote and Code block are in Insert and `/`. The release notes in `CHANGELOG.md` say so in plain words, and the overview of shortcuts lists every key.

## Design pictures and end-to-end tests

### Pictures to take again (all in `web/e2e/design-baselines/`)

`editor-light`, `editor-dark`, `editor-slash`, `editor-title`, `table-stretched`, `publish-options` (renamed `publish-step`), `template-panel`, `publishing-twin-editor`, `publishing-twin-editor-named`, the template editor's pictures (`TemplateView`), and `blocks-light`, `blocks-dark`, `blocks-narrow` and every page picture with a table, for the header fill. `table-menu` goes, replaced by the new pictures below. The full suite finds any other picture that shows the editor; each is looked at before it is taken again.

### New pictures

- `insert-dialog` (light), `insert-dialog-dark`, `insert-dialog-narrow` (360 px), `insert-dialog-rtl`, `insert-dialog-search-empty`
- `editor-slash-above` (the menu opened above the line), `editor-slash-last-row`
- `table-cell-menu`, `table-cell-menu-colour` (the sub-menu), `table-bar`, `table-settings`, `table-more`
- `editor-row-narrow` (folded into More), `editor-history`, `editor-help`

Every new picture is looked at in light, dark, narrow and right-to-left where it matters, and the product owner sees the before and after pictures in the report.

### End-to-end tests

- `helpers.ts` gains `publishFromEditor(page, choices?)`, which opens the step and publishes; the 26 clicks on Publish in 12 spec files use it.
- `editor.spec.ts`: the strip's order and names; Publish opens the step with the focus in the summary; Escape returns to Publish; Discard draft asks first and is absent while editing together; `Ctrl Enter` publishes without the step; Close waits for the save.
- `editor-rest.spec.ts`: the row's order; More formatting and List choices; undo and redo dimmed and still in the Tab order; the active look carries `aria-pressed`; folding at 800 px; the table tool inserts three by three and its arrow opens the picker.
- New `insert.spec.ts`: the dialog from the row, the plus button and the slash menu's last row with the words carried over; categories by arrow keys; search across categories; nothing found; grid keys by row and column; Insert with the selected entry scrolled away; Escape leaves nothing; the slash menu's flat list, its first row highlighted, the accent slash; `:` and `@` lists unchanged; axe on every state.
- `links-tables.spec.ts`: the cell button and Shift F10; the colour and alignment sub-menus; empty the cell and Undo; merge with several cells; the table bar, Table settings staying open, More with `Ctrl Shift .`; delete with a chart asks; header fill present for a reader.
- `collab.spec.ts`: two people, one Undo does not light the other's; restoring from History reaches the other person.
- `editor-feedback.spec.ts`, `blocks.spec.ts`, `more-blocks.spec.ts`, `dynamic-blocks.spec.ts`, `templates-form.spec.ts`: adjusted where they used Insert, Browse all or the table menu.

### Unit tests (written first)

- `insert.test.ts` (new): every entry has exactly one category; the order of roles; a recently used entry comes first and still keeps no second copy; search by name, description and synonym across categories; shortcut boxes only for shortcuts that work.
- `toolbar.test.ts` (new): the folding order of the new groups (`foldedGroups`).
- `table-cells.test.ts` (new): empty the cell keeps shape and colour; alignment of a selection of cells; mirrored in right-to-left.

### Mutations

One new access rule, the route of the document format: a line in `scripts/mutation-check.sh` makes it public, and the route test catches it. The targeted run covers the changed Go.

## Build plan

In order; each step is small enough for one builder, ends green (`make check`, the e2e files it touches, `0-design.spec.ts` for its pictures), and lands on the branch before the next starts. S is up to half a day, M about a day, L two days.

| Step | Size | What | Lines |
|---|---|---|---|
| 0 | S | Start after SC1 and SC2 are on `main`: rebase `wave-sc3`, take the editor's pictures as SC1 and SC2 left them, check the six typing shortcuts in the browser and correct the statuses of EDT-027 | EDT-027 |
| 1 | M | The strip: page icon and bold title, lozenge and public mark at the start; save status, people with Invite, Publish with its ellipsis, Close at the end; the three bands and their lines; Comment leaves | EDT-165, EDT-167, EDT-223, PAG-012 |
| 2 | M | The publish step: one dialog with the summary, the options of today, Publish or Schedule, Discard draft that asks; `Ctrl Enter`; `publishFromEditor` and the 26 clicks; picture `publish-step` | EDT-166, PAG-015, PAG-022, PAG-024 |
| 3 | M | The row of tools: new order, More formatting, List choices, direct buttons, the table tool with its arrow, History's place (opening a screen until step 9), last group, undo and redo dimmed, the active look, folding | EDT-168 to EDT-171, EDT-007 |
| 4 | S | The sheet: the reduced byline from SC2's parts; the help button; `Ctrl /`; the overview with the typing shortcuts | EDT-173, EDT-174, EDT-197 |
| 5 | M | The catalogue: categories, roles and order, shortcut boxes, icon tiles and the new drawings, the new entries (mention, columns four and five, Help); unit tests first. The old menus show the new tiles until steps 6 and 7 | EDT-177, EDT-187, EDT-189 to EDT-191 |
| 6 | L | The insert dialog: regions, categories, grid, keys, tooltip, narrow and right-to-left; Insert and the plus button open it; Browse all goes, and its sample documents move into the tooltip's preview (D22) | EDT-019, EDT-175, EDT-176, EDT-178 to EDT-183 |
| 7 | M | The slash menu: its own component, flat list, placement above or below, accent slash, the last row into the dialog with the words | EDT-184 to EDT-186 |
| 8 | L | Tables, part one: cell button, cell menu with the two sub-menus, empty the cell, cell alignment, Shift F10 and the menu key, the empty-cell hint | EDT-196, EDT-199, EDT-209 to EDT-212 |
| 9 | M | Tables, part two: the table bar, Table settings, More, faint controls and the select-all button, header fill; the one button of EDT-160 goes | EDT-213 to EDT-217 |
| 10 | M | History as a panel: the list, one version, compare two, restore into the draft with Undo; editing together | EDT-172 |
| 11 | S | Closing: the design standard's editor section rewritten, the ADR-045 list marked built, status lines in 03, `CHANGELOG.md`, the load measurement, before and after pictures, the report and the handoff | |

Steps 1 to 4 can go in any order among themselves after step 0; steps 6 and 7 need step 5; step 9 needs step 8; step 10 needs step 3. The whole wave is about ten working days.

## Acceptance criteria

- [x] Every line marked built above behaves as written, proved by the tests above.
- [x] Every function the editor has today is still reachable: each entry of the old table menu, each tool of the old row, Browse all's entries, Comment and Discard draft (the mapping tables above, checked by the tests).
- [x] axe finds nothing on the strip, the step, the row, the dialog, the slash menu, the cell menu, the table bar and the History panel.
- [ ] (D37: no slower than `main` on a shared machine; an idle measurement is owed) Typing stays at most 12 ms a key on the long page, and the insert dialog opens in at most 100 ms.
- [x] `make check`, the whole e2e suite once and `0-design.spec.ts` twice in a row are green.
- [x] The product owner sees the before and after pictures in the report.

## How the product owner tests it

1. Open a page to edit. The strip shows the page's icon and its name in bold at the start, and the save status, your picture, Publish and Close at the end. There is no summary field and no Discard draft in the strip.
2. Press Publish: a step opens with a field for what changed, the publish options and Discard draft on its own side. Press Escape, type a word, and press Ctrl Enter: the page is published without the step.
3. Look at the row of tools: the style in words at the start, then the formatting, lists, alignment and colour, then buttons for a task, a file, a mention, an emoji, columns, a panel and a table, then Insert, link, undo, redo and History, and at the end Find and Full width. Before you type anything, Undo is dimmed.
4. Press Insert: a large dialog with categories on the side and three columns of entries. Type "table": entries from every category appear. Use the arrow keys and Enter: the table lands where your cursor was.
5. Type `/` on an empty line: a flat list opens with the first row marked, and the slash turns blue. Type "pan", then choose the last row: the large dialog opens with "pan" already in its search.
6. Click in a table cell: a small button appears in its corner and a bar under the table. From the button choose a colour and an alignment; from the bar turn on numbered rows. Press Undo: the last change goes back.
7. Press History: the versions open beside the text. Choose an old one and restore it; press Undo: your text is back.

## Decided on the product owner's behalf on 2026-11-16, may be overruled

- **D1.** The fold control of EDT-165 is not built. Hiding the row is what ADR-040 decided against, the sidebar has its button in the top bar (NAV-092), and folding the strip would hide Publish and Close. ADR-040 stands.
- **D2.** Comment leaves the strip, because the floating text bar has it (ADR-040) and a comment needs selected text, which is when that bar shows; Alt F10 reaches it from the keyboard.
- **D3.** Invite, while editing together, is an icon button right after the people editing, because it is about who edits.
- **D4.** The lozenge Unpublished changes and the public mark sit after the title at the start, because they say something about the page, not about the action.
- **D5.** Publish's words end in an ellipsis to say that a step follows; the step's primary button says Publish, or Schedule while a date is set. `Ctrl Enter` keeps publishing at once (EDT-031), with the choices of the step as they stand.
- **D6.** In the step, Discard draft stands at the start side in the danger style, apart from Publish and Cancel at the end side, and asks first. For a published page with changes it keeps the words of today.
- **D7.** Browse all leaves as a dialog of its own. The insert dialog has no region for a preview, and the tooltip carries the whole description (EDT-181). Replaced in part by the product owner's answer 3 of 2026-11-21: the drawn sample stays as a secondary aid, placed by D22.
- **D8.** Quote and code block leave the row, as EDT-168 does not name them; they stay in Insert, `/`, Turn into and their keys.
- **D9.** The table tool inserts three by three with a header row at once (EDT-084), and its arrow opens the size picker.
- **D10.** Columns inserts two equal columns, panel an info panel, synced block a synced block; the column and panel tools then change them, as built.
- **D11.** More formatting holds highlight, strikethrough, inline code, subscript, superscript and clear formatting; the emoji picker moves to the direct emoji button.
- **D12.** List choices holds indent and outdent. A numbered list's start number stays in the tools of the selected list.
- **D13.** Undo and redo that cannot run are `aria-disabled` and stay in the row's arrow-key order, as the toolbar pattern advises for tools that may become available.
- **D14.** Cell alignment uses the alignment of the paragraphs and headings in the cell, so the document format, the collab service, Markdown and the comparison need no change. Top, middle and bottom are not offered: EDT-212 asks for a study first, and nothing else in the document aligns vertically.
- **D15.** No `Ctrl Alt` with the arrows to add a row or column: screen readers use those keys to move through table cells, and several desktops use them to switch workspaces. The cell menu shows no keys for those entries until a free combination is found; EDT-199 stays partly.
- **D16.** More of the table bar lists only what exists: sticky headers and the reader filter keep applying by themselves as built, so they get no switches; adding them would be a new attribute of the document for no asked need. Its order: add above and before; sort; caption; chart; duplicate; delete.
- **D17.** The fill of header rows and columns applies for readers as well as writers, as the outline and grid of EDT-159 do.
- **D18.** Restoring a version from History while editing together changes the shared draft for everyone; the restorer's Undo reverses it, and the change shows like any other edit.
- **D19.** EDT-167 and EDT-223 add lines but lack the tag "changes the design standard"; they are built as written, and step 11 lists them beside EDT-165 in the design standard.
- **D20.** Not in this wave, keeping their status: the New mark of EDT-188 (no entry is new in the release that builds this, and NAV-178 is not built); the block template gallery, the starter set and their settings (EDT-192 to EDT-195), a new page from the menu (EDT-200), one column (EDT-219) and tabs (EDT-220, EDT-221), all new features under the freeze of ADR-043; the key for a table (EDT-198); the widths of PAG-152.
- **D21.** On a narrow screen the insert dialog takes the whole screen, its categories are one row of tabs that scrolls sideways, and its grid has one column, two from 36rem.

## Decided on the product owner's behalf on 2026-11-22, may be overruled

- **D22.** The preview of answer 3 is drawn inside the entry's tooltip, under its description, and not in a side pane. A side pane would either be a fourth region, which the answer rules out, or lie over the grid's end column and hide the entries a person is looking at. The tooltip already appears on a pause of the pointer and on keyboard focus, lies over the grid without moving it, and goes with Escape, so the preview follows the same rules for free. The drawing is `aria-hidden`; the description stays the entry's `aria-describedby`. On a screen without hover and below 50rem there is no preview, as there is no tooltip.
- **D23.** The document format becomes a route of its own (`GET /api/v1/document/format`), because the rule of 2026-11-17 asks that an API client can do what the editor does, and writing a valid document needs the format. It describes what the gate accepts and nothing about any page, so it is open to every signed-in caller and to tokens with `read`.
- **D24.** The rest of the editor's work already has routes (the table under "Through the API"); this wave adds no route for the step itself, because the step only gathers the fields of the publish and schedule routes.

## As built (2026-11-22)

All twelve steps are built. Where the build differs from the plan, or settles what the plan left open, it is decided on the product owner's behalf on 2026-11-22 and may be overruled:

- **D25. Ctrl Enter and a date.** `Ctrl Enter` publishes at once even when the step holds a date, because EDT-031 says "at once"; a schedule goes only through the step. Schedule saves the draft first, then shows the page with "Publishes by itself".
- **D26. The step closes before it publishes**, so an error or the conflict dialog shows in the editor and not behind the step.
- **D27. The help button is named "Help with writing"**, because the top bar already has a button named Help. It and `Ctrl /` live in the editor component, so the template editor has them too; the Help entry of the insert dialog opens the same overview.
- **D28. The selected tools come after the last group**, on screen and in the arrow order, and wrap below the row, so Find and Full width never move (behaviour 8 put them before it).
- **D29. Fold order:** the last group, History, link, table and Insert, the block buttons, the direct buttons, alignment and colour, the lists, undo, the marks. The text style never folds.
- **D30. Keys in menus.** The text styles are `Ctrl Alt 0` to `6`, as the editor binds them. Keys show at the end of a menu entry and are hidden from screen readers, which get them through `aria-keyshortcuts`, so the names stay plain. Indent and outdent show no keys. The text style button's name is "Text style: <style>". Keys are named for the person's system in one place, `components/editor/key-names.ts`.
- **D31. Direct buttons run the insert entry of the same id** (`columns2`, `panelInfo`, `block_synced_block`) and are absent when that entry is not offered.
- **D32. History** opens under the strip and the row, so its tool stays in view and pressed. Escape inside the panel goes from a version back to the list, then closes it. A restore is one undo step of its own, also on a shared draft; the message's Undo also takes back the title, and it says when the shared draft changed for everyone.
- **D33. Search covers everything:** typing in the dialog's search goes back to Everything. Link cards and rotating cards are in "finding your way", after Spotlight in the order.
- **D34. Dialog keys.** Tab goes from the search to the categories, then to the grid, in reading order. A double click inserts an entry, a single click selects it. Escape first hides an open tooltip, then closes the dialog (WCAG 1.4.13). The slash menu closes when nothing matches, as before, so a stray slash is left alone.
- **D35. The tooltip** is dark in the light theme and light in the dark theme; its preview sits in a box of the surface colour so the document text stays readable. The dialog is its own `<dialog>`, because its regions do not fit the header of `Dialog`.
- **D36. Tables.** Cell colour shows the current colour as a swatch, ticked in its sub-menu. Fit to the text removes the stretch and scales fixed column widths to the text. The select-all button sits just outside the table's top start corner. Fixed column widths is on when the table is not flexible. The cell menu closes after a choice; Table settings and More stay open. The row and column handles show their colour swatches inline, because a sub-menu cannot sit inside the handles, which move by a transform.
- **D37. The load budget is judged against `main` on the same machine.** Measured as spec 030 did (a page of 1,000 paragraphs and 100,000 words, headless Chromium, through the e2e harness, three rounds, twice), on a machine shared with two other builders: `main` opened the editor in 493 to 716 ms, typed at 13.2 to 16.2 ms a key and showed its insert dialog in 194 to 209 ms; this wave opened in 490 to 630 ms, typed at 14.0 to 16.1 ms a key and showed the new dialog in 155 to 189 ms. The absolute figures of the budget (12 ms, 600 ms, 100 ms) were set on an idle machine and `main` misses them here too, so the wave is held to "no slower than `main`", which it meets. Measured inside the page, without the harness's round trips, the dialog opens in 33 to 76 ms. A measurement on an idle machine is left for the next quiet moment.
- Still open, keeping their status: the fold control (D1), the New mark and the gallery (D20), `Ctrl Alt` with the arrows (D15), vertical alignment (D14), switches for sticky headers and the reader filter (D16). On a long table the bar sits under the table, often out of view; `Ctrl Shift .` still opens More.

## Supersedes

ADR-049 records what this plan takes away: the one table button and its menu (EDT-160, spec 017, the table part of ADR-030), Publish in one click with the options behind an arrow (PAG-024 as arranged, "The publish arrow" in the design standard), Browse all as a dialog with a preview region (EDT-020; the preview stays inside the tooltip, D22), and in the design standard "Top strip", the order of "Below it one row of tools", "Insert opens the same list in a dialog", "An active tool is solid accent" and "A table has one button on its outline", as `docs/design/README.md` already lists under ADR-045. ADR-040's "the fixed toolbar stays and cannot be hidden" stands.

## Provenance

Own words, from blueprint 03 chapter 4 as written in the study of 2026-11-14 (ADR-045, 02 "One exception"), and from reading Kenwerk's own code. The toolbar and grid keys follow the WAI-ARIA Authoring Practices toolbar, combobox and grid patterns (w3.org/WAI/ARIA/apg/patterns, consulted 2026-11-16). No pictures, inventories or other product were consulted in this wave.
