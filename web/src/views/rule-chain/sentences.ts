// SPDX-License-Identifier: Apache-2.0
// The title and second line of every card (PLT-135, PLT-141). Each line is one translated
// sentence with named values, so a translation orders its words freely. Pure: it gives keys and
// values, and the screen translates them.
import type { Condition, RuleAction, Trigger } from '../rule-definition';
import { isGroup, isPlaceholder, type Card } from './chain-model';

/** A value of a sentence: plain text, a number, or words that need translating first. */
export type SentenceValue = string | number | { key: string };

/** How a line reads: quiet for what a step does, needs for what is missing (PLT-141). */
export type Tone = 'muted' | 'plain' | 'needs';

export interface Sentence {
  key: string;
  values: Record<string, SentenceValue>;
  tone: Tone;
}

/** What a sentence may name: the names the viewer may see (E4), by id. */
export type Names = Record<string, string>;

type Unseen = 'page' | 'space' | 'person' | 'group' | 'template';

const line = (name: string, tone: Tone, values: Record<string, SentenceValue> = {}): Sentence => ({
  key: `ruleChain.line.${name}`,
  values,
  tone,
});

const needs = (name: string): Sentence => line(`needs_${name}`, 'needs');

/** A name the viewer may see, or words saying they may not: never the id, never a title they may not see. */
function named(names: Names, id: string | undefined, unseen: Unseen): SentenceValue {
  const name = id ? names[id] : undefined;
  return name ?? { key: `ruleChain.unseen.${unseen}` };
}

const filled = (value: string | undefined): value is string => (value ?? '').trim() !== '';

function triggerName(kind: string): string {
  return kind.replaceAll('.', '_');
}

/** The key of a card's title: the type in words (PLT-135). */
export function titleKey(card: Card): string {
  if (isPlaceholder(card))
    return `ruleChain.title.placeholder_${card.kind === 'group' ? 'condition' : card.kind}`;
  switch (card.kind) {
    case 'trigger':
      return `ruleChain.title.trigger_${triggerName(card.trigger.kind)}`;
    case 'action':
      return `ruleChain.title.action_${card.action.type}`;
    default:
      return `ruleChain.title.condition_${card.condition.kind}`;
  }
}

function triggerSentence(trigger: Trigger): Sentence {
  if (trigger.kind === '') return line('placeholder_trigger', 'muted');
  if (trigger.kind !== 'schedule') return line(`trigger_${triggerName(trigger.kind)}`, 'muted');
  if (!trigger.every) return needs('every');
  if (trigger.every === 'hourly') return line('schedule_hourly', 'muted');
  if (!filled(trigger.at)) return needs('at');
  return line(`schedule_${trigger.every}`, 'muted', { at: trigger.at ?? '' });
}

function leafSentence(c: Condition, names: Names): Sentence {
  const value = c.value ?? '';
  switch (c.kind) {
    case 'has_label':
    case 'has_status':
    case 'title_contains':
    case 'text_contains':
      return filled(value) ? line(`condition_${c.kind}`, 'muted', { value }) : needs(c.kind);
    case 'older_than':
      return (c.days ?? 0) >= 1
        ? line('condition_older_than', 'muted', { count: c.days ?? 0 })
        : needs('days');
    case 'in_space':
      return filled(value)
        ? line('condition_in_space', 'muted', { name: named(names, value, 'space') })
        : needs('space');
    case 'below_page':
      return filled(value)
        ? line('condition_below_page', 'muted', { name: named(names, value, 'page') })
        : needs('page');
    case 'created_by':
      return filled(value)
        ? line('condition_created_by', 'muted', { name: named(names, value, 'person') })
        : needs('person');
    case 'member_of':
      return filled(value)
        ? line('condition_member_of', 'muted', { name: named(names, value, 'group') })
        : needs('group');
    default:
      return needs('condition');
  }
}

function groupSentence(c: Condition): Sentence {
  const count = (c.items ?? []).length;
  if (count === 0) return needs('group');
  if (c.kind === 'not') return line('group_not', 'muted');
  return line(`group_${c.kind}`, 'muted', { count });
}

const RECIPIENT_STEPS = ['notify', 'email', 'assign_task', 'add_watcher', 'remove_watcher'];
const TEXT_STEPS = ['add_comment', 'notify', 'email', 'assign_task', 'chat'];

function recipient(a: RuleAction, names: Names): SentenceValue | null {
  switch (a.to) {
    case 'owner':
    case 'author':
      return { key: `ruleChain.who.${a.to}` };
    case 'user':
      return a.target_id ? named(names, a.target_id, 'person') : null;
    case 'group':
      return a.target_id ? named(names, a.target_id, 'group') : null;
    default:
      return null;
  }
}

function findSentence(a: RuleAction): Sentence {
  const days = a.older_days ?? 0;
  if (filled(a.label) && days > 0)
    return line('action_find_pages_label_older', 'plain', { label: a.label ?? '', count: days });
  if (filled(a.label)) return line('action_find_pages_label', 'plain', { label: a.label ?? '' });
  if (days > 0) return line('action_find_pages_older', 'plain', { count: days });
  return line('action_find_pages', 'plain');
}

function placedSentence(a: RuleAction, names: Names): Sentence {
  switch (a.type) {
    case 'move':
      if (a.parent_id) return line('action_move_below', 'plain', { name: named(names, a.parent_id, 'page') });
      if (a.space_id) return line('action_move_space', 'plain', { name: named(names, a.space_id, 'space') });
      return needs('place');
    case 'restrict':
      if (a.restricted !== 'view' && a.restricted !== 'edit') return needs('restriction');
      if (!a.target_id) return needs('group');
      return line(`action_restrict_${a.restricted}`, 'plain', { name: named(names, a.target_id, 'group') });
    case 'set_owner':
      return a.target_id
        ? line('action_set_owner', 'plain', { name: named(names, a.target_id, 'person') })
        : needs('owner');
    default:
      if (!a.target_id) return needs('template');
      if (!filled(a.title)) return needs('title');
      return line('action_new_from_template', 'plain', {
        title: a.title ?? '',
        name: named(names, a.target_id, 'template'),
      });
  }
}

function actionSentence(a: RuleAction, names: Names): Sentence {
  if (RECIPIENT_STEPS.includes(a.type)) {
    const who = recipient(a, names);
    if (!who) return needs('recipient');
    if (!TEXT_STEPS.includes(a.type)) return line(`action_${a.type}`, 'plain', { who });
    return filled(a.text) ? line(`action_${a.type}`, 'plain', { who, text: a.text ?? '' }) : needs('text');
  }
  switch (a.type) {
    case 'find_pages':
      return findSentence(a);
    case 'add_label':
    case 'remove_label':
      return filled(a.label) ? line(`action_${a.type}`, 'plain', { label: a.label ?? '' }) : needs('label');
    case 'set_status':
      return filled(a.text) ? line('action_set_status', 'plain', { text: a.text ?? '' }) : needs('status');
    case 'add_comment':
      return filled(a.text) ? line('action_add_comment', 'plain', { text: a.text ?? '' }) : needs('text');
    case 'archive':
    case 'delete':
    case 'copy':
      return line(`action_${a.type}`, 'plain');
    case 'move':
    case 'restrict':
    case 'set_owner':
    case 'new_from_template':
      return placedSentence(a, names);
    case 'webhook':
      return filled(a.address)
        ? line('action_webhook', 'plain', { address: a.address ?? '' })
        : needs('host');
    case 'chat':
      if (!filled(a.address)) return needs('host');
      return filled(a.text)
        ? line('action_chat', 'plain', { address: a.address ?? '', text: a.text ?? '' })
        : needs('text');
    default:
      return needs('action');
  }
}

/** The second line of a card: never blank (PLT-141). */
export function cardSentence(card: Card, names: Names): Sentence {
  if (card.kind === 'trigger') return triggerSentence(card.trigger);
  if (isPlaceholder(card))
    return line(`placeholder_${card.kind === 'action' ? 'action' : 'condition'}`, 'muted');
  if (card.kind === 'action') return actionSentence(card.action, names);
  return isGroup(card.condition) ? groupSentence(card.condition) : leafSentence(card.condition, names);
}

const PAGE_FREE_STEPS = ['find_pages', 'new_from_template', 'webhook', 'chat'];

/** Whether a step acts on a page, so after Find pages its line starts with "On each page found". */
export function actsOnPage(card: Card): boolean {
  return card.kind === 'action' && !isPlaceholder(card) && !PAGE_FREE_STEPS.includes(card.action.type);
}

/** The words for screen readers of a card's kind: When, If or Then (PLT-135). */
export function kindKey(card: Card): string {
  switch (card.kind) {
    case 'trigger':
      return 'ruleChain.kind.trigger';
    case 'action':
      return 'ruleChain.kind.action';
    default:
      return 'ruleChain.kind.condition';
  }
}

/** The words of a problem, from its code, or the server's own words for a code not known here. */
export function problemKey(code: string | undefined): string {
  return code ? `ruleChain.problem.${code}` : '';
}
