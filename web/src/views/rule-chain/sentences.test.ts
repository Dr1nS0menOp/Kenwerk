// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import { ACTIONS, CONDITION_KINDS, TRIGGERS, type Condition, type RuleAction } from '../rule-definition';
import type { Card } from './chain-model';
import { actsOnPage, cardSentence, kindKey, problemKey, titleKey, type Sentence } from './sentences';

/** The words under a key, with the plural forms i18next picks from a count. */
function words(key: string, count?: number): string | undefined {
  const find = (k: string) =>
    k
      .split('.')
      .reduce<unknown>(
        (o, p) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[p] : undefined),
        en,
      );
  const plain = find(key);
  if (typeof plain === 'string') return plain;
  const plural = find(`${key}_${count === 1 ? 'one' : 'other'}`);
  return typeof plural === 'string' ? plural : undefined;
}

/** Checks that a sentence exists, is not blank, and names exactly the values it is given. */
function expectWhole(sentence: Sentence) {
  const count = typeof sentence.values.count === 'number' ? sentence.values.count : undefined;
  const text = words(sentence.key, count);
  expect(text, sentence.key).toBeTruthy();
  expect(text?.trim(), sentence.key).not.toBe('');
  const named = new Set([...(text ?? '').matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
  for (const name of Object.keys(sentence.values)) {
    if (name !== 'count') expect(named.has(name), `${sentence.key} names ${name}`).toBe(true);
  }
  for (const name of named)
    expect((name ?? '') in sentence.values, `${sentence.key} gets ${name ?? ''}`).toBe(true);
  for (const value of Object.values(sentence.values)) {
    if (typeof value === 'object') expect(words(value.key), value.key).toBeTruthy();
  }
}

const trigger = (kind: string, more: Partial<{ every: string; at: string }> = {}): Card => ({
  kind: 'trigger',
  key: 'k',
  trigger: { kind, ...more },
});
const condition = (c: Condition): Card => ({ kind: 'condition', key: 'k', condition: c });
const action = (a: RuleAction): Card => ({ kind: 'action', key: 'k', action: a });
const ID = '0190a0a0-0000-7000-8000-000000000001';

const filledActions: RuleAction[] = ACTIONS.map((type) => ({
  type,
  text: 'Hello',
  label: 'x',
  to: 'group',
  target_id: ID,
  parent_id: ID,
  title: 'T',
  older_days: 3,
  address: 'https://example.com/x',
  restricted: 'view',
}));

describe('the title of every card', () => {
  it('exists for every trigger, condition kind and action type', () => {
    for (const kind of TRIGGERS) expect(words(titleKey(trigger(kind))), kind).toBeTruthy();
    for (const kind of [...CONDITION_KINDS, 'any', 'all', 'not']) {
      expect(words(titleKey(condition({ kind }))), kind).toBeTruthy();
    }
    for (const type of ACTIONS) expect(words(titleKey(action({ type }))), type).toBeTruthy();
    for (const card of [trigger(''), condition({ kind: '' }), action({ type: '' })]) {
      expect(words(titleKey(card))).toBeTruthy();
    }
  });

  it('has its kind in words for screen readers', () => {
    for (const card of [trigger('manual'), condition({ kind: 'has_label' }), action({ type: 'archive' })]) {
      expect(words(kindKey(card))).toBeTruthy();
    }
  });
});

describe('the second line of every card', () => {
  it('is a whole sentence for every trigger, filled and not', () => {
    for (const kind of TRIGGERS)
      expectWhole(cardSentence(trigger(kind, { every: 'daily', at: '09:00' }), {}));
    for (const every of ['hourly', 'daily', 'weekly', 'monthly']) {
      expectWhole(cardSentence(trigger('schedule', { every, at: '09:00' }), {}));
    }
    expectWhole(cardSentence(trigger('schedule'), {}));
    expectWhole(cardSentence(trigger('schedule', { every: 'daily' }), {}));
    expectWhole(cardSentence(trigger(''), {}));
  });

  it('is a whole sentence for every condition kind, filled and empty', () => {
    for (const kind of CONDITION_KINDS) {
      const filled = cardSentence(condition({ kind, value: ID, days: 3 }), { [ID]: 'Plan' });
      expectWhole(filled);
      expect(filled.tone).toBe('muted');
      const empty = cardSentence(condition({ kind }), {});
      expectWhole(empty);
      expect(empty.tone).toBe('needs');
    }
    for (const kind of ['all', 'any', 'not']) {
      expectWhole(
        cardSentence(
          { kind: 'group', key: 'k', condition: { kind, items: [{ kind: 'has_label', value: 'a' }] } },
          {},
        ),
      );
      expectWhole(cardSentence({ kind: 'group', key: 'k', condition: { kind, items: [] } }, {}));
    }
  });

  it('is a whole sentence for every action type, filled and empty', () => {
    for (const a of filledActions) {
      const filled = cardSentence(action(a), { [ID]: 'Editors' });
      expectWhole(filled);
      expect(filled.tone, a.type).not.toBe('needs');
      expectWhole(cardSentence(action({ type: a.type }), {}));
    }
    for (const to of ['owner', 'author', 'user'])
      expectWhole(cardSentence(action({ type: 'notify', to, target_id: ID, text: 'x' }), {}));
    expectWhole(cardSentence(action({ type: 'move', space_id: ID }), {}));
    expectWhole(cardSentence(action({ type: 'restrict', restricted: 'edit', target_id: ID }), {}));
    expectWhole(cardSentence(action({ type: 'find_pages', label: 'x' }), {}));
    expectWhole(cardSentence(action({ type: 'find_pages', older_days: 1 }), {}));
    expectWhole(cardSentence(action({ type: '' }), {}));
  });

  it('says what is missing for a step not fully set up', () => {
    expect(cardSentence(action({ type: 'add_label' }), {}).key).toBe('ruleChain.line.needs_label');
    expect(cardSentence(action({ type: 'notify', to: 'owner' }), {}).key).toBe('ruleChain.line.needs_text');
    expect(cardSentence(action({ type: 'notify', text: 'x' }), {}).key).toBe(
      'ruleChain.line.needs_recipient',
    );
  });
});

describe('what a card may name', () => {
  it('never shows an id, and says so when the viewer may not see what it names', () => {
    const below = cardSentence(condition({ kind: 'below_page', value: ID }), {});
    expect(below.values.name).toEqual({ key: 'ruleChain.unseen.page' });
    expect(JSON.stringify(below)).not.toContain(ID);
    const moved = cardSentence(action({ type: 'move', parent_id: ID }), {});
    expect(moved.values.name).toEqual({ key: 'ruleChain.unseen.page' });
  });

  it('names what the viewer may see, from the check', () => {
    expect(cardSentence(condition({ kind: 'below_page', value: ID }), { [ID]: 'Plan' }).values.name).toBe(
      'Plan',
    );
  });
});

describe('a page step after Find pages', () => {
  it('acts on each page found; a step without a page does not', () => {
    expect(actsOnPage(action({ type: 'add_label', label: 'x' }))).toBe(true);
    expect(actsOnPage(action({ type: 'webhook' }))).toBe(false);
    expect(actsOnPage(action({ type: 'find_pages' }))).toBe(false);
    expect(words('ruleChain.onEachFound')).toBeTruthy();
  });
});

describe('the words of a problem', () => {
  it('exist for every code the server gives', () => {
    const codes = [
      'choose_trigger',
      'choose_every',
      'give_time',
      'too_deep',
      'group_empty',
      'not_takes_one',
      'give_days',
      'choose_subject',
      'needs_value',
      'not_a_condition',
      'conditions_need_page',
      'no_actions',
      'too_many_steps',
      'needs_page',
      'text_too_long',
      'choose_recipient',
      'choose_place',
      'choose_template',
      'needs_title',
      'choose_restriction',
      'choose_group',
      'give_label',
      'give_status',
      'choose_owner',
      'write_text',
      'choose_host',
      'not_an_action',
      'group_gone',
    ];
    for (const code of codes) expect(words(problemKey(code)), code).toBeTruthy();
  });
});
