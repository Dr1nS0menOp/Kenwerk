// SPDX-License-Identifier: Apache-2.0
// The mail server in Administration, Mail (spec 098): only a system administrator with a
// second factor changes it, the password is never shown, the environment locks it, and a test
// mail says what the server answered. The test server has no mail server and keeps none: what
// these tests save leaves the host empty, so mail stays off for every other test.
import type { Browser, Page } from '@playwright/test';
import { checkAccessibility, createUser, expect, login, PASSWORD, test, totpCode, unique } from './helpers';

const BASE = { baseURL: 'http://localhost:8080' };
const SERVER = '/api/v1/admin/mail/server';
const CODE = 'Code from your authenticator app, or a recovery code';
const SECRET = 'a-Password-only-the-mail-server-knows';

/** A system administrator with an authenticator app, in a browser of their own. */
async function systemAdministrator(browser: Browser) {
  const email = `${unique('keeper')}@example.com`;
  await createUser(browser, email, 'member', ['use_product', 'administrator', 'system_administrator']);
  const context = await browser.newContext(BASE);
  const res = await context.request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const setup = await context.request.post('/api/v1/me/totp/begin', { data: { password: PASSWORD } });
  const { secret } = (await setup.json()) as { secret: string };
  const confirm = await context.request.post('/api/v1/me/totp/confirm', { data: { code: totpCode(secret) } });
  expect(confirm.ok(), await confirm.text()).toBeTruthy();
  const { recovery_codes: codes } = (await confirm.json()) as { recovery_codes: string[] };
  return { page: await context.newPage(), codes, close: () => context.close() };
}

/** The Mail server part: the mail switches below it have a Save and Reset changes of their own. */
const serverPart = (page: Page) =>
  page
    .locator('section.settings-unit')
    .filter({ has: page.getByRole('heading', { name: 'Mail server', level: 2 }) });

/** A field by the start of its label; the label of a field with help holds the help too. */
const field = (page: Page, name: string) => page.getByLabel(new RegExp(`^${name}`));

test('an administrator reads the mail server and cannot change it', async ({ page, browser }) => {
  const email = `${unique('clerk')}@example.com`;
  await createUser(browser, email, 'member', ['use_product', 'administrator']);
  await login(page, email, PASSWORD);
  await page.goto('/admin/mail');
  await expect(page.getByRole('heading', { name: 'Mail server', level: 2 })).toBeVisible();
  await expect(page.getByText('Only a system administrator changes the mail server.')).toBeVisible();
  await expect(field(page, 'Host')).toBeDisabled();
  await expect(serverPart(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  // Without a server there is nothing to test.
  await expect(page.getByRole('button', { name: 'Send a test mail' })).toBeDisabled();
  const refused = await page.request.put(SERVER, {
    data: {
      host: '',
      port: 587,
      tls: 'starttls',
      username: '',
      password: { action: 'keep' },
      from_address: '',
      from_name: 'x',
      reply_to: '',
      code: '',
    },
  });
  expect(refused.status()).toBe(403);
  await checkAccessibility(page);
});

test('a system administrator saves the mail server with a code, and its password is never shown', async ({
  browser,
}) => {
  const keeper = await systemAdministrator(browser);
  const page = keeper.page;
  try {
    await page.goto('/admin/mail');
    await expect(page.getByText('No password is set.')).toBeVisible();
    await expect(page.getByLabel(CODE)).toHaveCount(0);
    await field(page, 'Sender name').fill('The wiki');
    await field(page, 'Password').selectOption('set');
    await field(page, 'New password').fill(SECRET);
    // A change asks for a code in the same form; Reset changes takes both away.
    await expect(page.getByLabel(CODE)).toBeVisible();
    await serverPart(page).getByRole('button', { name: 'Reset changes' }).click();
    await expect(page.getByLabel(CODE)).toHaveCount(0);
    await expect(field(page, 'Sender name')).toHaveValue('');

    await field(page, 'Sender name').fill('The wiki');
    await field(page, 'Password').selectOption('set');
    await field(page, 'New password').fill(SECRET);
    await page.getByLabel(CODE).fill('000000');
    await serverPart(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel(CODE).fill(keeper.codes[0] ?? '');
    await serverPart(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(page.getByText('A password is set. It is never shown.')).toBeVisible();
    await checkAccessibility(page);

    const read = await page.request.get(SERVER);
    const text = await read.text();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text)).toMatchObject({ from_name: 'The wiki', password_set: true, source: 'none' });
  } finally {
    const back = await page.request.put(SERVER, {
      data: {
        host: '',
        port: 587,
        tls: 'starttls',
        username: '',
        password: { action: 'remove' },
        from_address: '',
        from_name: '',
        reply_to: '',
        code: keeper.codes[1],
      },
    });
    expect(back.ok(), await back.text()).toBeTruthy();
    await keeper.close();
  }
});

test('a server from the environment shows locked, and a failed test names the step and the answer', async ({
  browser,
}) => {
  const keeper = await systemAdministrator(browser);
  const page = keeper.page;
  try {
    await page.route('**/api/v1/admin/mail/server', (route) =>
      route.fulfill({
        json: {
          host: 'smtp.example.com',
          port: 465,
          tls: 'implicit',
          username: 'wiki',
          password_set: true,
          from_address: 'wiki@example.com',
          from_name: '',
          reply_to: '',
          source: 'environment',
          locked: { setting: 'KENWERK_SMTP_HOST', source: 'file, line 5' },
          updated_at: null,
        },
      }),
    );
    await page.route('**/api/v1/admin/mail/test', (route) =>
      route.fulfill({
        json: {
          delivered: false,
          to: 'me@example.com',
          step: 'recipient',
          error: '550 5.7.1 Relaying denied',
        },
      }),
    );
    await page.goto('/admin/mail');
    await expect(
      page.getByText('The mail server is set by KENWERK_SMTP_HOST (file, line 5). Change it there'),
    ).toBeVisible();
    await expect(field(page, 'Host')).toHaveValue('smtp.example.com');
    await expect(field(page, 'Host')).toBeDisabled();
    await expect(serverPart(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Send a test mail' }).click();
    const failed = page.getByRole('alert').filter({ hasText: 'The server refused the recipient' });
    await expect(failed).toContainText('550 5.7.1 Relaying denied');
    await checkAccessibility(page);
  } finally {
    await keeper.close();
  }
});
