// SPDX-License-Identifier: Apache-2.0
// The small bar under the table with the cursor (spec 082, EDT-213 to EDT-215): its settings,
// its width, equal columns, fitting it to the text, and More for the rest. It is the one bar
// with tools the row lacks, because the row shows nothing for tables (EDT-161).
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  IconChart,
  IconColumnAdd,
  IconCopy,
  IconEqual,
  IconFrame,
  IconFullWidth,
  IconHeaderColumn,
  IconHeaderRow,
  IconMore,
  IconNumbered,
  IconRename,
  IconRowAdd,
  IconSortDown,
  IconSortUp,
  IconTableMenu,
  IconTrash,
  IconWrap,
} from '../icons';
import { Menu, MenuItem, MenuSeparator } from '../menu';
import { Dialog, Field } from '../ui';
import { duplicateBlock } from './block-commands';
import { addChart, chartsOfTable, removeCharts } from './dynamic/nodes';
import { useRovingFocus } from './roving-focus';
import {
  canSortTable,
  commitStretch,
  equalColumns,
  fitToText,
  FULL_STRETCH,
  hasHeaderColumn,
  hasHeaderRow,
  isTopLevel,
  setTableSettings,
  sortTable,
  tableAt,
  WIDE_STRETCH,
} from './table';
import { Tool, TOOL_ICON_SIZE, ToolSeparator } from './tool';

const MAX_CAPTION = 500;

/** A chart without its table has nothing to show, so removing the table asks (EDT-134). */
function RemoveTableDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useTranslation();
  const remove = (withCharts: boolean) => {
    onClose();
    if (withCharts) removeCharts(editor);
    editor.chain().focus().deleteTable().run();
  };
  return (
    <Dialog title={t('table.removeTitle')} onClose={onClose}>
      <p>{t('table.removeHelp')}</p>
      <div className="dialog-actions">
        <button type="button" className="quiet" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={() => remove(false)}>
          {t('table.removeKeepChart')}
        </button>
        <button type="button" className="danger" onClick={() => remove(true)}>
          {t('table.removeBoth')}
        </button>
      </div>
    </Dialog>
  );
}

function CaptionDialog({ editor, pos, onClose }: { editor: Editor; pos: number; onClose: () => void }) {
  const { t } = useTranslation();
  const attrs = tableAt(editor, pos)?.attrs as { caption: string | null; caption_below: boolean } | undefined;
  const [caption, setCaption] = useState(attrs?.caption ?? '');
  const [below, setBelow] = useState(attrs?.caption_below ?? false);
  return (
    <Dialog title={t('table.caption')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
          setTableSettings(editor, pos, { caption: caption.trim() || null, caption_below: below });
        }}
      >
        <Field label={t('table.captionText')}>
          <input
            autoFocus
            value={caption}
            maxLength={MAX_CAPTION}
            onChange={(e) => setCaption(e.target.value)}
          />
        </Field>
        <label className="check">
          <input type="checkbox" checked={below} onChange={(e) => setBelow(e.target.checked)} />
          {t('table.captionBelow')}
        </label>
        <div className="dialog-actions">
          <button type="submit" className="primary">
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function useTableFacts(editor: Editor, pos: number) {
  return useEditorState({
    editor,
    selector: (s) => {
      const table = tableAt(s.editor, pos);
      return {
        canSort: canSortTable(s.editor),
        canStretch: isTopLevel(s.editor, pos),
        headerRow: table ? hasHeaderRow(table) : false,
        headerColumn: table ? hasHeaderColumn(table) : false,
        stretch: (table?.attrs.stretch as number | null) ?? 0,
        numbered: (table?.attrs.numbered as boolean | undefined) ?? false,
        flexible: (table?.attrs.flexible as boolean | undefined) ?? false,
      };
    },
  });
}

type TableFacts = ReturnType<typeof useTableFacts>;

/** Switches that stay open while they change (EDT-214). */
function SettingsMenu({ editor, pos, facts }: { editor: Editor; pos: number; facts: TableFacts }) {
  const { t } = useTranslation();
  const chain = () => editor.chain();
  return (
    <Menu
      label={t('table.settings')}
      trigger={<IconTableMenu size={TOOL_ICON_SIZE} />}
      className="tool"
      align="start"
      keepOpen
      onLeave={() => editor.commands.focus()}
    >
      <MenuItem
        role="menuitemcheckbox"
        aria-checked={!facts.flexible}
        onClick={() => setTableSettings(editor, pos, { flexible: !facts.flexible })}
      >
        <IconFullWidth size={TOOL_ICON_SIZE} /> {t('table.fixedWidths')}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        aria-checked={facts.headerRow}
        onClick={() => chain().toggleHeaderRow().run()}
      >
        <IconHeaderRow size={TOOL_ICON_SIZE} /> {t('table.headerRow')}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        aria-checked={facts.headerColumn}
        onClick={() => chain().toggleHeaderColumn().run()}
      >
        <IconHeaderColumn size={TOOL_ICON_SIZE} /> {t('table.headerColumn')}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        aria-checked={facts.numbered}
        onClick={() => setTableSettings(editor, pos, { numbered: !facts.numbered })}
      >
        <IconNumbered size={TOOL_ICON_SIZE} /> {t('table.numbered')}
      </MenuItem>
    </Menu>
  );
}

function WidthMenu({ editor, pos, stretch }: { editor: Editor; pos: number; stretch: number }) {
  const { t } = useTranslation();
  const widths = [
    { value: 0, label: t('table.widthText') },
    { value: WIDE_STRETCH, label: t('table.widthWide') },
    { value: FULL_STRETCH, label: t('table.widthFull') },
  ];
  return (
    <Menu
      label={t('table.widthChooser')}
      trigger={<IconFullWidth size={TOOL_ICON_SIZE} />}
      className="tool"
      align="start"
      onLeave={() => editor.commands.focus()}
    >
      {widths.map((width) => (
        <MenuItem
          key={width.value}
          role="menuitemradio"
          aria-checked={stretch === width.value}
          onClick={() => {
            commitStretch(editor, pos, width.value);
            editor.commands.focus();
          }}
        >
          {width.label}
        </MenuItem>
      ))}
    </Menu>
  );
}

/** The rest, in the order of D16. Ctrl Shift . opens it from the text. */
function MoreMenu({ editor, pos, facts }: { editor: Editor; pos: number; facts: TableFacts }) {
  const { t } = useTranslation();
  const [captioning, setCaptioning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const chain = () => editor.chain();
  const remove = () => {
    if (chartsOfTable(editor).length > 0) {
      setRemoving(true);
      return;
    }
    chain().deleteTable().run();
    editor.commands.focus();
  };
  return (
    <>
      {captioning && <CaptionDialog editor={editor} pos={pos} onClose={() => setCaptioning(false)} />}
      {removing && <RemoveTableDialog editor={editor} onClose={() => setRemoving(false)} />}
      <Menu
        label={t('table.more')}
        trigger={<IconMore size={TOOL_ICON_SIZE} />}
        className="tool"
        keepOpen
        onLeave={() => editor.commands.focus()}
      >
        <MenuItem onClick={() => chain().addRowBefore().run()}>
          <IconRowAdd size={TOOL_ICON_SIZE} /> {t('table.rowAbove')}
        </MenuItem>
        <MenuItem onClick={() => chain().addColumnBefore().run()}>
          <IconColumnAdd size={TOOL_ICON_SIZE} /> {t('table.columnBefore')}
        </MenuItem>
        <MenuSeparator />
        {facts.canSort && (
          <>
            <MenuItem onClick={() => sortTable(editor, 'up')}>
              <IconSortUp size={TOOL_ICON_SIZE} /> {t('editor.sortUp')}
            </MenuItem>
            <MenuItem onClick={() => sortTable(editor, 'down')}>
              <IconSortDown size={TOOL_ICON_SIZE} /> {t('editor.sortDown')}
            </MenuItem>
          </>
        )}
        <MenuItem onClick={() => setCaptioning(true)}>
          <IconRename size={TOOL_ICON_SIZE} /> {t('table.caption')}
        </MenuItem>
        <MenuItem onClick={() => addChart(editor)}>
          <IconChart size={TOOL_ICON_SIZE} /> {t('table.addChart')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => duplicateBlock(editor, pos)}>
          <IconCopy size={TOOL_ICON_SIZE} /> {t('table.duplicate')}
        </MenuItem>
        <MenuItem onClick={remove}>
          <IconTrash size={TOOL_ICON_SIZE} /> {t('editor.tableDelete')}
        </MenuItem>
      </Menu>
    </>
  );
}

/** The bar under the table with the cursor: one toolbar, arrow keys inside it. */
export function TableBar({ editor, pos }: { editor: Editor; pos: number }) {
  const { t } = useTranslation();
  const facts = useTableFacts(editor, pos);
  const root = useRef<HTMLDivElement>(null);
  const roving = useRovingFocus(root, () => editor.commands.focus());
  return (
    <div
      ref={root}
      role="toolbar"
      aria-label={t('table.bar')}
      className="table-bar floating-tools"
      onFocus={roving.onFocus}
      onKeyDown={roving.onKeyDown}
    >
      <SettingsMenu editor={editor} pos={pos} facts={facts} />
      {facts.canStretch && <WidthMenu editor={editor} pos={pos} stretch={facts.stretch} />}
      <Tool editor={editor} label={t('editor.tableEqual')} run={() => equalColumns(editor)}>
        <IconEqual size={TOOL_ICON_SIZE} />
      </Tool>
      {facts.canStretch && (
        <Tool editor={editor} label={t('table.fitText')} run={() => fitToText(editor, pos)}>
          <IconWrap size={TOOL_ICON_SIZE} />
        </Tool>
      )}
      <ToolSeparator />
      <MoreMenu editor={editor} pos={pos} facts={facts} />
    </div>
  );
}

/** The round button on the table's top start corner, which selects every cell (EDT-216). */
export function SelectAllButton({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="table-select-all"
      aria-label={t('table.selectAll')}
      title={t('table.selectAll')}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <IconFrame size={TOOL_ICON_SIZE} />
    </button>
  );
}
