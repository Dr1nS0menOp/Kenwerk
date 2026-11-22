// SPDX-License-Identifier: Apache-2.0
// Where each entry of the insert dialog and the slash menu belongs, in what order, and its
// shortcut (spec 082, EDT-177, EDT-187, EDT-189). Data only: the entries themselves are in
// insert.tsx. A new entry without a category or a place in the order fails insert.test.ts.

/** The categories of the insert dialog, in the order they are shown (EDT-177). */
export const CATEGORY_ORDER = [
  'text',
  'wiki',
  'media',
  'pictures',
  'finding',
  'outside',
  'reports',
  'software',
] as const;

export type InsertCategory = (typeof CATEGORY_ORDER)[number];

/** A category, or every entry at once. */
export type CategoryChoice = 'all' | InsertCategory;

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const PANELS = ['panelInfo', 'panelNote', 'panelSuccess', 'panelWarning', 'panelError', 'panelNeutral'];
const COLUMNS = ['columns2', 'columns3', 'columns4', 'columns5', 'columnsSidebar'];
const TEMPLATE_ENTRIES = ['field', 'instruction', 'conditional', 'templateValue'];
const SAVED_PREFIX = 'saved_';

export const CATEGORY_ENTRIES: Record<InsertCategory, readonly string[]> = {
  text: [
    'text',
    ...HEADINGS,
    'bullet',
    'ordered',
    'task',
    'quote',
    'code',
    'rule',
    ...PANELS,
    'expand',
    ...COLUMNS,
    'decision',
    'spotlight',
    'table',
    'status',
    'date',
    'emoji',
    'mention',
    'link',
    'block_anchor',
    ...TEMPLATE_ENTRIES,
  ],
  wiki: [
    'block_synced_block',
    'block_excerpt',
    'block_show_excerpt',
    'block_embedded_page',
    'block_facts',
    'block_child_pages',
    'block_blog_posts',
    'block_create_from_template',
    'block_history_here',
  ],
  media: ['attach', 'pageFile', 'importWord', 'block_attachments_here', 'block_space_files'],
  pictures: ['block_drawing', 'block_chart'],
  finding: [
    'block_toc',
    'block_section_contents',
    'block_back_to_top',
    'block_search_box',
    'block_page_tree',
    'block_space_index',
    'block_spaces_list',
    'block_breadcrumbs',
    'block_link_cards',
    'block_rotating_cards',
    'block_filter_list',
    'block_labels_list',
    'block_popular_labels',
    'block_related_labels',
    'block_recent_labels',
    'help',
  ],
  outside: [],
  reports: [
    'block_recent_changes',
    'block_activity_tabs',
    'block_popular_pages',
    'block_my_favourites',
    'block_my_drafts',
    'block_my_tasks',
    'block_report_table',
    'block_facts_report',
    'block_decision_report',
    'block_task_report',
    'block_contributors',
    'block_contribution_table',
    'block_person_card',
    'block_people_list',
    'block_timeline',
  ],
  software: [],
};

/** The category of an entry; a saved block is the wiki's own content. */
export function categoryOf(id: string): InsertCategory | undefined {
  if (id.startsWith(SAVED_PREFIX)) return 'wiki';
  return CATEGORY_ORDER.find((category) => CATEGORY_ENTRIES[category].includes(id));
}

/** Everything first, then the categories that hold one of these entries. */
export function categoriesShown(items: readonly { id: string }[]): CategoryChoice[] {
  const held = new Set(items.map((item) => categoryOf(item.id)));
  return ['all', ...CATEGORY_ORDER.filter((category) => held.has(category))];
}

/** Where the saved blocks stand in the order: after Help, before the dynamic blocks. */
const SAVED_PLACE = 'saved';

/**
 * Every entry by role (EDT-189): items in a line and simple blocks; text structure; Help; the
 * saved blocks; the dynamic blocks for reports, people and finding your way, and page facts;
 * display blocks and actions. An entry the line does not name sits at the end of the role it is
 * closest to.
 */
export const ROLE_ORDER: readonly string[] = [
  // Items in a line and simple blocks.
  'task',
  'attach',
  'pageFile',
  'importWord',
  'mention',
  'block_synced_block',
  'emoji',
  'expand',
  'table',
  'block_chart',
  'block_drawing',
  'code',
  'status',
  ...PANELS,
  'date',
  'decision',
  ...TEMPLATE_ENTRIES,
  // Text structure.
  'bullet',
  ...COLUMNS,
  'link',
  'block_anchor',
  'block_excerpt',
  'ordered',
  'rule',
  'quote',
  'text',
  ...HEADINGS,
  'help',
  SAVED_PLACE,
  // Dynamic blocks for reports, people and finding your way, and page facts.
  ...CATEGORY_ENTRIES.reports,
  'block_section_contents',
  'block_back_to_top',
  'block_search_box',
  'block_page_tree',
  'block_space_index',
  'block_spaces_list',
  'block_breadcrumbs',
  'block_filter_list',
  'block_labels_list',
  'block_popular_labels',
  'block_related_labels',
  'block_recent_labels',
  'block_show_excerpt',
  'block_embedded_page',
  'block_child_pages',
  'block_blog_posts',
  'block_history_here',
  'block_attachments_here',
  'block_space_files',
  'block_facts',
  // Display blocks and actions.
  'block_toc',
  'spotlight',
  'block_link_cards',
  'block_rotating_cards',
  'block_create_from_template',
];

const rankOf = (id: string) => {
  const at = ROLE_ORDER.indexOf(id.startsWith(SAVED_PREFIX) ? SAVED_PLACE : id);
  return at === -1 ? ROLE_ORDER.length : at;
};

/** What a person used lately first, in that order, then the rest by role, each entry once. */
export function orderedItems<T extends { id: string }>(
  items: readonly T[],
  recentIds: readonly string[],
): T[] {
  const recent = recentIds.flatMap((id) => items.filter((item) => item.id === id));
  const others = items.filter((item) => !recentIds.includes(item.id));
  // A stable sort keeps saved blocks in their own order.
  return [...recent, ...others.sort((a, b) => rankOf(a.id) - rankOf(b.id))];
}

/** What a person types, or the keys they press, to add an entry without a menu (EDT-187). */
export type InsertShortcut = { kind: 'typed'; text: string } | { kind: 'keys'; binding: string };

// Only shortcuts that work in this release: StarterKit's input rules, blocks.tsx, inline.ts,
// the suggestion lists and keys.ts.
const TYPED: Record<string, string> = {
  ...Object.fromEntries(HEADINGS.map((id, at) => [id, '#'.repeat(at + 1)])),
  bullet: '-',
  ordered: '1.',
  task: '[ ]',
  quote: '>',
  code: '```',
  rule: '---',
  panelInfo: '!!',
  decision: '<>',
  date: '//',
  emoji: ':',
  mention: '@',
};

// Written as keys.ts binds them, so key-names.ts names them for the person's system.
const KEYS: Record<string, string> = { link: 'Mod-k' };

export function shortcutOf(id: string): InsertShortcut | undefined {
  const text = TYPED[id];
  if (text !== undefined) return { kind: 'typed', text };
  const binding = KEYS[id];
  return binding ? { kind: 'keys', binding } : undefined;
}

/** The colour of an entry's icon: a panel shows its own. */
export type InsertTone = 'info' | 'note' | 'success' | 'warning' | 'error';

const TONES: Record<string, InsertTone> = {
  panelInfo: 'info',
  panelNote: 'note',
  panelSuccess: 'success',
  panelWarning: 'warning',
  panelError: 'error',
};

export const toneOf = (id: string): InsertTone | undefined => TONES[id];
