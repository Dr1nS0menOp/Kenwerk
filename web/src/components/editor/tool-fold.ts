// SPDX-License-Identifier: Apache-2.0
// Tools that do not fit fold into More (EDT-007, spec 027 D1, spec 082 behaviour 13).
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** The groups of the row, in the order of the row (EDT-168, EDT-169). */
export const ROW_GROUPS = [
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
] as const;

export type RowGroup = (typeof ROW_GROUPS)[number];

/**
 * The order in which groups fold: the last group first, then History, link and the direct
 * buttons from the end (behaviour 13), then what is left from the end. The text style never
 * folds, because it says where the cursor is.
 */
export const FOLD_ORDER: RowGroup[] = [
  'last',
  'history',
  'link',
  'insert',
  'blocks',
  'direct',
  'align',
  'lists',
  'undo',
  'marks',
];

export interface GroupWidth {
  id: string;
  width: number;
}

/** Which groups fold into More, in the order they fold, so the rest and the More button fit. */
export function foldedGroups(
  widths: GroupWidth[],
  foldOrder: readonly string[],
  room: number,
  moreWidth: number,
) {
  const folded = new Set<string>();
  let used = widths.reduce((sum, group) => sum + group.width, 0);
  if (used <= room) return folded;
  const left = room - moreWidth;
  for (const id of foldOrder) {
    if (used <= left) break;
    const group = widths.find((g) => g.id === id);
    if (!group) continue;
    used -= group.width;
    folded.add(id);
  }
  return folded;
}

/** Room for a More button, which is not on the screen while it is not needed. */
const MORE_WIDTH_PX = 40;
const GROUP_SELECTOR = ':scope > [data-tool-group]';

/**
 * Watches the row. A group that has folded is not on the screen, so its width is the one
 * it had when it last was: that tells when it fits again.
 */
export function useToolFolding(row: RefObject<HTMLElement | null>, groups: readonly string[]) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const widths = useRef(new Map<string, number>());
  const key = groups.join(' ');

  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const ids = key.split(' ');
    const measure = () => {
      const style = getComputedStyle(element);
      const gap = parseFloat(style.columnGap) || 0;
      const padding = (parseFloat(style.paddingInlineStart) || 0) + (parseFloat(style.paddingInlineEnd) || 0);
      element.querySelectorAll<HTMLElement>(GROUP_SELECTOR).forEach((group) => {
        widths.current.set(group.dataset.toolGroup ?? '', group.getBoundingClientRect().width + gap);
      });
      // The tools of what is selected wrap below when they must, so the row itself stays put.
      const room = element.clientWidth - padding;
      const known = ids.map((id) => ({ id, width: widths.current.get(id) ?? 0 }));
      const next = foldedGroups(known, FOLD_ORDER, room, MORE_WIDTH_PX);
      setFolded((now) => (sameSet(now, next) ? now : next));
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [row, key]);

  return folded;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}
