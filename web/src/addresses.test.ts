// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { canonicalPath, pageOfAddress, pagePath, readPagePath, spacePath } from './addresses';

const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('pagePath', () => {
  it('puts the home page at its space and every other page under the key as stored', () => {
    expect(pagePath(id, { place: { spaceKey: 'Blue', isHome: true } })).toBe('/spaces/Blue');
    expect(pagePath(id, { place: { spaceKey: '~0190abcd12', isHome: false } })).toBe(
      `/spaces/~0190abcd12/pages/${id}`,
    );
    expect(spacePath('Blue')).toBe('/spaces/Blue');
  });

  it('gives the screens of the home page under its id, and keeps query and fragment', () => {
    expect(pagePath(id, { screen: 'edit', place: { spaceKey: 'Blue', isHome: true } })).toBe(
      `/spaces/Blue/pages/${id}/edit`,
    );
    expect(
      pagePath(id, { screen: 'compare', query: '?from=1&to=2', place: { spaceKey: 'B', isHome: false } }),
    ).toBe(`/spaces/B/pages/${id}/compare?from=1&to=2`);
    expect(pagePath(id, { fragment: 'steps' })).toBe(`/pages/${id}#steps`);
  });

  it('falls back to the id form without a space', () => {
    expect(pagePath(id)).toBe(`/pages/${id}`);
    expect(pagePath(id, { screen: 'history' })).toBe(`/pages/${id}/history`);
  });
});

describe('readPagePath', () => {
  it('reads both forms with their screen, and nothing else', () => {
    expect(readPagePath(`/pages/${id}`)).toEqual({ id, screen: null, key: null });
    expect(readPagePath(`/spaces/Old/pages/${id}/history`)).toEqual({ id, screen: 'history', key: 'Old' });
    expect(readPagePath(`/spaces/~01/pages/${id}/edit`)).toEqual({ id, screen: 'edit', key: '~01' });
    expect(readPagePath('/spaces/Blue')).toBeNull();
    expect(readPagePath(`/spaces/Blue/pages/${id}/nonsense`)).toBeNull();
    expect(readPagePath(`/spaces/Blue/settings`)).toBeNull();
  });
});

describe('pageOfAddress', () => {
  it('finds the page in either form of a link', () => {
    expect(pageOfAddress(`/pages/${id}#h`)).toBe(id);
    expect(pageOfAddress(`/spaces/K/pages/${id}?x`)).toBe(id);
    expect(pageOfAddress(`/spaces/K`)).toBeNull();
    expect(pageOfAddress(`https://example.org/pages/${id}`)).toBeNull();
  });
});

describe('canonicalPath', () => {
  const home = { id, space_key: 'Blue', address: '/spaces/Blue' };
  it('is the page address the server gave, or its screen under the key', () => {
    expect(canonicalPath(home, null)).toBe('/spaces/Blue');
    expect(canonicalPath(home, 'insights')).toBe(`/spaces/Blue/pages/${id}/insights`);
  });
});
