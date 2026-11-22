// SPDX-License-Identifier: Apache-2.0
// The parts of one entry that the slash menu and the insert dialog share: its words, its icon
// tile and its shortcut box (spec 082, EDT-187, EDT-191).
import i18n from '../../i18n';
import { shortcutOf, toneOf } from './insert-catalogue';
import { keysHere } from './key-names';
import type { InsertItem } from './insert';

const TILE_ICON_SIZE = 18;

/** The name of an entry: a saved block keeps the words its maker gave it. */
export const entryName = (item: InsertItem): string => item.label ?? i18n.t(`insert.${item.id}.name`);

/** What an entry adds, in a sentence. */
export const entryDescription = (item: InsertItem): string =>
  item.label ? i18n.t('insert.savedHint') : i18n.t(`insert.${item.id}.hint`);

/** The icon of an entry on its square tile; a panel's icon is in the panel's colour. */
export function InsertTile({ item }: { item: InsertItem }) {
  const tone = toneOf(item.id);
  return (
    <span className={tone ? `insert-tile tone-${tone}` : 'insert-tile'} aria-hidden="true">
      <item.icon size={TILE_ICON_SIZE} />
    </span>
  );
}

/**
 * What to type, or the keys to press, to add the entry without a menu. It is part of the
 * entry's name for screen readers, and hidden on a touch screen without a keyboard.
 */
export function ShortcutBox({ id }: { id: string }) {
  const shortcut = shortcutOf(id);
  if (!shortcut) return null;
  return (
    <span className="shortcut-box">
      {' '}
      {shortcut.kind === 'typed' ? (
        <kbd>{shortcut.text}</kbd>
      ) : (
        keysHere(shortcut.binding).map((key) => <kbd key={key}>{key}</kbd>)
      )}
    </span>
  );
}
