// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { accessOf, RESTRICTION_STATES, restrictionsKey, restrictionState, stateOf } from './restriction-state';

describe('the way a page stands', () => {
  it('is private as soon as anyone is named for viewing, whoever may edit', () => {
    expect(restrictionState({ view: [1], edit: [] })).toBe('private');
    expect(restrictionState({ view: [1], edit: [1] })).toBe('private');
  });

  it('is view only when only editing is restricted', () => {
    expect(restrictionState({ view: [], edit: [1] })).toBe('view_only');
  });

  it('is open without restrictions', () => {
    expect(restrictionState({ view: [], edit: [] })).toBe('open');
  });
});

describe('the access row of Share', () => {
  it('shows a private page as reached by those chosen', () => {
    expect(accessOf('private')).toEqual({ reach: 'chosen', ability: 'edit' });
  });

  it('shows an open page as editable by the whole space', () => {
    expect(accessOf('open')).toEqual({ reach: 'space', ability: 'edit' });
  });

  it('shows a view-only page as viewable by the whole space', () => {
    expect(accessOf('view_only')).toEqual({ reach: 'space', ability: 'view' });
  });

  it('makes a page private when only those chosen reach it, whatever everyone may do', () => {
    expect(stateOf('chosen', 'edit')).toBe('private');
    expect(stateOf('chosen', 'view')).toBe('private');
  });

  it('makes a page open or view only for the whole space', () => {
    expect(stateOf('space', 'edit')).toBe('open');
    expect(stateOf('space', 'view')).toBe('view_only');
  });

  it('comes back to the same state after showing it', () => {
    for (const state of RESTRICTION_STATES) {
      const { reach, ability } = accessOf(state);
      expect(stateOf(reach, ability)).toBe(state);
    }
  });
});

describe('the cache of restrictions', () => {
  it('keeps the restrictions of each page apart', () => {
    expect(restrictionsKey('p1')).toEqual(['restrictions', 'p1']);
    expect(restrictionsKey('p1')).not.toEqual(restrictionsKey('p2'));
  });
});
