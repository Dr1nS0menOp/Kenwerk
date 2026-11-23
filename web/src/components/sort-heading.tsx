// SPDX-License-Identifier: Apache-2.0
// The heading of a column a list is sorted by (NAV-157, ADM-110): accent words and one arrow
// right after them, and the state in aria-sort, so it never rests on colour alone. One look
// for a list the browser sorts (SortTable) and a list the server sorts (spec 100).
import { useTranslation } from 'react-i18next';
import { IconArrowDown, IconArrowUp } from './icons';
import type { SortState } from './list-address';

const ARROW_SIZE = 14;

function SortArrow({ state }: { state: SortState }) {
  if (state === 'none') return null;
  const Arrow = state === 'ascending' ? IconArrowUp : IconArrowDown;
  return (
    <span className="sort-arrow" aria-hidden="true">
      <Arrow size={ARROW_SIZE} />
    </span>
  );
}

/**
 * A heading cell. With onSort its words are a button that sorts by the column; without it the
 * list has one order, which the mark only shows (spec 100, D5).
 */
export function SortHeading({
  label,
  state,
  onSort,
}: {
  label: string;
  state: SortState;
  onSort?: () => void;
}) {
  const { t } = useTranslation();
  const className = state === 'none' ? undefined : 'sorted';
  if (!onSort) {
    return (
      <th scope="col" aria-sort={state} className={className}>
        {label}
        <SortArrow state={state} />
      </th>
    );
  }
  return (
    <th scope="col" aria-sort={state} className={className}>
      <button
        type="button"
        className="sort-heading"
        title={t('toolRow.sortBy', { column: label })}
        onClick={onSort}
      >
        {label}
        <SortArrow state={state} />
      </button>
    </th>
  );
}
