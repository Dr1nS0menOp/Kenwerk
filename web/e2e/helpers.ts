// SPDX-License-Identifier: Apache-2.0
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  expect,
  test as base,
  type APIRequestContext,
  type Browser,
  type Dialog,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const ADMIN = { email: 'admin@example.com', password: 'correct horse battery staple' };
export const PASSWORD = 'correct horse battery staple';

/** Every test fails on a Content Security Policy violation or a script error. */
export const test = base.extend<{ expectViolations: boolean; watch: void }>({
  expectViolations: [false, { option: true }],
  watch: [
    async ({ page, expectViolations }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push('script error: ' + e.message));
      page.on('console', (m) => {
        const text = m.text();
        if (m.type() === 'error' && /Content.Security.Policy|Trusted/i.test(text)) problems.push(text);
      });
      await use();
      if (!expectViolations) expect(problems, 'browser problems').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Opens More on a page and chooses an entry, following sub-menus: `pageMenu(page, 'Archive
 * or delete', 'Delete')` (spec 079). Names are exact, so an entry is never mistaken for
 * another that starts with the same word.
 */
export async function pageMenu(page: Page, ...entries: string[]) {
  await page.getByRole('button', { name: 'More actions' }).click();
  for (const name of entries) {
    await page.getByRole('menuitem', { name, exact: true }).click();
  }
}

/** Opens the restrictions of a page in detail: the lock is on Share, and they are in its More (COL-108). */
export async function openRestrictions(page: Page) {
  await page.getByRole('button', { name: /^Share\. Restrictions/ }).click();
  await page
    .getByRole('dialog', { name: 'Share this page' })
    .getByRole('button', { name: 'More about sharing' })
    .click();
  await page.getByRole('menuitem', { name: 'Restrictions in detail' }).click();
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  // The account button is in the top bar of every screen after login, on every width.
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
  // People with only a password are asked for more. Tests on other things put that off.
  await page.request.post('/api/v1/me/sign-in-prompt/later');
}

/**
 * Waits until the editor really has the focus. TipTap gives it back in the next
 * frame, and ProseMirror puts the cursor back 20 ms after focus. No person can type
 * that fast, but a test can: on a slow machine its keys then land somewhere else.
 * This timer starts after that one and lasts longer, so it always ends later.
 */
export async function editorSettled(page: Page) {
  await expect(page.locator('.prose.editing')).toBeFocused();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 40))));
}

/**
 * Pasted HTML that tries each way to run script: event handlers, a script and a javascript: link.
 * A handler that ran would set `pasteRan` on the window.
 */
export const HOSTILE_HTML =
  '<h1>Big</h1><img src=x onerror="window.pasteRan=1;alert(1)"><b onmouseover=alert(4)>bold</b>' +
  '<script>window.pasteRan=2</script><a href="javascript:alert(3)">click</a><mark>lit</mark>';

/** What a watched paste saw: elements that reached the live document, and the policy's reports. */
export interface WatchedPaste {
  /** Every attached element with an event handler, a script or a javascript: address. */
  attached: string[];
  /** The directive of every report of the Content Security Policy. */
  reports: string[];
}

/**
 * Pastes HTML into the focused element as a browser does, with the raw HTML on the clipboard, and
 * answers what happened on the way. Whatever parses the paste is watched from before it starts.
 */
export async function pasteWatched(page: Page, html: string): Promise<WatchedPaste> {
  return page.evaluate(async (pasted) => {
    const seen: { attached: string[]; reports: string[] } = { attached: [], reports: [] };
    const look = (node: Node) => {
      if (!(node instanceof Element)) return;
      for (const element of [node, ...node.querySelectorAll('*')]) {
        if (element.tagName === 'SCRIPT') seen.attached.push('script element');
        for (const name of element.getAttributeNames()) {
          const value = element.getAttribute(name) ?? '';
          if (/^on/i.test(name)) seen.attached.push(`${element.tagName} with ${name}`);
          if (/^\s*javascript:/i.test(value))
            seen.attached.push(`${element.tagName} with a javascript: ${name}`);
        }
      }
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') look(record.target);
        record.addedNodes.forEach(look);
      }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true });
    const report = (event: SecurityPolicyViolationEvent) => seen.reports.push(event.violatedDirective);
    document.addEventListener('securitypolicyviolation', report);
    const data = new DataTransfer();
    data.setData('text/html', pasted);
    document.activeElement?.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
    // Reports arrive as tasks of their own, so wait for a drawn frame and a task after it.
    await new Promise((done) => requestAnimationFrame(() => setTimeout(done, 200)));
    observer.disconnect();
    document.removeEventListener('securitypolicyviolation', report);
    return seen;
  }, html);
}

/**
 * Pastes HOSTILE_HTML into the focused editor and holds that it did no harm: nothing with a handler,
 * no script and no javascript: address reached the page, no script ran and no dialog opened.
 *
 * The browser does report the handlers once: ProseMirror parses a paste in a detached document, and
 * Chromium checks an inline handler against the policy as it parses one, even there. That report,
 * `script-src-attr`, is the policy doing its job, and the only report allowed. A test that calls
 * this must allow reports with `test.use({ expectViolations: true })`.
 */
export async function expectHostilePasteHarmless(page: Page) {
  const problems: string[] = [];
  const onError = (error: Error) => problems.push(`script error: ${error.message}`);
  const onDialog = (dialog: Dialog) => {
    problems.push(`a dialog opened: ${dialog.message()}`);
    void dialog.dismiss();
  };
  page.on('pageerror', onError);
  page.on('dialog', onDialog);
  const { attached, reports } = await pasteWatched(page, HOSTILE_HTML);
  expect(attached, 'reached the live document').toEqual([]);
  expect(reports.length, 'the policy blocked the handlers').toBeGreaterThan(0);
  expect(new Set(reports), 'only inline handlers were reported').toEqual(new Set(['script-src-attr']));
  expect(await page.evaluate(() => (window as { pasteRan?: number }).pasteRan)).toBeUndefined();
  page.off('pageerror', onError);
  page.off('dialog', onDialog);
  expect(problems).toEqual([]);
}

/** What the publish step can be asked to set before it publishes (spec 082). */
export interface PublishStepChoices {
  summary?: string;
  /** Leaves Notify watchers off. */
  silent?: boolean;
}

/** Opens the publish step from the editor's strip and publishes with its primary button. */
export async function publishFromEditor(page: Page, choices: PublishStepChoices = {}) {
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  const step = page.getByRole('dialog', { name: 'Publish', exact: true });
  await expect(step).toBeVisible();
  if (choices.summary !== undefined) await step.getByLabel('What changed? (optional)').fill(choices.summary);
  if (choices.silent) await step.getByLabel('Notify watchers').uncheck();
  await step.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(step).toHaveCount(0);
}

let counter = 0;
export const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${counter++}`;

export async function adminRequest(
  browser: Browser,
): Promise<{ api: APIRequestContext; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL: process.env.BASE_URL ?? 'http://localhost:8080' });
  const res = await context.request.post('/api/v1/auth/login', { data: ADMIN });
  expect(res.ok()).toBeTruthy();
  return { api: context.request, close: () => context.close() };
}

/** Creates a user through the admin API and returns the id. */
export async function createUser(browser: Browser, email: string, type = 'member', perms?: string[]) {
  const { api, close } = await adminRequest(browser);
  const res = await api.post('/api/v1/admin/users', {
    data: {
      email,
      display_name: email.split('@')[0],
      type,
      password: PASSWORD,
      global_permissions: perms ?? null,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const user = (await res.json()) as { id: string };
  await close();
  return user.id;
}

/**
 * A system administrator who just logged in and has recovery codes, for a change that lets more
 * through than before, such as putting a test's setting back (spec 076).
 */
export async function confirmingAdministrator(
  browser: Browser,
): Promise<{ api: APIRequestContext; codes: string[]; close: () => Promise<void> }> {
  const email = `${unique('keeper')}@example.com`;
  await createUser(browser, email, 'member', ['use_product', 'administrator', 'system_administrator']);
  const context = await browser.newContext({ baseURL: process.env.BASE_URL ?? 'http://localhost:8080' });
  const res = await context.request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const setup = await context.request.post('/api/v1/me/totp/begin', { data: { password: PASSWORD } });
  const { secret } = (await setup.json()) as { secret: string };
  const confirm = await context.request.post('/api/v1/me/totp/confirm', { data: { code: totpCode(secret) } });
  expect(confirm.ok(), await confirm.text()).toBeTruthy();
  const { recovery_codes: codes } = (await confirm.json()) as { recovery_codes: string[] };
  return { api: context.request, codes, close: () => context.close() };
}

/** The steps of a workflow whose approval its author signs as approved (spec 064, DOC-700). */
export const SIGNED_FLOW = {
  states: [
    { id: 'draft', name: 'Draft', kind: 'draft', start: true },
    { id: 'review', name: 'In review', kind: 'in_review' },
    { id: 'approved', name: 'Approved', kind: 'approved' },
  ],
  transitions: [
    { id: 'submit', name: 'Send for review', from: 'draft', to: 'review' },
    { id: 'approve', name: 'Approve', from: 'review', to: 'approved', signature_meaning: 'approved' },
  ],
};

/**
 * A person who may sign: a member with an authenticator app, whose signing an administrator
 * enabled after identifying them in person (DOC-751). It answers a logged-in context of theirs
 * and the secret of their app.
 */
export async function signer(
  browser: Browser,
  email: string,
  displayName: string,
): Promise<{ id: string; page: Page; secret: string; close: () => Promise<void> }> {
  const id = await createNamedUser(browser, email, displayName);
  const { api, close } = await adminRequest(browser);
  const enabled = await api.put(`/api/v1/admin/users/${id}/signing`, {
    data: { identified_by: 'in_person' },
  });
  expect(enabled.status(), await enabled.text()).toBe(204);
  await close();
  const context = await browser.newContext({ baseURL: process.env.BASE_URL ?? 'http://localhost:8080' });
  const page = await context.newPage();
  await login(page, email, PASSWORD);
  const setup = await page.request.post('/api/v1/me/totp/begin', { data: { password: PASSWORD } });
  const { secret } = (await setup.json()) as { secret: string };
  const confirm = await page.request.post('/api/v1/me/totp/confirm', { data: { code: totpCode(secret) } });
  expect(confirm.ok(), await confirm.text()).toBeTruthy();
  return { id, page, secret, close: () => context.close() };
}
/** A user with a real name, for screens where the name shows. */
export async function createNamedUser(browser: Browser, email: string, displayName: string) {
  const { api, close } = await adminRequest(browser);
  const res = await api.post('/api/v1/admin/users', {
    data: { email, display_name: displayName, type: 'member', password: PASSWORD, global_permissions: null },
  });
  expect(res.status(), await res.text()).toBe(201);
  const user = (await res.json()) as { id: string };
  await close();
  return user.id;
}

export async function newSpace(page: Page, name: string) {
  const key = unique('S');
  const res = await page.request.post('/api/v1/spaces', { data: { key, name } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; key: string; home_page_id: string };
}

export function paragraph(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

export async function publishedPage(
  page: Page,
  spaceId: string,
  title: string,
  text: string,
  parent?: string,
) {
  const created = await page.request.post('/api/v1/pages', {
    data: { space_id: spaceId, parent_id: parent ?? null, title },
  });
  expect(created.status(), await created.text()).toBe(201);
  const p = (await created.json()) as { id: string };
  const done = await page.request.post(`/api/v1/pages/${p.id}/publish`, {
    data: { title, document: paragraph(text), base_version: 0 },
  });
  expect(done.ok(), await done.text()).toBeTruthy();
  return p.id;
}

export async function grant(
  page: Page,
  spaceId: string,
  subject: { type: string; id: string },
  perms: string[],
) {
  const res = await page.request.put(`/api/v1/spaces/${spaceId}/grants`, {
    data: { subject, permissions: perms },
  });
  expect(res.status(), await res.text()).toBe(204);
}

export const VIEWER = ['space.view', 'space.export'];
export const EDITOR = ['space.view', 'page.create', 'page.edit', 'page.delete_own', 'attachment.add'];

/** Accessibility: WCAG 2.2 AA is the goal (blueprint 01). */
export async function checkAccessibility(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary).toEqual([]);
}

const WOFF_HEADER_BYTES = 44;
const WOFF_ENTRY_BYTES = 20;
const SFNT_ENTRY_BYTES = 16;
const SFNT_HEADER_BYTES = 12;
const padded = (length: number) => (length + 3) & ~3;

/** A real web font from a font in the test image: WOFF may store its tables uncompressed. */
export function realFont(path = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'): Buffer {
  const font = readFileSync(path);
  const tableCount = font.readUInt16BE(4);
  const tables = Array.from({ length: tableCount }, (_, i) => {
    const at = SFNT_HEADER_BYTES + i * SFNT_ENTRY_BYTES;
    return {
      tag: font.subarray(at, at + 4),
      checksum: font.readUInt32BE(at + 4),
      offset: font.readUInt32BE(at + 8),
      length: font.readUInt32BE(at + 12),
    };
  });
  const bodyStart = WOFF_HEADER_BYTES + tableCount * WOFF_ENTRY_BYTES;
  const bodySize = tables.reduce((sum, table) => sum + padded(table.length), 0);
  const woff = Buffer.alloc(bodyStart + bodySize);
  woff.write('wOFF', 0, 'latin1');
  woff.writeUInt32BE(font.readUInt32BE(0), 4);
  woff.writeUInt32BE(woff.length, 8);
  woff.writeUInt16BE(tableCount, 12);
  woff.writeUInt32BE(SFNT_HEADER_BYTES + tableCount * SFNT_ENTRY_BYTES + bodySize, 16);
  woff.writeUInt16BE(1, 20);
  let cursor = bodyStart;
  tables.forEach((table, i) => {
    const entry = WOFF_HEADER_BYTES + i * WOFF_ENTRY_BYTES;
    table.tag.copy(woff, entry);
    woff.writeUInt32BE(cursor, entry + 4);
    woff.writeUInt32BE(table.length, entry + 8);
    woff.writeUInt32BE(table.length, entry + 12);
    woff.writeUInt32BE(table.checksum, entry + 16);
    font.copy(woff, cursor, table.offset, table.offset + table.length);
    cursor += padded(table.length);
  });
  return woff;
}

/** RFC 6238, written out so the test does not share code with the server. */
export function totpCode(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = bits.match(/.{8}/g)?.map((b) => parseInt(b, 2)) ?? [];
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 15;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return n.toString().padStart(6, '0');
}
