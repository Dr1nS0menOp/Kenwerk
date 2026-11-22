// SPDX-License-Identifier: Apache-2.0
// The addresses of a space's content (spec 094): the home page of a space at /spaces/<key>, every
// other page at /spaces/<key>/pages/<id>, and the older /pages/<id>, which keeps working. Every
// address of a page is built here, so the forms cannot drift apart (D13); a lint rule refuses one
// built by hand elsewhere.

/** The screens of a page besides the page itself. */
export type PageScreen = 'edit' | 'history' | 'compare' | 'insights';

const SCREENS: readonly PageScreen[] = ['edit', 'history', 'compare', 'insights'];

/** Where a page lives, when the caller knows it. */
export interface PagePlace {
  spaceKey: string;
  isHome: boolean;
}

export interface PagePathOptions {
  screen?: PageScreen;
  /** Without a place the address is /pages/<id>, which the page screen replaces with its own. */
  place?: PagePlace;
  /** Written as it should appear after the path, starting with ? */
  query?: string;
  /** A heading or comment, without the # */
  fragment?: string | null;
}

/** The address of a space, which shows its home page. */
export function spacePath(spaceKey: string): string {
  return `/spaces/${encodeURIComponent(spaceKey)}`;
}

/** The address of a page or one of its screens. The home page alone has the short address; its screens follow the one rule of every page (D4). */
export function pagePath(id: string, options: PagePathOptions = {}): string {
  const { screen, place, query = '', fragment } = options;
  let path: string;
  if (place && place.isHome && !screen) path = spacePath(place.spaceKey);
  else path = `${place ? spacePath(place.spaceKey) : ''}/pages/${id}${screen ? `/${screen}` : ''}`;
  return path + query + (fragment ? `#${fragment}` : '');
}

/** A page address read back: the id decides which page opens; the key only names the space. */
export interface PageAddress {
  id: string;
  screen: PageScreen | null;
  /** The key in the address as typed, or null for the /pages/<id> form. */
  key: string | null;
}

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const PAGE_PATH = new RegExp(`^(?:/spaces/([^/?#]+))?/pages/(${UUID})(?:/(${SCREENS.join('|')}))?/?$`);

/** Reads a path of either form, or null when it is no page's address. */
export function readPagePath(pathname: string): PageAddress | null {
  const found = PAGE_PATH.exec(pathname);
  if (!found || !found[2]) return null;
  const screen = (found[3] as PageScreen | undefined) ?? null;
  return { id: found[2], screen, key: found[1] ? decodeURIComponent(found[1]) : null };
}

/** Reads the page an address inside this installation leads to, with what follows it, as links in documents hold it. */
export function pageOfAddress(href: string): string | null {
  const found = new RegExp(`^(?:/spaces/[^/?#]+)?/pages/(${UUID})(?:[/?#]|$)`).exec(href);
  return found?.[1] ?? null;
}

/** What a page screen knows of its page once it may show it. */
export interface ShownPage {
  id: string;
  space_key: string;
  address: string;
}

/** The canonical address of what is shown: the page's own, or the screen under its space's key. */
export function canonicalPath(page: ShownPage, screen: PageScreen | null): string {
  if (!screen) return page.address;
  return pagePath(page.id, { screen, place: { spaceKey: page.space_key, isHome: false } });
}
