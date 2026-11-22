// SPDX-License-Identifier: Apache-2.0
// Everything that can be added to a document, reached with `/`, `:`, `@` or the Insert tool.
import { forwardRef, useEffect, useId, useImperativeHandle, useState, type ComponentType } from 'react';
import { Extension, type Editor } from '@tiptap/core';
import { NodeSelection, PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { api, type MentionCandidate } from '../../api';
import i18n from '../../i18n';
import {
  IconAttach,
  IconBullet,
  IconCodeBlock,
  IconColumns2,
  IconColumns3,
  IconColumns4,
  IconColumns5,
  IconColumnsSidebar,
  IconDate,
  IconDecision,
  IconEmoji,
  IconExpand,
  IconHeading1,
  IconHeading2,
  IconHeading3,
  IconHeading4,
  IconHeading5,
  IconHeading6,
  IconHelp,
  IconLink,
  IconMention,
  IconNumbered,
  IconPanelError,
  IconPanelInfo,
  IconPanelNote,
  IconPanelSuccess,
  IconPanelWarning,
  IconPerson,
  IconPeople,
  IconQuote,
  IconRule,
  IconSpotlight,
  IconStatus,
  IconRename,
  IconTable,
  IconTask,
  IconText,
  IconPicture,
  IconSliders,
} from '../icons';
import { insertColumns, toggleList } from './block-commands';
import { DYNAMIC_KINDS } from './dynamic/kinds';
import { addChart } from './dynamic/nodes';
import emoji from './emoji.json';
import { today } from './inline';
import { orderedItems } from './insert-catalogue';
import { noActions, type EditorActions } from './keys';
import { setTextStyle } from './marks';
import { FIRST_PANEL_EMOJI, type PanelKind } from './palette';
import { slashRender } from './slash-menu';

const MAX_EMOJI_RESULTS = 8;
const HEADING_ICONS = [IconHeading1, IconHeading2, IconHeading3, IconHeading4, IconHeading5, IconHeading6];

export interface InsertItem {
  id: string;
  /** Words of a person, such as the name of a saved block. Otherwise the name is translated. */
  label?: string;
  icon: ComponentType<{ size?: number }>;
  run: (editor: Editor, actions: EditorActions) => void;
}

const panelItem = (id: string, kind: PanelKind, icon: InsertItem['icon']): InsertItem => ({
  id,
  icon,
  run: (editor) => editor.chain().focus().wrapIn('panel', { kind }).run(),
});

/** Text goes in as a node: a plain string would be parsed as HTML, which Trusted Types refuses. */
const insertText = (editor: Editor, text: string) =>
  editor.chain().focus().insertContent({ type: 'text', text }).run();

/** Adds an item that lives in a line, and selects it so its tools appear in the row. */
function insertSelected(editor: Editor, type: string, attrs: Record<string, string>) {
  const at = editor.state.selection.from;
  editor.chain().focus().insertContent({ type, attrs }).run();
  const { tr, doc } = editor.state;
  editor.view.dispatch(tr.setSelection(NodeSelection.create(doc, at)));
}

export const INSERT_ITEMS: InsertItem[] = [
  { id: 'text', icon: IconText, run: (editor) => editor.chain().focus().clearNodes().run() },
  ...HEADING_ICONS.map((icon, at) => ({
    id: `h${at + 1}`,
    icon,
    run: (editor: Editor) => setTextStyle(editor, at + 1),
  })),
  { id: 'bullet', icon: IconBullet, run: (editor) => toggleList(editor, 'bulletList') },
  { id: 'ordered', icon: IconNumbered, run: (editor) => toggleList(editor, 'orderedList') },
  { id: 'task', icon: IconTask, run: (editor) => toggleList(editor, 'taskList') },
  { id: 'quote', icon: IconQuote, run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { id: 'code', icon: IconCodeBlock, run: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { id: 'rule', icon: IconRule, run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  panelItem('panelInfo', 'info', IconPanelInfo),
  panelItem('panelNote', 'note', IconPanelNote),
  panelItem('panelSuccess', 'success', IconPanelSuccess),
  panelItem('panelWarning', 'warning', IconPanelWarning),
  panelItem('panelError', 'error', IconPanelError),
  {
    id: 'panelNeutral',
    icon: IconEmoji,
    run: (editor) =>
      editor.chain().focus().wrapIn('panel', { kind: 'neutral', emoji: FIRST_PANEL_EMOJI }).run(),
  },
  { id: 'spotlight', icon: IconSpotlight, run: (editor) => editor.chain().focus().wrapIn('spotlight').run() },
  { id: 'expand', icon: IconExpand, run: (editor) => editor.chain().focus().wrapIn('expand').run() },
  { id: 'columns2', icon: IconColumns2, run: (editor) => insertColumns(editor, 2) },
  { id: 'columns3', icon: IconColumns3, run: (editor) => insertColumns(editor, 3) },
  { id: 'columns4', icon: IconColumns4, run: (editor) => insertColumns(editor, 4) },
  { id: 'columns5', icon: IconColumns5, run: (editor) => insertColumns(editor, 5) },
  {
    id: 'columnsSidebar',
    icon: IconColumnsSidebar,
    run: (editor) => insertColumns(editor, 2, 'sidebar-end'),
  },
  { id: 'decision', icon: IconDecision, run: (editor) => editor.chain().focus().setNode('decision').run() },
  {
    id: 'table',
    icon: IconTable,
    run: (_editor, actions) => actions.openTableSize(),
  },
  { id: 'attach', icon: IconAttach, run: (_editor, actions) => actions.pickFiles() },
  { id: 'pageFile', icon: IconAttach, run: (_editor, actions) => actions.openPageFiles() },
  { id: 'importWord', icon: IconAttach, run: (_editor, actions) => actions.pickWord() },
  { id: 'link', icon: IconLink, run: (_editor, actions) => actions.openLink() },
  {
    id: 'status',
    icon: IconStatus,
    run: (editor) =>
      insertSelected(editor, 'status', { text: i18n.t('editor.statusDefault'), color: 'blue' }),
  },
  { id: 'date', icon: IconDate, run: (editor) => insertSelected(editor, 'date', { value: today() }) },
  { id: 'emoji', icon: IconEmoji, run: (editor) => insertText(editor, ':') },
  // Types the @ that opens the list of people, as a person would (EDT-168).
  { id: 'mention', icon: IconMention, run: (editor) => insertText(editor, '@') },
  { id: 'help', icon: IconHelp, run: (_editor, actions) => actions.openHelp() },
];

/** Only a template asks questions, so only there do these appear. */
export const TEMPLATE_ITEMS: InsertItem[] = [
  { id: 'field', icon: IconRename, run: (_editor, actions) => actions.openTemplateItem('field') },
  {
    id: 'instruction',
    icon: IconPanelNote,
    run: (_editor, actions) => actions.openTemplateItem('instruction'),
  },
];

/** A section of text a condition shows, in a guided template (spec 074, TPL-422, TPL-1013). */
export const TEMPLATE_SECTION_ITEM: InsertItem = {
  id: 'conditional',
  icon: IconExpand,
  run: (_editor, actions) => actions.openSection(null),
};

/** A value the template knows, or a link to a page of its set (spec 074, TPL-1013). */
export const TEMPLATE_VALUE_ITEM: InsertItem = {
  id: 'templateValue',
  icon: IconDate,
  run: (_editor, actions) => actions.openTemplateItem('value'),
};

const TURN_INTO_IDS = [
  'text',
  'h1',
  'h2',
  'h3',
  'bullet',
  'ordered',
  'task',
  'quote',
  'code',
  'panelInfo',
  'expand',
];

// One icon per family (EDT-191): people blocks show a person, the rest of the family one icon.
const PEOPLE_KINDS: Record<string, InsertItem['icon']> = {
  person_card: IconPerson,
  people_list: IconPeople,
  contributors: IconPeople,
};

/** Every dynamic block is an entry of the same menu. */
const BLOCK_ITEMS: InsertItem[] = Object.keys(DYNAMIC_KINDS).map((kind) => ({
  id: `block_${kind}`,
  icon: PEOPLE_KINDS[kind] ?? IconSliders,
  run: (editor) => editor.chain().focus().insertContent({ type: 'dynamic', attrs: { kind } }).run(),
}));

const FACTS_TABLE = {
  type: 'pageFacts',
  content: [
    {
      type: 'table',
      content: [0, 1].map(() => ({
        type: 'tableRow',
        content: [0, 1].map(() => ({ type: 'tableCell', content: [{ type: 'paragraph' }] })),
      })),
    },
  ],
};

INSERT_ITEMS.push(
  ...BLOCK_ITEMS,
  { id: 'block_chart', icon: IconTable, run: (editor) => addChart(editor) },
  { id: 'block_drawing', icon: IconPicture, run: (_editor, actions) => actions.openDrawing() },
  {
    id: 'block_anchor',
    icon: IconLink,
    run: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({ type: 'anchor', attrs: { name: 'anchor' } })
        .run(),
  },
  {
    id: 'block_facts',
    icon: IconSliders,
    run: (editor) => editor.chain().focus().insertContent(FACTS_TABLE).run(),
  },
  {
    id: 'block_excerpt',
    icon: IconSliders,
    run: (editor) => editor.chain().focus().wrapIn('excerpt', { name: 'excerpt' }).run(),
  },
);

export const TURN_INTO_ITEMS = INSERT_ITEMS.filter((item) => TURN_INTO_IDS.includes(item.id));

// What a block most often turns into, first in its menu (EDT-023).
const LIKELY_TURNS: Record<string, string[]> = {
  paragraph: ['h2', 'bullet', 'task'],
  heading: ['text', 'h3', 'bullet'],
  bulletList: ['task', 'ordered', 'text'],
  orderedList: ['bullet', 'task', 'text'],
  taskList: ['bullet', 'ordered', 'text'],
  blockquote: ['text', 'panelInfo', 'h2'],
  codeBlock: ['text', 'quote', 'panelInfo'],
};

/** Turn into for this kind of block, with the likely changes first. */
export function turnIntoItems(blockType: string): InsertItem[] {
  const likely = LIKELY_TURNS[blockType] ?? [];
  const rank = (item: InsertItem) => {
    const at = likely.indexOf(item.id);
    return at === -1 ? likely.length : at;
  };
  return [...TURN_INTO_ITEMS].sort((a, b) => rank(a) - rank(b));
}

/** Looks in names, descriptions and the extra words a person might try (EDT-178). */
export function matchingItems(query: string, items: InsertItem[] = INSERT_ITEMS): InsertItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (item.label) return item.label.toLowerCase().includes(needle);
    const words = ['name', 'hint', 'keywords'].map((part) => i18n.t(`insert.${item.id}.${part}`)).join(' ');
    return words.toLowerCase().includes(needle);
  });
}

export function matchingEmoji(query: string): typeof emoji {
  const needle = query.toLowerCase();
  return emoji.filter((entry) => entry.words.includes(needle)).slice(0, MAX_EMOJI_RESULTS);
}

interface ListEntry {
  id: string;
  name: string;
  hint?: string;
}

interface ListProps {
  entries: ListEntry[];
  label: string;
  editor: Editor;
  choose: (index: number) => void;
}

interface ListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** The popup of `:` and `@` at the cursor. The editor keeps focus, as the ARIA combobox pattern asks. */
const SuggestionList = forwardRef<ListHandle, ListProps>(function SuggestionList(
  { entries, label, editor, choose },
  ref,
) {
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(entries);
  const listId = useId();
  if (shown !== entries) {
    setShown(entries);
    setActive(0);
  }

  useEffect(() => {
    const dom = editor.view.dom;
    const optionId = `${listId}-${active}`;
    dom.setAttribute('aria-controls', listId);
    dom.setAttribute('aria-activedescendant', optionId);
    document.getElementById(optionId)?.scrollIntoView({ block: 'nearest' });
    return () => {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    };
  }, [editor, listId, active]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (entries.length === 0) return false;
      if (event.key === 'ArrowDown') setActive((active + 1) % entries.length);
      else if (event.key === 'ArrowUp') setActive((active - 1 + entries.length) % entries.length);
      else if (event.key === 'Enter' || event.key === 'Tab') choose(active);
      else return false;
      return true;
    },
  }));

  if (entries.length === 0) return null;
  return (
    // A long list scrolls, so it needs a Tab stop. Tab itself chooses the entry.
    <ul id={listId} role="listbox" aria-label={label} className="suggestions" tabIndex={0}>
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === active}
          className={index === active ? 'suggestion active' : 'suggestion'}
          onMouseEnter={() => setActive(index)}
          onMouseDown={(e) => {
            e.preventDefault();
            choose(index);
          }}
        >
          <span className="suggestion-name">{entry.name}</span>
          {entry.hint && <span className="muted suggestion-hint">{entry.hint}</span>}
        </li>
      ))}
    </ul>
  );
});

/** Connects a popup to the Suggestion utility, which places it near the cursor. */
function popupRender<Item>(label: () => string, toEntry: (item: Item) => ListEntry) {
  return () => {
    let popup: ReactRenderer<ListHandle, ListProps> | null = null;
    let unmount: () => void = () => undefined;
    const propsFor = (props: SuggestionProps<Item>): ListProps => ({
      entries: props.items.map(toEntry),
      label: label(),
      editor: props.editor,
      choose: (index) => {
        const item = props.items[index];
        if (item) props.command(item);
      },
    });
    return {
      onStart(props: SuggestionProps<Item>) {
        popup = new ReactRenderer(SuggestionList, {
          props: propsFor(props),
          editor: props.editor,
          className: 'suggestion-popup',
        });
        unmount = props.mount(popup.element as HTMLElement);
      },
      onUpdate(props: SuggestionProps<Item>) {
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

interface SlashOptions {
  actions: () => EditorActions;
  items: () => InsertItem[];
  recent: () => string[];
  onUsed: (id: string) => void;
}

/** The menu of `/`: the same entries as the insert dialog's Everything, in the same order. */
export const SlashCommands = Extension.create<SlashOptions>({
  name: 'slashCommands',
  // Before our own keys, so that Escape closes the menu first.
  priority: 1100,
  addOptions() {
    return { actions: () => noActions, items: () => INSERT_ITEMS, recent: () => [], onUsed: () => undefined };
  },
  addProseMirrorPlugins() {
    const { actions, items, recent, onUsed } = this.options;
    return [
      Suggestion<InsertItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: true,
        pluginKey: new PluginKey('slashCommands'),
        // The typed slash and words show in the accent while the menu is open, and are never stored.
        decorationClass: 'slash-typed',
        allow: ({ editor }) => !editor.isActive('codeBlock'),
        items: ({ query }) => orderedItems(matchingItems(query, items()), recent()),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          onUsed(props.id);
          props.run(editor, actions());
        },
        render: slashRender({ openInsert: (query) => actions().openInsert(query) }),
      }),
    ];
  },
});

export const EmojiSuggestions = Extension.create({
  name: 'emojiSuggestions',
  priority: 1100,
  addProseMirrorPlugins() {
    return [
      Suggestion<(typeof emoji)[number]>({
        editor: this.editor,
        char: ':',
        pluginKey: new PluginKey('emojiSuggestions'),
        minQueryLength: 1,
        allow: ({ editor }) => !editor.isActive('codeBlock'),
        items: ({ query }) => matchingEmoji(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, { type: 'text', text: props.glyph }).run();
        },
        render: popupRender<(typeof emoji)[number]>(
          () => i18n.t('insert.emoji.name'),
          (entry) => ({ id: entry.glyph, name: entry.glyph, hint: entry.words }),
        ),
      }),
    ];
  },
});

/** `@` opens a list of people: those who can see the page come first. */
export const MentionSuggestions = Extension.create<{ pageId: string; onNoAccess: (name: string) => void }>({
  name: 'mentionSuggestions',
  priority: 1100,
  addOptions() {
    return { pageId: '', onNoAccess: () => undefined };
  },
  addProseMirrorPlugins() {
    const { pageId, onNoAccess } = this.options;
    return [
      Suggestion<MentionCandidate>({
        editor: this.editor,
        char: '@',
        pluginKey: new PluginKey('mentionSuggestions'),
        allow: ({ editor }) => !editor.isActive('codeBlock'),
        items: async ({ query }) => {
          const found = await api.get<{ candidates: MentionCandidate[] }>(
            `/pages/${pageId}/mention-candidates?q=${encodeURIComponent(query)}`,
          );
          return found.candidates;
        },
        command: ({ editor, range, props }) => {
          const attrs = { id: props.id, kind: props.kind, label: props.name };
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'mention', attrs },
              { type: 'text', text: ' ' },
            ])
            .run();
          if (!props.can_view) onNoAccess(props.name);
        },
        render: popupRender<MentionCandidate>(
          () => i18n.t('mentions.title'),
          (entry) => ({
            id: entry.id,
            name: entry.name,
            hint: entry.can_view
              ? entry.kind === 'group'
                ? i18n.t('mentions.members', { count: entry.members ?? 0 })
                : ''
              : i18n.t('mentions.cannotSee'),
          }),
        ),
      }),
    ];
  },
});
