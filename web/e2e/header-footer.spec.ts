// SPDX-License-Identifier: Apache-2.0
// The installation's header and footer (spec 089): an administrator writes a few lines once, and
// every reader sees them above and below the text of each page and blog post. The header and footer
// are one value for the whole installation, so every test empties them again when it ends.
import type { Browser, Page } from '@playwright/test';
import {
  ADMIN,
  adminRequest,
  checkAccessibility,
  createUser,
  expect,
  expectHostilePasteHarmless,
  login,
  newSpace,
  paragraph,
  PASSWORD,
  publishedPage,
  test,
  unique,
} from './helpers';

const ADMIN_BAND = '/api/v1/admin/header-footer';
const ABOVE = 'Note from this installation, above the page';
const BELOW = 'Note from this installation, below the page';

const classification = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { align: 'center' },
      content: [{ type: 'status', attrs: { color: 'blue', text: 'Internal' } }],
    },
  ],
};

const contact = (href: string, words = 'the help desk') => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Questions: ' },
        { type: 'text', text: words, marks: [{ type: 'link', attrs: { href } }] },
      ],
    },
  ],
});

/** Stores a header and footer through the API as the administrator, who just logged in. */
async function setBand(browser: Browser, body: { header: unknown; footer: unknown }) {
  const { api, close } = await adminRequest(browser);
  const res = await api.put(ADMIN_BAND, { data: body });
  expect(res.ok(), await res.text()).toBeTruthy();
  await close();
}

/** Turns the part on or off for the whole installation, as Organising does. */
async function setPart(browser: Browser, on: boolean) {
  const { api, close } = await adminRequest(browser);
  const parts = (await (await api.get('/api/v1/admin/experimental')).json()) as { on: string[] };
  const next = parts.on.filter((part) => part !== 'header_footer');
  const res = await api.put('/api/v1/admin/experimental', {
    data: { on: on ? [...next, 'header_footer'] : next },
  });
  expect(res.status(), await res.text()).toBe(204);
  await close();
}

test.afterEach(async ({ browser }) => {
  await setPart(browser, true);
  await setBand(browser, { header: null, footer: null });
});

/** A member who reads a new space with a page and a blog post in it. */
async function readerWithPages(page: Page, browser: Browser) {
  await login(page, ADMIN.email, ADMIN.password);
  const space = await newSpace(page, unique('Band '));
  const pageId = await publishedPage(page, space.id, 'Opening hours', 'We are open from nine.');
  const post = await page.request.post('/api/v1/pages', {
    data: { space_id: space.id, title: 'News', kind: 'post' },
  });
  const postId = ((await post.json()) as { id: string }).id;
  const done = await page.request.post(`/api/v1/pages/${postId}/publish`, {
    data: { title: 'News', document: paragraph('A new office.'), base_version: 0 },
  });
  expect(done.ok(), await done.text()).toBeTruthy();
  const email = `${unique('reader')}@example.com`;
  const id = await createUser(browser, email);
  const grantRes = await page.request.put(`/api/v1/spaces/${space.id}/grants`, {
    data: { subject: { type: 'user', id }, permissions: ['space.view'] },
  });
  expect(grantRes.status(), await grantRes.text()).toBe(204);
  const reader = await browser.newContext();
  const readerPage = await reader.newPage();
  await login(readerPage, email, PASSWORD);
  return { readerPage, space, pageId, postId, close: () => reader.close() };
}

test('with the part off, the section is gone, its address says so, and a page shows no band', async ({
  page,
  browser,
}) => {
  await setBand(browser, { header: classification, footer: null });
  await setPart(browser, false);
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin/look');
  await expect(page.getByRole('link', { name: 'Header and footer' })).toHaveCount(0);
  await page.goto('/admin/header-footer');
  await expect(page.getByText('This is an experimental part, and it is off')).toBeVisible();
  const space = await newSpace(page, unique('Off '));
  await page.goto(`/pages/${await publishedPage(page, space.id, 'Quiet page', 'Nothing above.')}`);
  await expect(page.getByText('Nothing above.')).toBeVisible();
  await expect(page.getByRole('region', { name: ABOVE })).toHaveCount(0);
});

test('an administrator writes a classification and a contact, and a fresh login guards the save', async ({
  page,
}) => {
  await login(page, ADMIN.email, ADMIN.password);
  let asked = false;
  await page.route('**/api/v1/admin/header-footer', async (route) => {
    if (route.request().method() !== 'PUT' || asked) return route.fallback();
    asked = true;
    return route.fulfill({
      status: 403,
      json: { error: { code: 'reauth_required', message: 'Confirm who you are to do this.' } },
    });
  });
  await page.goto('/admin/look');
  await expect(page.getByRole('link', { name: /Header and footer/ })).toContainText('Experimental');
  await page.getByRole('link', { name: /Header and footer/ }).click();
  const header = page.getByRole('textbox', { name: 'Header' });
  await header.click();
  await page.keyboard.type('Internal');
  await page.keyboard.press('ControlOrMeta+a');
  await page.locator('.header-footer-field').first().getByRole('button', { name: 'Status mark' }).click();
  await page.getByRole('menuitem', { name: 'Blue' }).click();
  await page
    .locator('.header-footer-field')
    .first()
    .getByRole('button', { name: 'Align to the centre' })
    .click();
  const footer = page.getByRole('textbox', { name: 'Footer' });
  await footer.click();
  await page.keyboard.type('Questions: ');
  await page.locator('.header-footer-field').nth(1).getByRole('button', { name: 'Link' }).click();
  await page.getByLabel(/^Address/).fill('mailto:help@example.org');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm it is you' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Password').fill(ADMIN.password);
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await expect(page.getByText('Last changed by')).toBeVisible();
  const stored = (await (await page.request.get(ADMIN_BAND)).json()) as { header: unknown; footer: unknown };
  expect(JSON.stringify(stored.header)).toContain('"text":"Internal"');
  expect(JSON.stringify(stored.header)).toContain('"align":"center"');
  expect(JSON.stringify(stored.footer)).toContain('mailto:help@example.org');
  await checkAccessibility(page);
});

test('every reader sees the band around the text of a page, a blog post and a home page', async ({
  page,
  browser,
}) => {
  await setBand(browser, { header: classification, footer: contact('mailto:help@example.org') });
  const { readerPage, space, pageId, postId, close } = await readerWithPages(page, browser);
  for (const id of [pageId, postId, space.home_page_id]) {
    await readerPage.goto(`/pages/${id}`);
    const above = readerPage.getByRole('region', { name: ABOVE });
    const below = readerPage.getByRole('region', { name: BELOW });
    await expect(above).toContainText('Internal');
    await expect(below.getByRole('link', { name: 'the help desk' })).toHaveAttribute(
      'href',
      'mailto:help@example.org',
    );
    // Above the text and below it, before what follows the page.
    const order = await readerPage.evaluate(() => {
      const article = document.querySelector('article.page');
      const parts = [
        ...(article?.querySelectorAll('.instance-note-above, .ProseMirror, .instance-note-below') ?? []),
      ];
      return parts.map((p) => (p.classList.contains('ProseMirror') ? 'text' : p.className));
    });
    expect(order).toEqual(['instance-note instance-note-above', 'text', 'instance-note instance-note-below']);
  }
  await checkAccessibility(readerPage);
  await close();
});

test('an outside link shows its host and opens in a new tab; a link inside does not', async ({
  page,
  browser,
}) => {
  await setBand(browser, {
    header: contact('/search', 'search'),
    footer: contact('https://help.example.org/', 'Help'),
  });
  await login(page, ADMIN.email, ADMIN.password);
  const space = await newSpace(page, unique('Links '));
  await page.goto(`/pages/${await publishedPage(page, space.id, 'Linked', 'Some text.')}`);
  const help = page.getByRole('region', { name: BELOW }).getByRole('link');
  await expect(help).toContainText('Help (help.example.org)');
  await expect(help).toHaveAttribute('target', '_blank');
  await expect(help).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  const inside = page.getByRole('region', { name: ABOVE }).getByRole('link', { name: 'search' });
  await expect(inside).not.toHaveAttribute('target', '_blank');
});

test.describe('hostile content', () => {
  // The policy reports the handlers it blocks while ProseMirror parses the paste; see
  // expectHostilePasteHarmless, which allows that report and nothing else.
  test.use({ expectViolations: true });

  test('script and outside content never reach the band, by paste or by the API', async ({
    page,
    browser,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => {
      errors.push(`a dialog opened: ${dialog.message()}`);
      void dialog.dismiss();
    });
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/admin/header-footer');
    const header = page.getByRole('textbox', { name: 'Header' });
    await header.click();
    await expectHostilePasteHarmless(page);
    await expect(header).toContainText('Big');
    await expect(header).toContainText('bold');
    await expect(header.locator('img, script, a, h1, mark, [onmouseover], [onerror]')).toHaveCount(0);
    for (const href of ['javascript:alert(1)', 'http://intranet.example/']) {
      const refused = await page.request.put(ADMIN_BAND, { data: { header: null, footer: contact(href) } });
      expect(refused.status()).toBe(400);
      expect(await refused.text()).toContain('"field":"footer"');
    }
    const csp = (await page.request.get('/')).headers()['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    const space = await newSpace(page, unique('Safe '));
    await page.goto(`/pages/${await publishedPage(page, space.id, 'Safe page', 'Plain text.')}`);
    await expect(page.getByText('Plain text.')).toBeVisible();
    await expect(page.getByRole('region', { name: BELOW })).toHaveCount(0);
    await setBand(browser, { header: classification, footer: null });
    expect(errors).toEqual([]);
  });
});

test('the band prints, and the login page and the editor never show it', async ({ page, browser }) => {
  await setBand(browser, { header: classification, footer: contact('mailto:help@example.org') });
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByText('Internal')).toHaveCount(0);
  await login(page, ADMIN.email, ADMIN.password);
  const space = await newSpace(page, unique('Print '));
  const id = await publishedPage(page, space.id, 'Printed', 'On paper.');
  await page.goto(`/pages/${id}`);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: ABOVE })).toBeVisible();
  await expect(page.getByRole('region', { name: BELOW })).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.goto(`/pages/${id}/edit`);
  await expect(page.locator('.prose.editing')).toBeVisible();
  await expect(page.getByRole('region', { name: ABOVE })).toHaveCount(0);
});
