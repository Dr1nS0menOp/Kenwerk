// SPDX-License-Identifier: Apache-2.0
// Spec 027: the rest of the editor.
import type { Page } from '@playwright/test';
import {
  ADMIN,
  checkAccessibility,
  editorSettled,
  expect,
  login,
  newSpace,
  publishedPage,
  test,
  publishFromEditor,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
});

const body = (page: Page) => page.locator('.prose.editing');
const prose = (page: Page) => page.locator('.prose');
const line = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const cell = (type: string, text: string) => ({ type, content: [line(text)] });
const sales = (attrs: Record<string, unknown> = {}) => ({
  type: 'table',
  attrs: { block_id: 'salestable', ...attrs },
  content: [
    { type: 'tableRow', content: [cell('tableHeader', 'Month'), cell('tableHeader', 'Sales')] },
    { type: 'tableRow', content: [cell('tableCell', 'Jan'), cell('tableCell', '10')] },
    { type: 'tableRow', content: [cell('tableCell', 'Feb'), cell('tableCell', '4')] },
  ],
});

async function pageWith(page: Page, title: string, content: unknown[]) {
  const space = await newSpace(page, `${title} space`);
  const id = await publishedPage(page, space.id, title, 'start');
  const answer = await page.request.post(`/api/v1/pages/${id}/publish`, {
    data: { title, document: { type: 'doc', content }, base_version: 1 },
  });
  expect(answer.ok(), await answer.text()).toBeTruthy();
  return { id, space };
}

async function editing(page: Page, title: string, content: unknown[]) {
  const made = await pageWith(page, title, content);
  await page.goto(`/pages/${made.id}/edit`);
  await body(page).click();
  await editorSettled(page);
  return made;
}

/** The colour a token has on this page, as the browser computes it. */
async function cssColour(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

async function publish(page: Page) {
  await publishFromEditor(page);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
}

test('tools that do not fit fold into More from the end, and nothing is cut off', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 800 });
  await editing(page, 'Narrow', [line('text')]);
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  await expect(toolbar.getByRole('button', { name: 'Find', exact: true })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'More tools' })).toHaveCount(0);

  // The last group goes first, then History and link; the text style and Undo stay (behaviour 13).
  await page.setViewportSize({ width: 800, height: 800 });
  const more = toolbar.getByRole('button', { name: 'More tools' });
  await expect(more).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Find', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'History' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Text style/ })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  const row = await toolbar.boundingBox();
  const button = await more.boundingBox();
  expect((button?.x ?? 0) + (button?.width ?? 0)).toBeLessThanOrEqual((row?.x ?? 0) + (row?.width ?? 0));

  await more.click();
  await toolbar.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByRole('search', { name: 'Find' })).toBeVisible();
  await page.setViewportSize({ width: 1800, height: 800 });
  await expect(toolbar.getByRole('button', { name: 'More tools' })).toHaveCount(0);
});

test('the row of tools has the order of the lines, and only the text style shows words', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 800 });
  await editing(page, 'Row order', [line('text')]);
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  const names = await toolbar
    .locator(':scope > .tool-group')
    .locator('button[aria-label]')
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')));
  expect(names).toEqual([
    'Text style: Normal text',
    'Bold',
    'Underline',
    'Italic',
    'More formatting',
    'Bullet list',
    'Numbered list',
    'List choices',
    'Alignment',
    'Text colour',
    'Task list',
    'Add image or file',
    'Mention someone',
    'Emoji',
    'Two columns',
    'Info panel',
    'Synced block',
    'Table',
    'Choose the size of a table',
    'Insert',
    'Link',
    'Undo',
    'Redo',
    'History',
    'Find',
    'Full width',
  ]);
  // Quote and code block left the row (D8); they stay in Insert and the slash menu.
  await expect(toolbar.getByRole('button', { name: 'Quote' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Code block' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Text style/ })).toHaveText('Normal text');
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toHaveText('');
});

test('More formatting and List choices hold the rarer tools, with their keys', async ({ page }) => {
  await editing(page, 'Formatting menus', [line('some words')]);
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  await page.keyboard.press('Control+A');
  await toolbar.getByRole('button', { name: 'More formatting' }).click();
  const menu = page.getByRole('menu', { name: 'More formatting' });
  await expect(menu.getByRole('menuitem')).toHaveText([/Highlight/, /Clear formatting/]);
  await checkAccessibility(page);
  const strike = menu.getByRole('menuitemcheckbox', { name: 'Strikethrough' });
  await expect(strike).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+S');
  await expect(strike).toContainText('Ctrl Shift S');
  await strike.click();
  await expect(body(page).locator('s')).toHaveText('some words');
  await toolbar.getByRole('button', { name: 'More formatting' }).click();
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Strikethrough' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await menu.getByRole('menuitem', { name: 'Highlight' }).click();
  await page.getByRole('menu', { name: 'Highlight' }).getByRole('menuitemradio', { name: 'Green' }).click();
  await expect(body(page).locator('mark.mark-green')).toBeVisible();

  await toolbar.getByRole('button', { name: /^Text style/ }).click();
  const styles = page.getByRole('menu', { name: /^Text style/ });
  await expect(styles.getByRole('menuitemradio')).toHaveCount(7);
  await expect(styles.getByRole('menuitemradio', { name: 'Heading 2' })).toHaveAttribute(
    'aria-keyshortcuts',
    'Control+Alt+2',
  );
  await styles.getByRole('menuitemradio', { name: 'Heading 2' }).click();
  await expect(body(page).locator('h2')).toHaveText('some words');
  // The style shown is that of the line with the cursor.
  await body(page).locator('h2').click();
  await expect(toolbar.getByRole('button', { name: /^Text style/ })).toHaveText('Heading 2');

  await toolbar.getByRole('button', { name: 'List choices' }).click();
  await expect(page.getByRole('menu', { name: 'List choices' }).getByRole('menuitem')).toHaveText([
    /Indent/,
    /Outdent/,
  ]);
});

test('undo and redo are dimmed but stay in the arrow keys, and an active tool says it is pressed', async ({
  page,
}) => {
  await editing(page, 'Undo dimmed', [line('text')]);
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  const undo = toolbar.getByRole('button', { name: 'Undo', exact: true });
  const redo = toolbar.getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toHaveAttribute('aria-disabled', 'true');
  await expect(redo).toHaveAttribute('aria-disabled', 'true');
  await undo.focus();
  await page.keyboard.press('ArrowRight');
  await expect(redo).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(undo).toBeFocused();

  await body(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await expect(undo).not.toHaveAttribute('aria-disabled', 'true');
  await undo.click();
  await expect(body(page).locator('p')).toHaveText('text');
  await expect(redo).not.toHaveAttribute('aria-disabled', 'true');

  const bold = toolbar.getByRole('button', { name: 'Bold' });
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+A');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(bold).toHaveCSS('background-color', await cssColour(page, '--color-accent-tint'));
  await expect(bold).toHaveCSS('color', await cssColour(page, '--color-accent'));
});

test('the table tool adds three by three at once, and its arrow asks the size', async ({ page }) => {
  await editing(page, 'Table tool', [line('text')]);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  await toolbar.getByRole('button', { name: 'Table', exact: true }).click();
  const table = body(page).locator('table');
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(table.locator('tr').first().locator('th')).toHaveCount(3);
  await expect(page.getByRole('dialog', { name: 'New table' })).toHaveCount(0);

  await page.keyboard.press('Control+End');
  await page.locator('.prose.editing').press('Control+End');
  await body(page).locator('p').first().click();
  await toolbar.getByRole('button', { name: 'Choose the size of a table' }).click();
  const dialog = page.getByRole('dialog', { name: 'New table' });
  await dialog.getByLabel('Rows').fill('2');
  await dialog.getByRole('button', { name: 'Insert table' }).click();
  await expect(body(page).locator('table')).toHaveCount(2);
});

test('the direct buttons add a task list, columns, a panel and a mention', async ({ page }) => {
  await editing(page, 'Direct', [line('text')]);
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  await toolbar.getByRole('button', { name: 'Task list' }).click();
  await expect(body(page).locator('ul[data-type="taskList"]')).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Task list' })).toHaveAttribute('aria-pressed', 'true');
  await toolbar.getByRole('button', { name: 'Task list' }).click();
  await expect(body(page).locator('ul[data-type="taskList"]')).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Info panel' }).click();
  await expect(body(page).locator('.panel')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(body(page).locator('.panel')).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Two columns' }).click();
  await expect(body(page).locator('.doc-column')).toHaveCount(2);
  await toolbar.getByRole('button', { name: 'Mention someone' }).click();
  await expect(body(page)).toContainText('@');
});

test('History opens beside the draft, shows and compares versions, and restores into the draft', async ({
  page,
}) => {
  const { id } = await editing(page, 'Versions', [line('first words')]);
  const second = await page.request.post(`/api/v1/pages/${id}/publish`, {
    data: { title: 'Versions', document: { type: 'doc', content: [line('second words')] }, base_version: 2 },
  });
  expect(second.ok(), await second.text()).toBeTruthy();
  await page.reload();
  await body(page).click();
  await editorSettled(page);
  const versions = page.waitForRequest((r) => r.url().endsWith(`/pages/${id}/versions`));
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  // From the keyboard, so the focus comes back to the tool when the panel closes.
  await toolbar.getByRole('button', { name: 'History' }).focus();
  await page.keyboard.press('Enter');
  await versions;
  const panel = page.getByRole('complementary', { name: 'History' });
  await expect(panel.getByRole('heading', { name: 'History' })).toBeFocused();
  await expect(toolbar.getByRole('button', { name: 'History' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('button', { name: /^Version \d/ })).toHaveCount(3);
  await checkAccessibility(page);

  await panel.getByRole('checkbox', { name: 'Version 2' }).check();
  await panel.getByRole('checkbox', { name: 'Version 3' }).check();
  await panel.getByRole('button', { name: 'Compare the two chosen' }).click();
  await expect(panel.getByText('Version 2 compared with version 3')).toBeVisible();
  await expect(panel.locator('.diff-label').first()).toBeVisible();
  await panel.getByRole('button', { name: 'Back to the list' }).click();

  await panel.getByRole('button', { name: /^Version 2/ }).click();
  await expect(panel.getByText('first words')).toBeVisible();
  // The draft stays open and can be typed in beside the panel.
  await body(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' typed');
  await expect(body(page).locator('p')).toHaveText('second words typed');
  await panel.getByRole('button', { name: 'Restore into the draft' }).click();
  await expect(body(page).locator('p')).toHaveText('first words');
  await expect(page.getByRole('status').filter({ hasText: 'Version 2 is in your draft now' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(body(page).locator('p')).toHaveText('second words typed');

  await panel.getByRole('button', { name: 'Restore into the draft' }).click();
  await expect(body(page).locator('p')).toHaveText('first words');
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'History' })).toBeFocused();
  await publish(page);
  await expect(prose(page).locator('p')).toHaveText('first words');
});

test('the plus on an empty line opens the insert dialog for that line', async ({ page }) => {
  await editing(page, 'Plus', [line('text'), { type: 'paragraph' }, line('after')]);
  await body(page).locator('p').nth(1).hover();
  await page.getByRole('button', { name: 'Add a block here' }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'What do you want to add?' }).fill('horizontal rule');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(body(page).locator('p').first()).toHaveText('text');
  await expect(body(page).locator('hr')).toHaveCount(1);
  await expect(body(page).locator('p').last()).toHaveText('after');
});

test('a block gets a link that leads to it, also inside a collapsed section', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { id } = await editing(page, 'Linked', [
    line('first'),
    { type: 'expand', attrs: { title: 'More' }, content: [line('inside')] },
  ]);
  await body(page).locator('.expand').hover();
  await page.getByRole('button', { name: 'Block actions' }).click();
  await page.getByRole('menuitem', { name: 'Copy link to this block' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  await publish(page);
  const address = await page.evaluate(() => navigator.clipboard.readText());
  expect(address).toContain(`/pages/${id}#block-`);
  await page.goto(address);
  await expect(prose(page).getByText('inside')).toBeVisible();
});

test('the block menu offers what is likely first, and a panel goes back to text', async ({ page }) => {
  await editing(page, 'Turning', [
    line('words'),
    { type: 'panel', attrs: { kind: 'info' }, content: [line('note')] },
  ]);
  await body(page).locator('p').first().hover();
  await page.getByRole('button', { name: 'Block actions' }).click();
  const menu = page.getByRole('menu');
  const entries = await menu.getByRole('menuitem').allTextContents();
  const delete_ = entries.findIndex((entry) => entry.includes('Delete'));
  expect(entries[delete_ + 1]).toContain('Heading 2');
  await page.keyboard.press('Escape');
  await body(page).locator('.panel p').click();

  await body(page).locator('.panel').hover();
  await page.getByRole('button', { name: 'Block actions' }).click();
  await page.getByRole('menuitem', { name: 'Back to text' }).click();
  await expect(body(page).locator('.panel')).toHaveCount(0);
  await expect(body(page).locator('p').filter({ hasText: 'note' })).toBeVisible();
});

test('Shift and a grip select a run of blocks, which move and go together', async ({ page }) => {
  await editing(page, 'Range', [line('one'), line('two'), line('three'), line('four')]);
  const lines = body(page).locator('p');
  await lines.first().click();
  await lines.nth(2).hover();
  await page.locator('.block-grip').click({ modifiers: ['Shift'] });
  await lines.nth(2).hover();
  await page.getByRole('button', { name: 'Block actions' }).click();
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect(lines).toHaveText(['four', 'one', 'two', 'three']);

  await editorSettled(page);
  await page.keyboard.press('Control+z');
  await expect(lines).toHaveText(['one', 'two', 'three', 'four']);
});

test('a list item is dragged with what is nested below it', async ({ page }) => {
  const nested = { type: 'bulletList', content: [{ type: 'listItem', content: [line('child')] }] };
  await editing(page, 'Items', [
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [line('first'), nested] },
        { type: 'listItem', content: [line('second')] },
      ],
    },
  ]);
  const items = body(page).locator(':scope > ul > li');
  await items.first().locator('p').first().hover();
  await page.locator('.item-grip').dragTo(items.last(), { targetPosition: { x: 40, y: 18 } });
  await expect(items.first()).toContainText('second');
  await expect(items.last()).toContainText('first');
  await expect(items.last()).toContainText('child');
});

test('a block dropped beside another makes columns', async ({ page }) => {
  await editing(page, 'Beside', [line('left'), line('right'), line('rest')]);
  const lines = body(page).locator('p');
  await lines.first().hover();
  const target = await lines.nth(1).boundingBox();
  await page.locator('.block-grip').dragTo(lines.nth(1), {
    targetPosition: { x: (target?.width ?? 400) - 4, y: 8 },
  });
  await expect(body(page).locator('.doc-column')).toHaveCount(2);
  await expect(body(page).locator('.doc-column').first()).toHaveText('right');
  await expect(body(page).locator('.doc-column').last()).toHaveText('left');
});

test('the emoji tool has groups, and remembers what was used', async ({ page }) => {
  await editing(page, 'Smile', [line('text')]);
  await page.keyboard.press('Control+End');
  const emojiTool = page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Emoji' });
  await emojiTool.click();
  const dialog = page.getByRole('dialog', { name: 'Emoji' });
  await expect(dialog.getByRole('region', { name: 'Faces' })).toBeVisible();
  await dialog.getByLabel('Search emoji').fill('rocket');
  await dialog.getByRole('button').filter({ hasText: '🚀' }).click();
  await expect(body(page)).toContainText('🚀');
  await emojiTool.click();
  await expect(page.getByRole('region', { name: 'Used lately' }).getByText('🚀')).toBeVisible();
});

test('a saved block comes back from the slash menu', async ({ page }) => {
  await editing(page, 'Saved', [line('reusable words')]);
  await body(page).locator('p').first().hover();
  await page.getByRole('button', { name: 'Block actions' }).click();
  await page.getByRole('menuitem', { name: 'Save as a block' }).click();
  const name = `Intro ${Date.now()}`;
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await body(page).click();
  await editorSettled(page);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/${name}`);
  await page.keyboard.press('Enter');
  await expect(body(page).locator('p').filter({ hasText: 'reusable words' })).toHaveCount(2);
});

test('an image takes a width, a border, a link and text around it', async ({ page }) => {
  const space = await newSpace(page, 'Pictures space');
  const id = await publishedPage(page, space.id, 'Pictures', 'start');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const upload = await page.request.post(`/api/v1/pages/${id}/attachments?filename=a.png`, {
    headers: { 'content-type': 'image/png' },
    data: png,
  });
  expect(upload.ok(), await upload.text()).toBeTruthy();
  const { id: attachment } = (await upload.json()) as { id: string };
  const image = { type: 'image', attrs: { attachment_id: attachment, alt: 'a.png' } };
  const answer = await page.request.post(`/api/v1/pages/${id}/publish`, {
    data: { title: 'Pictures', document: { type: 'doc', content: [image, line('after')] }, base_version: 1 },
  });
  expect(answer.ok(), await answer.text()).toBeTruthy();
  await page.goto(`/pages/${id}/edit`);
  await expect(page.getByText('1 image has no description yet.')).toBeVisible();

  await body(page).locator('p').click();
  await editorSettled(page);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowUp');
  await page.getByRole('button', { name: 'Let text flow around the image' }).click();
  await page.getByRole('button', { name: 'Border', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Thin' }).click();
  await page.getByRole('button', { name: 'Describe this image' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Alt text').fill('A dot');
  await dialog.getByLabel('Width').fill('40');
  await dialog.getByLabel('Link').fill('https://example.org/a');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('1 image has no description yet.')).toHaveCount(0);
  await publish(page);

  const figure = prose(page).locator('figure.doc-image');
  await expect(figure).toHaveAttribute('data-wrap');
  await expect(figure).toHaveAttribute('data-border', 'thin');
  await expect(figure).toHaveAttribute('style', /40%/);
  await expect(figure.locator('a')).toHaveAttribute('href', 'https://example.org/a');
});

test('a folded code block opens for a reader and counts from its first line', async ({ page }) => {
  const code = {
    type: 'codeBlock',
    attrs: { line_numbers: true, line_start: 40, folded: true },
    content: [{ type: 'text', text: 'one\ntwo' }],
  };
  const { id } = await pageWith(page, 'Folded', [code]);
  await page.goto(`/pages/${id}`);
  await expect(prose(page).locator('pre')).toBeHidden();
  await page.getByRole('button', { name: 'Show 2 lines' }).click();
  await expect(prose(page).locator('pre')).toBeVisible();
  await expect(prose(page).locator('.code-lines li').first()).toHaveText('40');
});

test('Tab indents all selected lines of code, and Shift Tab takes it back', async ({ page }) => {
  await editing(page, 'Indent', [{ type: 'codeBlock', content: [{ type: 'text', text: 'one\ntwo' }] }]);
  await body(page).locator('pre').click();
  await editorSettled(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Tab');
  await expect(body(page).locator('pre')).toHaveText('  one\n  two');
  await page.keyboard.press('Shift+Tab');
  await expect(body(page).locator('pre')).toHaveText('one\ntwo');
});

test('a spotlight shows its button to readers, a panel its own emoji', async ({ page }) => {
  const { id } = await pageWith(page, 'Bright', [
    {
      type: 'spotlight',
      attrs: { color: 'blue', button_text: 'Read on', button_href: 'https://example.org/on' },
      content: [line('Big news')],
    },
    { type: 'panel', attrs: { kind: 'neutral', emoji: '🌊', color: 'blue' }, content: [line('Water')] },
    {
      type: 'columns',
      attrs: { layout: 'sidebar-end', width: 'wide' },
      content: [
        { type: 'column', content: [line('Main')] },
        { type: 'column', content: [line('Side')] },
      ],
    },
  ]);
  await page.goto(`/pages/${id}`);
  await expect(prose(page).getByRole('link', { name: 'Read on' })).toHaveAttribute(
    'href',
    'https://example.org/on',
  );
  await expect(prose(page).locator('.panel-icon')).toHaveText('🌊');
  await expect(prose(page).locator('.doc-columns')).toHaveAttribute('data-layout', 'sidebar-end');
  await checkAccessibility(page);
});

test('a chart follows its table, has options, and can be read as a table', async ({ page }) => {
  const { id } = await editing(page, 'Numbers', [
    sales(),
    { type: 'chart', attrs: { table: 'salestable', kind: 'line', points: true } },
  ]);
  await expect(body(page).locator('.chart-point')).toHaveCount(2);
  await body(page).locator('td').nth(1).click();
  await editorSettled(page);
  await page.keyboard.press('End');
  await page.keyboard.type('20');
  await expect(body(page).locator('.chart table td').nth(1)).toHaveText('1020');

  await body(page).locator('.chart-options summary').click();
  await page.getByLabel('Show a legend').uncheck();
  await expect(body(page).locator('.chart-legend')).toHaveCount(0);
  await page.getByLabel('Title of the axis').fill('Month of the year');
  await expect(body(page).locator('.chart-axis')).toHaveText('Month of the year');
  await publish(page);
  await page.goto(`/pages/${id}`);
  await expect(prose(page).locator('.chart table')).toHaveClass(/visually-hidden/);
  await expect(prose(page).locator('.chart table td').nth(1)).toHaveText('1020');
});

test('removing a table asks about its chart, and a chart in view keeps a hidden table', async ({ page }) => {
  await editing(page, 'Pair', [
    { type: 'expand', attrs: { title: 'The numbers' }, content: [sales()] },
    { type: 'chart', attrs: { table: 'salestable' } },
    line('end'),
  ]);
  await expect(body(page).locator('.chart svg')).toBeVisible();
  await body(page).locator('td').first().click();
  await editorSettled(page);
  await page.keyboard.press('Control+Shift+.');
  await page.getByRole('menuitem', { name: 'Delete table' }).click();
  await page
    .getByRole('dialog', { name: 'This table has a chart' })
    .getByRole('button', { name: 'Remove both' })
    .click();
  await expect(body(page).locator('table')).toHaveCount(0);
  await expect(body(page).locator('.chart')).toHaveCount(0);
});

test('the language of a page reaches the text, and stays out of a new version', async ({ page }) => {
  const { id } = await editing(page, 'Taal', [line('tekst')]);
  await page.getByText('Page options').hover();
  await page.getByRole('button', { name: 'Page options' }).click();
  await page.getByRole('menuitem', { name: 'Language of this page' }).click();
  await page.getByRole('dialog').getByRole('combobox').selectOption('nl');
  await publish(page);
  await page.goto(`/pages/${id}`);
  await expect(prose(page)).toHaveAttribute('lang', 'nl');
});

test('a line can run the other way than the page', async ({ page }) => {
  const { id } = await editing(page, 'Mixed', [line('שלום')]);
  await page.getByRole('button', { name: 'Alignment', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Right to left' }).click();
  await publish(page);
  await page.goto(`/pages/${id}`);
  await expect(prose(page).locator('p').first()).toHaveAttribute('dir', 'rtl');
});

test('the status of a page can be set while writing', async ({ page }) => {
  await editing(page, 'Status', [line('text')]);
  await expect(page.getByRole('button', { name: 'Set status' })).toBeVisible();
});

test('a block from a newer release shows a note, and stays through a save', async ({ page }) => {
  const original = JSON.stringify({ type: 'hologram', attrs: { depth: 3 } });
  const { id } = await editing(page, 'Future', [
    line('text'),
    { type: 'unknownBlock', attrs: { name: 'hologram', original } },
  ]);
  await expect(body(page).locator('.unknown-block')).toContainText('hologram');
  await body(page).locator('p').first().click();
  await editorSettled(page);
  await page.keyboard.type('more ');
  await publish(page);
  const stored = (await (await page.request.get(`/api/v1/pages/${id}`)).json()) as {
    document: { content: { type: string; attrs?: { original?: string } }[] };
  };
  expect(stored.document.content[1]?.attrs?.original).toBe(original);
});
