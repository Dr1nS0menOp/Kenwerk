// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { FOLD_ORDER, ROW_GROUPS, foldedGroups } from './tool-fold';
import { ariaKeys, keyNames } from './key-names';

const widths = (each: number) => ROW_GROUPS.map((id) => ({ id, width: each }));

describe('the row of tools (EDT-168, EDT-007)', () => {
  it('lists its groups in the order of the row', () => {
    expect(ROW_GROUPS).toEqual([
      'style',
      'marks',
      'lists',
      'align',
      'direct',
      'blocks',
      'insert',
      'link',
      'undo',
      'history',
      'last',
    ]);
  });

  it('folds nothing while everything fits', () => {
    expect(foldedGroups(widths(10), FOLD_ORDER, 110, 40).size).toBe(0);
  });

  it('folds the last group first, then History, link and the direct buttons from the end', () => {
    expect([...foldedGroups(widths(10), FOLD_ORDER, 109, 0)]).toEqual(['last']);
    expect([...foldedGroups(widths(10), FOLD_ORDER, 80, 0)]).toEqual(['last', 'history', 'link']);
    expect([...foldedGroups(widths(10), FOLD_ORDER, 50, 0)]).toEqual([
      'last',
      'history',
      'link',
      'insert',
      'blocks',
      'direct',
    ]);
  });

  it('makes room for the More button that folding brings', () => {
    // 110 wide with room for 105: one group would fit, but More needs 40, so a fifth goes.
    expect(foldedGroups(widths(10), FOLD_ORDER, 105, 40).size).toBe(5);
  });

  it('never folds the text style, which says where the cursor is', () => {
    expect(FOLD_ORDER).not.toContain('style');
    expect(foldedGroups(widths(10), FOLD_ORDER, 0, 40).has('style')).toBe(false);
    expect(new Set(FOLD_ORDER)).toEqual(new Set(ROW_GROUPS.filter((id) => id !== 'style')));
  });

  it('measures only the groups that are there, such as a row without Full width', () => {
    const shown = [
      { id: 'style', width: 50 },
      { id: 'history', width: 30 },
    ];
    expect([...foldedGroups(shown, FOLD_ORDER, 60, 0)]).toEqual(['history']);
  });
});

describe('keys as the system names them (NAV-067)', () => {
  it('names Mod and Alt by the system', () => {
    expect(keyNames('Mod-Alt-1', false)).toEqual(['Ctrl', 'Alt', '1']);
    expect(keyNames('Mod-Alt-1', true)).toEqual(['Cmd', 'Option', '1']);
  });

  it('keeps a last key that is itself punctuation', () => {
    expect(keyNames('Mod-,', false)).toEqual(['Ctrl', ',']);
    expect(keyNames('Mod-Shift-s', false)).toEqual(['Ctrl', 'Shift', 'S']);
  });

  it('gives aria-keyshortcuts the names ARIA expects', () => {
    expect(ariaKeys('Mod-b', false)).toBe('Control+B');
    expect(ariaKeys('Mod-Alt-0', true)).toBe('Meta+Alt+0');
  });
});
