// SPDX-License-Identifier: Apache-2.0
// The small button in the cell with the cursor and its menu (spec 082, EDT-209 to EDT-212):
// colour and alignment, a column or row more, and emptying or deleting. With several cells
// selected every entry acts on all of them, and merge and split join in.
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorState, type Editor } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';
import {
  IconAlignCenter,
  IconAlignEnd,
  IconAlignStart,
  IconChevronDown,
  IconClear,
  IconColumnAdd,
  IconColumnDelete,
  IconMerge,
  IconRowAdd,
  IconRowDelete,
} from '../icons';
import { Menu, MenuItem, MenuSeparator, MenuSub } from '../menu';
import { MARK_COLORS } from './palette';
import { alignCellsStep, cellAlignment, emptyCellsStep, type CellAlignment } from './table-cells';
import { tableAround } from './table';

const CELL_ICON_SIZE = 16;
/**
 * Room between the button and the corner of its cell. Dragging a column's border looks for the
 * text 5 pixels inside the border, so the button stays clear of that strip.
 */
const CORNER_GAP_PX = 8;

/** Where the head of the selection is: the cell the button sits in. */
function headCell(editor: Editor): number | null {
  const { selection } = editor.state;
  if (selection instanceof CellSelection) return selection.$headCell.pos;
  return tableAround(editor)?.cell ?? null;
}

function useCellFacts(editor: Editor) {
  return useEditorState({
    editor,
    selector: (s) => {
      const { selection } = s.editor.state;
      const background =
        (s.editor.getAttributes('tableHeader').background as string | null | undefined) ??
        (s.editor.getAttributes('tableCell').background as string | null | undefined) ??
        null;
      return {
        cell: headCell(s.editor),
        several: selection instanceof CellSelection && selection.ranges.length > 1,
        canMerge: s.editor.can().mergeCells(),
        canSplit: s.editor.can().splitCell(),
        background,
        align: cellAlignment(s.editor.state),
      };
    },
  });
}

function ColourChoice({ editor, current }: { editor: Editor; current: string | null }) {
  const { t } = useTranslation();
  const pick = (color: string | null) => editor.chain().focus().setCellAttribute('background', color).run();
  // The swatch in the entry shows the current colour; the sub-menu ticks it for a screen reader.
  return (
    <MenuSub
      label={t('table.cellColour')}
      icon={<span className={current ? `swatch mark-${current}` : 'swatch'} />}
    >
      <div role="group" aria-label={t('table.cellColour')} className="menu-swatches">
        <MenuItem
          role="menuitemradio"
          aria-checked={!current}
          aria-label={t('editor.noColor')}
          title={t('editor.noColor')}
          onClick={() => pick(null)}
        >
          <span className="swatch" />
        </MenuItem>
        {MARK_COLORS.map((color) => (
          <MenuItem
            key={color}
            role="menuitemradio"
            aria-checked={current === color}
            aria-label={t(`editor.colors.${color}`)}
            title={t(`editor.colors.${color}`)}
            onClick={() => pick(color)}
          >
            <span className={`swatch mark-${color}`} />
          </MenuItem>
        ))}
      </div>
    </MenuSub>
  );
}

function AlignChoice({ editor, current }: { editor: Editor; current: CellAlignment | null }) {
  const { t } = useTranslation();
  const options: { value: CellAlignment; label: string; icon: ReactNode }[] = [
    { value: 'start', label: t('table.alignStart'), icon: <IconAlignStart size={CELL_ICON_SIZE} /> },
    { value: 'center', label: t('table.alignCenter'), icon: <IconAlignCenter size={CELL_ICON_SIZE} /> },
    { value: 'end', label: t('table.alignEnd'), icon: <IconAlignEnd size={CELL_ICON_SIZE} /> },
  ];
  const align = (value: CellAlignment) => {
    const tr = alignCellsStep(editor.state, value);
    if (tr) editor.view.dispatch(tr);
    editor.commands.focus();
  };
  const shown = options.find((option) => option.value === current);
  return (
    <MenuSub label={t('table.alignment')} icon={shown?.icon ?? <IconAlignStart size={CELL_ICON_SIZE} />}>
      {options.map((option) => (
        <MenuItem
          key={option.value}
          role="menuitemradio"
          aria-checked={current === option.value}
          onClick={() => align(option.value)}
        >
          {option.icon} {option.label}
        </MenuItem>
      ))}
    </MenuSub>
  );
}

/** Keeps the button in the top end corner of the cell, as the table moves and the cursor goes. */
function useCornerPlace(
  editor: Editor,
  cell: number | null,
  frame: RefObject<HTMLDivElement | null>,
  layout: unknown,
) {
  const holder = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = cell === null ? null : editor.view.nodeDOM(cell);
    const outer = frame.current;
    const box = holder.current;
    if (!(element instanceof HTMLElement) || !outer || !box) return;
    const inner = element.getBoundingClientRect();
    const around = outer.getBoundingClientRect();
    const rightToLeft = getComputedStyle(outer).direction === 'rtl';
    const left = rightToLeft
      ? inner.left - around.left + CORNER_GAP_PX
      : inner.right - around.left - box.offsetWidth - CORNER_GAP_PX;
    box.style.left = `${left}px`;
    box.style.top = `${inner.top - around.top + CORNER_GAP_PX}px`;
    box.hidden = inner.right < around.left || inner.left > around.right;
  }, [editor, cell, frame, layout]);
  return holder;
}

/** The cell button and its menu. Shift F10 and the menu key open it from the text (EDT-199). */
export function CellMenu({
  editor,
  frame,
  layout,
}: {
  editor: Editor;
  frame: RefObject<HTMLDivElement | null>;
  /** Changes whenever the table moved or changed size. */
  layout: unknown;
}) {
  const { t } = useTranslation();
  const facts = useCellFacts(editor);
  const holder = useCornerPlace(editor, facts.cell, frame, layout);
  if (facts.cell === null) return null;
  const chain = () => editor.chain().focus();
  const empty = () => {
    const tr = emptyCellsStep(editor.state);
    if (tr) editor.view.dispatch(tr);
    editor.commands.focus();
  };
  const label = t('table.cellMenu');
  return (
    // The menu key and Shift F10 open this menu on keydown; the browser's own menu that the
    // same keys bring a moment later lands on the focused entry, and must not cover it.
    <div ref={holder} className="table-cell" onContextMenu={(e) => e.preventDefault()}>
      <Menu
        label={`${label} (${t('table.cellMenuKeys')})`}
        trigger={<IconChevronDown size={CELL_ICON_SIZE} />}
        className="table-cell-button"
        align="start"
        onLeave={() => editor.commands.focus()}
      >
        <ColourChoice editor={editor} current={facts.background} />
        <AlignChoice editor={editor} current={facts.align} />
        <MenuSeparator />
        <MenuItem onClick={() => chain().addColumnAfter().run()}>
          <IconColumnAdd size={CELL_ICON_SIZE} /> {t('table.columnAfter')}
        </MenuItem>
        <MenuItem onClick={() => chain().addRowAfter().run()}>
          <IconRowAdd size={CELL_ICON_SIZE} /> {t('table.rowBelow')}
        </MenuItem>
        {facts.canMerge && (
          <MenuItem onClick={() => chain().mergeCells().run()}>
            <IconMerge size={CELL_ICON_SIZE} /> {t('table.mergeCells')}
          </MenuItem>
        )}
        {facts.canSplit && (
          <MenuItem onClick={() => chain().splitCell().run()}>
            <IconMerge size={CELL_ICON_SIZE} /> {t('table.splitCell')}
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem onClick={empty}>
          <IconClear size={CELL_ICON_SIZE} /> {facts.several ? t('table.emptyCells') : t('table.emptyCell')}
        </MenuItem>
        <MenuItem onClick={() => chain().deleteColumn().run()}>
          <IconColumnDelete size={CELL_ICON_SIZE} /> {t('table.columnDelete')}
        </MenuItem>
        <MenuItem onClick={() => chain().deleteRow().run()}>
          <IconRowDelete size={CELL_ICON_SIZE} /> {t('table.rowDelete')}
        </MenuItem>
      </Menu>
    </div>
  );
}
