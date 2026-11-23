// SPDX-License-Identifier: Apache-2.0
// Your account in its own frame (spec 084): the bar and its tabs, every address, and the guards
// that must keep holding in the new frame.
import type { Page } from '@playwright/test';
import { checkAccessibility, createUser, expect, login, PASSWORD, test, totpCode, unique } from './helpers';

const TABS = [
  'Profile and visibility',
  'E-mail',
  'Security',
  'Privacy',
  'Preferences',
  'Notifications',
  'Watches',
];

const ADDRESSES: [string, string][] = [
  ['/me', 'Profile and visibility'],
  ['/me/email', 'E-mail'],
  ['/me/security', 'Security'],
  ['/me/data', 'Privacy'],
  ['/me/preferences', 'Preferences'],
  ['/me/notifications', 'Notifications'],
  ['/me/watches', 'Watches'],
  ['/me/tokens', 'Tokens'],
  ['/me/sessions', 'Sessions'],
];

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Sections of your account' });

async function member(page: Page, browser: Parameters<typeof createUser>[0]) {
  const email = `${unique('account')}@example.com`;
  await createUser(browser, email);
  await login(page, email);
  return email;
}

test('the bar of Your account holds the logo, its name, the tabs, help and the account menu', async ({
  page,
  browser,
}) => {
  await member(page, browser);
  await page.goto('/me');
  const bar = page.getByRole('banner');
  await expect(bar.getByText('Your account', { exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Help' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('search')).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Create' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: /Notifications/ })).toHaveCount(0);
  await expect(tabs(page).getByRole('link')).toHaveText(TABS);
  await expect(tabs(page).getByRole('link', { name: 'Profile and visibility' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await bar.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/$/);
});

test('every address of Your account opens its section, and Tokens and Sessions keep Security selected', async ({
  page,
  browser,
}) => {
  await member(page, browser);
  for (const [address, title] of ADDRESSES) {
    await page.goto(address);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    const selected = title === 'Tokens' || title === 'Sessions' ? 'Security' : title;
    await expect(tabs(page).locator('[aria-current="page"]')).toHaveText(selected);
    await checkAccessibility(page);
  }
  // The watches keep their place in the personal frame too (D4).
  await page.goto('/me/watching');
  await expect(page.getByRole('heading', { name: 'Watching', level: 1 })).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);
});

test('Security leads on to Tokens and Sessions', async ({ page, browser }) => {
  await member(page, browser);
  await page.goto('/me/security');
  await page.getByRole('link', { name: 'See sessions' }).click();
  await expect(page).toHaveURL(/\/me\/sessions$/);
  await tabs(page).getByRole('link', { name: 'Security' }).click();
  await page.getByRole('link', { name: 'Manage tokens' }).click();
  await expect(page).toHaveURL(/\/me\/tokens$/);
});

test('at 360 pixels and right to left the page never scrolls sideways', async ({ page, browser }) => {
  await member(page, browser);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const direction of ['ltr', 'rtl']) {
    await page.goto('/me/notifications');
    await page.evaluate((dir) => document.documentElement.setAttribute('dir', dir), direction);
    await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(sideways).toBe(false);
  }
});

test('a field is saved when left, Escape puts back the stored value, and a missing time zone says so', async ({
  page,
  browser,
}) => {
  await member(page, browser);
  await page.goto('/me');
  await expect(page.getByText('Not set.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set your time zone in Preferences' })).toBeVisible();
  await page.getByRole('button', { name: /^Location/ }).click();
  await page.getByRole('textbox', { name: 'Location' }).fill('Utrecht');
  await page.getByRole('textbox', { name: 'Location' }).press('Tab');
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Location/ })).toContainText('Utrecht');

  await page.getByRole('button', { name: /^Location/ }).click();
  await page.getByRole('textbox', { name: 'Location' }).fill('Amsterdam');
  await page.getByRole('textbox', { name: 'Location' }).press('Escape');
  await expect(page.getByRole('button', { name: /^Location/ })).toContainText('Utrecht');
  await expect(page.getByRole('button', { name: /^Location/ })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Location/ })).toContainText('Utrecht');
});

test('ending a session ends it at once, and ending all others leaves only this one', async ({
  page,
  browser,
}) => {
  const email = await member(page, browser);
  const second = await (await browser.newContext({ baseURL: 'http://localhost:8080' })).newPage();
  await login(second, email);
  const third = await (await browser.newContext({ baseURL: 'http://localhost:8080' })).newPage();
  await login(third, email);
  await page.goto('/me/sessions');
  await expect(page.getByText('This session', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End session' })).toHaveCount(2);
  await page.getByRole('button', { name: 'End session' }).first().click();
  await expect(page.getByRole('button', { name: 'End session' })).toHaveCount(1);

  await page.getByRole('button', { name: 'End all other sessions' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End all other sessions' }).click();
  await expect(page.getByRole('button', { name: 'End session' })).toHaveCount(0);
  expect((await second.request.get('/api/v1/me')).status()).toBe(401);
  expect((await third.request.get('/api/v1/me')).status()).toBe(401);
  await second.context().close();
  await third.context().close();
});

test('a token never reaches the routes of Your account that are for a session only', async ({
  page,
  browser,
}) => {
  await member(page, browser);
  const made = await page.request.post('/api/v1/me/tokens', {
    data: {
      name: 'script',
      scopes: ['content:read', 'content:write'],
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  expect(made.status(), await made.text()).toBe(201);
  const { secret } = (await made.json()) as { secret: string };
  const anonymous = await browser.newContext({ baseURL: 'http://localhost:8080' });
  const headers = { Authorization: `Bearer ${secret}` };
  for (const call of [
    anonymous.request.get('/api/v1/me/sessions', { headers }),
    anonymous.request.post('/api/v1/me/tokens', { headers, data: { name: 'x', scopes: ['content:read'] } }),
  ]) {
    const res = await call;
    expect(res.status()).toBe(403);
    expect(await res.text()).toContain('session_only');
  }
  await anonymous.close();
});

test('turning off the authenticator in the new frame still asks to confirm who you are', async ({
  page,
  browser,
}) => {
  await member(page, browser);
  const setup = await page.request.post('/api/v1/me/totp/begin', { data: { password: PASSWORD } });
  const { secret } = (await setup.json()) as { secret: string };
  const confirm = await page.request.post('/api/v1/me/totp/confirm', { data: { code: totpCode(secret) } });
  expect(confirm.ok(), await confirm.text()).toBeTruthy();
  // A fresh login is a fresh proof, so the server's answer for an older one stands in for it.
  let asked = false;
  await page.route('**/api/v1/me/totp/disable', async (route) => {
    if (asked) return route.fallback();
    asked = true;
    return route.fulfill({
      status: 403,
      json: { error: { code: 'reauth_required', message: 'Confirm who you are to do this.' } },
    });
  });
  await page.goto('/me/security');
  const part = page.getByRole('heading', { name: 'Two-step verification' }).locator('..');
  await part.getByLabel('Current password').fill(PASSWORD);
  await part.getByRole('button', { name: 'Remove' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm it is you' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(part.getByText('Add an authenticator app for a second login step.')).toBeVisible();
});
