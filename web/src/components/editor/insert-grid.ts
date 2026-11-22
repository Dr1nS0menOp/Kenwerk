// SPDX-License-Identifier: Apache-2.0
// How the keys move the selection through the insert dialog's grid (EDT-182): the four arrows
// by cell and row, Home and End to the first and last entry. The search field moves by row only.

/** Where the selection goes after a key, or null when the key does not move it. */
export function gridStep(
  key: string,
  { at, count, columns, rtl }: { at: number; count: number; columns: number; rtl: boolean },
): number | null {
  if (count === 0) return null;
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  const clamp = (to: number) => Math.min(Math.max(to, 0), count - 1);
  switch (key) {
    case forward:
      return clamp(at + 1);
    case backward:
      return clamp(at - 1);
    case 'ArrowDown':
      return at + columns < count ? at + columns : at;
    case 'ArrowUp':
      return at - columns >= 0 ? at - columns : at;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** The entries cut into rows of the grid's width, for the rows of the ARIA grid. */
export function rowsOf<T>(items: readonly T[], columns: number): T[][] {
  const width = Math.max(1, columns);
  return Array.from({ length: Math.ceil(items.length / width) }, (_, row) =>
    items.slice(row * width, (row + 1) * width),
  );
}
