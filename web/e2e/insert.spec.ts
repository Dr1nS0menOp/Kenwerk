// SPDX-License-Identifier: Apache-2.0
// Spec 082, steps 5 to 7: the insert dialog, the slash menu that leads to it, and the lists of
// `:` and `@` that keep their own look. Also the link dialog's offer of a new page (c29ea8c).
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
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
});

const body = (page: Page) => page.locator('.prose.editing');
const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Insert' });
const searchOf = (page: Page) => dialogOf(page).getByRole('combobox', { name: 'What do you want to add?' });
const gridOf = (page: Page) => dialogOf(page).getByRole('grid');
const slashMenu = (page: Page) => page.getByRole('listbox', { name: 'Insert' });

/** Opens a page in the editor with the cursor at the end of its one line. */
async function editing(page: Page, title: string, text = 'start') {
  const space = await newSpace(page, `${title} space`);
  const id = await publishedPage(page, space.id, title, text);
  await page.goto(`/pages/${id}/edit`);
  await body(page).click();
  await editorSettled(page);
  await page.keyboard.press('Control+End');
  return { id, space };
}

async function openFromRow(page: Page) {
  await page
    .getByRole('toolbar', { name: 'Formatting' })
    .getByRole('button', { name: 'Insert', exact: true })
    .click();
  await expect(searchOf(page)).toBeFocused();
}

/** The name of the entry the grid and the search point at. */
async function selectedName(page: Page) {
  return (
    (await gridOf(page).locator('[role=gridcell][aria-selected=true] .insert-name-text').textContent()) ?? ''
  );
}

test('the dialog opens from the row with every entry, quickly, and the first one selected', async ({
  page,
}) => {
  await editing(page, 'Insert open');
  // From the press to a drawn dialog, measured inside the page (load budget of spec 082).
  const took = await page.evaluate(async () => {
    const tool = [...document.querySelectorAll<HTMLButtonElement>('[role=toolbar] button')].find(
      (button) => button.getAttribute('aria-label') === 'Insert',
    );
    const start = performance.now();
    tool?.click();
    await new Promise((done) => requestAnimationFrame(() => done(null)));
    return document.querySelector('dialog.insert-dialog') ? performance.now() - start : Infinity;
  });
  console.log(`the insert dialog opened in ${Math.round(took)} ms`);
  expect(took).toBeLessThan(100);
  await expect(searchOf(page)).toBeFocused();
  await expect(dialogOf(page).getByRole('tab', { name: 'Everything' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await gridOf(page).getByRole('gridcell').count()).toBeGreaterThan(60);
  expect(await selectedName(page)).toBe('Task list');
  await expect(searchOf(page)).toHaveAttribute('aria-activedescendant', /cell-task$/);
  // Outside content and software work hold nothing yet, so they do not show (EDT-177).
  await expect(dialogOf(page).getByRole('tab', { name: 'Outside content' })).toHaveCount(0);
  await checkAccessibility(page);
});

test('the categories follow the arrow keys, and a search looks in all of them', async ({ page }) => {
  await editing(page, 'Insert categories');
  await openFromRow(page);
  await page.keyboard.press('Tab');
  await expect(dialogOf(page).getByRole('tab', { name: 'Everything' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(dialogOf(page).getByRole('tab', { name: 'Text and structure' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(dialogOf(page).getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');
  await expect(gridOf(page).getByRole('gridcell', { name: /^Heading 1/ })).toHaveCount(0);
  await expect(gridOf(page).getByRole('gridcell', { name: /^Image or file/ })).toBeVisible();
  await checkAccessibility(page);

  await searchOf(page).fill('table');
  await expect(dialogOf(page).getByRole('tab', { name: 'Everything' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(gridOf(page).getByRole('gridcell', { name: /^Table/ })).toBeVisible();
  await expect(gridOf(page).getByRole('gridcell', { name: /^Page report/ })).toBeVisible();
  expect(await selectedName(page)).toBe('Table');

  await searchOf(page).fill('zebra crossing');
  await expect(dialogOf(page).getByRole('status')).toHaveText('Nothing to insert matches “zebra crossing”.');
  await expect(dialogOf(page).getByRole('button', { name: 'Insert', exact: true })).toBeDisabled();
  await checkAccessibility(page);
});

test('the grid is one Tab stop that moves by cell and by row, and Enter inserts at the cursor', async ({
  page,
}) => {
  await editing(page, 'Insert keys');
  await openFromRow(page);
  await page.keyboard.press('ArrowDown');
  const second = await selectedName(page);
  expect(second).not.toBe('Task list');
  await page.keyboard.press('ArrowUp');
  expect(await selectedName(page)).toBe('Task list');

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(gridOf(page)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect(await selectedName(page)).toBe('Image or file');
  // The tooltip carries the whole description, and a drawing for a simple block (D22).
  await page.keyboard.press('ArrowLeft');
  const tip = dialogOf(page).getByRole('tooltip');
  await expect(tip).toContainText('A list to tick off');
  await expect(tip.locator('.insert-preview ul')).toBeVisible();
  await expect(gridOf(page).getByRole('gridcell', { name: /^Task list/ })).toHaveAttribute(
    'aria-describedby',
    (await tip.getAttribute('id')) ?? '',
  );
  await checkAccessibility(page);
  // Escape first hides the tooltip; the dialog stays.
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(0);
  await expect(dialogOf(page)).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  expect(await selectedName(page)).toBe('Task list');
  await page.keyboard.press('Enter');
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(body(page).locator('ul[data-type=taskList]')).toBeVisible();
  await expect(body(page).locator('p').first()).toHaveText('start');
});

test('Insert adds the selected entry when it is scrolled out of view', async ({ page }) => {
  await editing(page, 'Insert scrolled');
  await openFromRow(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('End');
  const last = await selectedName(page);
  await gridOf(page).evaluate((grid) => grid.scrollTo({ top: 0 }));
  await dialogOf(page).getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(dialogOf(page)).toHaveCount(0);
  expect(last).toBe('Create from template');
  await expect(body(page).locator('.dynamic[data-kind=create_from_template]')).toBeVisible();
});

test('Close, the close button and Escape add nothing and give the text its focus back', async ({ page }) => {
  await editing(page, 'Insert leave');
  for (const leave of ['Escape', 'Close', 'corner'] as const) {
    await openFromRow(page);
    if (leave === 'Escape') await page.keyboard.press('Escape');
    else if (leave === 'Close') await dialogOf(page).getByRole('button', { name: 'Close' }).last().click();
    else await dialogOf(page).getByRole('button', { name: 'Close' }).first().click();
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(body(page)).toBeFocused();
  }
  await expect(body(page)).toHaveText('start');
});

test('the slash menu is a flat list with its first row marked, an accent slash and a last row', async ({
  page,
}) => {
  await editing(page, 'Slash flat');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await expect(slashMenu(page)).toBeVisible();
  await expect(slashMenu(page).getByRole('group')).toHaveCount(0);
  await expect(slashMenu(page).getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await expect(slashMenu(page).getByRole('option').first()).toHaveAccessibleName(/^Task list \[ \]/);
  const slash = body(page).locator('.slash-typed');
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
  );
  expect(accent).not.toBe('');
  const colour = await slash.evaluate((element) => getComputedStyle(element).color);
  const link = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-accent)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(colour).toBe(link);
  await checkAccessibility(page);

  // The last row opens the dialog with the words typed after the slash.
  await page.keyboard.type('panel');
  await page.keyboard.press('ArrowUp');
  await expect(
    slashMenu(page).getByRole('option', { name: 'Find more in the insert dialog' }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(searchOf(page)).toHaveValue('panel');
  await expect(gridOf(page).getByRole('gridcell', { name: /^Info panel/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(body(page).locator('.panel')).toBeVisible();
  // The typed slash and words left the text, and nothing stored the decoration.
  await expect(body(page)).not.toContainText('/panel');
  await expect(body(page).locator('.slash-typed')).toHaveCount(0);
});

test('the lists of a colon and of @ keep their own look', async ({ page }) => {
  await editing(page, 'Other lists');
  await page.keyboard.press('Enter');
  await page.keyboard.type(':smil');
  const emoji = page.getByRole('listbox', { name: 'Emoji' });
  await expect(emoji).toBeVisible();
  await expect(emoji).toHaveClass(/suggestions/);
  await expect(page.locator('.slash-menu')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.keyboard.type('@Adm');
  const people = page.getByRole('listbox', { name: 'People' });
  await expect(people).toBeVisible();
  await expect(people).toHaveClass(/suggestions/);
  await expect(people.getByRole('option').first()).toHaveClass(/suggestion/);
  await expect(page.locator('.slash-menu')).toHaveCount(0);
});

test('the link dialog offers a new page only once the search has answered', async ({ page }) => {
  const { space } = await editing(page, 'Link offer');
  await publishedPage(page, space.id, 'Existing target', 'here');
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route('**/api/v1/search?*', async (route) => {
    await held;
    await route.fallback();
  });
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Link' });
  await dialog.getByLabel('Find a page').fill('Existing target');
  // While the search has not answered, nobody can tell whether the page exists.
  await page.waitForTimeout(300);
  await expect(dialog.getByRole('button', { name: /^Link to a new page/ })).toHaveCount(0);
  release();
  await expect(dialog.locator('.insert-list').getByRole('button', { name: 'Existing target' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Link to a new page/ })).toHaveCount(0);
  await checkAccessibility(page);

  await dialog.getByLabel('Find a page').fill('Nowhere yet');
  await expect(dialog.getByRole('button', { name: 'Link to a new page: Nowhere yet' })).toBeVisible();
});
