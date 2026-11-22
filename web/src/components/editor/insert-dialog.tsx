// SPDX-License-Identifier: Apache-2.0
// The insert dialog (spec 082, EDT-175 to EDT-183): a column of categories, a grid of entries in
// three columns that alone scrolls, the title and the search on one line, and the actions at the
// end. The search field is a combobox that controls the grid; the grid is one Tab stop.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/core';
import { IconClose } from '../icons';
import { Tabs } from '../ui';
import { categoriesShown, categoryOf, orderedItems, type CategoryChoice } from './insert-catalogue';
import { entryDescription, entryName, InsertTile, ShortcutBox } from './insert-entry';
import { gridStep, rowsOf } from './insert-grid';
import { InsertPreview } from './insert-preview';
import { matchingItems, type InsertItem } from './insert';
import type { EditorActions } from './keys';

/** How long the pointer rests on an entry before its tooltip shows (EDT-181). */
const TIP_DELAY_MS = 500;
const TIP_GAP_PX = 4;

export interface InsertDialogProps {
  editor: Editor;
  actions: EditorActions;
  /** Every entry this editor offers, in no particular order. */
  items: InsertItem[];
  recent: string[];
  /** Words already typed after a slash (EDT-186). */
  query: string;
  onUsed: (id: string) => void;
  onClose: () => void;
}

/** The number of columns the grid's style lays out, which changes with the width of the screen. */
function useGridColumns(grid: RefObject<HTMLDivElement | null>, isEmpty: boolean): number {
  const [columns, setColumns] = useState(3);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () =>
      setColumns(
        Math.max(1, getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
    // A search that finds nothing puts another element in the grid's place.
  }, [grid, isEmpty]);
  return columns;
}

/** Places the tooltip under its entry, or over it when the window ends first. */
function useTipPlace(tip: RefObject<HTMLDivElement | null>, cellId: string | null) {
  useLayoutEffect(() => {
    const element = tip.current;
    const cell = cellId ? document.getElementById(cellId) : null;
    if (!element || !cell) return;
    const box = cell.getBoundingClientRect();
    const upwards = box.bottom + TIP_GAP_PX + element.offsetHeight > window.innerHeight;
    const rtl = getComputedStyle(cell).direction === 'rtl';
    Object.assign(element.style, {
      top: upwards ? `${box.top - TIP_GAP_PX - element.offsetHeight}px` : `${box.bottom + TIP_GAP_PX}px`,
      left: rtl ? '' : `${box.left}px`,
      right: rtl ? `${window.innerWidth - box.right}px` : '',
    });
  });
}

/** The entries shown: a search looks in every category at once (EDT-178). */
function shownItems(items: InsertItem[], recent: string[], query: string, category: CategoryChoice) {
  const found = query.trim() ? matchingItems(query, items) : items;
  const ordered = orderedItems(found, recent);
  return category === 'all' ? ordered : ordered.filter((item) => categoryOf(item.id) === category);
}

/** One entry of the grid (EDT-179, EDT-180): its tile, its name and keys, its description. */
function EntryCell({
  item,
  id,
  selected,
  describedBy,
  onSelect,
  onInsert,
  onHover,
}: {
  item: InsertItem;
  id: string;
  selected: boolean;
  describedBy: string | undefined;
  onSelect: () => void;
  onInsert: () => void;
  onHover: (item: InsertItem | null) => void;
}) {
  return (
    <div
      id={id}
      role="gridcell"
      aria-selected={selected}
      aria-describedby={describedBy}
      className={selected ? 'insert-cell selected' : 'insert-cell'}
      onClick={onSelect}
      onDoubleClick={onInsert}
      onMouseEnter={() => onHover(item)}
      onMouseLeave={() => onHover(null)}
    >
      <InsertTile item={item} />
      <span className="insert-words">
        <span className="insert-name">
          <span className="insert-name-text">{entryName(item)}</span>
          <ShortcutBox id={item.id} />
        </span>
        <span className="insert-description">{entryDescription(item)}</span>
      </span>
    </div>
  );
}

export function InsertDialog({
  editor,
  actions,
  items,
  recent,
  query: typed,
  onUsed,
  onClose,
}: InsertDialogProps) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const ids = useId();
  const [query, setQuery] = useState(typed);
  const [category, setCategory] = useState<CategoryChoice>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [keyboardTip, setKeyboardTip] = useState(false);
  const hoverTimer = useRef<number | undefined>(undefined);

  const shown = shownItems(items, recent, query, category);
  const columns = useGridColumns(grid, shown.length === 0);
  // The first entry is selected on opening and after each search (EDT-182).
  const selected = shown.find((item) => item.id === selectedId) ?? shown[0];
  const at = selected ? shown.indexOf(selected) : -1;
  const cellId = (item: InsertItem) => `${ids}-cell-${item.id}`;
  const tipItem = shown.find((item) => item.id === (hovered ?? (keyboardTip ? selected?.id : null)));
  const tipId = `${ids}-tip`;
  useTipPlace(tip, tipItem ? cellId(tipItem) : null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // A modal dialog focuses its first button, but focus starts in the search (EDT-182).
    searchField.current?.focus();
    return () => window.clearTimeout(hoverTimer.current);
  }, []);
  useEffect(() => {
    if (selected) document.getElementById(cellId(selected))?.scrollIntoView({ block: 'nearest' });
  });

  const close = () => {
    onClose();
    editor.commands.focus();
  };
  const insert = () => {
    if (!selected) return;
    onClose();
    onUsed(selected.id);
    selected.run(editor, actions);
  };
  const search = (words: string) => {
    setQuery(words);
    setCategory('all');
    setSelectedId(null);
    setKeyboardTip(false);
  };
  const move = (e: KeyboardEvent, rowsOnly: boolean) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insert();
      return;
    }
    if (rowsOnly && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const next = gridStep(e.key, { at, count: shown.length, columns, rtl });
    if (next === null) return;
    e.preventDefault();
    setSelectedId(shown[next]?.id ?? null);
    setHovered(null);
    setKeyboardTip(true);
  };
  const hover = (item: InsertItem | null) => {
    window.clearTimeout(hoverTimer.current);
    if (!item) setHovered(null);
    else hoverTimer.current = window.setTimeout(() => setHovered(item.id), TIP_DELAY_MS);
  };

  const categories = categoriesShown(items);
  const gridId = `${ids}-grid`;
  return (
    <dialog
      ref={dialog}
      className="insert-dialog"
      aria-labelledby={`${ids}-title`}
      onClose={close}
      onCancel={(e) => {
        // Escape first hides a tooltip, as WCAG 1.4.13 asks, and closes the dialog the next time.
        if (!tipItem) return;
        e.preventDefault();
        setHovered(null);
        setKeyboardTip(false);
      }}
    >
      <button
        type="button"
        className="icon insert-close"
        aria-label={t('common.close')}
        title={t('common.close')}
        onClick={close}
      >
        <IconClose />
      </button>
      <div className="insert-head">
        <h2 id={`${ids}-title`}>{t('editor.insert')}</h2>
        <span className="insert-search">
          <input
            type="search"
            role="combobox"
            ref={searchField}
            aria-label={t('editor.insertSearch')}
            aria-expanded="true"
            aria-controls={gridId}
            aria-autocomplete="list"
            aria-activedescendant={selected ? cellId(selected) : undefined}
            placeholder={t('editor.insertSearch')}
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => move(e, true)}
          />
          <span className="insert-enter" aria-hidden="true">
            {t('insert.enterHint')}
          </span>
        </span>
      </div>
      <div className="insert-categories">
        <Tabs
          names={categories}
          current={category}
          label={t('insert.categories')}
          nameOf={(name) => t(`insert.category_${name}`)}
          panel={gridId}
          orientation="vertical"
          onChange={(next) => {
            setCategory(next);
            setSelectedId(null);
          }}
        />
      </div>
      {shown.length === 0 ? (
        // An empty grid would be a grid without rows, so the sentence stands in its place (EDT-178).
        <div ref={grid} id={gridId} className="insert-grid">
          <p role="status" className="muted insert-none">
            {t('insert.nothingFound', { query: query.trim() })}
          </p>
        </div>
      ) : (
        <div
          ref={grid}
          id={gridId}
          role="grid"
          aria-label={t(`insert.category_${category}`)}
          aria-activedescendant={selected ? cellId(selected) : undefined}
          tabIndex={0}
          className="insert-grid"
          onKeyDown={(e) => move(e, false)}
          onFocus={() => setKeyboardTip(true)}
          onBlur={() => setKeyboardTip(false)}
        >
          {rowsOf(shown, columns).map((row) => (
            <div role="row" className="insert-row" key={row[0]?.id}>
              {row.map((item) => (
                <EntryCell
                  key={item.id}
                  item={item}
                  id={cellId(item)}
                  selected={item === selected}
                  describedBy={item === tipItem ? tipId : undefined}
                  onSelect={() => setSelectedId(item.id)}
                  onInsert={insert}
                  onHover={hover}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {tipItem && (
        <div ref={tip} id={tipId} role="tooltip" className="insert-tip">
          <p>{entryDescription(tipItem)}</p>
          <InsertPreview id={tipItem.id} />
        </div>
      )}
      <div className="insert-foot">
        <button type="button" className="primary" disabled={!selected} onClick={insert}>
          {t('insert.insertButton')}
        </button>
        <button type="button" className="quiet" onClick={close}>
          {t('common.close')}
        </button>
      </div>
    </dialog>
  );
}
