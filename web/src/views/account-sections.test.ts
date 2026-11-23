// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_SECTIONS,
  accountSectionAt,
  accountTabs,
  selectedTab,
  tabsOffered,
} from './account-sections';

describe('the sections of Your account', () => {
  it('gives every section its own id and address', () => {
    const ids = ACCOUNT_SECTIONS.map((section) => section.id);
    const addresses = ACCOUNT_SECTIONS.map((section) => section.address);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it('lists the tabs in the order of ACC-105', () => {
    expect(accountTabs().map((section) => section.id)).toEqual([
      'profile',
      'email',
      'security',
      'privacy',
      'preferences',
      'notifications',
      'watches',
    ]);
  });

  it('puts Tokens and Sessions below Security, not among the tabs', () => {
    for (const id of ['tokens', 'sessions']) {
      const section = ACCOUNT_SECTIONS.find((s) => s.id === id);
      expect(section?.parent).toBe('security');
      expect(accountTabs().map((s) => s.id)).not.toContain(id);
      expect(section && selectedTab(section)).toBe('security');
    }
  });

  it('keeps every address of before this wave, and adds three', () => {
    for (const address of [
      '/me',
      '/me/preferences',
      '/me/security',
      '/me/tokens',
      '/me/data',
      '/me/notifications',
    ]) {
      expect(accountSectionAt(address)?.address).toBe(address);
    }
    for (const address of ['/me/email', '/me/sessions', '/me/watches']) {
      expect(accountSectionAt(address)?.address).toBe(address);
    }
  });

  it('leaves the watches in the personal frame out of Your account', () => {
    expect(accountSectionAt('/me/watching')).toBeUndefined();
    expect(accountSectionAt('/me/unknown')).toBeUndefined();
    expect(accountSectionAt('/people')).toBeUndefined();
  });

  it('offers no tabs while a second factor is required', () => {
    expect(tabsOffered(true)).toEqual([]);
    expect(tabsOffered(false)).toEqual(accountTabs());
  });
});
