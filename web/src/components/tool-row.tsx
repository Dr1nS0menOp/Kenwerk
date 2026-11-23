// SPDX-License-Identifier: Apache-2.0
// The one row of tools above a long list (spec 100, ADM-103, SPC-120, SPC-154): a search field
// first, a button per filter that shows its value in words, More filters for the rarer ones,
// Reset while anything is set, and the screen's own action at the end. Every choice applies
// at once and lives in the address, under the names of the route's parameters; the list is
// always filtered by the server, so a filter never shows what the list without it would not.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { IconChevronDown, IconSearch, IconSliders } from './icons';
import { personQuery } from './person';
import { SubjectPicker } from './picker';
import { Menu, MenuItem } from './menu';
import { useListAddress } from './list-address';
import {
  anythingSet,
  filterWords,
  isFilterSet,
  moreLineShown,
  paramsOf,
  rowParams,
  type ToolFilter,
} from './tool-row-model';

export type { ToolFilter } from './tool-row-model';

const MARK_SIZE = 16;
/** How long the search waits after the last key before it asks the server (one request per pause). */
const SEARCH_PAUSE_MS = 250;

/** A text of the address that is typed: its own text while typing, sent to the address after a pause. */
function useTypedParam(param: string) {
  const { params, set } = useListAddress();
  const [text, setText] = useState(params.get(param) ?? '');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const type = (next: string) => {
    setText(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set(param, next.trim()), SEARCH_PAUSE_MS);
  };
  return { text, type };
}

function SearchField({ param, label, placeholder }: { param: string; label: string; placeholder: string }) {
  const { text, type } = useTypedParam(param);
  return (
    <div className="tool-search">
      <IconSearch size={MARK_SIZE} />
      <input
        type="search"
        value={text}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => type(e.target.value)}
      />
    </div>
  );
}

/** A short text inside a filter's panel, such as an id, sent to the address after a pause. */
export function FilterText({ param, label }: { param: string; label: string }) {
  const { text, type } = useTypedParam(param);
  return (
    <label className="field">
      <span>{label}</span>
      <input value={text} onChange={(e) => type(e.target.value)} />
    </label>
  );
}

/** A whole number inside a filter's panel; its label names the unit. */
export function FilterNumber({ param, label }: { param: string; label: string }) {
  const { text, type } = useTypedParam(param);
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={0} step={1} value={text} onChange={(e) => type(e.target.value)} />
    </label>
  );
}

/** A person inside a filter's panel, chosen from the directory the person may read. */
export function FilterPerson({ param, label }: { param: string; label: string }) {
  const { set } = useListAddress();
  return <SubjectPicker label={label} usersOnly onPick={(person) => set(param, person.id)} />;
}

/** The name of the person a filter holds, for the words on its button. */
export function usePersonWords(id: string): string {
  const person = useQuery({ ...personQuery(id), enabled: Boolean(id) }).data;
  return person?.name ?? id;
}

const DAY_LENGTH = 10;

/**
 * A day inside a filter's panel. A route that takes days gets the day as written (2026-11-23);
 * one that takes a moment gets the start of that day as a time (RFC 3339).
 */
export function FilterDate({ param, label, as }: { param: string; label: string; as: 'day' | 'moment' }) {
  const { params, set } = useListAddress();
  const stored = params.get(param) ?? '';
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="date"
        value={stored.slice(0, DAY_LENGTH)}
        onChange={(e) => {
          const day = e.target.value;
          set(param, day && as === 'moment' ? new Date(day).toISOString() : day);
        }}
      />
    </label>
  );
}

function ButtonFace({ icon, words }: { icon: ReactNode; words: string }) {
  return (
    <>
      {icon}
      <span className="filter-words">{words}</span>
      <IconChevronDown size={MARK_SIZE} />
    </>
  );
}

/** A filter of fixed values: a menu of radio entries, Any first, which applies at once and closes. */
function ChoiceFilter({ filter }: { filter: Extract<ToolFilter, { kind: 'choice' }> }) {
  const { t } = useTranslation();
  const { params, set } = useListAddress();
  const value = params.get(filter.param) ?? '';
  const words = filterWords(filter, params, (name, chosen) =>
    t('toolRow.setFilter', { name, value: chosen }),
  );
  return (
    <Menu
      label={words}
      align="start"
      className={value ? 'filter-button is-set' : 'filter-button'}
      trigger={<ButtonFace icon={filter.icon} words={words} />}
    >
      <MenuItem role="menuitemradio" aria-checked={!value} onClick={() => set(filter.param, '')}>
        {t('toolRow.any')}
      </MenuItem>
      {filter.options.map((o) => (
        <MenuItem
          key={o.value}
          role="menuitemradio"
          aria-checked={value === o.value}
          onClick={() => set(filter.param, o.value)}
        >
          {o.label}
        </MenuItem>
      ))}
    </Menu>
  );
}

/**
 * A filter that needs a field, such as dates or a person: a small panel under its button with
 * the field and Clear. Escape and a press outside close it; Escape gives the focus back.
 */
function FieldFilter({ filter }: { filter: Extract<ToolFilter, { kind: 'field' }> }) {
  const { t } = useTranslation();
  const { params, clear } = useListAddress();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useId();
  const set = isFilterSet(filter, params);
  const words = filterWords(filter, params, (name, value) => t('toolRow.setFilter', { name, value }));

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('.tool-panel input, .tool-panel select')?.focus();
    // A press anywhere else closes the panel, as a menu closes.
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="tool-chooser" ref={root} onKeyDown={keys}>
      <button
        ref={button}
        type="button"
        className={set ? 'filter-button is-set' : 'filter-button'}
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
      >
        <ButtonFace icon={filter.icon} words={words} />
      </button>
      {open && (
        <div id={panel} role="group" aria-label={filter.label} className="tool-panel">
          {filter.field}
          <button type="button" className="quiet" onClick={() => clear(paramsOf(filter))}>
            {t('toolRow.clear')}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterButton({ filter }: { filter: ToolFilter }) {
  return filter.kind === 'choice' ? <ChoiceFilter filter={filter} /> : <FieldFilter filter={filter} />;
}

export function ToolRow({
  label,
  search,
  filters = [],
  sortParam,
  action,
  count,
}: {
  /** What the row is for, for screen readers, such as "Find people". */
  label: string;
  search?: { label: string; placeholder: string; param?: string };
  filters?: ToolFilter[];
  /** The parameter of the list's sort, when it sorts by its columns, so Reset takes it away too. */
  sortParam?: string;
  /** The screen's own action, alone at the end of the row. */
  action?: ReactNode;
  /** How many rows match, in words, said under the row. */
  count?: string;
}) {
  const { t } = useTranslation();
  const { params, clear } = useListAddress();
  const [opened, setOpened] = useState(false);
  // A new key after Reset starts the search field again from the emptied address.
  const [resets, setResets] = useState(0);
  const more = useId();
  const searchParam = search ? (search.param ?? 'q') : null;
  const keys = rowParams(searchParam, filters, sortParam ?? null);
  const inRow = filters.filter((f) => f.place === 'row');
  const onMore = filters.filter((f) => f.place === 'more');
  const moreShown = moreLineShown(filters, params, opened);
  return (
    <div className="tool-row-box">
      <div className="tool-row" role="group" aria-label={label}>
        {search && searchParam && (
          <SearchField
            key={resets}
            param={searchParam}
            label={search.label}
            placeholder={search.placeholder}
          />
        )}
        {inRow.map((f) => (
          <FilterButton key={f.label} filter={f} />
        ))}
        {onMore.length > 0 && (
          <button
            type="button"
            className="filter-button"
            aria-expanded={moreShown}
            aria-controls={more}
            onClick={() => setOpened(!moreShown)}
          >
            <IconSliders size={MARK_SIZE} />
            {t('toolRow.moreFilters')}
          </button>
        )}
        {anythingSet(params, keys) && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              clear(keys);
              setResets(resets + 1);
            }}
          >
            {t('toolRow.reset')}
          </button>
        )}
        {action && <div className="tool-action">{action}</div>}
      </div>
      {onMore.length > 0 && moreShown && (
        <div id={more} className="tool-row tool-row-more" role="group" aria-label={t('toolRow.moreFilters')}>
          {onMore.map((f) => (
            <FilterButton key={f.label} filter={f} />
          ))}
        </div>
      )}
      {count !== undefined && (
        <p className="tool-count" role="status">
          {count}
        </p>
      )}
    </div>
  );
}
