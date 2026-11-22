// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import '../../i18n';
import { keyNames } from './key-names';
import {
  CATEGORY_ENTRIES,
  CATEGORY_ORDER,
  ROLE_ORDER,
  categoriesShown,
  categoryOf,
  orderedItems,
  shortcutOf,
} from './insert-catalogue';
import {
  INSERT_ITEMS,
  TEMPLATE_ITEMS,
  TEMPLATE_SECTION_ITEM,
  TEMPLATE_VALUE_ITEM,
  matchingItems,
  type InsertItem,
} from './insert';
import { gridStep, rowsOf } from './insert-grid';
import { hasSample } from './insert-preview';

const EVERY_ITEM = [...INSERT_ITEMS, ...TEMPLATE_ITEMS, TEMPLATE_SECTION_ITEM, TEMPLATE_VALUE_ITEM];
const ids = (items: { id: string }[]) => items.map((item) => item.id);
const saved = (name: string): InsertItem => ({ ...INSERT_ITEMS[0]!, id: `saved_${name}`, label: name });

describe('the categories of the insert dialog', () => {
  it('put every entry in exactly one category', () => {
    for (const item of EVERY_ITEM) {
      const homes = CATEGORY_ORDER.filter((category) => CATEGORY_ENTRIES[category].includes(item.id));
      expect(homes, item.id).toHaveLength(1);
    }
  });

  it('name no entry that does not exist', () => {
    const known = new Set(ids(EVERY_ITEM));
    for (const category of CATEGORY_ORDER) {
      for (const id of CATEGORY_ENTRIES[category]) expect(known.has(id), id).toBe(true);
    }
  });

  it('put saved blocks with the wiki content', () => {
    expect(categoryOf('saved_abc')).toBe('wiki');
  });

  it('leave out the categories that hold nothing, and start with everything', () => {
    const shown = categoriesShown(INSERT_ITEMS);
    expect(shown[0]).toBe('all');
    expect(shown).not.toContain('outside');
    expect(shown).not.toContain('software');
    expect(shown).toContain('reports');
    expect(categoriesShown(INSERT_ITEMS.filter((item) => item.id === 'text'))).toEqual(['all', 'text']);
  });
});

describe('the order of the entries', () => {
  it('names every entry once in the order of roles', () => {
    for (const item of EVERY_ITEM) {
      expect(
        ROLE_ORDER.filter((id) => id === item.id),
        item.id,
      ).toHaveLength(1);
    }
  });

  it('starts with the items in a line and simple blocks, and keeps contents for the end', () => {
    const shown = ids(orderedItems(INSERT_ITEMS, []));
    expect(shown.slice(0, 3)).toEqual(['task', 'attach', 'pageFile']);
    expect(shown.indexOf('h6')).toBeLessThan(shown.indexOf('help'));
    expect(shown.indexOf('help')).toBeLessThan(shown.indexOf('block_recent_changes'));
    expect(shown.indexOf('block_recent_changes')).toBeLessThan(shown.indexOf('block_toc'));
    expect(shown.indexOf('block_toc')).toBeLessThan(shown.indexOf('spotlight'));
  });

  it('puts saved blocks after Help and before the dynamic blocks', () => {
    const shown = ids(orderedItems([...INSERT_ITEMS, saved('mine')], []));
    expect(shown.indexOf('saved_mine')).toBeGreaterThan(shown.indexOf('help'));
    expect(shown.indexOf('saved_mine')).toBeLessThan(shown.indexOf('block_recent_changes'));
  });

  it('puts what was used lately first, and shows it only once', () => {
    const shown = ids(orderedItems(INSERT_ITEMS, ['table', 'h2']));
    expect(shown.slice(0, 2)).toEqual(['table', 'h2']);
    expect(shown.filter((id) => id === 'table')).toHaveLength(1);
    expect(shown).toHaveLength(INSERT_ITEMS.length);
  });

  it('forgets a recent entry that does not exist, or does not fit the search', () => {
    const shown = ids(orderedItems(INSERT_ITEMS.slice(0, 2), ['gone', 'table']));
    expect(shown).not.toContain('gone');
    expect(shown).not.toContain('table');
    expect(shown).toHaveLength(2);
  });
});

describe('searching the entries', () => {
  it('finds by name, by description and by other words, across categories', () => {
    expect(ids(matchingItems('warning'))).toContain('panelWarning');
    expect(ids(matchingItems('callout'))).toContain('panelInfo');
    expect(ids(matchingItems('side by side'))).toEqual(
      expect.arrayContaining(['columns2', 'columns3', 'columns4', 'columns5']),
    );
    const tables = matchingItems('table').map((item) => categoryOf(item.id));
    expect(new Set(tables).size).toBeGreaterThan(1);
  });

  it('finds the new entries', () => {
    expect(ids(matchingItems('mention'))).toContain('mention');
    expect(ids(matchingItems('five columns'))).toContain('columns5');
    expect(ids(matchingItems('keyboard'))).toContain('help');
  });

  it('finds a saved block by its own name only', () => {
    expect(ids(matchingItems('mine', [saved('mine')]))).toEqual(['saved_mine']);
    expect(matchingItems('text', [saved('mine')])).toEqual([]);
  });
});

describe('the shortcut boxes', () => {
  it('show what is typed for a block that has a typing shortcut', () => {
    expect(shortcutOf('h1')).toEqual({ kind: 'typed', text: '#' });
    expect(shortcutOf('h6')).toEqual({ kind: 'typed', text: '######' });
    expect(shortcutOf('code')).toEqual({ kind: 'typed', text: '```' });
    expect(shortcutOf('decision')).toEqual({ kind: 'typed', text: '<>' });
    expect(shortcutOf('mention')).toEqual({ kind: 'typed', text: '@' });
  });

  it('show the keys when there is no typing shortcut', () => {
    expect(shortcutOf('link')).toEqual({ kind: 'keys', binding: 'Mod-k' });
  });

  it('show nothing for an entry without a shortcut', () => {
    expect(shortcutOf('block_toc')).toBeUndefined();
    expect(shortcutOf('saved_x')).toBeUndefined();
  });

  it('name the keys of a box as the system does', () => {
    expect(keyNames('Mod-k', true)).toEqual(['Cmd', 'K']);
    expect(keyNames('Mod-k', false)).toEqual(['Ctrl', 'K']);
  });
});

describe('the keys of the grid', () => {
  const grid = { at: 4, count: 10, columns: 3, rtl: false };

  it('move by cell and by row, and stop at the edges', () => {
    expect(gridStep('ArrowRight', grid)).toBe(5);
    expect(gridStep('ArrowLeft', grid)).toBe(3);
    expect(gridStep('ArrowDown', grid)).toBe(7);
    expect(gridStep('ArrowUp', grid)).toBe(1);
    expect(gridStep('ArrowDown', { ...grid, at: 8 })).toBe(8);
    expect(gridStep('ArrowUp', { ...grid, at: 1 })).toBe(1);
    expect(gridStep('ArrowRight', { ...grid, at: 9 })).toBe(9);
    expect(gridStep('ArrowLeft', { ...grid, at: 0 })).toBe(0);
  });

  it('go to the first and the last entry', () => {
    expect(gridStep('Home', grid)).toBe(0);
    expect(gridStep('End', grid)).toBe(9);
  });

  it('mirror left and right in right-to-left', () => {
    expect(gridStep('ArrowLeft', { ...grid, rtl: true })).toBe(5);
    expect(gridStep('ArrowRight', { ...grid, rtl: true })).toBe(3);
  });

  it('do nothing for other keys or an empty grid', () => {
    expect(gridStep('a', grid)).toBeNull();
    expect(gridStep('ArrowDown', { ...grid, count: 0 })).toBeNull();
  });

  it('cut the entries into rows of the grid', () => {
    expect(rowsOf([1, 2, 3, 4, 5], 3)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(rowsOf([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe('the preview in the tooltip', () => {
  it('draws a sample for simple blocks and none for blocks that fill themselves', () => {
    expect(hasSample('table')).toBe(true);
    expect(hasSample('columns5')).toBe(true);
    expect(hasSample('block_recent_changes')).toBe(false);
    expect(hasSample('saved_x')).toBe(false);
  });
});
