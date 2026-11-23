// SPDX-License-Identifier: Apache-2.0
// Spec 017: what the product owner asked for after their first test of the editor.
import type { Page } from '@playwright/test';
import {
  ADMIN,
  checkAccessibility,
  editorSettled,
  expect,
  login,
  newSpace,
  paragraph,
  publishedPage,
  test,
  publishFromEditor,
} from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const body = (page: Page) => page.locator('.prose.editing');
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Table', exact: true });
const menu = (page: Page) => page.getByRole('menu', { name: 'More table options' });
const button = (page: Page) => bar(page).getByRole('button', { name: 'More table options' });
const cellButton = (page: Page) => page.getByRole('button', { name: /^Cell options/ });
const cellMenu = (page: Page) => page.getByRole('menu', { name: /^Cell options/ });
const edge = (page: Page) => page.getByRole('separator', { name: 'Width of the table' });

const cell = (type: string, text: string) => ({ type, content: [paragraph(text).content[0]] });
const row = (type: string, ...texts: string[]) => ({
  type: 'tableRow',
  content: texts.map((text) => cell(type, text)),
});
const table = (attrs?: { stretch: number }) => ({
  type: 'table',
  ...(attrs ? { attrs } : {}),
  content: [row('tableHeader', 'Name', 'Team'), row('tableCell', 'Robin', 'Docs')],
});

async function pageWith(page: Page, title: string, content: unknown[]) {
  const space = await newSpace(page, `${title} space`);
  const id = await publishedPage(page, space.id, title, 'x');
  const res = await page.request.post(`/api/v1/pages/${id}/publish`, {
    data: { title, document: { type: 'doc', content }, base_version: 1 },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return { id, space };
}

async function intoTable(page: Page) {
  await body(page).locator('td').first().click();
  await editorSettled(page);
}

async function expectClearOfTheTools(page: Page, shown = menu(page)) {
  const tools = await page.getByRole('toolbar', { name: 'Formatting' }).boundingBox();
  const list = await shown.boundingBox();
  expect(list?.y ?? 0).toBeGreaterThanOrEqual((tools?.y ?? 0) + (tools?.height ?? 0));
}

async function publish(page: Page) {
  await publishFromEditor(page);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
});

test('a table gets a cell button and a bar, and the row of tools stays the same', async ({ page }) => {
  const { id } = await pageWith(page, 'Calm row', [paragraph('text').content[0], table()]);
  await page.goto(`/pages/${id}/edit`);
  await body(page).locator('p').first().click();
  await editorSettled(page);
  const tools = page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button');
  const before = await tools.count();
  // Only the table with the cursor has its controls (EDT-216).
  await body(page).locator('.tableWrapper').hover();
  await expect(cellButton(page)).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);

  await intoTable(page);
  await expect(cellButton(page)).toBeVisible();
  await expect(bar(page)).toBeVisible();
  await expect(tools).toHaveCount(before);
  await expect(page.locator('.table-frame.active')).toBeVisible();
});

test('More of the table bar works from the keyboard, and stays open while it is used', async ({ page }) => {
  const { id } = await pageWith(page, 'Keys', [table()]);
  await page.goto(`/pages/${id}/edit`);
  await intoTable(page);
  await page.keyboard.press('Control+Shift+.');
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem', { name: 'Add row above' })).toBeFocused();

  const rows = body(page).locator('tr');
  await expect(rows).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(5);
  await expect(menu(page)).toBeVisible();
  await checkAccessibility(page);

  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(body(page)).toBeFocused();
  await page.keyboard.type('still here');
  await expect(body(page).locator('tr').nth(4)).toContainText('still here');
});

test('a long menu low on the screen stays clear of the row of tools', async ({ page }) => {
  const lines = Array.from({ length: 30 }, (_, i) => paragraph(`Line ${i}`).content[0]);
  const { id } = await pageWith(page, 'Low table', [...lines, table()]);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/pages/${id}/edit`);
  await intoTable(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  await button(page).click();
  await expect(menu(page).getByRole('menuitem', { name: 'Add row above' })).toBeFocused();
  await expectClearOfTheTools(page);
});

test('in a long table the cell menu is in reach where the cursor is, also from the keyboard', async ({
  page,
}) => {
  const rows = Array.from({ length: 40 }, (_, i) => row('tableCell', `Name ${i}`, `Team ${i}`));
  const { id } = await pageWith(page, 'Long table', [{ type: 'table', content: rows }]);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/pages/${id}/edit`);
  await body(page).locator('td').nth(60).click();
  await editorSettled(page);

  await expect(cellButton(page)).toBeInViewport();
  const layer = (selector: string) =>
    page.locator(selector).evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(await layer('.table-frame')).toBeLessThan(await layer('.toolbar'));

  await page.keyboard.press('Shift+F10');
  await expect(cellMenu(page).getByRole('menuitem', { name: /^Cell colour/ })).toBeFocused();
  await expectClearOfTheTools(page, cellMenu(page));
  await page.keyboard.press('Escape');
  await expect(body(page)).toBeFocused();

  await page.keyboard.press('Control+Shift+.');
  await expect(menu(page).getByRole('menuitem', { name: 'Add row above' })).toBeFocused();
  await expectClearOfTheTools(page);
});

test('on a narrow window the folded row of tools leaves the table menus free', async ({ page }) => {
  const rows = Array.from({ length: 40 }, (_, i) => row('tableCell', `Name ${i}`, `Team ${i}`));
  const { id } = await pageWith(page, 'Narrow table', [{ type: 'table', content: rows }]);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/pages/${id}/edit`);
  await body(page).locator('td').nth(60).click();
  await editorSettled(page);
  const tools = page.getByRole('toolbar', { name: 'Formatting' });
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect(tools.getByRole('button', { name: 'More tools' })).toBeVisible();

  await page.keyboard.press('Shift+F10');
  await expect(cellMenu(page).getByRole('menuitem', { name: /^Cell colour/ })).toBeFocused();
  await expectClearOfTheTools(page, cellMenu(page));
  await page.keyboard.press('Escape');
  // Escape gives the focus back to the text a frame later; keys sent before that miss it.
  await editorSettled(page);

  await page.keyboard.press('Control+Shift+.');
  await expect(menu(page).getByRole('menuitem', { name: 'Add row above' })).toBeFocused();
  await expectClearOfTheTools(page);
});

test('labels can still be set while editing', async ({ page }) => {
  const { id } = await pageWith(page, 'Labelled', [paragraph('text').content[0]]);
  await page.goto(`/pages/${id}/edit`);
  const box = page.getByRole('combobox', { name: 'Add a label' });
  await box.fill('handbook');
  await box.press('Enter');
  await expect(page.getByRole('link', { name: 'handbook', exact: true })).toBeVisible();
  await page.goto(`/pages/${id}`);
  await expect(page.getByRole('link', { name: 'handbook', exact: true })).toBeVisible();
});

test('the block handle stays off the cells of a stretched table', async ({ page }) => {
  const { id } = await pageWith(page, 'Wide handle', [paragraph('Text').content[0], table({ stretch: 100 })]);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/pages/${id}/edit`);
  await intoTable(page);
  await body(page).locator('th').first().hover();

  const frame = await body(page).locator('.tableWrapper').boundingBox();
  const handle = await page.locator('.block-handle').boundingBox();
  if (!frame || !handle) throw new Error('the table or its handle is missing');
  expect(handle.y + handle.height / 2).toBeLessThanOrEqual(frame.y + 1);
  expect(Math.abs(handle.x - frame.x)).toBeLessThan(handle.width);
});

/** The WCAG contrast of two colours as a computed style gives them, such as `rgb(1, 2, 3)`. */
function contrast(first: string, second: string) {
  const luminance = (colour: string) => {
    const [r = NaN, g = NaN, b = NaN] = (colour.match(/[\d.]+/g) ?? []).map((part) => {
      const c = Number(part) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The outline of a table, the lines after its first heading cell, the page under the table, and
 * the heading cell's own fill, which lies beside those lines too.
 */
function measureLines(frame: Element) {
  const heading = frame.querySelector('th') as Element;
  const cell = getComputedStyle(heading);
  let under: Element | null = frame;
  while (under && getComputedStyle(under).backgroundColor === 'rgba(0, 0, 0, 0)') under = under.parentElement;
  const surface = under ? getComputedStyle(under).backgroundColor : 'rgb(255, 255, 255)';
  return {
    outline: parseFloat(getComputedStyle(frame).borderInlineStartWidth),
    column: parseFloat(cell.borderInlineEndWidth),
    columnColour: cell.borderInlineEndColor,
    row: parseFloat(cell.borderBlockEndWidth),
    rowColour: cell.borderBlockEndColor,
    surface,
    fill: cell.backgroundColor === 'rgba(0, 0, 0, 0)' ? surface : cell.backgroundColor,
  };
}

test('a table has thin lines between its cells inside a thicker outline, for readers and writers', async ({
  page,
}) => {
  const { id } = await pageWith(page, 'Grid lines', [table()]);
  for (const address of [`/pages/${id}`, `/pages/${id}/edit`]) {
    await page.goto(address);
    const frame = page.locator('.prose .tableWrapper').first();
    await expect(frame).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((name) => {
        document.documentElement.dataset.theme = name;
      }, theme);
      const lines = await frame.evaluate(measureLines);
      const where = `${address} in ${theme}: ${JSON.stringify(lines)}`;
      expect(lines.column, where).toBeGreaterThan(0);
      expect(lines.row, where).toBeGreaterThan(0);
      expect(lines.column, where).toBeLessThan(lines.outline);
      expect(lines.row, where).toBeLessThan(lines.outline);
      // Where the columns and rows meet must be seen, so the lines pass WCAG 1.4.11.
      expect(contrast(lines.columnColour, lines.surface), where).toBeGreaterThanOrEqual(3);
      expect(contrast(lines.rowColour, lines.surface), where).toBeGreaterThanOrEqual(3);
      expect(contrast(lines.columnColour, lines.fill), where).toBeGreaterThanOrEqual(3);
    }
  }
});

test('the column handle acts on the table with the cursor, and colours a whole column', async ({ page }) => {
  const { id } = await pageWith(page, 'Two tables', [table(), paragraph('between').content[0], table()]);
  await page.goto(`/pages/${id}/edit`);
  await body(page).locator('.tableWrapper').nth(1).locator('td').first().click();
  await editorSettled(page);
  await page.getByRole('button', { name: 'Column options' }).click();
  await page.getByRole('menuitem', { name: 'Column colour: Yellow' }).click();
  await expect(body(page).locator('.tableWrapper').nth(1).locator('.mark-yellow')).toHaveCount(2);
  await expect(body(page).locator('.tableWrapper').first().locator('.mark-yellow')).toHaveCount(0);
});

test('a table stretches from the menu and by keys, and readers see the same', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { id } = await pageWith(page, 'Stretch', [paragraph('Some text').content[0], table()]);
  await page.goto(`/pages/${id}/edit`);
  await intoTable(page);
  const frame = body(page).locator('.tableWrapper');
  const text = await body(page).boundingBox();
  const narrow = await frame.boundingBox();
  expect(narrow?.width).toBeCloseTo(text?.width ?? 0, 0);

  await bar(page).getByRole('button', { name: 'Table width' }).click();
  await page
    .getByRole('menu', { name: 'Table width' })
    .getByRole('menuitemradio', { name: 'Full width' })
    .click();
  await expect(edge(page)).toHaveAttribute('aria-valuenow', '100');
  const full = await frame.boundingBox();
  expect(full?.width ?? 0).toBeGreaterThan((text?.width ?? 0) + 200);
  await page.keyboard.press('Escape');

  // The closing menu hands the focus back a moment later, which on a slow machine can come after
  // this focus. Home means the same each time, so trying again changes nothing else.
  await expect(async () => {
    await edge(page).focus();
    await page.keyboard.press('Home');
    await expect(edge(page)).toHaveAttribute('aria-valuenow', '0', { timeout: 1000 });
  }).toPass();
  // A change redraws the table, and the edge takes the focus back a moment later.
  await expect(edge(page)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(edge(page)).toHaveAttribute('aria-valuenow', '5');
  await expect(edge(page)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(edge(page)).toHaveAttribute('aria-valuenow', '10');
  await expect(edge(page)).toBeFocused();
  await page.keyboard.press('End');
  await expect(edge(page)).toHaveAttribute('aria-valuenow', '100');
  await publish(page);

  await page.reload();
  const shown = page.locator('.prose .tableWrapper');
  await expect(shown).toHaveAttribute('data-stretch', '100');
  const reader = await shown.boundingBox();
  const content = await page.locator('main .column').boundingBox();
  expect(reader?.width ?? 0).toBeGreaterThan((content?.width ?? 0) + 200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('dragging the edge stretches a table, and one Undo takes it back', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { id } = await pageWith(page, 'Drag edge', [table()]);
  await page.goto(`/pages/${id}/edit`);
  await intoTable(page);
  const box = await edge(page).boundingBox();
  if (!box) throw new Error('the table has no edge');
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(edge(page)).not.toHaveAttribute('aria-valuenow', '0');
  await expect(body(page).locator('.tableWrapper')).toHaveAttribute('data-stretch', /\d+/);

  await intoTable(page);
  await page.keyboard.press('Control+z');
  await expect(body(page).locator('.tableWrapper')).not.toHaveAttribute('data-stretch', /\d+/);
});

test('a stretched table scrolls in its own frame on a narrow screen', async ({ page }) => {
  const wide = {
    type: 'table',
    attrs: { stretch: 100 },
    content: [row('tableHeader', ...Array.from({ length: 12 }, (_, i) => `Column number ${i}`))],
  };
  const { id } = await pageWith(page, 'Narrow', [wide]);
  await page.setViewportSize({ width: 420, height: 800 });
  await page.goto(`/pages/${id}`);
  await expect(page.locator('.prose table')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const scrolls = await page
    .locator('.prose .tableWrapper')
    .evaluate((frame) => frame.scrollWidth > frame.clientWidth);
  expect(scrolls).toBe(true);
});

test('the page scales with the window, and Full width takes all the room', async ({ page }) => {
  const { id } = await pageWith(page, 'Scaling', [paragraph('Some words.').content[0]]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/pages/${id}`);
  const small = await page.locator('article.page').boundingBox();
  await page.setViewportSize({ width: 2200, height: 900 });
  await expect
    .poll(async () => (await page.locator('article.page').boundingBox())?.width ?? 0)
    .toBeGreaterThan((small?.width ?? 0) + 100);

  await page.goto(`/pages/${id}/edit`);
  const sheet = page.locator('.editor-sheet');
  const fitted = await sheet.boundingBox();
  await page.getByRole('button', { name: 'Full width' }).click();
  await expect(sheet).toHaveClass(/full/);
  const full = await sheet.boundingBox();
  expect(full?.width ?? 0).toBeGreaterThan((fitted?.width ?? 0) + 300);

  await page.goto(`/pages/${id}`);
  await expect(page.locator('.page-layout')).toHaveClass(/full/);
  const reading = await page.locator('article.page').boundingBox();
  expect(reading?.width ?? 0).toBeGreaterThan(1500);
});

test('a header image moves by dragging, and stays there', async ({ page }) => {
  const space = await newSpace(page, 'Drag header');
  const id = await publishedPage(page, space.id, 'Header', 'x');
  await page.goto(`/pages/${id}/edit`);
  const head = page.locator('.page-head');
  await head.hover();
  await head
    .locator('input[type=file]')
    .setInputFiles({ name: 'head.png', mimeType: 'image/png', buffer: PNG });
  const image = head.locator('.page-header-image');
  await expect(image).toBeVisible();
  const range = head.getByLabel('Position of the image');
  await expect(range).toHaveValue('50');

  const box = await image.boundingBox();
  if (!box) throw new Error('the image has no size');
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 60, { steps: 4 });
  await page.mouse.up();
  await expect(range).not.toHaveValue('50');
  const moved = await range.inputValue();

  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/v1/pages/${id}/summary`);
      return String(((await res.json()) as { header_position: number }).header_position);
    })
    .toBe(moved);
});

test('a code block finds any language, also by a short name, and keeps its colours', async ({ page }) => {
  const space = await newSpace(page, 'Languages');
  const id = await publishedPage(page, space.id, 'Rust page', 'x');
  await page.goto(`/pages/${id}/edit`);
  await body(page).click();
  await editorSettled(page);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```');
  await page.keyboard.press('Enter');
  await page.keyboard.type('fn main() {}');

  await page.getByRole('button', { name: /^Language:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Language' });
  const search = dialog.getByLabel('Find a language');
  await search.fill('zzzz');
  await expect(dialog).toContainText('No language has that name.');
  await search.fill('c++');
  await expect(dialog.getByRole('button', { name: 'c++', exact: true })).toBeVisible();
  await search.fill('rus');
  await expect(dialog.getByRole('button', { name: 'rust', exact: true })).toBeVisible();
  await checkAccessibility(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Language: rust' })).toBeVisible();
  await expect(body(page).locator('.hljs-keyword')).toHaveText('fn');
  await publishFromEditor(page);
  await expect(page.locator('.prose .hljs-keyword')).toHaveText('fn');
  await page.reload();
  await expect(page.locator('.prose .hljs-keyword')).toHaveText('fn');
});

test('the tree stays beside the editor, and can be put away', async ({ page }) => {
  const space = await newSpace(page, 'Tree in editor');
  const id = await publishedPage(page, space.id, 'Writing here', 'x');
  await publishedPage(page, space.id, 'Another page', 'x');
  await page.goto(`/pages/${id}/edit`);
  const tree = page.getByRole('navigation', { name: 'Pages' });
  await expect(tree.getByRole('link', { name: 'Another page' })).toBeVisible();
  await checkAccessibility(page);

  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(tree).toHaveCount(0);
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(tree.getByRole('link', { name: 'Another page' })).toBeVisible();
});

test('leaving through the tree at once keeps what was typed', async ({ page }) => {
  const space = await newSpace(page, 'Leaving');
  const id = await publishedPage(page, space.id, 'Stay safe', 'start');
  await publishedPage(page, space.id, 'Elsewhere', 'x');
  await page.goto(`/pages/${id}/edit`);
  await body(page).click();
  await editorSettled(page);
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' typed just now');
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Elsewhere' }).click();
  await expect(page.locator('h1')).toContainText('Elsewhere');

  await page.goto(`/pages/${id}/edit`);
  await expect(body(page)).toContainText('typed just now');
});

test('opening the editor and leaving again leaves no draft behind', async ({ page }) => {
  const words = paragraph('text').content[0];
  const { id, space } = await pageWith(page, 'Nothing typed', [
    words,
    table({ stretch: 30 }),
    { type: 'panel', attrs: { kind: 'info' }, content: [words] },
    { type: 'expand', attrs: { title: 'Section', open: true }, content: [words] },
    {
      type: 'columns',
      content: [
        { type: 'column', content: [words] },
        { type: 'column', content: [words] },
      ],
    },
    { type: 'codeBlock', attrs: { language: 'rust' }, content: [{ type: 'text', text: 'fn main() {}' }] },
  ]);
  await page.goto(`/pages/${id}/edit`);
  await intoTable(page);
  await page.getByRole('link', { name: 'Close', exact: true }).click();
  await expect(page.locator('h1')).toContainText('Nothing typed');
  await page.waitForTimeout(300);
  const res = await page.request.get(`/api/v1/spaces/${space.id}/tree`);
  const pages = ((await res.json()) as { pages: { id: string; has_draft: boolean }[] }).pages;
  expect(pages.find((p) => p.id === id)?.has_draft).toBe(false);
});

test('when saving fails on leaving, the text can still be brought back', async ({ page }) => {
  const space = await newSpace(page, 'Failing');
  const id = await publishedPage(page, space.id, 'Keep me', 'start');
  await publishedPage(page, space.id, 'Elsewhere', 'x');
  await page.goto(`/pages/${id}/edit`);
  await body(page).click();
  await editorSettled(page);
  await page.keyboard.press('Control+End');
  await page.route(`**/api/v1/pages/${id}/draft`, (route) => route.abort());
  await page.keyboard.type(' not saved');
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Elsewhere' }).click();

  const back = page.getByRole('button', { name: 'Back to the editor' });
  await expect(back).toBeVisible();
  await page.unroute(`**/api/v1/pages/${id}/draft`);
  await back.click();
  await page.getByRole('button', { name: 'Put it back' }).click();
  await expect(body(page)).toContainText('not saved');
});
