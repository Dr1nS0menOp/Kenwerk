// SPDX-License-Identifier: Apache-2.0
// The tool rows of spec 100: one row above every long list of the administration and the settings
// of a space, whose search, filters and sort live in the address and are sent to the server.
import {
  ADMIN,
  checkAccessibility,
  createNamedUser,
  createUser,
  expect,
  grant,
  login,
  newSpace,
  PASSWORD,
  publishedPage,
  test,
  unique,
} from './helpers';

test('a filter of Users shows its value in words, lives in the address and is reset', async ({
  page,
  browser,
}) => {
  await login(page, ADMIN.email, ADMIN.password);
  const email = `${unique('guestrow')}@example.com`;
  await createUser(browser, email, 'guest');
  await page.goto('/admin/users');
  const row = page.getByRole('group', { name: 'Find people' });

  await row.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Any' })).toBeFocused();
  await checkAccessibility(page);
  // Escape closes the chooser and gives the focus back to its button.
  await page.keyboard.press('Escape');
  await expect(row.getByRole('button', { name: 'Type', exact: true })).toBeFocused();

  await row.getByRole('button', { name: 'Type', exact: true }).click();
  const asked = page.waitForRequest(
    (r) => r.url().includes('/api/v1/admin/users?') && r.url().includes('type=guest'),
  );
  await page.getByRole('menuitemradio', { name: 'Guest' }).click();
  await asked;
  await expect(page).toHaveURL(/[?&]type=guest/);
  await expect(row.getByRole('button', { name: 'Type: Guest' })).toBeVisible();
  await row.getByRole('searchbox', { name: 'Search by name or e-mail' }).fill(email);
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(email);
  await expect(page.getByRole('status').filter({ hasText: '1 person' })).toBeVisible();

  await page.reload();
  await expect(row.getByRole('button', { name: 'Type: Guest' })).toBeVisible();
  await expect(row.getByRole('searchbox', { name: 'Search by name or e-mail' })).toHaveValue(email);

  await row.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(row.getByRole('button', { name: 'Type', exact: true })).toBeVisible();
  await expect(row.getByRole('searchbox', { name: 'Search by name or e-mail' })).toHaveValue('');
  await expect(row.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0);
});

test('More filters opens a second line, which shows by itself while one of its filters is set', async ({
  page,
}) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin/users');
  const more = page.getByRole('button', { name: 'More filters' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Status', exact: true })).toHaveCount(0);
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Disabled' }).click();
  await expect(page).toHaveURL(/status=disabled/);
  await page.goto('/admin/users?status=disabled');
  await expect(page.getByRole('button', { name: 'Status: Disabled' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More filters' })).toHaveAttribute('aria-expanded', 'true');
});

test('a sorted column of Users is in the address, marked for screen readers, and turns round', async ({
  page,
}) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin/users');
  const email = page.getByRole('columnheader', { name: 'Email' });
  await expect(page.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');
  await expect(email).toHaveAttribute('aria-sort', 'none');
  const asked = page.waitForRequest(
    (r) => r.url().includes('/api/v1/admin/users?') && r.url().includes('sort=email'),
  );
  await email.getByRole('button').click();
  await asked;
  await expect(page).toHaveURL(/sort=email/);
  await expect(email).toHaveAttribute('aria-sort', 'ascending');
  await email.getByRole('button').click();
  await expect(page).toHaveURL(/sort=-email/);
  await expect(email).toHaveAttribute('aria-sort', 'descending');
});

test('the Audit log filters by person and its export carries the same filters', async ({ page, browser }) => {
  const email = `${unique('audited')}@example.com`;
  const id = await createNamedUser(browser, email, 'Audited Person');
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto(`/admin/audit?actor_id=${id}&result=denied`);
  await expect(page.getByRole('button', { name: 'Who: Audited Person' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Result: Refused' })).toBeVisible();
  const exported = page.getByRole('link', { name: 'Export as CSV' });
  await expect(exported).toHaveAttribute(
    'href',
    new RegExp(`actor_id=${id}.*result=denied|result=denied.*actor_id=${id}`),
  );
  await expect(page.getByRole('columnheader', { name: 'When' })).toHaveAttribute('aria-sort', 'descending');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
});

test('Spaces are searched and filtered by the server', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  const name = unique('Findable');
  await newSpace(page, name);
  await page.goto('/admin/spaces');
  const asked = page.waitForRequest(
    (r) =>
      r.url().includes('/api/v1/admin/spaces?') && r.url().includes(`q=${name.toLowerCase().slice(0, 6)}`),
  );
  await page.getByRole('searchbox', { name: 'Find a space' }).fill(name.toLowerCase().slice(0, 6));
  await asked;
  await expect(page.getByRole('link', { name })).toBeVisible();
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Archived' }).click();
  await expect(page).toHaveURL(/status=archived/);
  await expect(page.getByRole('link', { name })).toHaveCount(0);
  await checkAccessibility(page);
});

test('People of a space filter by kind on the server, and Add people opens the way to add', async ({
  page,
  browser,
}) => {
  await login(page, ADMIN.email, ADMIN.password);
  const space = await newSpace(page, 'Holders');
  const viewerEmail = `${unique('holder')}@example.com`;
  const viewer = await createNamedUser(browser, viewerEmail, 'Holder Person');
  await grant(page, space.id, { type: 'user', id: viewer }, ['space.view']);
  const group = await page.request.post('/api/v1/admin/groups', { data: { name: unique('Holders group') } });
  expect(group.status(), await group.text()).toBe(201);
  const made = (await group.json()) as { id: string; name: string };
  await grant(page, space.id, { type: 'group', id: made.id }, ['space.view']);

  await page.goto(`/spaces/${space.key}/settings?section=people`);
  await expect(page.getByText('Holder Person', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kind', exact: true }).click();
  const asked = page.waitForRequest(
    (r) => r.url().includes('/role-assignments?') && r.url().includes('kind=group'),
  );
  await page.getByRole('menuitemradio', { name: 'Groups' }).click();
  await asked;
  await expect(page).toHaveURL(/section=people.*kind=group/);
  await expect(page.getByText(made.name, { exact: true })).toBeVisible();
  await expect(page.getByText('Holder Person', { exact: true })).toHaveCount(0);
  await checkAccessibility(page);

  await page.getByRole('button', { name: 'Add people' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add people' });
  await expect(dialog.getByRole('button', { name: 'All members' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Someone who may only read the space gets no list, with or without filters.
  const reader = await browser.newContext({ baseURL: 'http://localhost:8080' });
  const readerPage = await reader.newPage();
  await login(readerPage, viewerEmail, PASSWORD);
  const refused = await readerPage.request.get(`/api/v1/spaces/${space.id}/role-assignments?kind=group`);
  expect(refused.status()).toBe(403);
  await reader.close();
});

test('the Content search finds a page by part of its title', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  const space = await newSpace(page, 'Searchable content');
  await publishedPage(page, space.id, 'Quarterly budget review', 'x', space.home_page_id);
  await publishedPage(page, space.id, 'Holiday plans', 'x', space.home_page_id);
  await page.goto(`/spaces/${space.key}/content`);
  await page.getByRole('searchbox', { name: 'Search by title' }).fill('BUDGET');
  await expect(page).toHaveURL(/q=BUDGET/);
  await expect(page.getByRole('link', { name: 'Quarterly budget review' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Holiday plans' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '1 page' })).toBeVisible();
});
