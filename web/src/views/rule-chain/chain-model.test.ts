// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ACTIONS, CONDITION_KINDS, RULE_TEMPLATES, TRIGGERS, type Definition } from '../rule-definition';
import {
  addAfter,
  canonical,
  copyAt,
  emptyChain,
  kindsAfter,
  mayMove,
  moveAt,
  placeOf,
  placeProblems,
  placeholderCount,
  removeAt,
  restoreAt,
  setCard,
  toChain,
  toDefinition,
} from './chain-model';

const labelled = (label: string) => ({ kind: 'has_label', value: label });

const rule: Definition = {
  trigger: { kind: 'page.published' },
  conditions: { kind: 'all', items: [labelled('a'), labelled('b')] },
  actions: [{ type: 'find_pages' }, { type: 'add_label', label: 'x' }, { type: 'archive' }],
};

describe('a rule as cards and back', () => {
  it('gives the same definition for every template', () => {
    for (const template of RULE_TEMPLATES) {
      expect(toDefinition(toChain(template.definition))).toEqual(template.definition);
    }
  });

  it('gives the same definition for every trigger, condition kind and action type', () => {
    for (const kind of TRIGGERS) {
      const d: Definition = { trigger: { kind }, actions: [{ type: 'archive' }] };
      expect(toDefinition(toChain(d))).toEqual(d);
    }
    const every: Definition = {
      trigger: { kind: 'schedule', every: 'daily', at: '09:00' },
      conditions: { kind: 'all', items: CONDITION_KINDS.map((kind) => ({ kind, value: 'v', days: 2 })) },
      actions: ACTIONS.map((type) => ({ type, text: 't', label: 'l', to: 'owner' })),
      spaces: ['s1', 's2'],
    };
    expect(toDefinition(toChain(every))).toEqual(every);
  });

  it('keeps a tree another client saved: a single leaf, an any group and a nested group', () => {
    const shapes: Definition[] = [
      { trigger: { kind: 'manual' }, conditions: labelled('a'), actions: [] },
      {
        trigger: { kind: 'manual' },
        conditions: { kind: 'any', items: [labelled('a'), labelled('b')] },
        actions: [],
      },
      {
        trigger: { kind: 'manual' },
        conditions: {
          kind: 'all',
          items: [labelled('a'), { kind: 'not', items: [{ kind: 'any', items: [labelled('b')] }] }],
        },
        actions: [],
      },
      { trigger: { kind: 'manual' }, conditions: { kind: 'all', items: [] }, actions: [] },
    ];
    for (const d of shapes) expect(toDefinition(toChain(d))).toEqual(d);
  });

  it('makes one card per item of an all group, and one group card of any other tree', () => {
    expect(toChain(rule).cards.map((c) => c.kind)).toEqual([
      'trigger',
      'condition',
      'condition',
      'action',
      'action',
      'action',
    ]);
    const anyTree = toChain({ ...rule, conditions: { kind: 'any', items: [labelled('a'), labelled('b')] } });
    expect(anyTree.cards.map((c) => c.kind)).toEqual(['trigger', 'group', 'action', 'action', 'action']);
  });

  it('leaves placeholders out of the definition', () => {
    const { chain } = addAfter(toChain(rule), 4, 'action');
    expect(placeholderCount(chain)).toBe(1);
    expect(toDefinition(chain)).toEqual(rule);
  });
});

describe('a new rule', () => {
  it('starts with the trigger placeholder alone, and offers nothing after it', () => {
    const chain = emptyChain();
    expect(chain.cards).toHaveLength(1);
    expect(placeholderCount(chain)).toBe(1);
    expect(kindsAfter(chain, 0)).toEqual([]);
  });
});

describe('adding a step', () => {
  it('offers a condition and an action after the trigger and the last condition', () => {
    const chain = toChain(rule);
    expect(kindsAfter(chain, 0)).toEqual(['condition']);
    expect(kindsAfter(chain, 2)).toEqual(['condition', 'action']);
    expect(kindsAfter(toChain({ ...rule, conditions: undefined }), 0)).toEqual(['condition', 'action']);
  });

  it('offers only an action after an action, until conditions after actions exist (E1)', () => {
    expect(kindsAfter(toChain(rule), 3)).toEqual(['action']);
  });

  it('puts the placeholder right after the step, and nothing can follow it', () => {
    const { chain, index } = addAfter(toChain(rule), 1, 'condition');
    expect(index).toBe(2);
    expect(chain.cards[2]?.kind).toBe('condition');
    expect(kindsAfter(chain, 2)).toEqual([]);
    expect(addAfter(chain, 2, 'action').chain).toBe(chain);
  });

  it('refuses a kind that may not go there', () => {
    const chain = toChain(rule);
    expect(addAfter(chain, 3, 'condition').chain).toBe(chain);
  });

  it('gives every new card a key of its own', () => {
    let { chain } = addAfter(toChain(rule), 3, 'action');
    ({ chain } = addAfter(
      setCard(chain, 4, { kind: 'action', key: chain.cards[4]?.key ?? '', action: { type: 'archive' } }),
      4,
      'action',
    ));
    const keys = chain.cards.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('removing and copying', () => {
  it('never removes the trigger', () => {
    const chain = toChain(rule);
    expect(removeAt(chain, 0)).toBe(chain);
  });

  it('removes a step, and Undo puts it back in its place', () => {
    const chain = toChain(rule);
    const card = chain.cards[4];
    const removed = removeAt(chain, 4);
    expect(toDefinition(removed).actions).toEqual([{ type: 'find_pages' }, { type: 'archive' }]);
    expect(card && toDefinition(restoreAt(removed, 4, card))).toEqual(rule);
  });

  it('puts a copy right after the step, with the same settings', () => {
    const { chain, index } = copyAt(toChain(rule), 4);
    expect(index).toBe(5);
    expect(toDefinition(chain).actions.map((a) => a.type)).toEqual([
      'find_pages',
      'add_label',
      'add_label',
      'archive',
    ]);
    expect(chain.cards[5]?.key).not.toBe(chain.cards[4]?.key);
  });

  it('copies neither the trigger nor a placeholder', () => {
    const chain = toChain(rule);
    expect(copyAt(chain, 0).chain).toBe(chain);
    const withPlaceholder = addAfter(chain, 5, 'action').chain;
    expect(copyAt(withPlaceholder, 6).chain).toBe(withPlaceholder);
  });
});

describe('moving a step', () => {
  it('cannot move the first condition up, or the last action down', () => {
    const chain = toChain(rule);
    expect(mayMove(chain, 1, -1)).toBe(false);
    expect(mayMove(chain, 5, 1)).toBe(false);
    expect(mayMove(chain, 0, 1)).toBe(false);
  });

  it('keeps a condition among the conditions and an action among the actions', () => {
    const chain = toChain(rule);
    expect(mayMove(chain, 2, 1)).toBe(false);
    expect(mayMove(chain, 3, -1)).toBe(false);
    expect(moveAt(chain, 2, 1).chain).toBe(chain);
  });

  it('moves a step one place and says where it went', () => {
    const { chain, index } = moveAt(toChain(rule), 4, 1);
    expect(index).toBe(5);
    expect(toDefinition(chain).actions.map((a) => a.type)).toEqual(['find_pages', 'archive', 'add_label']);
    expect(placeOf(chain, 5)).toEqual({ place: 3, of: 3 });
    const swapped = moveAt(toChain(rule), 2, -1).chain;
    expect(toDefinition(swapped).conditions).toEqual({ kind: 'all', items: [labelled('b'), labelled('a')] });
  });
});

describe('where a problem shows', () => {
  it('puts each problem on its card, counting saved cards only', () => {
    const { chain } = addAfter(toChain(rule), 1, 'condition');
    const placed = placeProblems(chain, [
      { step: -1, message: 'm', where: 'trigger' },
      { step: -2, message: 'm', where: 'condition/1' },
      { step: 1, message: 'm', where: 'step/1' },
      { step: 0, message: 'm', where: 'steps' },
    ]);
    expect(placed.byCard.map((list) => list.length)).toEqual([1, 0, 0, 1, 0, 1, 0]);
    expect(placed.general).toHaveLength(1);
  });

  it('puts a problem of all the conditions on every condition card', () => {
    const placed = placeProblems(toChain(rule), [
      { step: -2, message: 'm', where: 'conditions', kind: 'fit' },
    ]);
    expect(placed.byCard.map((list) => list.length)).toEqual([0, 1, 1, 0, 0, 0]);
  });

  it('keeps a problem without a place for the summary', () => {
    const placed = placeProblems(toChain(rule), [{ step: 0, message: 'm' }]);
    expect(placed.general).toHaveLength(1);
  });
});

describe('the canonical form of a definition', () => {
  it('is the same for the server order and the order the cards make', () => {
    const stored = {
      trigger: { kind: 'page.published' },
      conditions: labelled('a'),
      actions: [{ type: 'add_label', label: 'x' }],
    };
    const made: Definition = {
      trigger: { kind: 'page.published', every: '' },
      actions: [{ label: 'x', type: 'add_label', text: '', older_days: 0 }],
      conditions: { value: 'a', kind: 'has_label', items: [] },
    };
    expect(canonical(made)).toBe(canonical(stored));
  });

  it('differs when a value changes, and keeps an empty list of actions', () => {
    expect(canonical(rule)).not.toBe(canonical({ ...rule, actions: [{ type: 'archive' }] }));
    expect(canonical({ trigger: { kind: 'manual' }, actions: [] })).toContain('"actions":[]');
  });
});
