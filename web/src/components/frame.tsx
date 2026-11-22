// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canonicalPath, type PageScreen } from '../addresses';
import { api, type PageDetail, type Space } from '../api';
import { usePreferences } from '../preferences';
import { replaceAddress } from '../router';
import { spaceByKeyQuery } from './current-space';
import { GlobalPart } from './global-sidebar';
import { PageRefused } from './no-access';
import { SidebarToggle, useSidebarVisible } from './sidebar-state';
import { SpaceBlock } from './space-block';
import { Loading } from './ui';

// Every screen of a space finds its space by the key in its address.
export { spaceByKeyQuery };

const MIN_SIDEBAR_REM = 14;
const MAX_SIDEBAR_REM = 32;

const remInPixels = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
const clampWidth = (rem: number) => Math.min(MAX_SIDEBAR_REM, Math.max(MIN_SIDEBAR_REM, Math.round(rem)));

/** The edge of the sidebar. Dragging has a keyboard way as well (WCAG 2.5.7). */
export function SidebarEdge({ split }: { split: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const [width, setWidth] = useState(preferences.sidebar_width);
  const dragging = useRef(false);

  const [stored, setStored] = useState(preferences.sidebar_width);
  if (stored !== preferences.sidebar_width) {
    setStored(preferences.sidebar_width);
    setWidth(preferences.sidebar_width);
  }

  useEffect(() => {
    split.current?.style.setProperty('--sidebar-width', `${width}rem`);
  }, [width, split]);

  const isRtl = () => getComputedStyle(document.documentElement).direction === 'rtl';
  const widthAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = split.current?.getBoundingClientRect();
    if (!box) return width;
    const pixels = isRtl() ? box.right - e.clientX : e.clientX - box.left;
    return clampWidth(pixels / remInPixels());
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const wider = isRtl() ? 'ArrowLeft' : 'ArrowRight';
    const narrower = isRtl() ? 'ArrowRight' : 'ArrowLeft';
    if (e.key !== wider && e.key !== narrower) return;
    e.preventDefault();
    const next = clampWidth(width + (e.key === wider ? 1 : -1));
    setWidth(next);
    update({ sidebar_width: next });
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      className="sidebar-edge"
      aria-orientation="vertical"
      aria-label={t('space.sidebarWidth')}
      aria-valuemin={MIN_SIDEBAR_REM}
      aria-valuemax={MAX_SIDEBAR_REM}
      aria-valuenow={width}
      onKeyDown={keys}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragging.current) setWidth(widthAt(e));
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        update({ sidebar_width: widthAt(e) });
      }}
    />
  );
}

/**
 * A screen inside a space: the sidebar with the global part and the block of the space, and a
 * reading column. The button that hides the sidebar sits in the top bar (NAV-092).
 */
export function Frame({
  space,
  current,
  parent,
  focus,
  children,
}: {
  space: Space;
  current?: string;
  parent?: string | null;
  /** The editor: no reading column, and the tools run the full width of what is left. */
  focus?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const sidebarVisible = useSidebarVisible();
  const split = useRef<HTMLDivElement>(null);
  return (
    <div ref={split} className={sidebarVisible ? 'split' : 'split collapsed'}>
      <SidebarToggle />
      {sidebarVisible && (
        <div className="sidebar-frame">
          <aside className="sidebar">
            <GlobalPart />
            <SpaceBlock space={space} current={current} parent={parent ?? null} />
          </aside>
          <SidebarEdge split={split} />
        </div>
      )}
      {focus ? (
        <main id="main" className="focus">
          {children}
        </main>
      ) : (
        <main id="main" className="content">
          <div className="column">
            {space.status === 'archived' && (
              <p role="status" className="note">
                {t('space.archived')}
              </p>
            )}
            {children}
          </div>
        </main>
      )}
    </div>
  );
}

/**
 * Puts the canonical address of what is shown in the bar, once the page may be shown (spec 094,
 * rules 14, 19 and 20). It is built only from the page the server allowed, never from the key in
 * the address, and replaces the entry, so Back does not return to the old form.
 */
function useCanonicalAddress(
  page: PageDetail | undefined,
  space: Space | undefined,
  screen: PageScreen | null,
) {
  const client = useQueryClient();
  useEffect(() => {
    if (!page || !space) return;
    const target = canonicalPath(page, screen);
    if (window.location.pathname === target) return;
    // The home page's address is the space's: the screen there finds the space it has already.
    client.setQueryData(spaceByKeyQuery(page.space_key).queryKey, space);
    replaceAddress(target + window.location.search + window.location.hash);
  }, [client, page, space, screen]);
}

/** Frames a page with the sidebar of its space. */
export function SpaceShell({
  pageId,
  screen = null,
  focus,
  children,
}: {
  pageId: string;
  /** The screen of the page shown, for its canonical address. */
  screen?: PageScreen | null;
  focus?: boolean;
  children: ReactNode;
}) {
  const page = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => api.get<PageDetail>(`/pages/${pageId}`),
    // The frame stays while the next page loads, so the tree does not blink.
    placeholderData: (previous) => previous,
  });
  // Another page's answer kept while this one loads never names the address.
  const shown = page.data?.id === pageId && !page.isPlaceholderData ? page.data : undefined;
  const space = useQuery({
    queryKey: ['space-id', page.data?.space_id],
    queryFn: () => api.get<Space>(`/spaces/${page.data?.space_id}`),
    enabled: !!page.data,
  });
  useCanonicalAddress(shown, space.data, screen);
  if (page.isPending || (page.data && space.isPending)) return <Loading />;
  if (page.error || space.error || !space.data) {
    return <PageRefused pageId={pageId} error={page.error ?? space.error} />;
  }
  return (
    <Frame
      space={space.data}
      current={pageId}
      parent={page.data?.status === 'published' ? pageId : null}
      focus={focus}
    >
      {children}
    </Frame>
  );
}
