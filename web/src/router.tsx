// SPDX-License-Identifier: Apache-2.0
// A small client-side router. About a dozen screens do not justify a dependency.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

export function useLocation(): URL {
  return new URL(useSyncExternalStore(subscribe, snapshot), window.location.origin);
}

/**
 * Decides whether the app may leave the screen for another address. Returning false keeps the
 * screen, which then asks the person itself (spec 091, D15). One screen at a time holds it: a
 * page has one router, so this is the router's own state, like its listeners.
 */
export type LeaveGuard = (to: string) => boolean;

let leaveGuard: LeaveGuard | null = null;

/** Sets the one guard that navigate and Link consult, or clears it with null. */
export function guardLeaving(guard: LeaveGuard | null): void {
  leaveGuard = guard;
}

export function navigate(to: string, replace = false): void {
  if (leaveGuard && !leaveGuard(to)) return;
  const page = window.location.pathname;
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
  // Moving within a page raises no event by itself, and the page may have to jump.
  if (window.location.hash && window.location.pathname === page) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

/**
 * Replaces the address in the bar with another form of the same screen, without a new entry in
 * the history and without moving the page (spec 094): what is shown stays as it is.
 */
export function replaceAddress(to: string): void {
  window.history.replaceState(window.history.state, '', to);
  listeners.forEach((l) => l());
}

/** Returns the named parts when the path fits the pattern: /pages/:id/edit */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/');
  const b = path.replace(/\/$/, '').split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const part = a[i] ?? '';
    const value = b[i] ?? '';
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(value);
    else if (part !== value) return null;
  }
  return params;
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={click} {...rest} />;
}
