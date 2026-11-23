// SPDX-License-Identifier: Apache-2.0
// Spec 023: links that follow their page, and tables with handles.
import type { Browser, Page } from '@playwright/test';
import {
  ADMIN,
  checkAccessibility,
  createUser,
  editorSettled,
  expect,
  grant,
  login,
  newSpace,
  publishedPage,
  test,
  unique,
  VIEWER,
  publishFromEditor,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
});

const prose = (page: Page) => page.locator('.prose');
const body = (page: Page) => page.locator('.prose.editing');

async function publishDocument(page: Page, id: string, title: string, content: unknown[], base = 1) {
  const answer = await page.request.post(`/api/v1/pages/${id}/publish`, {
    data: { title, document: { type: 'doc', content }, base_version: base },
  });
  expect(answer.ok(), await answer.text()).toBeTruthy();
}

async function editing(page: Page, title: string) {
  const space = await newSpace(page, `${title} space`);
  const id = await publishedPage(page, space.id, title, 'start');
  await page.goto(`/pages/${id}/edit`);
  await body(page).click();
  await editorSettled(page);
  await page.keyboard.press('Control+End');
  return { id, space };
}

async function publish(page: Page) {
  await publishFromEditor(page);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
}

async function newTable(page: Page, rows = 3, columns = 3) {
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Choose the size of a table' }).click();
  const dialog = page.getByRole('dialog', { name: 'New table' });
  await dialog.getByLabel('Rows').fill(String(rows));
  await dialog.getByLabel('Columns').fill(String(columns));
  await dialog.getByRole('button', { name: 'Insert table' }).click();
  await expect(body(page).locator('table')).toBeVisible();
  await editorSettled(page);
}

/** Someone else in their own browser, who can read the space. */
async function viewerOf(page: Page, browser: Browser, spaceId: string) {
  const email = `${unique('viewer')}@example.com`;
  const id = await createUser(browser, email);
  await grant(page, spaceId, { type: 'user', id }, VIEWER);
  const context = await browser.newContext({ baseURL: 'http://localhost:8080' });
  const other = await context.newPage();
  await login(other, email);
  return other;
}

const pageLink = (id: string, attrs: object = {}) => ({ type: 'pageLink', attrs: { page_id: id, ...attrs } });
const line = (...content: unknown[]) => ({ type: 'paragraph', content });

test('a reader who may not see a page gets no word of it, in a link, a tag or a card', async ({
  page,
  browser,
}) => {
  const space = await newSpace(page, 'Hidden links');
  const secret = await publishedPage(page, space.id, 'Merger with Initech', 'Secret words');
  const open = await publishedPage(page, space.id, 'Open plan', 'x');
  await publishDocument(page, open, 'Open plan', [
    line(pageLink(secret)),
    line(pageLink(secret, { display: 'tag' })),
    { type: 'pageCard', attrs: { page_id: secret } },
  ]);
  const reader = await viewerOf(page, browser, space.id);
  const restricted = await page.request.put(`/api/v1/pages/${secret}/restrictions`, {
    data: {
      kind: 'view',
      subjects: [
        {
          type: 'user',
          id: ((await (await page.request.get('/api/v1/me')).json()) as { user: { id: string } }).user.id,
        },
      ],
    },
  });
  expect(restricted.ok(), await restricted.text()).toBeTruthy();

  await reader.goto(`/pages/${open}`);
  const shown = reader.locator('.prose');
  await expect(shown.locator('.link-gone')).toHaveCount(3);
  await expect(shown).not.toContainText('Merger');
  await expect(shown).not.toContainText('Secret words');
  await expect(shown.locator(`a[href*="${secret}"]`)).toHaveCount(0);

  await page.goto(`/pages/${open}`);
  await expect(prose(page).getByRole('link', { name: 'Merger with Initech' })).toHaveCount(3);
});

test('a link without words of your own follows the title, and a card shows what it should', async ({
  page,
}) => {
  const { space } = await editing(page, 'Following');
  const target = await publishedPage(page, space.id, 'Zebrapage target', 'Words on the target');
  await page.keyboard.press(' ');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Link' });
  await dialog.getByLabel('Find a page').fill('Zebrapage');
  await dialog.getByRole('button', { name: 'Zebrapage target' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(body(page).getByRole('link', { name: 'Zebrapage target' })).toBeVisible();

  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+k');
  await dialog.getByLabel('Find a page').fill('Zebrapage');
  await dialog.getByRole('button', { name: 'Zebrapage target' }).click();
  await dialog.getByLabel('Show as').selectOption('Card');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await publish(page);

  const card = prose(page).locator('.page-card');
  await expect(card).toContainText('Zebrapage target');
  await expect(card).toContainText('Words on the target');
  await expect(card).toContainText('Following space');

  const renamed = await page.request.patch(`/api/v1/pages/${target}`, { data: { title: 'A new name' } });
  expect(renamed.ok(), await renamed.text()).toBeTruthy();
  await page.reload();
  await expect(prose(page).getByRole('link', { name: 'A new name' })).toHaveCount(2);
  await expect(prose(page)).not.toContainText('Zebrapage');
  await checkAccessibility(page);
});

test('the link dialog offers recent pages first', async ({ page }) => {
  const space = await newSpace(page, 'Recent');
  const seen = await publishedPage(page, space.id, 'Page seen lately', 'x');
  const id = await publishedPage(page, space.id, 'The writer', 'start');
  await page.goto(`/pages/${seen}`);
  await expect(page.getByRole('heading', { name: 'Page seen lately', level: 1 })).toBeVisible();
  await page.goto(`/pages/${id}/edit`);
  await body(page).click();
  await editorSettled(page);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Link' });
  await expect(dialog.getByText('Recent pages')).toBeVisible();
  await dialog.getByRole('button', { name: 'Page seen lately' }).click();
  await expect(dialog.getByLabel('Link address')).toHaveValue(`/pages/${seen}`);
});

test('a link goes to a heading on another page, and to an anchor', async ({ page }) => {
  const { space } = await editing(page, 'Places');
  const target = await publishedPage(page, space.id, 'Long story', 'x');
  await publishDocument(page, target, 'Long story', [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Next steps' }] },
    line({ type: 'anchor', attrs: { name: 'the-list' } }, { type: 'text', text: 'the list' }),
  ]);
  await page.keyboard.press(' ');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Link' });
  await dialog.getByLabel('Find a page').fill('Long story');
  await dialog.getByRole('button', { name: 'Long story' }).click();
  const place = dialog.getByLabel('Where on the page');
  await expect(place.locator('option')).toHaveCount(3);
  await place.selectOption('next-steps');
  await expect(dialog.getByLabel('Link address')).toHaveValue(`/pages/${target}#next-steps`);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await publish(page);

  await prose(page).getByRole('link', { name: 'Long story' }).click();
  await expect(page).toHaveURL(new RegExp(`/pages/${target}#next-steps$`));
  await expect(page.locator('#next-steps')).toBeInViewport();
});

test('a placeholder starts a page below it, and leads there from then on', async ({ page }) => {
  const { id, space } = await editing(page, 'Planned');
  await page.keyboard.press(' ');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Link' });
  await dialog.getByLabel('Find a page').fill('Meeting notes');
  await dialog.getByRole('button', { name: 'Link to a new page: Meeting notes' }).click();
  await expect(body(page).locator('.link-placeholder')).toHaveText('Meeting notes');
  await publish(page);

  await page.goto(`/spaces/${space.key}/settings?section=placeholders`);
  const list = page.getByRole('table');
  await expect(list).toContainText('Meeting notes');
  await expect(list.getByRole('link', { name: 'Planned' })).toBeVisible();

  await page.goto(`/pages/${id}`);
  await prose(page).getByRole('button', { name: 'Meeting notes' }).click();
  await expect(page).toHaveURL(/\/pages\/[0-9a-f-]+\/edit$/);
  const started = /\/pages\/([0-9a-f-]+)\/edit$/.exec(page.url())?.[1] ?? '';
  expect(started).not.toBe(id);
  const facts = await (await page.request.get(`/api/v1/pages/${started}`)).json();
  expect(facts.parent_id).toBe(id);
  expect(facts.title).toBe('Meeting notes');

  await page.goto(`/pages/${id}`);
  await expect(prose(page).getByRole('link', { name: 'Meeting notes' })).toHaveAttribute(
    'href',
    `/pages/${started}`,
  );
});

test('a reader who may not create pages is told so at a placeholder', async ({ page, browser }) => {
  const space = await newSpace(page, 'No create');
  const id = await publishedPage(page, space.id, 'Planned', 'x');
  await publishDocument(page, id, 'Planned', [
    line({ type: 'placeholderLink', attrs: { title: 'Meeting notes' } }),
  ]);
  const reader = await viewerOf(page, browser, space.id);
  await reader.goto(`/pages/${id}`);
  await reader.locator('.prose').getByRole('button', { name: 'Meeting notes' }).click();
  await expect(reader.locator('.toast')).toBeVisible();
  await expect(reader).toHaveURL(new RegExp(`/pages/${id}$`));
});

test('a selected link gets its tools in the row', async ({ page }) => {
  const { space } = await editing(page, 'Tools');
  // A word no other page holds keeps the search to this one page. The exact name keeps
  // the click off "Link to a new page: …", which is offered until the search answers.
  const title = unique('Tooltarget');
  const target = await publishedPage(page, space.id, title, 'x');
  await publishDocument(page, target, title, [line({ type: 'text', text: 'x' })]);
  await page.keyboard.press(' ');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Link' });
  await dialog.getByLabel('Find a page').fill(title);
  await dialog.getByRole('button', { name: title, exact: true }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  const link = body(page).getByRole('link', { name: title });
  await link.click();
  await expect(page.getByRole('button', { name: 'Open link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await page.getByLabel('Show as').selectOption('Tag');
  await expect(body(page).locator('.page-tag')).toHaveText(title);

  await body(page).locator('.page-tag').click();
  await page.getByRole('button', { name: 'Remove link' }).click();
  await expect(body(page).locator('.page-tag')).toHaveCount(0);
  await expect(body(page)).toContainText(title);
});

test('a new table asks for its size, and Enter takes three by three', async ({ page }) => {
  await editing(page, 'Sizes');
  await newTable(page, 2, 5);
  await expect(body(page).locator('tr')).toHaveCount(2);
  await expect(body(page).locator('tr').first().locator('th')).toHaveCount(5);

  await page.keyboard.press('Control+End');
  await page.locator('.prose.editing').press('Control+End');
  await body(page).locator('tr').last().locator('td').last().click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'cannot hold another table' })).toBeVisible();
  await expect(body(page).locator('table')).toHaveCount(1);
});

test('a row has a handle with its menu, and a plus inserts exactly there', async ({ page }) => {
  await editing(page, 'Handles');
  await newTable(page, 3, 2);
  const rows = body(page).locator('tr');
  await rows.nth(1).locator('td').first().click();
  await editorSettled(page);
  await page.keyboard.type('middle');

  await page.getByRole('button', { name: 'Add row below' }).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText('middle');
  await expect(rows.nth(2)).not.toContainText('middle');

  await rows.nth(1).locator('td').first().click();
  await page.getByRole('button', { name: 'Row options' }).click();
  await expect(body(page).locator('.selectedCell')).toHaveCount(2);
  await page.getByRole('menuitem', { name: 'Move row down' }).click();
  await expect(rows.nth(2)).toContainText('middle');
  await checkAccessibility(page);
});

test('a column can be selected, moved and deleted from its handle', async ({ page }) => {
  await editing(page, 'Columns');
  await newTable(page, 2, 3);
  const header = body(page).locator('tr').first().locator('th');
  await header.nth(0).click();
  await editorSettled(page);
  await page.keyboard.type('first');
  await page.getByRole('button', { name: 'Column options' }).click();
  await page.getByRole('menuitem', { name: 'Move column forward' }).click();
  await expect(header.nth(1)).toHaveText('first');
  await page.getByRole('menuitem', { name: 'Delete column' }).click();
  await expect(header).toHaveCount(2);
  await expect(body(page)).not.toContainText('first');
});

test('dragging a handle moves a row', async ({ page }) => {
  await editing(page, 'Dragging');
  await newTable(page, 4, 2);
  const rows = body(page).locator('tr');
  await rows.nth(1).locator('td').first().click();
  await editorSettled(page);
  await page.keyboard.type('moved');
  const handle = page.locator('.table-line.row-line');
  const from = await handle.boundingBox();
  const to = await rows.nth(3).boundingBox();
  if (!from || !to) throw new Error('nothing to drag');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(rows.nth(3)).toContainText('moved');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

// The line that shows where a dragged row or column lands appears only during the drag. It
// used to show all the time, through the first row, because the global .row and .column
// layout classes beat the hidden attribute (spec 055).
test('the drop line shows only while a row is dragged', async ({ page }) => {
  await editing(page, 'Drop line');
  await newTable(page, 4, 2);
  const rows = body(page).locator('tr');
  await rows.nth(1).locator('td').first().click();
  await editorSettled(page);
  const drops = page.locator('.table-frame .table-drop');
  await expect(drops.first()).toBeAttached();
  await expect(drops.filter({ visible: true })).toHaveCount(0);

  const handle = page.getByRole('button', { name: 'Row options' });
  const from = await handle.boundingBox();
  const to = await rows.nth(3).boundingBox();
  if (!from || !to) throw new Error('nothing to drag');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 8 });
  await expect(drops.filter({ visible: true })).toHaveCount(1);
  await page.mouse.up();
  await expect(drops.filter({ visible: true })).toHaveCount(0);
});

test('shift on a handle selects several rows', async ({ page }) => {
  await editing(page, 'Several');
  await newTable(page, 4, 2);
  const rows = body(page).locator('tr');
  await rows.nth(1).locator('td').first().click();
  await page.locator('.table-line.row-line button').click();
  await page.keyboard.press('Escape');
  await rows.nth(3).locator('td').first().hover();
  await page.locator('.table-line.row-line button').click({ modifiers: ['Shift'] });
  await expect(body(page).locator('.selectedCell')).toHaveCount(6);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('numbers, a caption and a flexible table reach the reader', async ({ page }) => {
  await editing(page, 'Settings');
  await newTable(page, 3, 2);
  await body(page).locator('td').first().click();
  await tableBar(page).getByRole('button', { name: 'Table settings' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Number the rows' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Fixed column widths' }).click();
  await page.keyboard.press('Escape');
  await tableBar(page).getByRole('button', { name: 'More table options' }).click();
  await page.getByRole('menuitem', { name: 'Caption' }).click();
  const dialog = page.getByRole('dialog', { name: 'Caption' });
  await dialog.getByLabel('Words of the caption').fill('Costs per year');
  await dialog.getByLabel('Show it below the table').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(body(page).locator('caption')).toHaveText('Costs per year');
  await page.keyboard.press('Escape');
  await publish(page);

  const wrapper = prose(page).locator('.tableWrapper');
  await expect(wrapper).toHaveAttribute('data-numbered', '');
  await expect(wrapper).toHaveAttribute('data-flexible', '');
  await expect(wrapper.locator('caption')).toHaveText('Costs per year');
  const number = await wrapper
    .locator('tr')
    .nth(1)
    .locator('td')
    .first()
    .evaluate((cell) => getComputedStyle(cell, '::before').content);
  expect(number).toContain('counter');
  await checkAccessibility(page);
});

test('a flexible table shrinks with the window and another scrolls', async ({ page }) => {
  const space = await newSpace(page, 'Narrow');
  const id = await publishedPage(page, space.id, 'Wide', 'x');
  const wide = (attrs: object) => ({
    type: 'table',
    attrs,
    content: [
      {
        type: 'tableRow',
        content: [0, 1, 2].map(() => ({
          type: 'tableCell',
          attrs: { colwidth: [400] },
          content: [line({ type: 'text', text: 'words' })],
        })),
      },
    ],
  });
  await publishDocument(page, id, 'Wide', [wide({}), wide({ flexible: true })]);
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto(`/pages/${id}`);
  const fits = (index: number) =>
    prose(page)
      .locator('.tableWrapper')
      .nth(index)
      .evaluate((frame) => frame.scrollWidth <= frame.clientWidth);
  await expect(prose(page).locator('.tableWrapper')).toHaveCount(2);
  expect(await fits(0)).toBe(false);
  expect(await fits(1)).toBe(true);
});

test('cells from a spreadsheet land as cells, in a table and outside one', async ({ page }) => {
  await editing(page, 'Paste');
  const paste = (text: string) =>
    body(page).evaluate((element, words) => {
      const data = new DataTransfer();
      data.setData('text/plain', words);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, text);
  await page.keyboard.press('Enter');
  await paste('name\tcost\nfood\t12\n');
  await expect(body(page).locator('table')).toHaveCount(1);
  await expect(body(page).locator('td')).toHaveCount(4);
  await expect(body(page).locator('tr').nth(1).locator('td').nth(1)).toHaveText('12');

  await body(page).locator('td').first().click();
  await editorSettled(page);
  await paste('x\ty\n');
  await expect(body(page).locator('table')).toHaveCount(1);
  await expect(body(page).locator('tr').first().locator('td').nth(1)).toHaveText('y');
});

test('a table in a stored document keeps working in the reader with its handles gone', async ({ page }) => {
  await editing(page, 'Reader');
  await newTable(page, 2, 2);
  await publish(page);
  await expect(page.locator('.table-line')).toHaveCount(0);
  await expect(page.locator('.table-plus')).toHaveCount(0);
});

// Spec 082, steps 8 and 9: the cell button, its menu, and the bar under the table.

const tableBar = (page: Page) => page.getByRole('toolbar', { name: 'Table', exact: true });
const cellButton = (page: Page) => page.getByRole('button', { name: /^Cell options/ });
const cellMenu = (page: Page) => page.getByRole('menu', { name: /^Cell options/ });

const tableCell = (type: string, text: string) => ({
  type,
  content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [{ type: 'paragraph' }],
});
const tableOf = (...rows: [string, ...string[]][]) => ({
  type: 'table',
  content: rows.map((texts, index) => ({
    type: 'tableRow',
    content: texts.map((text) => tableCell(index === 0 ? 'tableHeader' : 'tableCell', text)),
  })),
});

/** A page with this table, open in the editor with the cursor in its first body cell. */
async function editingTable(
  page: Page,
  title: string,
  table = tableOf(['Name', 'Team'], ['Robin', 'Docs'], ['Sam', 'Web']),
) {
  const space = await newSpace(page, `${title} space`);
  const id = await publishedPage(page, space.id, title, 'x');
  await publishDocument(page, id, title, [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
    table,
  ]);
  await page.goto(`/pages/${id}/edit`);
  await body(page).locator('td').first().click();
  await editorSettled(page);
  return { id, space };
}

test('the cell with the cursor has a button in its top end corner, and Shift F10 opens its menu', async ({
  page,
}) => {
  await editingTable(page, 'Cell button');
  const cell = await body(page).locator('td').first().boundingBox();
  const button = await cellButton(page).boundingBox();
  if (!cell || !button) throw new Error('no cell or no button');
  expect(button.x + button.width).toBeLessThanOrEqual(cell.x + cell.width + 1);
  expect(button.x).toBeGreaterThan(cell.x + cell.width / 2);
  expect(Math.abs(button.y - cell.y)).toBeLessThan(button.height);
  await expect(cellButton(page)).toHaveAttribute('title', 'Cell options (Shift+F10)');

  await page.keyboard.press('Shift+F10');
  await expect(cellMenu(page)).toBeVisible();
  await expect(cellMenu(page).getByRole('menuitem').first()).toBeFocused();
  await expect(tableBar(page)).toBeHidden();
  await checkAccessibility(page);
  await page.keyboard.press('Escape');
  await expect(cellMenu(page)).toHaveCount(0);
  await expect(body(page)).toBeFocused();
  await expect(tableBar(page)).toBeVisible();

  await page.keyboard.press('ContextMenu');
  await expect(cellMenu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cellMenu(page)).toHaveCount(0);
  await expect(body(page)).toBeFocused();

  // Outside a table the keys do what they did before.
  await body(page).locator('p').first().click();
  // The editor takes the new place of the cursor from the browser a moment after the click; a
  // key sent before that still finds the cell. The cell button goes once the cursor has left.
  await expect(cellButton(page)).toHaveCount(0);
  await page.keyboard.press('Shift+F10');
  await expect(cellMenu(page)).toHaveCount(0);
});

test('the colour and alignment of a cell are sub-menus, and act on every selected cell', async ({ page }) => {
  await editingTable(page, 'Cell colour');
  const cells = body(page).locator('td');
  await cells.nth(0).click({ modifiers: [] });
  await cells.nth(1).click({ modifiers: ['Shift'] });
  await expect(body(page).locator('.selectedCell')).toHaveCount(2);

  await cellButton(page).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Cell colour' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const colours = page.getByRole('menu', { name: 'Cell colour' });
  await expect(colours.getByRole('menuitemradio', { name: 'None' })).toBeFocused();
  await expect(colours.getByRole('menuitemradio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
  await checkAccessibility(page);
  await colours.getByRole('menuitemradio', { name: 'Yellow' }).click();
  await expect(cellMenu(page)).toHaveCount(0);
  await expect(body(page).locator('td.mark-yellow')).toHaveCount(2);

  await cellButton(page).click();
  await expect(
    page.getByRole('menuitem', { name: 'Cell colour' }).locator('.swatch.mark-yellow'),
  ).toBeVisible();
  await page.getByRole('menuitem', { name: 'Alignment' }).click();
  await page.getByRole('menu', { name: 'Alignment' }).getByRole('menuitemradio', { name: 'Centre' }).click();
  await expect(body(page).locator('td p[data-align="center"]')).toHaveCount(2);
  await expect(body(page).locator('th p[data-align="center"]')).toHaveCount(0);
});

test('emptying a cell keeps its colour, and one Undo brings the words back', async ({ page }) => {
  await editingTable(page, 'Empty cell');
  const first = body(page).locator('td').first();
  await cellButton(page).click();
  await page.getByRole('menuitem', { name: /^Cell colour/ }).click();
  await page.getByRole('menu', { name: 'Cell colour' }).getByRole('menuitemradio', { name: 'Green' }).click();
  await cellButton(page).click();
  await page.getByRole('menuitem', { name: 'Empty the cell' }).click();
  await expect(first).toHaveText('');
  await expect(first).toHaveClass(/mark-green/);
  await expect(body(page).locator('tr')).toHaveCount(3);
  await page.keyboard.press('Control+z');
  await expect(first).toHaveText('Robin');
});

test('several cells merge from the cell menu, and split again', async ({ page }) => {
  await editingTable(page, 'Merge cells');
  const cells = body(page).locator('td');
  await cellButton(page).click();
  await expect(page.getByRole('menuitem', { name: 'Merge cells' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await cells.nth(1).click({ modifiers: ['Shift'] });
  await cellButton(page).click();
  await expect(page.getByRole('menuitem', { name: 'Empty the cells' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Merge cells' }).click();
  await expect(body(page).locator('td[colspan="2"]')).toHaveCount(1);
  await cellButton(page).click();
  await page.getByRole('menuitem', { name: 'Split cell' }).click();
  await expect(body(page).locator('td[colspan="2"]')).toHaveCount(0);
});

test('the bar under the table: arrow keys, settings that stay open, and More with Ctrl Shift .', async ({
  page,
}) => {
  await editingTable(page, 'Table bar');
  const bar = tableBar(page);
  const table = await body(page).locator('table').boundingBox();
  const under = await bar.boundingBox();
  if (!table || !under) throw new Error('no table or no bar');
  expect(under.y).toBeGreaterThanOrEqual(table.y + table.height);
  expect(Math.abs(under.x + under.width / 2 - (table.x + table.width / 2))).toBeLessThan(8);
  const names = await bar
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')));
  expect(names).toEqual([
    'Table settings',
    'Table width',
    'Equal columns',
    'Fit to the text',
    'More table options',
  ]);

  const settings = bar.getByRole('button', { name: 'Table settings' });
  await settings.click();
  const menu = page.getByRole('menu', { name: 'Table settings' });
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Header row' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await menu.getByRole('menuitemcheckbox', { name: 'Number the rows' }).click();
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Number the rows' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await menu.getByRole('menuitemcheckbox', { name: 'Header column' }).click();
  await expect(menu).toBeVisible();
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await expect(body(page).locator('.tableWrapper')).toHaveAttribute('data-numbered', '');
  await checkAccessibility(page);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // One toolbar: one Tab stop, and the arrows move inside it.
  await settings.focus();
  await page.keyboard.press('ArrowRight');
  await expect(bar.getByRole('button', { name: 'Table width' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(bar.getByRole('button', { name: 'More table options' })).toBeFocused();

  await body(page).locator('td').first().click();
  await page.keyboard.press('Control+Shift+.');
  const more = page.getByRole('menu', { name: 'More table options' });
  await expect(more.getByRole('menuitem')).toHaveText([
    /Add row above/,
    /Add column before/,
    /Sort ascending/,
    /Sort descending/,
    /Caption/,
    /Add a chart/,
    /Duplicate table/,
    /Delete table/,
  ]);
  await expect(more.getByRole('menuitem', { name: 'Add row above' })).toBeFocused();
  await checkAccessibility(page);
});

test('deleting a table from More asks first when a chart reads it', async ({ page }) => {
  await editingTable(page, 'Chart table');
  await tableBar(page).getByRole('button', { name: 'More table options' }).click();
  await page.getByRole('menuitem', { name: 'Add a chart' }).click();
  await page.keyboard.press('Escape');
  await body(page).locator('td').first().click();
  await tableBar(page).getByRole('button', { name: 'More table options' }).click();
  await page.getByRole('menuitem', { name: 'Delete table' }).click();
  const dialog = page.getByRole('dialog', { name: 'This table has a chart' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove both' }).click();
  await expect(body(page).locator('table')).toHaveCount(0);
});

test('the round corner button selects the whole table, and Fit to the text narrows it', async ({ page }) => {
  await editingTable(page, 'Select all');
  await page.getByRole('button', { name: 'Select the whole table' }).click();
  await expect(body(page).locator('.selectedCell')).toHaveCount(6);
  await body(page).locator('td').first().click();
  await tableBar(page).getByRole('button', { name: 'Table width' }).click();
  await page.getByRole('menuitemradio', { name: 'Full width' }).click();
  await expect(body(page).locator('.tableWrapper')).toHaveAttribute('data-stretch', '100');
  await tableBar(page).getByRole('button', { name: 'Fit to the text' }).click();
  await expect(body(page).locator('.tableWrapper')).not.toHaveAttribute('data-stretch', /\d/);
});

test('an empty cell with the cursor hints at the slash, which is never stored', async ({ page }) => {
  const { id } = await editingTable(page, 'Hint', tableOf(['Name', 'Team'], ['', 'Docs']));
  const hint = body(page).locator('.cell-hint');
  await expect(hint).toHaveCount(1);
  await expect(hint).toContainText('/');
  await expect(hint).toContainText('opens the insert menu');
  await page.keyboard.type('a');
  await expect(hint).toHaveCount(0);
  await page.keyboard.press('Backspace');
  await expect(hint).toHaveCount(1);
  // An empty paragraph outside a table shows no such hint.
  await body(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(hint).toHaveCount(0);
  await publish(page);
  const stored = await (await page.request.get(`/api/v1/pages/${id}`)).text();
  expect(stored).not.toContain('opens the insert menu');
});

test('header rows have a quiet fill for readers as well', async ({ page }) => {
  const { id } = await editingTable(page, 'Header fill');
  const fill = (locator: ReturnType<Page['locator']>) =>
    locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  const side = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.background = 'var(--color-side)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });
  expect(await fill(body(page).locator('th').first())).toBe(side);
  await page.goto(`/pages/${id}`);
  expect(await fill(prose(page).locator('th').first())).toBe(side);
  expect(await fill(prose(page).locator('td').first())).not.toBe(side);
});
