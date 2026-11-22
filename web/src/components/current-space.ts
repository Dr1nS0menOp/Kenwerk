// SPDX-License-Identifier: Apache-2.0
// Which space, and which page in it, the current screen shows. The top bar, the frame and the
// panels of the sidebar all ask, so it lives apart from any of them.
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readPagePath, spacePath } from '../addresses';
import { api, type PageDetail, type Space } from '../api';
import { mayCreateAnything } from '../create-permission';
import { match, replaceAddress, useLocation } from '../router';
import type { CreateTarget } from './create';

const SPACE_ROUTES = [
  '/spaces/:key',
  '/spaces/:key/settings',
  '/spaces/:key/trash',
  '/spaces/:key/overview',
  '/spaces/:key/files',
  '/spaces/:key/access',
  '/spaces/:key/people',
  '/spaces/:key/audit',
  '/spaces/:key/content',
  '/spaces/:key/blog',
  '/spaces/:key/archive',
  '/spaces/:key/labels',
  '/spaces/:key/templates',
  '/spaces/:key/release',
];

export const spaceByKeyQuery = (key: string) => ({
  queryKey: ['space', key],
  queryFn: () => api.get<Space>(`/space-keys/${encodeURIComponent(key)}`),
});

function firstMatch(patterns: string[], path: string, part: string): string | undefined {
  return patterns.map((pattern) => match(pattern, path)?.[part]).find(Boolean);
}

/** The space of the current screen, and the page in it if there is one. The space of a page
 * comes from the page, never from a key in its address (spec 094, rule 19); the home page at its
 * space's address is the page of that space. The edit screen has no space chrome, so it counts as
 * no page here. */
export function useCurrentSpace(): { space: Space | null; page: PageDetail | undefined } {
  const { pathname } = useLocation();
  const shown = readPagePath(pathname);
  const spaceKey = shown ? undefined : firstMatch(SPACE_ROUTES, pathname, 'key');
  const spaceAtKey = useQuery({ ...spaceByKeyQuery(spaceKey ?? ''), enabled: !!spaceKey });
  const atHome = !!spaceKey && match('/spaces/:key', pathname) !== null;
  const pageId =
    shown && (shown.screen === null || shown.screen === 'history' || shown.screen === 'compare')
      ? shown.id
      : atHome
        ? (spaceAtKey.data?.home_page_id ?? undefined)
        : undefined;
  const page = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => api.get<PageDetail>(`/pages/${pageId}`),
    enabled: !!pageId,
  });
  const spaceOfPage = useQuery({
    queryKey: ['space-id', page.data?.space_id],
    queryFn: () => api.get<Space>(`/spaces/${page.data?.space_id}`),
    enabled: !!page.data && !spaceKey,
  });
  return { space: (spaceKey ? spaceAtKey.data : spaceOfPage.data) ?? null, page: page.data };
}

/** Where the Create button puts a new item: below what you are reading, if you may make any kind there. */
export function useCreateTarget(): CreateTarget | null {
  const { space, page } = useCurrentSpace();
  if (!space || !mayCreateAnything(space.can)) return null;
  return { space, parent: page?.status === 'published' ? page.id : null };
}

/**
 * A screen of a space reached by an old key or a key in another case shows the current key in the
 * bar, once the space may be shown (spec 094, rule 18). The home page leaves this to the frame of
 * its page, which knows its own address.
 */
export function useCanonicalSpaceAddress(): void {
  const { pathname } = useLocation();
  const client = useQueryClient();
  const spaceKey = readPagePath(pathname) ? undefined : firstMatch(SPACE_ROUTES, pathname, 'key');
  const space = useQuery({ ...spaceByKeyQuery(spaceKey ?? ''), enabled: !!spaceKey });
  useEffect(() => {
    const current = space.data?.key;
    if (!spaceKey || !current || current === spaceKey || match('/spaces/:key', pathname)) return;
    client.setQueryData(spaceByKeyQuery(current).queryKey, space.data);
    const rest = pathname.slice(spacePath(spaceKey).length);
    replaceAddress(spacePath(current) + rest + window.location.search + window.location.hash);
  }, [client, pathname, space.data, spaceKey]);
}
