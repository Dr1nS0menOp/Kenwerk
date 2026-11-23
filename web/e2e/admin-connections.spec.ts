// SPDX-License-Identifier: Apache-2.0
// The identity provider, the helper services, the metrics token and the name, set in the
// administration (spec 101). Only a system administrator with a second factor changes them, no
// secret is ever shown, and the environment locks what it sets. The test server sets none of
// them, and every other test runs against it at the same time: a real save here touches only the
// metrics token and puts it back, and the parts that would show elsewhere come from routed
// answers.
import type { Browser, Page } from '@playwright/test';
import {
  ADMIN,
  checkAccessibility,
  createUser,
  expect,
  login,
  PASSWORD,
  test,
  totpCode,
  unique,
} from './helpers';

const BASE = { baseURL: 'http://localhost:8080' };
const CONNECTIONS = '/api/v1/admin/connections';
const CODE = 'Code from your authenticator app, or a recovery code';

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

/** One part of a section, by its heading: each has a Save and Reset changes of its own. */
const part = (page: Page, heading: string) =>
  page
    .locator('section.settings-unit')
    .filter({ has: page.getByRole('heading', { name: heading, level: 2 }) });

/** A field by the start of its label; the label of a field with help holds the help too. */
const field = (where: Page | ReturnType<typeof part>, name: string) =>
  where.getByLabel(new RegExp(`^${name}`));

const origin = (locked: { setting: string; source: string } | null) => ({
  source: locked ? 'environment' : 'none',
  locked,
});

/** The answer of the read while the environment sets the identity provider and the PDF helper. */
const lockedConnections = {
  identity_provider: {
    issuer: 'https://auth.example.com/application/o/kenwerk/',
    client_id: 'kenwerk',
    client_secret_set: true,
    display_name: 'Company login',
    auto_create: true,
    allow_unverified_email: false,
    groups_claim: 'groups',
    ...origin({ setting: 'KENWERK_OIDC_ISSUER', source: 'environment' }),
  },
  pdf: {
    url: 'http://pdf:3000',
    password_set: true,
    ...origin({ setting: 'KENWERK_PDF_URL', source: 'file, line 7' }),
  },
  office: { url: '', ...origin(null) },
  drawing: { url: '', ...origin(null) },
  metrics: { token_set: false, ...origin(null) },
  updated_at: null,
};

test('an administrator reads the connections and cannot change them', async ({ page, browser }) => {
  const email = `${unique('clerk')}@example.com`;
  await createUser(browser, email, 'member', ['use_product', 'administrator']);
  await login(page, email, PASSWORD);
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Identity provider', level: 2 })).toBeVisible();
  await expect(field(page, 'Issuer address')).toBeDisabled();
  await expect(
    part(page, 'Identity provider').getByRole('button', { name: 'Save', exact: true }),
  ).toHaveCount(0);
  await page.goto('/admin/settings');
  await expect(page.getByText('Only a system administrator changes the identity provider')).toBeVisible();
  await expect(field(part(page, 'PDF helper'), 'Address')).toBeDisabled();
  const refused = await page.request.put(`${CONNECTIONS}/metrics`, {
    data: { token: { action: 'remove' }, code: '' },
  });
  expect(refused.status()).toBe(403);
  await checkAccessibility(page);
});

test('a system administrator makes a metrics token, saves it with a code, and it is never shown again', async ({
  browser,
}) => {
  const keeper = await systemAdministrator(browser);
  const page = keeper.page;
  const metrics = part(page, 'Metrics');
  try {
    await page.goto('/admin/settings');
    await expect(metrics.getByText('No token is set.')).toBeVisible();
    await expect(page.getByLabel(CODE)).toHaveCount(0);
    await metrics.getByRole('button', { name: 'Make a token' }).click();
    const token = (await metrics.locator('code').textContent()) ?? '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // A change asks for a code in the same part; Reset changes takes both away.
    await expect(page.getByLabel(CODE)).toBeVisible();
    await metrics.getByRole('button', { name: 'Reset changes' }).click();
    await expect(page.getByLabel(CODE)).toHaveCount(0);

    await metrics.getByRole('button', { name: 'Make a token' }).click();
    await page.getByLabel(CODE).fill('000000');
    await metrics.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(metrics.getByRole('alert')).toBeVisible();
    await page.getByLabel(CODE).fill(keeper.codes[0] ?? '');
    await metrics.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(metrics.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(metrics.getByText('A token is set. It is never shown.')).toBeVisible();
    await expect(metrics.locator('code')).toHaveCount(0);
    await checkAccessibility(page);

    const read = await page.request.get(CONNECTIONS);
    const text = await read.text();
    expect(text).not.toContain(token);
    expect(JSON.parse(text)).toMatchObject({
      metrics: { token_set: true, source: 'database', locked: null },
    });
  } finally {
    const back = await page.request.put(`${CONNECTIONS}/metrics`, {
      data: { token: { action: 'remove' }, code: keeper.codes[1] },
    });
    expect(back.ok(), await back.text()).toBeTruthy();
    await keeper.close();
  }
});

test('an invalid issuer is refused and nothing is stored', async ({ browser }) => {
  const keeper = await systemAdministrator(browser);
  const page = keeper.page;
  try {
    await page.goto('/admin/login');
    const provider = part(page, 'Identity provider');
    await field(provider, 'Issuer address').fill('http://auth.example.com/?tenant=1');
    await field(provider, 'Client ID').fill('kenwerk');
    await page.getByLabel(CODE).fill(keeper.codes[0] ?? '');
    await provider.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(provider.getByRole('alert')).toContainText('without a user name, a query or a fragment');
    const read = (await (await page.request.get(CONNECTIONS)).json()) as {
      identity_provider: { source: string };
    };
    expect(read.identity_provider.source).toBe('none');
  } finally {
    await keeper.close();
  }
});

test('what the environment sets shows locked, and the rest stays open', async ({ browser }) => {
  const keeper = await systemAdministrator(browser);
  const page = keeper.page;
  try {
    await page.route(`**${CONNECTIONS}`, (route) => route.fulfill({ json: lockedConnections }));
    await page.goto('/admin/login');
    const provider = part(page, 'Identity provider');
    await expect(provider.getByText('This is set by KENWERK_OIDC_ISSUER (environment).')).toBeVisible();
    await expect(field(provider, 'Issuer address')).toHaveValue(
      'https://auth.example.com/application/o/kenwerk/',
    );
    await expect(field(provider, 'Issuer address')).toBeDisabled();
    await expect(provider.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await page.goto('/admin/settings');
    const pdf = part(page, 'PDF helper');
    await expect(pdf.getByText('This is set by KENWERK_PDF_URL (file, line 7).')).toBeVisible();
    await expect(field(pdf, 'Address')).toBeDisabled();
    await expect(field(part(page, 'Office service'), 'Address')).toBeEnabled();
    await checkAccessibility(page);
  } finally {
    await keeper.close();
  }
});

test('a name the environment sets shows locked in Look', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.route('**/api/v1/admin/instance-name', (route) =>
    route.fulfill({
      json: {
        name: 'Acme wiki',
        source: 'environment',
        locked: { setting: 'KENWERK_INSTANCE_NAME', source: 'environment' },
      },
    }),
  );
  await page.goto('/admin/look');
  await expect(page.getByText('The name is set by KENWERK_INSTANCE_NAME (environment).')).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
  await checkAccessibility(page);
});
