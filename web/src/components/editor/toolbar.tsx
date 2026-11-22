// SPDX-License-Identifier: Apache-2.0
// The row of tools: one Tab stop, with arrow keys inside it (ARIA toolbar pattern). Its order
// is that of EDT-168 and EDT-169 (spec 082, behaviour 8 to 13).
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorState, type Editor } from '@tiptap/react';
import { offered, useCapabilities } from '../../capabilities';
import {
  IconAlignCenter,
  IconAlignEnd,
  IconAlignStart,
  IconAttach,
  IconBold,
  IconBullet,
  IconChevronDown,
  IconClear,
  IconClock,
  IconCode,
  IconColumns,
  IconEmoji,
  IconFullWidth,
  IconHighlight,
  IconIndent,
  IconItalic,
  IconLink,
  IconMention,
  IconMore,
  IconNumbered,
  IconOutdent,
  IconPanelInfo,
  IconPlus,
  IconRedo,
  IconSearch,
  IconStrike,
  IconSubscript,
  IconSuperscript,
  IconSynced,
  IconTable,
  IconTask,
  IconTextColor,
  IconUnderline,
  IconUndo,
} from '../icons';
import { Menu, MenuItem, MenuSeparator, MenuSub } from '../menu';
import { toggleList } from './block-commands';
import { INSERT_ITEMS } from './insert';
import { ariaKeysHere, keysHere } from './key-names';
import type { EditorActions } from './keys';
import { indentBlock, setAlignment, setDirection, setTextStyle } from './marks';
import { MARK_COLORS, TEXT_COLORS } from './palette';
import { useRovingFocus } from './roving-focus';
import { SelectionTools } from './selection-tools';
import { Tool, ToolSeparator, TOOL_ICON_SIZE } from './tool';
import { ROW_GROUPS, useToolFolding, type RowGroup } from './tool-fold';

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const ARROW_ICON_SIZE = 14;

/** The keys of a combination, shown at the end of a menu entry and said through aria-keyshortcuts. */
function MenuKeys({ binding }: { binding: string }) {
  return (
    <span className="menu-keys" aria-hidden="true">
      {keysHere(binding).join(' ')}
    </span>
  );
}

const keyshortcuts = ariaKeysHere;

/** The text style as words, with a menu of normal text and the six headings (EDT-168). */
function TextStyle({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const current = useEditorState({
    editor,
    selector: (s) => HEADING_LEVELS.find((level) => s.editor.isActive('heading', { level })) ?? 0,
  });
  const name = current ? t(`editor.h${current}`) : t('editor.normalText');
  const styles = [0, ...HEADING_LEVELS].map((level) => ({
    level,
    name: level ? t(`editor.h${level}`) : t('editor.normalText'),
    binding: `Mod-Alt-${level}`,
  }));
  return (
    <Menu
      label={t('editor.textStyleNow', { style: name })}
      trigger={
        <>
          <span className="tool-style-name">{name}</span>
          <IconChevronDown size={ARROW_ICON_SIZE} />
        </>
      }
      className="tool tool-style"
      align="start"
    >
      {styles.map((style) => (
        <MenuItem
          key={style.level}
          role="menuitemradio"
          aria-checked={current === style.level}
          aria-keyshortcuts={keyshortcuts(style.binding)}
          onClick={() => setTextStyle(editor, style.level || null)}
        >
          {style.name}
          <MenuKeys binding={style.binding} />
        </MenuItem>
      ))}
    </Menu>
  );
}

function Marks({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const chain = () => editor.chain().focus();
  return (
    <>
      <Tool editor={editor} label={t('editor.bold')} active="bold" run={() => chain().toggleBold().run()}>
        <IconBold size={TOOL_ICON_SIZE} />
      </Tool>
      <Tool
        editor={editor}
        label={t('editor.underline')}
        active="underline"
        run={() => chain().toggleUnderline().run()}
      >
        <IconUnderline size={TOOL_ICON_SIZE} />
      </Tool>
      <Tool
        editor={editor}
        label={t('editor.italic')}
        active="italic"
        run={() => chain().toggleItalic().run()}
      >
        <IconItalic size={TOOL_ICON_SIZE} />
      </Tool>
      <MoreFormatting editor={editor} />
    </>
  );
}

/** One entry of More formatting that turns a mark on or off, with its keys. */
function MarkEntry({
  editor,
  mark,
  label,
  binding,
  icon,
}: {
  editor: Editor;
  mark: string;
  label: string;
  binding: string;
  icon: ReactNode;
}) {
  const on = useEditorState({ editor, selector: (s) => s.editor.isActive(mark) });
  return (
    <MenuItem
      role="menuitemcheckbox"
      aria-checked={on}
      aria-keyshortcuts={keyshortcuts(binding)}
      onClick={() => editor.chain().focus().toggleMark(mark).run()}
    >
      {icon} {label}
      <MenuKeys binding={binding} />
    </MenuItem>
  );
}

/** Highlight, the rarer marks and clear formatting, each with its keys (D11). */
function MoreFormatting({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const icon = (Icon: typeof IconStrike) => <Icon size={TOOL_ICON_SIZE} />;
  return (
    <Menu
      label={t('editor.moreFormatting')}
      trigger={<IconMore size={TOOL_ICON_SIZE} />}
      className="tool"
      align="start"
    >
      <MenuSub label={t('editor.highlight')} icon={icon(IconHighlight)}>
        <HighlightChoices editor={editor} />
      </MenuSub>
      <MarkEntry
        editor={editor}
        mark="strike"
        label={t('editor.strike')}
        binding="Mod-Shift-s"
        icon={icon(IconStrike)}
      />
      <MarkEntry editor={editor} mark="code" label={t('editor.code')} binding="Mod-e" icon={icon(IconCode)} />
      <MarkEntry
        editor={editor}
        mark="subscript"
        label={t('editor.subscript')}
        binding="Mod-,"
        icon={icon(IconSubscript)}
      />
      <MarkEntry
        editor={editor}
        mark="superscript"
        label={t('editor.superscript')}
        binding="Mod-."
        icon={icon(IconSuperscript)}
      />
      <MenuSeparator />
      <MenuItem
        aria-keyshortcuts={keyshortcuts('Mod-\\')}
        onClick={() => editor.chain().focus().unsetAllMarks().run()}
      >
        {icon(IconClear)} {t('editor.clearFormatting')}
        <MenuKeys binding="Mod-\" />
      </MenuItem>
    </Menu>
  );
}

export function TextColorMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const current = useEditorState({
    editor,
    selector: (s) => s.editor.getAttributes('textColor').color as string | undefined,
  });
  const chain = () => editor.chain().focus();
  return (
    <Menu
      label={t('editor.textColor')}
      trigger={<IconTextColor size={TOOL_ICON_SIZE} />}
      className="tool"
      align="start"
    >
      <MenuItem
        role="menuitemradio"
        aria-checked={!current}
        onClick={() => chain().unsetMark('textColor').run()}
      >
        <IconTextColor size={TOOL_ICON_SIZE} /> {t('editor.defaultColor')}
      </MenuItem>
      {TEXT_COLORS.map((color) => (
        <MenuItem
          key={color}
          role="menuitemradio"
          aria-checked={current === color}
          onClick={() => chain().setMark('textColor', { color }).run()}
        >
          <span className={`text-${color}`}>
            <IconTextColor size={TOOL_ICON_SIZE} />
          </span>{' '}
          {t(`editor.colors.${color}`)}
        </MenuItem>
      ))}
    </Menu>
  );
}

/** The palette of highlights, in the floating bar's menu and in the sub-menu of More formatting. */
function HighlightChoices({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const current = useEditorState({
    editor,
    selector: (s) => s.editor.getAttributes('highlight').color as string | undefined,
  });
  const chain = () => editor.chain().focus();
  return (
    <>
      <MenuItem
        role="menuitemradio"
        aria-checked={!current}
        onClick={() => chain().unsetMark('highlight').run()}
      >
        <span className="swatch" /> {t('editor.noColor')}
      </MenuItem>
      {MARK_COLORS.map((color) => (
        <MenuItem
          key={color}
          role="menuitemradio"
          aria-checked={current === color}
          onClick={() => chain().setMark('highlight', { color }).run()}
        >
          <span className={`swatch mark-${color}`} /> {t(`editor.colors.${color}`)}
        </MenuItem>
      ))}
    </>
  );
}

export function HighlightMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  return (
    <Menu
      label={t('editor.highlight')}
      trigger={<IconHighlight size={TOOL_ICON_SIZE} />}
      className="tool"
      align="start"
    >
      <HighlightChoices editor={editor} />
    </Menu>
  );
}

function AlignMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const current = useEditorState({
    editor,
    selector: (s) => {
      const block = s.editor.isActive('heading') ? 'heading' : 'paragraph';
      const attrs = s.editor.getAttributes(block) as { align?: string | null; dir?: string | null };
      return { align: attrs.align ?? null, dir: attrs.dir ?? null };
    },
  });
  const directions = [
    { value: null, label: t('editor.directionPage') },
    { value: 'ltr', label: t('editor.directionLtr') },
    { value: 'rtl', label: t('editor.directionRtl') },
  ] as const;
  const options = [
    { value: null, label: t('editor.alignStart'), icon: <IconAlignStart size={TOOL_ICON_SIZE} /> },
    { value: 'center', label: t('editor.alignCenter'), icon: <IconAlignCenter size={TOOL_ICON_SIZE} /> },
    { value: 'end', label: t('editor.alignEnd'), icon: <IconAlignEnd size={TOOL_ICON_SIZE} /> },
  ] as const;
  return (
    <Menu
      label={t('editor.align')}
      trigger={<IconAlignStart size={TOOL_ICON_SIZE} />}
      className="tool"
      align="start"
    >
      {options.map((option) => (
        <MenuItem
          key={option.label}
          role="menuitemradio"
          aria-checked={current.align === option.value}
          onClick={() => setAlignment(editor, option.value)}
        >
          {option.icon} {option.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      {directions.map((option) => (
        <MenuItem
          key={option.label}
          role="menuitemradio"
          aria-checked={current.dir === option.value}
          onClick={() => setDirection(editor, option.value)}
        >
          {option.label}
        </MenuItem>
      ))}
    </Menu>
  );
}

/** Bullet and numbered lists, and the list choices: indent and outdent (D12). */
function Lists({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  return (
    <>
      <Tool
        editor={editor}
        label={t('editor.bullet')}
        active="bulletList"
        run={() => toggleList(editor, 'bulletList')}
      >
        <IconBullet size={TOOL_ICON_SIZE} />
      </Tool>
      <Tool
        editor={editor}
        label={t('editor.ordered')}
        active="orderedList"
        run={() => toggleList(editor, 'orderedList')}
      >
        <IconNumbered size={TOOL_ICON_SIZE} />
      </Tool>
      <Menu
        label={t('editor.listChoices')}
        trigger={<IconChevronDown size={ARROW_ICON_SIZE} />}
        className="tool tool-arrow"
        align="start"
      >
        <MenuItem onClick={() => indentBlock(editor, 'in')}>
          <IconIndent size={TOOL_ICON_SIZE} /> {t('editor.indent')}
        </MenuItem>
        <MenuItem onClick={() => indentBlock(editor, 'out')}>
          <IconOutdent size={TOOL_ICON_SIZE} /> {t('editor.outdent')}
        </MenuItem>
      </Menu>
    </>
  );
}

/** Runs an entry of the insert list, so a direct button and its entry are one way (D10). */
function useEntries(editor: Editor, actions: EditorActions) {
  const items = offered(INSERT_ITEMS, useCapabilities());
  return {
    has: (id: string) => items.some((item) => item.id === id),
    run: (id: string) => items.find((item) => item.id === id)?.run(editor, actions),
  };
}

/** Task, image or file, mention and emoji (behaviour 10). */
function DirectTools({
  editor,
  actions,
  canAttach,
}: {
  editor: Editor;
  actions: EditorActions;
  canAttach: boolean;
}) {
  const { t } = useTranslation();
  const entries = useEntries(editor, actions);
  return (
    <>
      {entries.has('task') && (
        <Tool
          editor={editor}
          label={t('editor.task')}
          active="taskList"
          run={() => toggleList(editor, 'taskList')}
        >
          <IconTask size={TOOL_ICON_SIZE} />
        </Tool>
      )}
      {canAttach && entries.has('attach') && (
        <Tool editor={editor} label={t('editor.attach')} run={actions.pickFiles}>
          <IconAttach size={TOOL_ICON_SIZE} />
        </Tool>
      )}
      <Tool
        editor={editor}
        label={t('editor.mention')}
        run={() => editor.chain().focus().insertContent({ type: 'text', text: '@' }).run()}
      >
        <IconMention size={TOOL_ICON_SIZE} />
      </Tool>
      {entries.has('emoji') && (
        <Tool editor={editor} label={t('editor.emojiPicker')} run={actions.openEmojiPicker}>
          <IconEmoji size={TOOL_ICON_SIZE} />
        </Tool>
      )}
    </>
  );
}

/** Columns, an info panel and a synced block, where each is offered (D10). */
function BlockTools({ editor, actions }: { editor: Editor; actions: EditorActions }) {
  const { t } = useTranslation();
  const entries = useEntries(editor, actions);
  return (
    <>
      {entries.has('columns2') && (
        <Tool editor={editor} label={t('editor.columns')} run={() => entries.run('columns2')}>
          <IconColumns size={TOOL_ICON_SIZE} />
        </Tool>
      )}
      {entries.has('panelInfo') && (
        <Tool editor={editor} label={t('editor.panel')} run={() => entries.run('panelInfo')}>
          <IconPanelInfo size={TOOL_ICON_SIZE} />
        </Tool>
      )}
      {entries.has('block_synced_block') && (
        <Tool editor={editor} label={t('editor.syncedBlock')} run={() => entries.run('block_synced_block')}>
          <IconSynced size={TOOL_ICON_SIZE} />
        </Tool>
      )}
    </>
  );
}

/** Undo and redo keep their place and their stop while there is nothing to do (EDT-170, D13). */
function UndoTools({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const can = useEditorState({
    editor,
    selector: (s) => ({ undo: s.editor.can().undo(), redo: s.editor.can().redo() }),
  });
  const chain = () => editor.chain().focus();
  return (
    <>
      <Tool editor={editor} label={t('editor.undo')} unavailable={!can.undo} run={() => chain().undo().run()}>
        <IconUndo size={TOOL_ICON_SIZE} />
      </Tool>
      <Tool editor={editor} label={t('editor.redo')} unavailable={!can.redo} run={() => chain().redo().run()}>
        <IconRedo size={TOOL_ICON_SIZE} />
      </Tool>
    </>
  );
}

export function Toolbar({
  editor,
  canAttach,
  actions,
  fileInput,
  fullWidth,
  onFullWidth,
  onInsert,
  onFiles,
  history,
}: {
  editor: Editor;
  canAttach: boolean;
  actions: EditorActions;
  fileInput: RefObject<HTMLInputElement | null>;
  fullWidth?: boolean;
  /** Left out where there is no page to widen, such as in a template. */
  onFullWidth?: () => void;
  onInsert: () => void;
  onFiles: (files: File[]) => void;
  /** The History panel of a page; left out where there are no versions, such as in a template. */
  history?: { open: boolean; onToggle: () => void };
}) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);

  const [showsMore, setShowsMore] = useState(false);
  const roving = useRovingFocus(root, () => editor.commands.focus());
  const tools: Record<RowGroup, ReactNode> = {
    style: <TextStyle editor={editor} />,
    marks: <Marks editor={editor} />,
    lists: <Lists editor={editor} />,
    align: (
      <>
        <AlignMenu editor={editor} />
        <TextColorMenu editor={editor} />
        <ToolSeparator />
      </>
    ),
    direct: <DirectTools editor={editor} actions={actions} canAttach={canAttach} />,
    blocks: <BlockTools editor={editor} actions={actions} />,
    insert: (
      <>
        <Tool editor={editor} label={t('editor.table')} run={actions.insertTable}>
          <IconTable size={TOOL_ICON_SIZE} />
        </Tool>
        <Tool editor={editor} label={t('editor.tableSize')} narrow run={actions.openTableSize}>
          <IconChevronDown size={ARROW_ICON_SIZE} />
        </Tool>
        <Tool editor={editor} label={t('editor.insert')} run={onInsert}>
          <IconPlus size={TOOL_ICON_SIZE} />
        </Tool>
        <ToolSeparator />
      </>
    ),
    link: (
      <>
        <Tool editor={editor} label={t('editor.link')} active="link" run={actions.openLink}>
          <IconLink size={TOOL_ICON_SIZE} />
        </Tool>
        <ToolSeparator />
      </>
    ),
    undo: <UndoTools editor={editor} />,
    history: history && (
      <Tool editor={editor} label={t('editor.history')} pressed={history.open} run={history.onToggle}>
        <IconClock size={TOOL_ICON_SIZE} />
      </Tool>
    ),
    last: (
      <>
        <ToolSeparator />
        <Tool editor={editor} label={t('editor.find')} run={actions.openFind}>
          <IconSearch size={TOOL_ICON_SIZE} />
        </Tool>
        {onFullWidth && (
          <Tool editor={editor} label={t('editor.fullWidth')} pressed={fullWidth ?? false} run={onFullWidth}>
            <IconFullWidth size={TOOL_ICON_SIZE} />
          </Tool>
        )}
      </>
    ),
  };
  const present = ROW_GROUPS.filter((id) => tools[id]);
  const folded = useToolFolding(root, present);
  const shown = present.filter((id) => !folded.has(id));
  const hidden = present.filter((id) => folded.has(id));
  return (
    <div
      ref={root}
      role="toolbar"
      aria-label={t('editor.toolbar')}
      className="toolbar"
      onFocus={roving.onFocus}
      onKeyDown={roving.onKeyDown}
    >
      {shown.map((id) => (
        <span key={id} className="tool-group" data-tool-group={id}>
          {tools[id]}
        </span>
      ))}
      {hidden.length > 0 && (
        <span className="tool-more">
          <button
            type="button"
            className={showsMore ? 'tool on' : 'tool'}
            aria-label={t('editor.moreTools')}
            title={t('editor.moreTools')}
            aria-expanded={showsMore}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowsMore(!showsMore)}
          >
            <IconChevronDown size={TOOL_ICON_SIZE} />
          </button>
          {showsMore && (
            <span className="tool-more-panel" role="group" aria-label={t('editor.moreTools')}>
              {hidden.map((id) => (
                <span key={id} className="tool-fold">
                  {tools[id]}
                </span>
              ))}
            </span>
          )}
        </span>
      )}
      {canAttach && (
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          aria-label={t('editor.attach')}
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      )}
      {/* They come and go with the selection, so they sit after the fixed groups and wrap below. */}
      <span className="tool-side">
        <SelectionTools editor={editor} actions={actions} />
      </span>
    </div>
  );
}
