// SPDX-License-Identifier: Apache-2.0
// A rule as a chain of cards (spec 091), apart from how it looks: a definition becomes cards
// and back, and steps are added, copied, removed and moved. Pure, so every rule is tested.
//
// Today's model holds the trigger, then the conditions, then the actions (E1): a condition
// never follows an action, so conditions move among conditions and actions among actions.
import type { Condition, Definition, Problem, RuleAction, Trigger } from '../rule-definition';

export type Card =
  | { kind: 'trigger'; key: string; trigger: Trigger }
  | { kind: 'condition'; key: string; condition: Condition }
  | { kind: 'group'; key: string; condition: Condition }
  | { kind: 'action'; key: string; action: RuleAction };

export type CardKind = Card['kind'];

/** What a step added after another can be. A group is made from a condition's settings. */
export type AddKind = 'condition' | 'action';

export interface Chain {
  cards: Card[];
  /**
   * How the conditions are stored: as an all group of the cards, or as the one tree a card
   * holds, as another client may have saved it. Kept, so cards and back give the same rule.
   */
  conditionRoot: 'all' | 'single';
  spaces?: string[];
  /** The number of the next card made, so every card keeps its key while the chain changes. */
  nextKey: number;
}

const GROUP_KINDS = ['all', 'any', 'not'];

export function isGroup(condition: Condition): boolean {
  return GROUP_KINDS.includes(condition.kind);
}

/** A card whose type is not chosen yet. It is never saved (point 32). */
export function isPlaceholder(card: Card): boolean {
  switch (card.kind) {
    case 'trigger':
      return card.trigger.kind === '';
    case 'action':
      return card.action.type === '';
    default:
      return card.condition.kind === '';
  }
}

function conditionCard(condition: Condition, key: string): Card {
  return isGroup(condition) ? { kind: 'group', key, condition } : { kind: 'condition', key, condition };
}

/** The cards of a definition: the trigger, each condition, each action, in that order. */
export function toChain(definition: Definition): Chain {
  const conditions = definition.conditions;
  let conditionCards: Condition[] = [];
  let conditionRoot: Chain['conditionRoot'] = 'all';
  if (conditions && conditions.kind === 'all' && (conditions.items ?? []).length > 0) {
    conditionCards = conditions.items ?? [];
  } else if (conditions) {
    conditionCards = [conditions];
    conditionRoot = 'single';
  }
  let next = 0;
  const key = () => `card-${next++}`;
  const cards: Card[] = [
    { kind: 'trigger', key: key(), trigger: definition.trigger },
    ...conditionCards.map((c) => conditionCard(c, key())),
    ...definition.actions.map((action): Card => ({ kind: 'action', key: key(), action })),
  ];
  return { cards, conditionRoot, spaces: definition.spaces, nextKey: next };
}

/** A new rule: only the trigger's placeholder, which the screen selects (PLT-136). */
export function emptyChain(): Chain {
  return {
    cards: [{ kind: 'trigger', key: 'card-0', trigger: { kind: '' } }],
    conditionRoot: 'all',
    nextKey: 1,
  };
}

function savedConditions(chain: Chain): Condition[] {
  return chain.cards.flatMap((card) =>
    (card.kind === 'condition' || card.kind === 'group') && !isPlaceholder(card) ? [card.condition] : [],
  );
}

function savedActions(chain: Chain): RuleAction[] {
  return chain.cards.flatMap((card) => (card.kind === 'action' && !isPlaceholder(card) ? [card.action] : []));
}

function triggerOf(chain: Chain): Trigger {
  const first = chain.cards[0];
  return first?.kind === 'trigger' ? first.trigger : { kind: '' };
}

/** The definition the cards stand for, without placeholders. */
export function toDefinition(chain: Chain): Definition {
  const conditions = savedConditions(chain);
  const definition: Definition = { trigger: triggerOf(chain), actions: savedActions(chain) };
  const [only] = conditions;
  if (only && conditions.length === 1 && chain.conditionRoot === 'single') {
    definition.conditions = only;
  } else if (conditions.length > 0) {
    definition.conditions = { kind: 'all', items: conditions };
  }
  if (chain.spaces !== undefined) definition.spaces = chain.spaces;
  return definition;
}

/** Whether a stored value is one the server leaves out of what it stores (Go's omitempty). */
function leftOut(key: string, value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === 0 || value === false) return true;
  // The list of actions is always stored, even empty; every other empty list is left out.
  return Array.isArray(value) && value.length === 0 && key !== 'actions';
}

function cleaned(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleaned);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const inner = cleaned((value as Record<string, unknown>)[key]);
    if (!leftOut(key, inner)) out[key] = inner;
  }
  return out;
}

/**
 * A definition as the server stores it, as text: keys in order and empty values left out. Two
 * definitions that mean the same give the same text, so "Changes not saved" is only said of a change.
 */
export function canonical(definition: Definition): string {
  return JSON.stringify(cleaned(definition));
}

/** How many steps still need a type chosen. */
export function placeholderCount(chain: Chain): number {
  return chain.cards.filter(isPlaceholder).length;
}

function firstActionIndex(chain: Chain): number {
  const i = chain.cards.findIndex((card) => card.kind === 'action');
  return i < 0 ? chain.cards.length : i;
}

/**
 * The kinds a step added right after this card may be. Nothing follows a placeholder; an action
 * may follow the trigger or a condition only where the actions start.
 */
export function kindsAfter(chain: Chain, index: number): AddKind[] {
  const card = chain.cards[index];
  if (!card || isPlaceholder(card)) return [];
  if (card.kind === 'action') return ['action'];
  return index === firstActionIndex(chain) - 1 ? ['condition', 'action'] : ['condition'];
}

function withKey(chain: Chain, make: (key: string) => Card): { chain: Chain; card: Card } {
  const card = make(`card-${chain.nextKey}`);
  return { chain: { ...chain, nextKey: chain.nextKey + 1 }, card };
}

function insertAt(chain: Chain, index: number, card: Card): Chain {
  const cards = [...chain.cards];
  cards.splice(index, 0, card);
  return { ...chain, cards };
}

/** Puts a placeholder of a kind right after a card. Returns the chain unchanged if it may not go there. */
export function addAfter(chain: Chain, index: number, kind: AddKind): { chain: Chain; index: number } {
  if (!kindsAfter(chain, index).includes(kind)) return { chain, index };
  const made = withKey(chain, (key) =>
    kind === 'action'
      ? { kind: 'action', key, action: { type: '' } }
      : { kind: 'condition', key, condition: { kind: '' } },
  );
  return { chain: insertAt(made.chain, index + 1, made.card), index: index + 1 };
}

/** Replaces the card at an index, keeping its key. */
export function setCard(chain: Chain, index: number, card: Card): Chain {
  return { ...chain, cards: chain.cards.map((c, i) => (i === index ? card : c)) };
}

/** Takes a step away. The trigger cannot be removed: it is changed instead. */
export function removeAt(chain: Chain, index: number): Chain {
  const card = chain.cards[index];
  if (!card || card.kind === 'trigger') return chain;
  return { ...chain, cards: chain.cards.filter((_, i) => i !== index) };
}

/** Puts a removed card back where it was, for Undo. */
export function restoreAt(chain: Chain, index: number, card: Card): Chain {
  return insertAt(chain, Math.min(index, chain.cards.length), card);
}

/** Whether a step can be copied: not the trigger, and not a placeholder. */
export function mayCopy(chain: Chain, index: number): boolean {
  const card = chain.cards[index];
  return card !== undefined && card.kind !== 'trigger' && !isPlaceholder(card);
}

/** Puts a copy with the same settings right after a step. */
export function copyAt(chain: Chain, index: number): { chain: Chain; index: number } {
  const card = chain.cards[index];
  if (!card || !mayCopy(chain, index)) return { chain, index };
  const made = withKey(chain, (key) => structuredClone({ ...card, key }));
  return { chain: insertAt(made.chain, index + 1, made.card), index: index + 1 };
}

function family(card: Card): 'trigger' | 'condition' | 'action' {
  return card.kind === 'group' ? 'condition' : card.kind;
}

/** Whether a step can move one place up (-1) or down (+1): among the steps of its own kind. */
export function mayMove(chain: Chain, index: number, delta: -1 | 1): boolean {
  const card = chain.cards[index];
  const other = chain.cards[index + delta];
  return (
    card !== undefined && other !== undefined && card.kind !== 'trigger' && family(card) === family(other)
  );
}

/** Moves a step one place, or leaves the chain as it is when it cannot move there. */
export function moveAt(chain: Chain, index: number, delta: -1 | 1): { chain: Chain; index: number } {
  if (!mayMove(chain, index, delta)) return { chain, index };
  const cards = [...chain.cards];
  const [card] = cards.splice(index, 1);
  if (card) cards.splice(index + delta, 0, card);
  return { chain: { ...chain, cards }, index: index + delta };
}

/** The place of a step among the steps of its kind, from 1, and how many there are. */
export function placeOf(chain: Chain, index: number): { place: number; of: number } {
  const card = chain.cards[index];
  if (!card) return { place: 0, of: 0 };
  const same = chain.cards.flatMap((c, i) => (family(c) === family(card) ? [i] : []));
  return { place: same.indexOf(index) + 1, of: same.length };
}

/** Whether a page step after this card acts on the pages a Find pages step found. */
export function afterFind(chain: Chain, index: number): boolean {
  return chain.cards.slice(0, index).some((c) => c.kind === 'action' && c.action.type === 'find_pages');
}

/** Problems on each card, and those of the rule as a whole, from the server's `where`. */
export interface PlacedProblems {
  byCard: Problem[][];
  general: Problem[];
}

/**
 * Puts each problem on its card. A condition or step number counts saved cards only, because
 * the check saw the definition without placeholders.
 */
export function placeProblems(chain: Chain, problems: Problem[]): PlacedProblems {
  const byCard: Problem[][] = chain.cards.map(() => []);
  const general: Problem[] = [];
  const saved = (kind: 'condition' | 'action') =>
    chain.cards.flatMap((card, i) => (family(card) === kind && !isPlaceholder(card) ? [i] : []));
  const conditionCards = saved('condition');
  const actionCards = saved('action');
  for (const problem of problems) {
    const [where, number] = (problem.where ?? '').split('/');
    const at = Number(number);
    const targets =
      where === 'trigger'
        ? [0]
        : where === 'conditions'
          ? conditionCards
          : where === 'condition'
            ? [conditionCards[at]]
            : where === 'step'
              ? [actionCards[at]]
              : [];
    const found = targets.filter((i): i is number => i !== undefined);
    if (found.length === 0) general.push(problem);
    for (const i of found) byCard[i]?.push(problem);
  }
  return { byCard, general };
}
