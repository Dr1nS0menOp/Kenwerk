// SPDX-License-Identifier: Apache-2.0
// Rules as a chain of cards, in a real browser (spec 091): built from the keyboard, moved without
// dragging, every change said aloud, and the rules of who holds a rule kept (specs 092, 093).
import type { Browser, Page } from '@playwright/test';
import {
  ADMIN,
  checkAccessibility,
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

const MANAGER = ['space.view', 'space.automation'];

interface Definition {
  trigger: { kind: string; every?: string; at?: string };
  conditions?: unknown;
  actions: Record<string, unknown>[];
}

async function makeRule(page: Page, spaceId: string, name: string, definition: Definition, enabled = false) {
  const res = await page.request.post(`/api/v1/spaces/${spaceId}/rules`, {
    data: { name, enabled, definition },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function asPerson(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://localhost:8080' });
  const page = await context.newPage();
  await login(page, email, PASSWORD);
  return page;
}

/** The card of a step, by the words its name starts with. */
const card = (page: Page, name: string | RegExp) =>
  page.getByRole('list', { name: 'Steps of the rule' }).getByRole('button', { name, exact: false });

/** What the live region last said. */
const said = (page: Page) => page.locator('.rule-screen > [role="status"]');

const threeActions: Definition = {
  trigger: { kind: 'page.published' },
  actions: [
    { type: 'add_label', label: 'one' },
    { type: 'add_label', label: 'two' },
    { type: 'add_label', label: 'three' },
  ],
};

test.describe('rules as a chain of cards', () => {
  test('a new rule is built from the keyboard, saved off while it needs input, and then on', async ({
    page,
  }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Chain');
    await page.goto(`/spaces/${space.key}/settings/automation`);
    await page.getByRole('button', { name: 'New rule' }).click();
    await page.getByRole('button', { name: 'Start from empty' }).click();
    await expect(page).toHaveURL(new RegExp(`/spaces/${space.key}/settings/automation/new$`));

    // The trigger's placeholder is selected, and the list of triggers has the focus.
    const heading = page.getByRole('heading', { name: 'When does this rule run?' });
    await expect(heading).toBeFocused();
    const save = page.getByRole('button', { name: 'Save and switch on' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await checkAccessibility(page);

    // Search narrows the list; choosing a trigger makes saving possible.
    await page.getByRole('searchbox', { name: 'Search the triggers' }).fill('publ');
    await expect(page.getByRole('button', { name: 'Page edited' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Page published', exact: true }).click();
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');

    // The add button opens its menu from the keyboard.
    await page.getByRole('button', { name: 'Add a step after step 1' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Condition' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'What does this condition check?' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Add a step', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.getByRole('button', { name: 'Has the label' }).click();

    // A value left missing shows beside its field and on the card.
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(card(page, /^If: Has the label.*1 problem/)).toBeVisible();

    await page.getByRole('button', { name: 'Add a step after step 2' }).click();
    await page.getByRole('menuitem', { name: 'Action' }).click();
    await page.getByRole('button', { name: 'Notify' }).click();
    await page.getByLabel('For * (required)').selectOption('owner');
    const text = page.getByRole('textbox', { name: 'Text * (required)' });
    await text.fill('See ');
    await page.getByRole('button', { name: 'Put a value into Text * (required)' }).click();
    await page.getByRole('menuitem', { name: 'The title of the page' }).click();
    await expect(text).toHaveValue('See {page.title}');
    await expect(text).toBeFocused();
    await expect(said(page)).toHaveText('The title of the page was put into Text * (required).');

    // Escape in the panel gives the focus back to the card.
    await page.keyboard.press('Escape');
    await expect(card(page, /^Then: Notify/)).toBeFocused();

    // Saving while a step needs input saves the rule off, and says why.
    await save.click();
    await expect(page).toHaveURL(/\/rules\/[0-9a-f-]+$/);
    await expect(page.getByText(/Saved, but off: 1 step needs input/)).toBeVisible();
    await card(page, /^If: Has the label/).click();
    await page.getByRole('textbox', { name: 'Label * (required)' }).fill('release');
    await expect(card(page, /^If: Has the label\W+If the page has the label release$/)).toBeVisible();
    await page.getByRole('button', { name: 'Save and switch on' }).click();
    await expect(page.getByText('On, Saved')).toBeVisible();
    await checkAccessibility(page);

    // A reload shows the same chain.
    await page.reload();
    await expect(card(page, /^When: Page published/)).toBeVisible();
    await expect(card(page, /^If: Has the label\W+If the page has the label release$/)).toBeVisible();
    await expect(card(page, /^Then: Notify\W+Tells the owner: See \{page.title\}$/)).toBeVisible();
  });

  test('steps move by their buttons and by Alt with the arrow keys, and say where they went', async ({
    page,
  }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Moves');
    const id = await makeRule(page, space.id, 'Three labels', threeActions);
    await page.goto(`/rules/${id}`);
    const two = card(page, /Adds the label two/);
    await two.focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(said(page)).toHaveText('Add a label moved to place 3 of 3');
    await expect(card(page, /Adds the label two/)).toBeFocused();
    const order = await page.locator('.step-card').evaluateAll((all) => all.map((c) => c.textContent));
    expect(order.map((name) => name?.match(/label (\w+)$/)?.[1] ?? '')).toEqual(['', 'one', 'three', 'two']);

    // The last step cannot go further down: its button says so by being unavailable.
    await card(page, /Adds the label two/).click();
    await expect(page.getByRole('button', { name: 'Move down' })).toBeDisabled();
    await page.getByRole('button', { name: 'Move up' }).click();
    await expect(said(page)).toHaveText('Add a label moved to place 2 of 3');
  });

  test('a step is copied, and removed with Undo; the trigger has no Remove', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Copies');
    const id = await makeRule(page, space.id, 'Copy me', threeActions);
    await page.goto(`/rules/${id}`);
    await card(page, /^When/).click();
    await expect(page.getByRole('button', { name: 'Remove this step' })).toHaveCount(0);
    await card(page, /Adds the label one/).click();
    await page.getByRole('button', { name: 'Copy this step' }).click();
    await expect(card(page, /Adds the label one/)).toHaveCount(2);
    await page.getByRole('button', { name: 'Remove this step' }).click();
    await expect(card(page, /Adds the label one/)).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(card(page, /Adds the label one/)).toHaveCount(2);
    await expect(page.getByText('Changes not saved')).toBeVisible();
  });

  test('a page step under a schedule warns that it may not fit', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Fit');
    const id = await makeRule(page, space.id, 'Weekly label', {
      trigger: { kind: 'schedule', every: 'weekly', at: '09:00' },
      actions: [{ type: 'add_label', label: 'stale' }],
    });
    await page.goto(`/rules/${id}`);
    const step = card(page, /^Then: Add a label.*1 problem/);
    await expect(step).toBeVisible();
    await step.click();
    await expect(page.getByText('This step may not fit its trigger')).toBeVisible();
    await expect(page.getByText('Or choose a trigger that gives a page.')).toBeVisible();
    await checkAccessibility(page);
  });

  test('More exports, tests, shows the log, and deletes after asking', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'More');
    const id = await makeRule(page, space.id, 'Exported', threeActions);
    await page.goto(`/rules/${id}`);
    const more = page.getByRole('button', { name: 'More', exact: true });
    await more.click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Export' }).click();
    const file = await download;
    const saved = JSON.parse(
      await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()),
    ) as {
      definition: Definition;
    };
    expect(saved.definition.actions).toHaveLength(3);
    await more.click();
    await page.getByRole('menuitem', { name: 'Test this rule' }).click();
    await expect(page.getByRole('dialog', { name: 'Test this rule' })).toBeVisible();
    await page.keyboard.press('Escape');
    await more.click();
    await page.getByRole('menuitem', { name: 'Run log' }).click();
    await expect(page.getByRole('dialog', { name: 'Run log' })).toBeVisible();
    await page.keyboard.press('Escape');
    await more.click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(new RegExp(`/spaces/${space.key}/settings/automation$`));
    expect((await page.request.get(`/api/v1/rules/${id}`)).status()).toBe(404);
  });

  test('leaving with changes asks first', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Leave');
    const id = await makeRule(page, space.id, 'Unsaved', threeActions);
    await page.goto(`/rules/${id}`);
    await page.getByLabel('Name * (required)').fill('Renamed');
    await page.getByRole('button', { name: 'Back to the rules' }).click();
    await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(new RegExp(`/rules/${id}$`));
    await page.getByRole('button', { name: 'Back to the rules' }).click();
    await page.getByRole('button', { name: 'Leave without saving' }).click();
    await expect(page).toHaveURL(new RegExp(`/spaces/${space.key}/settings/automation$`));
  });

  test('someone who does not hold a rule takes it over only after asking, and cannot make its address', async ({
    browser,
    page,
  }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Held');
    const email = `${unique('keeper')}@example.com`;
    const keeperId = await createUser(browser, email);
    await grant(page, space.id, { type: 'user', id: keeperId }, MANAGER);
    const id = await makeRule(page, space.id, 'From outside', {
      trigger: { kind: 'incoming' },
      actions: [{ type: 'find_pages' }, { type: 'add_label', label: 'x' }],
    });
    const keeper = await asPerson(browser, email);
    await keeper.goto(`/rules/${id}`);
    await expect(keeper.getByText(/This rule acts as .*to change it, take it over/)).toBeVisible();
    await card(keeper, /^When: Incoming webhook/).click();
    await expect(keeper.getByText('Only the person this rule acts as can make its address.')).toBeVisible();
    await expect(keeper.getByRole('button', { name: /Make/ })).toHaveCount(0);
    await keeper.getByRole('button', { name: 'Next' }).click();
    await keeper.getByLabel('Name * (required)').fill('Mine now');
    await keeper.getByRole('button', { name: 'Save and switch on' }).click();
    const dialog = keeper.getByRole('dialog', { name: 'Take over this rule?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Take over and save' }).click();
    // A take-over always starts off (spec 092, D3).
    await expect(keeper.getByText('Off, Saved')).toBeVisible();
    const rule = (await (await keeper.request.get(`/api/v1/rules/${id}`)).json()) as {
      account_id: string;
      enabled: boolean;
      you_hold: boolean;
    };
    expect(rule).toMatchObject({ account_id: keeperId, enabled: false, you_hold: true });
    await keeper.context().close();
  });

  test('a card never names a page its viewer may not see', async ({ browser, page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Secrets');
    const secret = await publishedPage(page, space.id, 'Salaries next year', 'x');
    const me = (await (await page.request.get('/api/v1/me')).json()) as { user: { id: string } };
    const restricted = await page.request.put(`/api/v1/pages/${secret}/restrictions`, {
      data: { kind: 'view', subjects: [{ type: 'user', id: me.user.id }] },
    });
    expect(restricted.ok(), await restricted.text()).toBeTruthy();
    const email = `${unique('keeper')}@example.com`;
    const keeperId = await createUser(browser, email);
    await grant(page, space.id, { type: 'user', id: keeperId }, MANAGER);
    const id = await makeRule(page, space.id, 'Below the secret', {
      trigger: { kind: 'page.published' },
      conditions: { kind: 'below_page', value: secret },
      actions: [{ type: 'add_label', label: 'x' }],
    });
    await page.goto(`/rules/${id}`);
    await expect(card(page, /If the page is below Salaries next year/)).toBeVisible();
    const keeper = await asPerson(browser, email);
    await keeper.goto(`/rules/${id}`);
    await expect(card(keeper, /If the page is below a page you cannot see/)).toBeVisible();
    await expect(keeper.getByText('Salaries next year')).toHaveCount(0);
    await keeper.context().close();
  });

  test('a member who may not manage rules does not see one', async ({ browser, page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Closed');
    const email = `${unique('member')}@example.com`;
    const memberId = await createUser(browser, email);
    await grant(page, space.id, { type: 'user', id: memberId }, ['space.view']);
    const id = await makeRule(page, space.id, 'Hidden rule', threeActions);
    const member = await asPerson(browser, email);
    await member.goto(`/rules/${id}`);
    await expect(member.getByText(/does not exist, or you cannot see it/)).toBeVisible();
    await expect(member.getByText('Hidden rule')).toHaveCount(0);
    await member.context().close();
  });

  test('the screen works at 360 pixels, right to left, and zoomed', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const space = await newSpace(page, 'Narrow');
    const id = await makeRule(page, space.id, 'Narrow rule', threeActions);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/rules/${id}`);
    await expect(card(page, /^When/)).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(sideways).toBe(false);
    await checkAccessibility(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await checkAccessibility(page);
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    await zoomOut.click();
    await zoomOut.click();
    await expect(page.getByText('50%')).toBeVisible();
    await expect(zoomOut).toBeDisabled();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByText('150%')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    await checkAccessibility(page);
  });
});
