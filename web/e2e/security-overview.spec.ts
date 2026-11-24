// SPDX-License-Identifier: Apache-2.0
// The security overview in the browser (spec 088, wave SO1). scripts/e2e turns every
// experimental part on, so the overview is on here; a test that needs it off says so through
// the answers the screen gets.
import type { Browser, Page } from '@playwright/test';
import { ADMIN, checkAccessibility, createUser, expect, login, PASSWORD, test, unique } from './helpers';

const PHONE = { width: 360, height: 740 };

/** The group Security of the sidebar of the administration. */
const securityGroup = (page: Page) =>
  page
    .locator('.settings-group')
    .filter({ has: page.getByRole('button', { name: 'Security', exact: true }) });

async function openOverview(page: Page) {
  await page.goto('/admin/security-overview');
  await expect(page.getByRole('heading', { name: 'Security overview', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign-in and accounts', level: 3 })).toBeVisible();
}

/** A person who may use the product but not the administration, in a browser of their own. */
async function memberPage(browser: Browser): Promise<Page> {
  const email = `${unique('member')}@example.com`;
  await createUser(browser, email);
  const page = await (await browser.newContext({ baseURL: 'http://localhost:8080' })).newPage();
  await login(page, email, PASSWORD);
  return page;
}

test.beforeEach(async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
});

test('the overview opens first in Security, marked experimental, with its groups in order', async ({
  page,
}) => {
  await openOverview(page);
  const first = securityGroup(page).locator('a.side-link').first();
  await expect(first).toContainText('Security overview');
  await expect(first).toContainText('Experimental');
  await expect(page.locator('.security-group > h3')).toHaveText([
    'Sign-in and accounts',
    'Tokens and sharing',
    'Installation',
    'Backups and audit',
  ]);
  // A test installation has an administrator without a passkey: the state is said in words.
  await expect(
    page.getByRole('link', { name: /^Needs attention: Protect every administrator/ }),
  ).toBeVisible();
  await checkAccessibility(page);
});

test('a step leads to the section where it is done, and the cards lead on', async ({ page }) => {
  await openOverview(page);
  await page.getByRole('link', { name: /Have two administrators/ }).click();
  await expect(page).toHaveURL(/\/admin\/instance-permissions$/);
  await openOverview(page);
  await page.getByRole('link', { name: /Give guests an end date/ }).click();
  await expect(page).toHaveURL(/\/admin\/users\?type=guest$/);
  await openOverview(page);
  await page.getByRole('link', { name: 'Open the audit log' }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await openOverview(page);
  await expect(page.getByRole('link', { name: /Read the guide/ })).toHaveAttribute(
    'href',
    /operations\/security-overview\.md$/,
  );
});

test('the switch hides the steps that are done, and the address keeps it (ADM-191)', async ({ page }) => {
  await openOverview(page);
  const toggle = page.getByRole('switch', { name: 'Hide steps that are done' });
  await expect(toggle).not.toBeChecked();
  const done = page.locator('.security-step').filter({ has: page.locator('.security-tile-done') });
  const before = await done.count();
  expect(before).toBeGreaterThan(0);
  await toggle.check();
  await expect(page).toHaveURL(/done=hidden/);
  await expect(done).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Hide steps that are done' })).toBeChecked();
  await expect(done).toHaveCount(0);
  await checkAccessibility(page);
});

test('a member who types the address is told it does not exist', async ({ browser }) => {
  const page = await memberPage(browser);
  await page.goto('/admin/security-overview');
  await expect(page.getByRole('alert')).toContainText('does not exist');
  const answer = await page.request.get('/api/v1/admin/security-overview');
  expect(answer.status()).toBe(403);
  await page.context().close();
});

test('with the part off, Security has no entry and the address says the part is off', async ({ page }) => {
  await page.route('**/api/v1/system/capabilities', async (route) => {
    const response = await route.fetch();
    const on = (await response.json()) as Record<string, boolean>;
    return route.fulfill({ response, json: { ...on, security_overview: false } });
  });
  await page.route('**/api/v1/admin/security-overview', (route) =>
    route.fulfill({
      status: 404,
      json: {
        error: {
          code: 'experimental_off',
          message:
            'This experimental part is off on this installation. An administrator can turn it on in the console.',
        },
      },
    }),
  );
  await page.goto('/admin/security-overview');
  await expect(page.getByText(/experimental part, and it is off/)).toBeVisible();
  await expect(securityGroup(page).getByRole('link', { name: /Security overview/ })).toHaveCount(0);
  await checkAccessibility(page);
});

test('the overview on a phone keeps every row readable', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openOverview(page);
  const row = page.locator('.security-step').first();
  const box = await row.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(PHONE.width);
  await checkAccessibility(page);
});
