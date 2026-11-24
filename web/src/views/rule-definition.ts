// SPDX-License-Identifier: Apache-2.0
// What a rule does, as the server stores it (internal/automation/definition.go), and the lists
// of its kinds that both editors offer: the form, and the chain of cards (spec 091).

export interface Trigger {
  kind: string;
  every?: string;
  at?: string;
}

export interface Condition {
  kind: string;
  value?: string;
  days?: number;
  items?: Condition[];
}

export interface RuleAction {
  type: string;
  text?: string;
  label?: string;
  color?: string;
  to?: string;
  target_id?: string;
  space_id?: string;
  parent_id?: string;
  title?: string;
  older_days?: number;
  address?: string;
  body?: string;
  with_text?: boolean;
  restricted?: string;
}

export interface Definition {
  trigger: Trigger;
  conditions?: Condition;
  actions: RuleAction[];
  /** For a rule of the instance: the spaces it acts in, or none for every space. */
  spaces?: string[];
}

/** Something a rule still needs. `where`, `kind` and `code` place it on a card (spec 091). */
export interface Problem {
  step: number;
  message: string;
  where?: string;
  kind?: 'input' | 'fit';
  code?: string;
}

export interface Rule {
  id: string;
  space_id: string | null;
  name: string;
  enabled: boolean;
  definition: Definition;
  owner_id: string;
  owner_name: string;
  account_id: string;
  paused_at: string | null;
  last_run_at: string | null;
  last_state: string;
  has_hook: boolean;
  problems: Problem[];
  /** Whether the person asking holds the rule (spec 092); only the holder changes it. */
  you_hold: boolean;
}

/** The answer of the check: what a definition still needs, and names the viewer may see. */
export interface Checked {
  problems: Problem[];
  names: Record<string, string>;
}

export const EVENT_TRIGGERS = [
  'page.published',
  'page.edited',
  'page.moved',
  'page.copied',
  'page.archived',
  'page.deleted',
  'page.commented',
  'page.labelled',
  'page.status_changed',
  'page.owner_changed',
  'blog.published',
  'blog.commented',
  'blog.labelled',
  'attachment.added',
  'attachment.removed',
  'task.created',
  'task.ticked',
  'person.mentioned',
  'group.member_added',
  'group.member_removed',
  'space.created',
  'space.archived',
];

/** Triggers without a space: a rule of a space never hears them (D16). */
export const INSTANCE_ONLY_TRIGGERS = ['group.member_added', 'group.member_removed', 'space.created'];

/** The triggers of the rule engine itself, as against the events of pages and people. */
export const ENGINE_TRIGGERS = ['schedule', 'incoming'];

export const TRIGGERS = [...EVENT_TRIGGERS, 'schedule', 'manual', 'incoming'];

export const CONDITION_KINDS = [
  'has_label',
  'has_status',
  'title_contains',
  'text_contains',
  'older_than',
  'in_space',
  'below_page',
  'created_by',
  'member_of',
];

export const ACTIONS = [
  'find_pages',
  'add_label',
  'remove_label',
  'set_status',
  'add_comment',
  'notify',
  'email',
  'assign_task',
  'add_watcher',
  'remove_watcher',
  'archive',
  'delete',
  'copy',
  'move',
  'restrict',
  'set_owner',
  'new_from_template',
  'webhook',
  'chat',
];

export const SCHEDULES = ['hourly', 'daily', 'weekly', 'monthly'];

/** The values a text may hold, filled in when the rule runs (D13 of spec 015). */
export const TRIGGER_VALUES = ['{page.title}', '{page.url}', '{page.author}', '{page.owner}'];
export const FOUND_VALUES = ['{found.title}'];
export const RULE_VALUES = ['{rule.name}'];

/** Whether a run that starts with this trigger has a page (spec 092, D5). */
export function triggerBringsPage(kind: string): boolean {
  return (
    kind === 'manual' ||
    (EVENT_TRIGGERS.includes(kind) && !kind.startsWith('group.') && !kind.startsWith('space.'))
  );
}

/** Ready-made rules (PLT-033): people want a start more than an empty form. */
export const RULE_TEMPLATES: { key: string; definition: Definition }[] = [
  {
    key: 'remindOwner',
    definition: {
      trigger: { kind: 'schedule', every: 'weekly', at: '09:00' },
      actions: [
        { type: 'find_pages', older_days: 365 },
        { type: 'notify', to: 'owner', text: '{found.title} has not changed for a year.' },
      ],
    },
  },
  {
    key: 'labelNew',
    definition: { trigger: { kind: 'page.published' }, actions: [{ type: 'add_label', label: 'new' }] },
  },
  {
    key: 'tellOnPost',
    definition: {
      trigger: { kind: 'blog.published' },
      actions: [{ type: 'notify', to: 'owner', text: 'New blog post: {page.title}' }],
    },
  },
  {
    key: 'askReview',
    definition: {
      trigger: { kind: 'page.status_changed' },
      actions: [{ type: 'notify', to: 'owner', text: 'Please review {page.title}.' }],
    },
  },
  {
    key: 'manyComments',
    definition: {
      trigger: { kind: 'page.commented' },
      actions: [{ type: 'notify', to: 'owner', text: '{page.title} has a new comment.' }],
    },
  },
];

/** The address of the list of rules of a space, or of the instance. */
export function ruleListPath(spaceId: string | null): string {
  return spaceId ? `/spaces/${spaceId}/rules` : '/admin/rules';
}

/** The address of the check of a definition, for a rule of a space or of the instance. */
export function ruleCheckPath(spaceId: string | null): string {
  return `${ruleListPath(spaceId)}/check`;
}
