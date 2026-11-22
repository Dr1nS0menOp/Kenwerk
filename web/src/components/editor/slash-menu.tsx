// SPDX-License-Identifier: Apache-2.0
// The menu that `/` opens at the cursor (spec 082, EDT-184 to EDT-186): one flat list in a card,
// the first row marked at once, and a last row that opens the insert dialog with the words typed.
import { forwardRef, useEffect, useId, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionProps } from '@tiptap/suggestion';
import { IconMore } from '../icons';
import { entryDescription, entryName, InsertTile, ShortcutBox } from './insert-entry';
import type { InsertItem } from './insert';

/** The space between the line and the menu, and between the menu and what bounds it. */
const MENU_GAP_PX = 4;
/** The share of the window the menu may take below the line. */
const BELOW_SHARE = 0.5;

interface SlashProps {
  items: InsertItem[];
  editor: Editor;
  choose: (index: number) => void;
  /** The last row: the insert dialog, with the words typed after the slash. */
  more: () => void;
}

interface SlashHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** Keeps the editor's combobox pointing at the marked row, as the ARIA combobox pattern asks. */
function useActiveDescendant(editor: Editor, listId: string, optionId: string) {
  useEffect(() => {
    const dom = editor.view.dom;
    dom.setAttribute('aria-controls', listId);
    dom.setAttribute('aria-activedescendant', optionId);
    document.getElementById(optionId)?.scrollIntoView({ block: 'nearest' });
    return () => {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    };
  }, [editor, listId, optionId]);
}

const SlashMenu = forwardRef<SlashHandle, SlashProps>(function SlashMenu(
  { items, editor, choose, more },
  ref,
) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  // The list is built anew on every change of the editor; only other entries move the mark back.
  const signature = items.map((item) => item.id).join(' ');
  const [shown, setShown] = useState(signature);
  const listId = useId();
  if (shown !== signature) {
    setShown(signature);
    setActive(0);
  }
  // The rows, then the last row of its own.
  const rowCount = items.length + 1;
  const moreIndex = items.length;
  const optionId = (index: number) => `${listId}-${index}`;
  useActiveDescendant(editor, listId, optionId(active));

  const run = (index: number) => (index === moreIndex ? more() : choose(index));
  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') setActive((active + 1) % rowCount);
      else if (event.key === 'ArrowUp') setActive((active - 1 + rowCount) % rowCount);
      else if (event.key === 'Enter' || event.key === 'Tab') run(active);
      else return false;
      return true;
    },
  }));

  if (items.length === 0) return null;
  const rowProps = (index: number) => ({
    id: optionId(index),
    role: 'option' as const,
    'aria-selected': index === active,
    onMouseEnter: () => setActive(index),
    onMouseDown: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      run(index);
    },
  });
  return (
    <div className="slash-menu">
      {/* A long list scrolls, so it needs a Tab stop. Tab itself chooses the entry. */}
      <ul id={listId} role="listbox" aria-label={t('editor.insert')} className="slash-list" tabIndex={0}>
        {items.map((item, index) => (
          <li
            key={item.id}
            className={index === active ? 'slash-row active' : 'slash-row'}
            {...rowProps(index)}
          >
            <InsertTile item={item} />
            <span className="slash-words">
              <span className="slash-name">
                {entryName(item)}
                <ShortcutBox id={item.id} />
              </span>
              <span className="slash-description">{entryDescription(item)}</span>
            </span>
          </li>
        ))}
        <li className={active === moreIndex ? 'slash-more active' : 'slash-more'} {...rowProps(moreIndex)}>
          <span className="slash-more-dots" aria-hidden="true">
            <IconMore size={18} />
          </span>
          {t('insert.slashMore')}
        </li>
      </ul>
    </div>
  );
});

/**
 * Below the line, or above it when there is more room there; either way the menu takes the room
 * up to the row of tools or the bottom of the window, and its list scrolls inside (EDT-185).
 */
function placeMenu(element: HTMLElement, line: DOMRect) {
  const tools = document.querySelector('[role=toolbar]')?.getBoundingClientRect().bottom ?? 0;
  const below = window.innerHeight - line.bottom - 2 * MENU_GAP_PX;
  const above = line.top - Math.max(tools, 0) - 2 * MENU_GAP_PX;
  const upwards = above > below;
  const rtl = getComputedStyle(element).direction === 'rtl';
  Object.assign(element.style, {
    position: 'fixed',
    top: upwards ? '' : `${line.bottom + MENU_GAP_PX}px`,
    bottom: upwards ? `${window.innerHeight - line.top + MENU_GAP_PX}px` : '',
    left: rtl ? '' : `${line.left}px`,
    right: rtl ? `${window.innerWidth - line.right}px` : '',
  });
  // Below the line the menu keeps to half the window, so the text being written stays in view.
  const room = upwards ? above : Math.min(below, window.innerHeight * BELOW_SHARE);
  element.style.maxHeight = `${Math.floor(room)}px`;
}

/** Connects the slash menu to the Suggestion utility. */
export function slashRender({ openInsert }: { openInsert: (query: string) => void }) {
  return () => {
    let popup: ReactRenderer<SlashHandle, SlashProps> | null = null;
    let unmount: () => void = () => undefined;
    // The line moves as the person types, so placing reads the latest props.
    let latest: SuggestionProps<InsertItem> | null = null;
    const propsFor = (props: SuggestionProps<InsertItem>): SlashProps => ({
      items: props.items,
      editor: props.editor,
      choose: (index) => {
        const item = props.items[index];
        if (item) props.command(item);
      },
      more: () => {
        props.editor.chain().focus().deleteRange(props.range).run();
        openInsert(props.query);
      },
    });
    return {
      onStart(props: SuggestionProps<InsertItem>) {
        latest = props;
        popup = new ReactRenderer(SlashMenu, {
          props: propsFor(props),
          editor: props.editor,
          className: 'suggestion-popup',
        });
        const element = popup.element as HTMLElement;
        unmount = props.mount(element, {
          onPosition: () => {
            const line = latest?.clientRect?.();
            if (line) placeMenu(element, line);
          },
        });
      },
      onUpdate(props: SuggestionProps<InsertItem>) {
        latest = props;
        popup?.updateProps(propsFor(props));
      },
      onKeyDown({ event }: { event: KeyboardEvent }) {
        return popup?.ref?.onKeyDown(event) ?? false;
      },
      onExit() {
        unmount();
        popup?.destroy();
      },
    };
  };
}
