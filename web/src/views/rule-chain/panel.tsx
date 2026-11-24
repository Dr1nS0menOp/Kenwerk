// SPDX-License-Identifier: Apache-2.0
// The panel beside the chain (PLT-143 to PLT-149, PLT-151, PLT-160): the rule's summary and
// details while nothing is selected, the list of types for a placeholder, or one step's settings.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api, type Me } from '../../api';
import { GuideLink } from '../../components/guide-link';
import { IconCopy, IconMoveDown, IconMoveUp, IconSearch, IconTrash } from '../../components/icons';
import { Menu, MenuItem } from '../../components/menu';
import { Notice } from '../../components/notice';
import { personQuery, PersonPicture } from '../../components/person';
import { useToast } from '../../components/toast';
import { Field } from '../../components/ui';
import {
  ACTIONS,
  CONDITION_KINDS,
  ENGINE_TRIGGERS,
  EVENT_TRIGGERS,
  INSTANCE_ONLY_TRIGGERS,
  type Rule,
} from '../rule-definition';
import { focusCard, KindIcon } from './chain';
import {
  copyAt,
  isPlaceholder,
  mayCopy,
  mayMove,
  moveAt,
  placeOf,
  removeAt,
  restoreAt,
  setCard,
  type Card,
  type Chain,
  type PlacedProblems,
} from './chain-model';
import { titleKey, type Names } from './sentences';
import { useProblemWords } from './words';
import { StepForm } from './step-forms';

const ICON_SIZE = 18;
const SUGGESTED_TRIGGERS = ['schedule', 'page.published', 'page.edited'];
const RULES_GUIDE = 'automation';

interface Place {
  spaceId: string | null;
}

export interface PanelProps {
  chain: Chain;
  place: Place;
  saved: Rule | null;
  name: string;
  names: Names;
  problems: PlacedProblems;
  needInput: number;
  fromTemplate: boolean;
  selected: number | null;
  onName: (name: string) => void;
  onChange: (next: SetStateAction<Chain>) => void;
  onSelect: (index: number | null) => void;
  onSay: (words: string) => void;
  onCheck: () => void;
}

export function Panel(props: PanelProps) {
  const { chain, selected } = props;
  const card = selected === null ? undefined : chain.cards[selected];
  const leave = (e: KeyboardEvent<HTMLElement>) => {
    // Escape gives the focus back to the card whose settings these are (point 11).
    if (e.key !== 'Escape' || !card || e.defaultPrevented) return;
    e.preventDefault();
    focusCard(card.key);
  };
  return (
    <aside className="chain-panel" onKeyDown={leave}>
      {card && selected !== null ? (
        <StepPanel key={card.key} {...props} card={card} index={selected} />
      ) : (
        <Summary {...props} />
      )}
    </aside>
  );
}

/** Puts the focus on a panel's heading when it opens (point 11). */
function useFocusHeading() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return heading;
}

function Summary({
  chain,
  saved,
  name,
  needInput,
  fromTemplate,
  problems,
  place,
  onName,
  onSelect,
}: PanelProps) {
  const { t } = useTranslation();
  const words = useProblemWords();
  const nameId = useId();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/me') }).data;
  const ownerId = saved?.owner_id ?? me?.user.id ?? '';
  const owner = useQuery({ ...personQuery(ownerId), enabled: ownerId !== '' }).data;
  const tiles = chain.cards.filter((card) => card.kind === 'trigger' || card.kind === 'action');
  return (
    <div className="chain-summary">
      <div className="summary-tiles" aria-hidden="true">
        {tiles.map((card) => (
          <span key={card.key} className={`step-tile kind-${card.kind}`}>
            <KindIcon card={card} />
          </span>
        ))}
      </div>
      <h2 className="summary-name">{name || t('rules2.newName')}</h2>
      {fromTemplate && <span className="bordered-word">{t('ruleChain.fromTemplate')}</span>}
      {needInput > 0 && <p className="summary-needs">{t('ruleChain.needInput', { count: needInput })}</p>}
      {problems.general.map((p) => (
        <p key={`${p.where ?? ''}-${p.code ?? p.message}`} className="field-error">
          {words(p)}
        </p>
      ))}
      <section className="details-card" aria-labelledby={`${nameId}-details`}>
        <h3 id={`${nameId}-details`}>{t('ruleChain.details')}</h3>
        <p className="muted">{t('ruleChain.requiredNote')}</p>
        <Field label={t('ruleChain.nameRequired')}>
          <input value={name} required aria-required="true" onChange={(e) => onName(e.target.value)} />
        </Field>
        <div className="details-row">
          <span className="details-label">{t('ruleChain.owner')}</span>
          <span className="details-owner">
            {owner && <PersonPicture person={owner} size="small" />}
            <span>{saved?.owner_name ?? me?.user.display_name ?? ''}</span>
          </span>
          <span className="muted">{t('ruleChain.ownerTold')}</span>
        </div>
        <div className="details-row">
          <span className="details-label">{t('ruleChain.livesIn')}</span>
          <span>{place.spaceId ? t('ruleChain.thisSpace') : t('ruleChain.theInstance')}</span>
        </div>
        <p className="muted">{t('ruleChain.triggerHolds')}</p>
        <div className="row">
          <button type="button" onClick={() => onSelect(0)}>
            {t('ruleChain.openTrigger')}
          </button>
          <GuideLink path={RULES_GUIDE}>{t('ruleChain.help')}</GuideLink>
        </div>
      </section>
    </div>
  );
}

function StepPanel(props: PanelProps & { card: Card; index: number }) {
  const { card } = props;
  const [choosing, setChoosing] = useState(isPlaceholder(card));
  if (choosing) return <TypeList {...props} onChosen={() => setChoosing(false)} />;
  return <StepSettings {...props} onBack={() => setChoosing(true)} />;
}

/** A row of a list of types: a tinted tile with the kind's icon, and one label (PLT-146). */
interface TypeRow {
  id: string;
  label: string;
}

function rowsOf(ids: string[], label: (id: string) => string): TypeRow[] {
  return ids.map((id) => ({ id, label: label(id) })).sort((a, b) => a.label.localeCompare(b.label));
}

type TriggerGroup = 'all' | 'engine' | 'kenwerk';

function triggerGroups(spaceId: string | null): { engine: string[]; kenwerk: string[] } {
  const events = spaceId ? EVENT_TRIGGERS.filter((k) => !INSTANCE_ONLY_TRIGGERS.includes(k)) : EVENT_TRIGGERS;
  return { engine: ENGINE_TRIGGERS, kenwerk: [...events, 'manual'] };
}

/** The type a card has: its trigger, condition kind or action type. */
function typeOf(card: Card): string {
  switch (card.kind) {
    case 'trigger':
      return card.trigger.kind;
    case 'action':
      return card.action.type;
    default:
      return card.condition.kind;
  }
}

/** The card a chosen type makes, keeping the values that still apply (point 15). */
function withType(card: Card, id: string): Card {
  switch (card.kind) {
    case 'trigger':
      return { ...card, trigger: { kind: id } };
    case 'action':
      return { ...card, action: { type: id, ...(card.action.text ? { text: card.action.text } : {}) } };
    default:
      if (id === 'any') return { kind: 'group', key: card.key, condition: { kind: 'any', items: [] } };
      return {
        kind: 'condition',
        key: card.key,
        condition: { kind: id, ...(card.condition.value ? { value: card.condition.value } : {}) },
      };
  }
}

function TypeList({
  chain,
  card,
  index,
  place,
  onChange,
  onChosen,
}: PanelProps & { card: Card; index: number; onChosen: () => void }) {
  const { t } = useTranslation();
  const heading = useFocusHeading();
  const headingId = useId();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<TriggerGroup>('all');
  const choose = (id: string) => {
    onChange(setCard(chain, index, withType(card, id)));
    onChosen();
  };
  const found = (rows: TypeRow[]) =>
    rows.filter((row) => row.label.toLowerCase().includes(search.trim().toLowerCase()));
  let sections: { id: string; title?: string; rows: TypeRow[]; counted: boolean }[];
  if (card.kind === 'trigger') {
    const label = (id: string) => t(`ruleChain.title.trigger_${id.replaceAll('.', '_')}`);
    const groups = triggerGroups(place.spaceId);
    const suggested = rowsOf(SUGGESTED_TRIGGERS, label);
    sections = [
      ...(search === '' && group === 'all'
        ? [{ id: 'suggested', title: t('ruleChain.suggested'), rows: suggested, counted: false }]
        : []),
      ...(['engine', 'kenwerk'] as const)
        .filter((id) => group === 'all' || group === id)
        .map((id) => ({
          id,
          title: t(`ruleChain.group_${id}`),
          rows: found(rowsOf(groups[id], label)),
          counted: true,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    ];
  } else if (card.kind === 'action') {
    sections = [
      {
        id: 'actions',
        rows: found(rowsOf(ACTIONS, (id) => t(`ruleChain.title.action_${id}`))),
        counted: false,
      },
    ];
  } else {
    const kinds = [...CONDITION_KINDS, 'any'];
    sections = [
      {
        id: 'conditions',
        rows: found(rowsOf(kinds, (id) => t(`ruleChain.title.condition_${id}`))),
        counted: false,
      },
    ];
  }
  const kindWord = card.kind === 'trigger' ? 'trigger' : card.kind === 'action' ? 'action' : 'condition';
  return (
    <div className="type-list" aria-labelledby={headingId}>
      <div className="type-list-head">
        <h2 id={headingId} ref={heading} tabIndex={-1}>
          {t(`ruleChain.choose_${kindWord}`)}
        </h2>
        <div className="type-list-tools">
          <label className="tool-search">
            <IconSearch size={ICON_SIZE} />
            <span className="visually-hidden">{t(`ruleChain.search_${kindWord}`)}</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {card.kind === 'trigger' && (
            <Menu
              label={t('ruleChain.filterNamed', { group: t(`ruleChain.filter_${group}`) })}
              className="filter-button"
              trigger={<span>{t(`ruleChain.filter_${group}`)}</span>}
            >
              {(['all', 'engine', 'kenwerk'] as const).map((id) => (
                <MenuItem
                  key={id}
                  role="menuitemradio"
                  aria-checked={group === id}
                  onClick={() => setGroup(id)}
                >
                  {t(`ruleChain.filter_${id}`)}
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>
      </div>
      <div className="type-list-rows">
        {sections.map((section) => (
          <section key={section.id} aria-label={section.title}>
            {section.title && (
              <h3 className="type-group">
                {section.title}
                {section.counted && <span className="type-count">{section.rows.length}</span>}
              </h3>
            )}
            <ul className="plain-list">
              {section.rows.map((row) => {
                const current = !isPlaceholder(card) && typeOf(card) === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`type-row kind-${card.kind}${current ? ' current' : ''}`}
                      aria-current={current || undefined}
                      onClick={() => choose(row.id)}
                    >
                      <span className={`step-tile kind-${card.kind}`} aria-hidden="true">
                        <KindIcon card={card} size={ICON_SIZE - 2} />
                      </span>
                      {row.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {sections.every((s) => s.rows.length === 0) && <p className="muted">{t('search.noResults')}</p>}
        <p className="type-help">
          <GuideLink path={RULES_GUIDE}>{t(`ruleChain.help_${kindWord}`)}</GuideLink>
        </p>
      </div>
    </div>
  );
}

function StepSettings({
  chain,
  card,
  index,
  place,
  saved,
  names,
  problems,
  onChange,
  onSelect,
  onSay,
  onCheck,
  onBack,
}: PanelProps & { card: Card; index: number; onBack: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const words = useProblemWords();
  const heading = useFocusHeading();
  const headingId = useId();
  const mine = problems.byCard[index] ?? [];
  const fit = mine.filter((p) => p.kind === 'fit');
  const title = t(titleKey(card));
  const kindWord = card.kind === 'trigger' ? 'trigger' : card.kind === 'action' ? 'action' : 'condition';
  const move = (delta: -1 | 1) => {
    const moved = moveAt(chain, index, delta);
    onChange(moved.chain);
    onSelect(moved.index);
    const { place: at, of } = placeOf(moved.chain, moved.index);
    onSay(t('ruleChain.moved', { title, place: at, of }));
  };
  const remove = () => {
    onChange(removeAt(chain, index));
    onSelect(null);
    // Removing is at once, with Undo for a while (point 16).
    toast({
      message: t('ruleChain.removed', { title }),
      action: {
        label: t('ruleChain.undo'),
        run: () => onChange((current) => restoreAt(current, index, card)),
      },
    });
  };
  const copy = () => {
    const copied = copyAt(chain, index);
    onChange(copied.chain);
    onSelect(copied.index);
    onSay(t('ruleChain.copiedStep', { title }));
  };
  const isTrigger = card.kind === 'trigger';
  return (
    <div className="step-settings" aria-labelledby={headingId}>
      <div className="step-settings-head">
        <span className={`step-tile kind-${card.kind}`} aria-hidden="true">
          <KindIcon card={card} />
        </span>
        <h2 id={headingId} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        {!isTrigger && (
          <span className="step-settings-tools">
            <button
              type="button"
              className="icon"
              aria-label={t('ruleChain.moveUp')}
              title={t('ruleChain.moveUp')}
              disabled={!mayMove(chain, index, -1)}
              onClick={() => move(-1)}
            >
              <IconMoveUp size={ICON_SIZE} />
            </button>
            <button
              type="button"
              className="icon"
              aria-label={t('ruleChain.moveDown')}
              title={t('ruleChain.moveDown')}
              disabled={!mayMove(chain, index, 1)}
              onClick={() => move(1)}
            >
              <IconMoveDown size={ICON_SIZE} />
            </button>
            <button
              type="button"
              className="icon"
              aria-label={t('ruleChain.copyStep')}
              title={t('ruleChain.copyStep')}
              disabled={!mayCopy(chain, index)}
              onClick={copy}
            >
              <IconCopy size={ICON_SIZE} />
            </button>
            <button
              type="button"
              className="icon"
              aria-label={t('ruleChain.removeStep')}
              title={t('ruleChain.removeStep')}
              onClick={remove}
            >
              <IconTrash size={ICON_SIZE} />
            </button>
          </span>
        )}
      </div>
      <p className="muted">
        {t(`ruleChain.about_${kindWord}`)} <GuideLink path={RULES_GUIDE}>{t('ruleChain.help')}</GuideLink>
      </p>
      {fit.map((p) => (
        <Notice key={`${p.where ?? ''}-${p.code ?? ''}`} kind="warning" title={t('ruleChain.mayNotFit')}>
          <p>{words(p)}</p>
          <p>{t(`ruleChain.fitAdvice_${p.code === 'conditions_need_page' ? 'conditions' : 'step'}`)}</p>
        </Notice>
      ))}
      <StepForm
        chain={chain}
        card={card}
        index={index}
        place={place}
        saved={saved}
        names={names}
        problems={mine}
        onChange={onChange}
        onSay={onSay}
      />
      <div className="step-settings-foot">
        <button type="button" className="quiet" onClick={onBack}>
          {t('ruleChain.backToTypes')}
        </button>
        <button
          type="button"
          onClick={() => {
            onCheck();
            onSelect(null);
          }}
        >
          {t('ruleChain.next')}
        </button>
      </div>
    </div>
  );
}
