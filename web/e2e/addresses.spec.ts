// SPDX-License-Identifier: Apache-2.0
// Spec 094: the key of a space in every address of its content, the old forms that keep working,
// and what a person without access sees.
import type { Page } from '@playwright/test';
import {
  ADMIN,
  createUser,
  expect,
  grant,
  login,
  newSpace,
  PASSWORD,
  publishedPage,
  test,
  unique,
  VIEWER,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
});

async function changeKey(page: Page, spaceId: string, key: string) {
  const res = await page.request.put(`/api/v1/spaces/${spaceId}/key`, { data: { key } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test('an old address of a page lands on the canonical one, and Back does not return to it', async ({
  page,
}) => {
  const space = await newSpace(page, unique('Canon'));
  const child = await publishedPage(page, space.id, 'Child page', 'x', space.home_page_id);
  await page.goto('/spaces');
  await page.goto(`/pages/${child}#top`);
  await expect(page.getByRole('heading', { level: 1, name: 'Child page' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/spaces/${space.key}/pages/${child}#top$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/spaces$/);

  // The home page stays at its space's address, and its id form is replaced by it.
  await page.goto(`/spaces/${space.key}`);
  await expect(page.locator('#space-head-link')).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(new RegExp(`/spaces/${space.key}$`));
  await page.goto(`/spaces/${space.key}/pages/${space.home_page_id}`);
  await expect(page).toHaveURL(new RegExp(`/spaces/${space.key}$`));
  await page.goto(`/pages/${space.home_page_id}/history`);
  await expect(page).toHaveURL(new RegExp(`/spaces/${space.key}/pages/${space.home_page_id}/history$`));
  // A key in another case and a key of another space name the page's own space.
  await page.goto(`/spaces/${space.key.toLowerCase()}/pages/${child}`);
  await expect(page).toHaveURL(new RegExp(`/spaces/${space.key}/pages/${child}$`));
});

test('a change of key and a move keep every old address working', async ({ page }) => {
  const space = await newSpace(page, unique('Renamed'));
  const other = await newSpace(page, unique('Elsewhere'));
  const child = await publishedPage(page, space.id, 'Moving page', 'x');
  const oldKey = space.key;
  const newKey = unique('K');
  await changeKey(page, space.id, newKey);
  await page.goto(`/spaces/${oldKey}/pages/${child}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Moving page' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/spaces/${newKey}/pages/${child}$`));
  await page.goto(`/spaces/${oldKey}`);
  await expect(page).toHaveURL(new RegExp(`/spaces/${newKey}$`));
  await page.goto(`/spaces/${oldKey}/settings`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/spaces/${newKey}/settings$`));

  const moved = await page.request.post(`/api/v1/pages/${child}/move`, {
    data: { space_id: other.id, parent_id: null },
  });
  expect(moved.ok(), await moved.text()).toBeTruthy();
  await page.goto(`/spaces/${newKey}/pages/${child}`);
  await expect(page).toHaveURL(new RegExp(`/spaces/${other.key}/pages/${child}$`));
});

test('copy link gives the canonical address from Share, the tree and a heading', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const space = await newSpace(page, unique('Copied'));
  const child = await publishedPage(page, space.id, 'Copied page', 'x', space.home_page_id);
  const canonical = `/spaces/${space.key}/pages/${child}`;
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  await page.goto(`/pages/${child}`);
  await expect(page).toHaveURL(new RegExp(`${canonical}$`));
  await page.getByRole('button', { name: 'Copy link' }).first().click();
  expect(new URL(await clipboard()).pathname).toBe(canonical);

  await page
    .getByRole('navigation', { name: 'Pages' })
    .getByRole('button', { name: 'Actions for Copied page' })
    .click();
  await page.getByRole('menuitem', { name: 'Copy link' }).click();
  expect(new URL(await clipboard()).pathname).toBe(canonical);
});

test('a person without access sees what the space chose, and the address stays', async ({
  page,
  browser,
}) => {
  const space = await newSpace(page, unique('Guarded'));
  const secret = await publishedPage(page, space.id, 'Secret plans', 'x');
  const name = unique('stranger');
  await createUser(browser, `${name}@example.com`);
  const context = await browser.newContext({ baseURL: 'http://localhost:8080' });
  const outsider = await context.newPage();
  await login(outsider, `${name}@example.com`, PASSWORD);

  const set = async (answer: string) => {
    const res = await page.request.put(`/api/v1/spaces/${space.id}/access-answer`, { data: { answer } });
    expect(res.ok(), await res.text()).toBeTruthy();
  };
  const address = `/spaces/${space.key}/pages/${secret}`;

  // A new space says there is no access, and offers to ask.
  await outsider.goto(address);
  await expect(outsider.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible();
  await expect(outsider.getByRole('button', { name: 'Ask for access' })).toBeVisible();
  await expect(outsider.getByText('Secret plans')).toHaveCount(0);
  expect(new URL(outsider.url()).pathname).toBe(address);

  await set('no_access');
  await outsider.reload();
  await expect(outsider.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible();
  await expect(outsider.getByRole('button', { name: 'Ask for access' })).toHaveCount(0);
  await outsider.goto(`/spaces/${space.key}`);
  await expect(outsider.getByRole('heading', { name: "You don't have access to this space" })).toBeVisible();

  await set('not_found');
  await outsider.goto(address);
  await expect(outsider.getByRole('alert')).toContainText('does not exist, or you cannot see it');
  expect(new URL(outsider.url()).pathname).toBe(address);

  // Someone who may see the space gets the page, under its key.
  const reader = unique('reader');
  const readerId = await createUser(browser, `${reader}@example.com`);
  await grant(page, space.id, { type: 'user', id: readerId }, VIEWER);
  const readerContext = await browser.newContext({ baseURL: 'http://localhost:8080' });
  const allowed = await readerContext.newPage();
  await login(allowed, `${reader}@example.com`, PASSWORD);
  await allowed.goto(`/pages/${secret}`);
  await expect(allowed).toHaveURL(new RegExp(`${address}$`));
  await readerContext.close();
  await context.close();
});

test('the space settings choose what someone without access sees', async ({ page }) => {
  const space = await newSpace(page, unique('Choosing'));
  await page.goto(`/spaces/${space.key}/settings?section=no-access`);
  await expect(page.getByRole('heading', { level: 1, name: 'When someone cannot see this' })).toBeVisible();
  const ask = page.getByRole('radio', { name: /^No access, and ask for it/ });
  await expect(ask).toBeChecked();
  await page.getByRole('radio', { name: /^Not found/ }).check();
  await expect(page.getByRole('radio', { name: /^Not found/ })).toBeChecked();
  const read = await page.request.get(`/api/v1/spaces/${space.id}`);
  expect(((await read.json()) as { access_answer: string }).access_answer).toBe('not_found');
  await page.goto(`/spaces/${space.key}/settings?section=features`);
  await expect(page.getByRole('switch', { name: 'Comments' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Requests for access' })).toHaveCount(0);
});
