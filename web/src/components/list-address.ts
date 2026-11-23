// SPDX-License-Identifier: Apache-2.0
// The search, filters and sort of a list live in the address (spec 100, ADM-103), under the
// names of the parameters of the list's route, so a copied address opens the same view.
import { navigate, useLocation } from '../router';

/** Where a list starts again when what it shows changes: its first page. */
const PAGE_PARAMS = ['offset'];

/** The query with one parameter set, or taken away when empty; the list starts at its first page. */
export function withParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  for (const page of PAGE_PARAMS) next.delete(page);
  return next;
}

/** The query without these parameters, keeping everything else, such as the section of the settings. */
export function withoutParams(params: URLSearchParams, keys: readonly string[]): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of [...keys, ...PAGE_PARAMS]) next.delete(key);
  return next;
}

/** The query a list sends to its route: the parameters of the list that are set, nothing else. */
export function queryOf(params: URLSearchParams, keys: readonly string[]): string {
  const out = new URLSearchParams();
  for (const key of keys) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  return out.toString();
}

/** How a column sorts: both ways, ascending first, or only in the one direction its list knows. */
export type SortRule = { kind: 'both' } | { kind: 'one'; direction: 'ascending' | 'descending' };

export const BOTH_WAYS: SortRule = { kind: 'both' };

export type SortState = 'ascending' | 'descending' | 'none';

/** The state of a column for `aria-sort`, given the parameter sort; empty is the list's default column. */
export function sortStateOf(sort: string, column: string, defaultColumn: string, rule: SortRule): SortState {
  const current = sort || defaultColumn;
  if (current === `-${column}`) return 'descending';
  if (current !== column) return 'none';
  return rule.kind === 'one' ? rule.direction : 'ascending';
}

/**
 * The parameter sort after a press on a column's heading: a column that sorts both ways turns
 * round on a second press; any other press sorts by that column. The default column is no
 * parameter at all, so the address stays short.
 */
export function nextSort(sort: string, column: string, defaultColumn: string, rule: SortRule): string {
  const turnsRound = rule.kind === 'both' && sortStateOf(sort, column, defaultColumn, rule) === 'ascending';
  if (turnsRound) return `-${column}`;
  return column === defaultColumn ? '' : column;
}

/**
 * The query of the address, and how to change it without adding a step to the history. A
 * change reads the address as it is at that moment, so a search sent after a pause never
 * undoes a filter chosen during it.
 */
export function useListAddress() {
  const { searchParams } = useLocation();
  const go = (change: (now: URLSearchParams) => URLSearchParams) => {
    const query = change(new URLSearchParams(window.location.search)).toString();
    const path = window.location.pathname;
    navigate(query ? `${path}?${query}` : path, true);
  };
  return {
    params: searchParams,
    set: (key: string, value: string) => go((now) => withParam(now, key, value)),
    clear: (keys: readonly string[]) => go((now) => withoutParams(now, keys)),
  };
}
