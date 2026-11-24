// SPDX-License-Identifier: Apache-2.0
// The canvas of a rule (PLT-134 to PLT-142): the steps as an ordered list of cards joined by
// lines, an add button after each, and the zoom. Moving never needs dragging (WCAG 2.5.7).
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconAction,
  IconAutomation,
  IconCondition,
  IconPanelWarning,
  IconPlus,
} from '../../components/icons';
import { Menu, MenuItem } from '../../components/menu';
import { ZoomControl, type Zoom } from '../../components/zoom-control';
import type { Problem } from '../rule-definition';
import {
  addAfter,
  afterFind,
  isPlaceholder,
  kindsAfter,
  moveAt,
  placeOf,
  type AddKind,
  type Card,
  type Chain,
} from './chain-model';
import { actsOnPage, cardSentence, kindKey, titleKey, type Names } from './sentences';
import { useSentence } from './words';

const TILE_ICON_SIZE = 18;
const SMALL_ICON_SIZE = 14;

/** The icon of a card's kind (PLT-135). */
export function KindIcon({ card, size = TILE_ICON_SIZE }: { card: Card; size?: number }) {
  switch (card.kind) {
    case 'trigger':
      return <IconAutomation size={size} />;
    case 'action':
      return <IconAction size={size} />;
    default:
      return <IconCondition size={size} />;
  }
}

/** Moves the focus to a card by its key, after a move or when its settings close. */
export function focusCard(key: string) {
  document.querySelector<HTMLElement>(`[data-card="${key}"]`)?.focus();
}

function StepCard({
  card,
  index,
  chain,
  names,
  problems,
  selected,
  onSelect,
  onMove,
}: {
  card: Card;
  index: number;
  chain: Chain;
  names: Names;
  problems: Problem[];
  selected: boolean;
  onSelect: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const sentence = useSentence(cardSentence(card, names));
  const title = t(titleKey(card));
  const lead = afterFind(chain, index) && actsOnPage(card) ? t('ruleChain.onEachFound') : '';
  // A placeholder is one step that needs input, whatever the check says of it.
  const count = isPlaceholder(card) ? 1 : problems.length;
  const keys = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    onMove(e.key === 'ArrowUp' ? -1 : 1);
  };
  // The name screen readers hear is the card's own words, with its kind before them and its
  // problems after them in words (PLT-135); the visible count is hidden from them (WCAG 2.5.3).
  return (
    <button
      type="button"
      data-card={card.key}
      className={`step-card kind-${card.kind}${selected ? ' selected' : ''}${count > 0 ? ' needs' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={keys}
    >
      <span className="step-tile" aria-hidden="true">
        <KindIcon card={card} />
      </span>
      <span className="step-words">
        <span className="step-title">
          {/* One inline run, so the name reads "When: Page published." without a gap a flex item adds. */}
          <span>
            <span className="visually-hidden">{`${t(kindKey(card))}: `}</span>
            {title}
            <span className="visually-hidden">{'. '}</span>
          </span>
          {count > 0 && (
            <span className="step-warning" aria-hidden="true">
              <IconPanelWarning size={SMALL_ICON_SIZE} />
              {count}
            </span>
          )}
        </span>
        {lead && <span className="step-lead">{lead} </span>}
        <span className={`step-line tone-${sentence.tone}`}>{sentence.text}</span>
        {count > 0 && <span className="visually-hidden">{`. ${t('ruleChain.problems', { count })}`}</span>}
      </span>
    </button>
  );
}

function AddStep({ chain, index, onAdd }: { chain: Chain; index: number; onAdd: (kind: AddKind) => void }) {
  const { t } = useTranslation();
  const whyId = useId();
  const kinds = kindsAfter(chain, index);
  if (kinds.length === 0) {
    return (
      <span className="chain-add">
        <span id={whyId} hidden>
          {t('ruleChain.chooseTypeFirst')}
        </span>
        <button
          type="button"
          className="add-step"
          aria-disabled="true"
          aria-label={t('ruleChain.addStep')}
          aria-describedby={whyId}
          title={t('ruleChain.chooseTypeFirst')}
        >
          <IconPlus size={SMALL_ICON_SIZE} />
        </button>
      </span>
    );
  }
  return (
    <span className="chain-add">
      <Menu
        label={t('ruleChain.addStepAfter', { place: index + 1 })}
        className="add-step"
        align="start"
        floating
        trigger={<IconPlus size={SMALL_ICON_SIZE} />}
      >
        {kinds.map((kind) => (
          <MenuItem key={kind} onClick={() => onAdd(kind)}>
            {t(`ruleChain.add_${kind}`)}
          </MenuItem>
        ))}
      </Menu>
    </span>
  );
}

export function Canvas({
  chain,
  names,
  problems,
  selected,
  zoom,
  onZoom,
  onChange,
  onSelect,
  onSay,
}: {
  chain: Chain;
  names: Names;
  problems: Problem[][];
  selected: number | null;
  zoom: Zoom;
  onZoom: (zoom: Zoom) => void;
  onChange: (chain: Chain) => void;
  onSelect: (index: number | null) => void;
  onSay: (words: string) => void;
}) {
  const { t } = useTranslation();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => {
    if (focusKey === null) return;
    focusCard(focusKey);
    setFocusKey(null);
  }, [focusKey]);

  const move = (index: number, delta: -1 | 1) => {
    const card = chain.cards[index];
    const moved = moveAt(chain, index, delta);
    if (!card || moved.chain === chain) {
      onSay(t('ruleChain.cannotMove'));
      return;
    }
    onChange(moved.chain);
    if (selected === index) onSelect(moved.index);
    const { place, of } = placeOf(moved.chain, moved.index);
    onSay(t('ruleChain.moved', { title: t(titleKey(card)), place, of }));
    setFocusKey(card.key);
  };
  const add = (index: number, kind: AddKind) => {
    const added = addAfter(chain, index, kind);
    onChange(added.chain);
    onSelect(added.index);
    onSay(t(`ruleChain.added_${kind}`));
  };
  return (
    <div className="chain-canvas">
      <div className={`chain-zoom zoom-${zoom}`}>
        <ol className="chain" aria-label={t('ruleChain.steps')}>
          {chain.cards.map((card, i) => (
            <li key={card.key} className="chain-step">
              <StepCard
                card={card}
                index={i}
                chain={chain}
                names={names}
                problems={problems[i] ?? []}
                selected={selected === i}
                onSelect={() => onSelect(i)}
                onMove={(delta) => move(i, delta)}
              />
              <AddStep chain={chain} index={i} onAdd={(kind) => add(i, kind)} />
            </li>
          ))}
        </ol>
      </div>
      <div className="chain-zoom-bar">
        <ZoomControl zoom={zoom} onChange={onZoom} />
      </div>
    </div>
  );
}
