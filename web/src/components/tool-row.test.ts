// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { nextSort, sortStateOf, withoutParams, withParam, type SortRule } from './list-address';
import {
  anythingSet,
  filterWords,
  isFilterSet,
  moreLineShown,
  rowParams,
  type ToolFilter,
} from './tool-row-model';

const words = (name: string, value: string) => `${name}: ${value}`;
const role: ToolFilter = {
  kind: 'choice',
  param: 'role',
  label: 'Role',
  icon: null,
  place: 'row',
  options: [
    { value: 'administrator', label: 'Administrator' },
    { value: 'create_space', label: 'Create spaces' },
  ],
};
const time: ToolFilter = {
  kind: 'field',
  params: ['since', 'until'],
  label: 'Time',
  icon: null,
  place: 'more',
  valueText: 'From 1 November',
  field: null,
};
const both: SortRule = { kind: 'both' };
const newestFirst: SortRule = { kind: 'one', direction: 'descending' };

describe('a filter of the tool row', () => {
  it('says only its name while not set', () => {
    expect(filterWords(role, new URLSearchParams(), words)).toBe('Role');
  });
  it('says its name and its value in words once set', () => {
    expect(filterWords(role, new URLSearchParams('role=create_space'), words)).toBe('Role: Create spaces');
    expect(filterWords(time, new URLSearchParams('until=2026-11-30'), words)).toBe('Time: From 1 November');
  });
  it('shows a value it does not know as it is, rather than hiding that it is set', () => {
    expect(filterWords(role, new URLSearchParams('role=gone'), words)).toBe('Role: gone');
  });
  it('is set when any of its parameters holds something', () => {
    expect(isFilterSet(time, new URLSearchParams('since=x'))).toBe(true);
    expect(isFilterSet(time, new URLSearchParams('since='))).toBe(false);
  });
});

describe('the line of more filters', () => {
  it('stays shut until opened', () => {
    expect(moreLineShown([role, time], new URLSearchParams('role=administrator'), false)).toBe(false);
    expect(moreLineShown([role, time], new URLSearchParams(), true)).toBe(true);
  });
  it('shows by itself while one of its filters is set, so a set filter is never hidden', () => {
    expect(moreLineShown([role, time], new URLSearchParams('since=2026-11-01'), false)).toBe(true);
  });
});

describe('Reset', () => {
  it('takes away the search, every filter and the sort', () => {
    expect(rowParams('q', [role, time], 'sort')).toEqual(['q', 'role', 'since', 'until', 'sort']);
    expect(rowParams(null, [role], null)).toEqual(['role']);
  });
  it('shows only while something of the row is set', () => {
    const keys = rowParams('q', [role], 'sort');
    expect(anythingSet(new URLSearchParams('section=people'), keys)).toBe(false);
    expect(anythingSet(new URLSearchParams('section=people&sort=-name'), keys)).toBe(true);
  });
});

describe('the address of a list', () => {
  it('sets a parameter, takes an empty one away and starts again at the first page', () => {
    const start = new URLSearchParams('section=people&kind=group&offset=50');
    expect(withParam(start, 'role', 'r1').toString()).toBe('section=people&kind=group&role=r1');
    expect(withParam(start, 'kind', '').toString()).toBe('section=people');
  });
  it('keeps what is not the list’s own on Reset, such as the section of the settings', () => {
    const start = new URLSearchParams('section=people&kind=group&q=ann');
    expect(withoutParams(start, ['q', 'kind', 'sort']).toString()).toBe('section=people');
  });
});

describe('sorting by a column', () => {
  it('starts on the default column without a parameter', () => {
    expect(sortStateOf('', 'name', 'name', both)).toBe('ascending');
    expect(sortStateOf('', 'email', 'name', both)).toBe('none');
  });
  it('sorts by a new column ascending, then turns it round, then back', () => {
    expect(nextSort('', 'email', 'name', both)).toBe('email');
    expect(nextSort('email', 'email', 'name', both)).toBe('-email');
    expect(nextSort('-email', 'email', 'name', both)).toBe('email');
    expect(sortStateOf('-email', 'email', 'name', both)).toBe('descending');
  });
  it('turns the default column round, and back to no parameter', () => {
    expect(nextSort('', 'name', 'name', both)).toBe('-name');
    expect(nextSort('-name', 'name', 'name', both)).toBe('');
  });
  it('keeps a column that sorts one way in that way', () => {
    expect(nextSort('', 'changed', 'title', newestFirst)).toBe('changed');
    expect(nextSort('changed', 'changed', 'title', newestFirst)).toBe('changed');
    expect(sortStateOf('changed', 'changed', 'title', newestFirst)).toBe('descending');
    expect(sortStateOf('changed', 'title', 'title', { kind: 'one', direction: 'ascending' })).toBe('none');
  });
});
