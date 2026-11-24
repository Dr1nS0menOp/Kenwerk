// SPDX-License-Identifier: Apache-2.0
// The settings of each type of step (point 22): labels above their fields, what is missing beside
// its field, as the server's check said (PLT-149). The fields are those the rule model holds.
import { useId, useRef, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api, type Space, type TemplateSummary } from '../../api';
import { IconClose, IconPlus } from '../../components/icons';
import { Menu, MenuItem } from '../../components/menu';
import { PagePicker, SubjectPicker } from '../../components/picker';
import { Field } from '../../components/ui';
import {
  FOUND_VALUES,
  RULE_VALUES,
  SCHEDULES,
  TRIGGER_VALUES,
  triggerBringsPage,
  type Condition,
  type Definition,
  type Problem,
  type Rule,
  type RuleAction,
  type Trigger,
} from '../rule-definition';
import { HookAddress, ScopePart } from '../rules';
import { afterFind, isGroup, setCard, toDefinition, type Card, type Chain } from './chain-model';
import { cardSentence, type Names } from './sentences';
import { useProblemWords, useSentence } from './words';

/** Which field a problem belongs to, so its words sit beside that field (PLT-149). */
const FIELD_OF_CODE: Record<string, string> = {
  choose_every: 'every',
  give_time: 'at',
  needs_value: 'value',
  choose_subject: 'value',
  give_days: 'days',
  give_label: 'label',
  give_status: 'text',
  write_text: 'text',
  text_too_long: 'text',
  choose_recipient: 'to',
  choose_host: 'address',
  host_not_allowed: 'address',
  choose_place: 'place',
  choose_template: 'template',
  needs_title: 'title',
  choose_restriction: 'restricted',
  choose_group: 'group',
  group_gone: 'group',
  choose_owner: 'owner',
};

interface FormProps {
  chain: Chain;
  card: Card;
  index: number;
  place: { spaceId: string | null };
  saved: Rule | null;
  names: Names;
  problems: Problem[];
  onChange: (next: SetStateAction<Chain>) => void;
  onSay: (words: string) => void;
}

function useFieldError(problems: Problem[]) {
  const words = useProblemWords();
  return (field: string) => {
    const found = problems.find((p) => p.kind !== 'fit' && p.code && FIELD_OF_CODE[p.code] === field);
    return found ? words(found) : undefined;
  };
}

/** The problems of a step that belong to no field, shown above its form. */
function OtherProblems({ problems }: { problems: Problem[] }) {
  const words = useProblemWords();
  const rest = problems.filter((p) => p.kind !== 'fit' && !(p.code && FIELD_OF_CODE[p.code]));
  return (
    <>
      {rest.map((p) => (
        <p key={`${p.where ?? ''}-${p.code ?? p.message}`} className="field-error">
          {words(p)}
        </p>
      ))}
    </>
  );
}

/** The label of a required field: its name, an asterisk, and "required" in words (PLT-149). */
function useRequired() {
  const { t } = useTranslation();
  return (label: string) => t('ruleChain.required', { label });
}

/** A value from the rule's run, put into a text at the cursor (PLT-152, E6). */
function ValuePicker({
  values,
  fieldName,
  field,
  onPut,
  onSay,
}: {
  values: string[];
  fieldName: string;
  field: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onPut: (text: string) => void;
  onSay: (words: string) => void;
}) {
  const { t } = useTranslation();
  const put = (value: string) => {
    const box = field.current;
    const text = box?.value ?? '';
    const start = box?.selectionStart ?? text.length;
    const end = box?.selectionEnd ?? text.length;
    onPut(text.slice(0, start) + value + text.slice(end));
    onSay(
      t('ruleChain.valuePut', {
        value: t(`ruleChain.value.${value.slice(1, -1).replace('.', '_')}`),
        field: fieldName,
      }),
    );
    // The focus goes back to the field, with the cursor after the value.
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + value.length, start + value.length);
    });
  };
  return (
    <Menu
      label={t('ruleChain.putValue', { field: fieldName })}
      className="icon value-button"
      floating
      trigger={<IconPlus size={16} />}
      onLeave={() => field.current?.focus()}
    >
      {values.map((value) => (
        <MenuItem key={value} onClick={() => put(value)}>
          {t(`ruleChain.value.${value.slice(1, -1).replace('.', '_')}`)}
        </MenuItem>
      ))}
    </Menu>
  );
}

function valuesFor(chain: Chain, index: number): string[] {
  const first = chain.cards[0];
  const trigger = first?.kind === 'trigger' ? first.trigger.kind : '';
  return [
    ...(triggerBringsPage(trigger) ? TRIGGER_VALUES : []),
    ...(afterFind(chain, index) ? FOUND_VALUES : []),
    ...RULE_VALUES,
  ];
}

/** A text field that takes values from the run, with its picker at the end. */
function TextWithValues({
  label,
  value,
  error,
  long,
  values,
  onChange,
  onSay,
}: {
  label: string;
  value: string;
  error?: string;
  long?: boolean;
  values: string[];
  onChange: (text: string) => void;
  onSay: (words: string) => void;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  return (
    <div className="field-with-values">
      <Field label={label} error={error} id={id}>
        {long ? (
          <textarea
            ref={field}
            value={value}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            ref={field}
            value={value}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
      <ValuePicker values={values} fieldName={label} field={field} onPut={onChange} onSay={onSay} />
    </div>
  );
}

function TriggerForm({
  chain,
  card,
  place,
  saved,
  problems,
  onChange,
}: FormProps & { card: Extract<Card, { kind: 'trigger' }> }) {
  const { t } = useTranslation();
  const errorOf = useFieldError(problems);
  const required = useRequired();
  const trigger = card.trigger;
  const sentence = useSentence(cardSentence(card, {}));
  const set = (part: Partial<Trigger>) =>
    onChange((c) => setCard(c, 0, { ...card, trigger: { ...trigger, ...part } }));
  return (
    <>
      <p className="muted">{sentence.text}</p>
      {trigger.kind === 'schedule' && (
        <>
          <Field label={required(t('rules2.every'))} error={errorOf('every')}>
            <select value={trigger.every ?? ''} onChange={(e) => set({ every: e.target.value })}>
              <option value="">{t('rules2.chooseEvery')}</option>
              {SCHEDULES.map((s) => (
                <option key={s} value={s}>
                  {t(`rules2.every_${s}`)}
                </option>
              ))}
            </select>
          </Field>
          {trigger.every !== 'hourly' && (
            <Field label={required(t('rules2.at'))} help={t('rules2.atHelp')} error={errorOf('at')}>
              <input type="time" value={trigger.at ?? ''} onChange={(e) => set({ at: e.target.value })} />
            </Field>
          )}
          <details className="explain">
            <summary>{t('ruleChain.howItWorks')}</summary>
            <p>{t('ruleChain.explainSchedule')}</p>
          </details>
        </>
      )}
      {place.spaceId === null && (
        <ScopePart
          definition={toDefinition(chain)}
          onChange={(next: Definition) => onChange((c) => ({ ...c, spaces: next.spaces }))}
        />
      )}
      <div className="details-row">
        <span className="details-label">{t('ruleChain.actsAs')}</span>
        <span>
          {saved ? t('ruleChain.actsAsAccount', { name: saved.owner_name }) : t('ruleChain.actsAsYou')}
        </span>
      </div>
      {trigger.kind === 'incoming' &&
        (!saved ? (
          <p className="muted">{t('ruleChain.hookAfterSave')}</p>
        ) : saved.you_hold ? (
          <HookAddress rule={saved} />
        ) : (
          <p className="muted">{t('ruleChain.hookHolderOnly')}</p>
        ))}
    </>
  );
}

const TEXT_KINDS = ['has_label', 'has_status', 'title_contains', 'text_contains'];

function LeafFields({
  condition,
  names,
  errorOf,
  onSet,
}: {
  condition: Condition;
  names: Names;
  errorOf: (field: string) => string | undefined;
  onSet: (next: Condition) => void;
}) {
  const { t } = useTranslation();
  const required = useRequired();
  const spaces = useQuery({
    queryKey: ['spaces'],
    queryFn: () => api.get<{ spaces: Space[] }>('/spaces'),
    enabled: condition.kind === 'in_space',
  });
  const value = condition.value ?? '';
  if (TEXT_KINDS.includes(condition.kind)) {
    return (
      <Field label={required(t(`ruleChain.field.${condition.kind}`))} error={errorOf('value')}>
        <input
          value={value}
          aria-invalid={!!errorOf('value')}
          onChange={(e) => onSet({ ...condition, value: e.target.value })}
        />
      </Field>
    );
  }
  if (condition.kind === 'older_than') {
    return (
      <Field label={required(t('rules2.days'))} error={errorOf('days')}>
        <input
          type="number"
          min={1}
          value={condition.days ?? ''}
          onChange={(e) => onSet({ ...condition, days: Number(e.target.value) })}
        />
      </Field>
    );
  }
  const chosen = value ? (
    <p>{names[value] ?? t(`ruleChain.unseen.${UNSEEN_OF[condition.kind] ?? 'page'}`)}</p>
  ) : null;
  switch (condition.kind) {
    case 'in_space':
      return (
        <Field label={required(t('ruleChain.field.space'))} error={errorOf('value')}>
          <select value={value} onChange={(e) => onSet({ ...condition, value: e.target.value })}>
            <option value="">{t('rules2.pickSpace')}</option>
            {value && !spaces.data?.spaces.some((s) => s.id === value) && (
              <option value={value}>{names[value] ?? t('ruleChain.unseen.space')}</option>
            )}
            {spaces.data?.spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'below_page':
      return (
        <>
          {chosen}
          <PagePicker
            label={required(t('ruleChain.field.page'))}
            help={errorOf('value') ?? ''}
            value=""
            onChange={(id) => onSet({ ...condition, value: id })}
          />
        </>
      );
    case 'created_by':
    case 'member_of':
      return (
        <>
          {chosen}
          <SubjectPicker
            label={required(t(`ruleChain.field.${condition.kind}`))}
            usersOnly={condition.kind === 'created_by'}
            groupsOnly={condition.kind === 'member_of'}
            onPick={(entry) => onSet({ ...condition, value: entry.id })}
          />
          {errorOf('value') && <p className="field-error">{errorOf('value')}</p>}
        </>
      );
    default:
      return null;
  }
}

const UNSEEN_OF: Record<string, string> = {
  in_space: 'space',
  below_page: 'page',
  created_by: 'person',
  member_of: 'group',
};

function ConditionForm({
  card,
  index,
  names,
  problems,
  onChange,
}: FormProps & { card: Extract<Card, { kind: 'condition' }> }) {
  const errorOf = useFieldError(problems);
  const set = (next: Condition) => onChange((c) => setCard(c, index, { ...card, condition: next }));
  return <LeafFields condition={card.condition} names={names} errorOf={errorOf} onSet={set} />;
}

function GroupItem({ item, names }: { item: Condition; names: Names }) {
  const sentence = useSentence(cardSentence({ kind: 'group', key: '', condition: item }, names));
  return <span className="muted">{sentence.text}</span>;
}

/** A group card as criteria rows (point 23): a lead word, the kind, the value, and remove. */
function GroupForm({
  card,
  index,
  names,
  problems,
  onChange,
}: FormProps & { card: Extract<Card, { kind: 'group' }> }) {
  const { t } = useTranslation();
  const errorOf = useFieldError(problems);
  const group = card.condition;
  const items = group.items ?? [];
  const set = (next: Condition) => onChange((c) => setCard(c, index, { ...card, condition: next }));
  const setItem = (i: number, next: Condition) =>
    set({ ...group, items: items.map((item, k) => (k === i ? next : item)) });
  return (
    <>
      {group.kind === 'not' ? (
        <p className="muted">{t('ruleChain.notGroup')}</p>
      ) : (
        <div className="toggle-pair" role="group" aria-label={t('ruleChain.matchLabel')}>
          {(['all', 'any'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={group.kind === kind}
              onClick={() => set({ ...group, kind })}
            >
              {t(`ruleChain.match_${kind}`)}
            </button>
          ))}
        </div>
      )}
      <ol className="criteria">
        {items.map((item, i) => (
          <li key={i} className="criteria-row">
            <span className="criteria-lead">
              {i === 0 ? t('ruleChain.lead_if') : t(`ruleChain.lead_${group.kind}`)}
            </span>
            {isGroup(item) ? (
              <GroupItem item={item} names={names} />
            ) : (
              <div className="criteria-fields">
                <Field label={t('ruleChain.checks')}>
                  <select value={item.kind} onChange={(e) => setItem(i, { kind: e.target.value })}>
                    {['has_label', 'has_status', 'title_contains', 'text_contains', 'older_than'].map(
                      (kind) => (
                        <option key={kind} value={kind}>
                          {t(`ruleChain.title.condition_${kind}`)}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <LeafFields
                  condition={item}
                  names={names}
                  errorOf={errorOf}
                  onSet={(next) => setItem(i, next)}
                />
              </div>
            )}
            <button
              type="button"
              className="icon"
              aria-label={t('ruleChain.removeCriterion', { number: i + 1 })}
              title={t('ruleChain.removeCriterion', { number: i + 1 })}
              onClick={() => set({ ...group, items: items.filter((_, k) => k !== i) })}
            >
              <IconClose size={16} />
            </button>
          </li>
        ))}
      </ol>
      {group.kind !== 'not' && (
        <button
          type="button"
          className="quiet"
          onClick={() => set({ ...group, items: [...items, { kind: 'has_label', value: '' }] })}
        >
          <IconPlus size={16} /> {t('ruleChain.addCriterion')}
        </button>
      )}
    </>
  );
}

const RECIPIENT_STEPS = ['notify', 'email', 'assign_task', 'add_watcher', 'remove_watcher'];
const TEXT_STEPS = ['add_comment', 'notify', 'email', 'assign_task', 'chat'];

function ActionForm(props: FormProps & { card: Extract<Card, { kind: 'action' }> }) {
  const { chain, card, index, names, place, problems, onChange, onSay } = props;
  const { t } = useTranslation();
  const errorOf = useFieldError(problems);
  const required = useRequired();
  const action = card.action;
  const set = (part: Partial<RuleAction>) =>
    onChange((c) => setCard(c, index, { ...card, action: { ...action, ...part } }));
  const values = valuesFor(chain, index);
  const spaces = useQuery({
    queryKey: ['spaces'],
    queryFn: () => api.get<{ spaces: Space[] }>('/spaces'),
    enabled: action.type === 'move',
  });
  const templates = useQuery({
    queryKey: ['rule-templates', place.spaceId],
    queryFn: () =>
      api.get<{ templates: TemplateSummary[] }>(
        place.spaceId ? `/spaces/${place.spaceId}/templates` : '/admin/templates',
      ),
    enabled: action.type === 'new_from_template',
  });
  const nameOf = (id: string | undefined, unseen: string) =>
    id ? (names[id] ?? t(`ruleChain.unseen.${unseen}`)) : '';
  return (
    <>
      <OtherProblems problems={problems} />
      {action.type === 'find_pages' && (
        <>
          <Field label={t('rules2.label')}>
            <input value={action.label ?? ''} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label={t('rules2.olderDays')}>
            <input
              type="number"
              min={0}
              value={action.older_days ?? 0}
              onChange={(e) => set({ older_days: Number(e.target.value) })}
            />
          </Field>
          <details className="explain">
            <summary>{t('ruleChain.howItWorks')}</summary>
            <p>{t('ruleChain.explainFind')}</p>
          </details>
        </>
      )}
      {(action.type === 'add_label' || action.type === 'remove_label') && (
        <Field label={required(t('rules2.label'))} error={errorOf('label')}>
          <input
            value={action.label ?? ''}
            aria-invalid={!!errorOf('label')}
            onChange={(e) => set({ label: e.target.value })}
          />
        </Field>
      )}
      {action.type === 'set_status' && (
        <Field label={required(t('ruleChain.field.status'))} error={errorOf('text')}>
          <input
            value={action.text ?? ''}
            aria-invalid={!!errorOf('text')}
            onChange={(e) => set({ text: e.target.value })}
          />
        </Field>
      )}
      {RECIPIENT_STEPS.includes(action.type) && (
        <>
          <Field label={required(t('rules2.to'))} error={errorOf('to')}>
            <select
              value={action.to ?? ''}
              aria-invalid={!!errorOf('to')}
              onChange={(e) => set({ to: e.target.value, target_id: undefined })}
            >
              <option value="">{t('rules2.chooseWho')}</option>
              {['owner', 'author', 'user', 'group'].map((r) => (
                <option key={r} value={r}>
                  {t(`ruleChain.to_${r}`)}
                </option>
              ))}
            </select>
          </Field>
          {(action.to === 'user' || action.to === 'group') && (
            <>
              {action.target_id && (
                <p>{nameOf(action.target_id, action.to === 'user' ? 'person' : 'group')}</p>
              )}
              <SubjectPicker
                label={t(`ruleChain.pick_${action.to}`)}
                usersOnly={action.to === 'user'}
                groupsOnly={action.to === 'group'}
                onPick={(entry) => set({ target_id: entry.id })}
              />
            </>
          )}
        </>
      )}
      {(action.type === 'webhook' || action.type === 'chat') && (
        <Field
          label={required(t('rules2.address'))}
          help={t('rules2.addressHelp')}
          error={errorOf('address')}
        >
          <input
            type="url"
            value={action.address ?? ''}
            aria-invalid={!!errorOf('address')}
            onChange={(e) => set({ address: e.target.value })}
          />
        </Field>
      )}
      {action.type === 'webhook' && (
        <>
          <TextWithValues
            label={t('rules2.body')}
            value={action.body ?? ''}
            long
            values={values}
            onChange={(body) => set({ body })}
            onSay={onSay}
          />
          <details className="explain">
            <summary>{t('ruleChain.howItWorks')}</summary>
            <p>{t('ruleChain.explainBody')}</p>
          </details>
        </>
      )}
      {TEXT_STEPS.includes(action.type) && (
        <TextWithValues
          label={required(t('rules2.text'))}
          value={action.text ?? ''}
          error={errorOf('text')}
          long
          values={values}
          onChange={(text) => set({ text })}
          onSay={onSay}
        />
      )}
      {['archive', 'delete', 'copy'].includes(action.type) && (
        <p className="muted">{t('ruleChain.nothingToSet')}</p>
      )}
      {action.type === 'move' && (
        <>
          {action.parent_id && <p>{t('ruleChain.belowName', { name: nameOf(action.parent_id, 'page') })}</p>}
          <PagePicker
            label={t('ruleChain.field.parent')}
            help={errorOf('place') ?? ''}
            value=""
            onChange={(id) => set({ parent_id: id || undefined, space_id: undefined })}
          />
          <Field label={t('ruleChain.field.space')} error={errorOf('place')}>
            <select
              value={action.parent_id ? '' : (action.space_id ?? '')}
              onChange={(e) => set({ space_id: e.target.value || undefined, parent_id: undefined })}
            >
              <option value="">{t('rules2.pickSpace')}</option>
              {spaces.data?.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      {action.type === 'restrict' && (
        <>
          <Field label={required(t('ruleChain.field.restricted'))} error={errorOf('restricted')}>
            <select value={action.restricted ?? ''} onChange={(e) => set({ restricted: e.target.value })}>
              <option value="">{t('ruleChain.chooseRestriction')}</option>
              <option value="view">{t('ruleChain.restrict_view')}</option>
              <option value="edit">{t('ruleChain.restrict_edit')}</option>
            </select>
          </Field>
          {action.target_id && <p>{nameOf(action.target_id, 'group')}</p>}
          <SubjectPicker
            label={required(t('ruleChain.pick_group'))}
            groupsOnly
            onPick={(entry) => set({ target_id: entry.id })}
          />
          {errorOf('group') && <p className="field-error">{errorOf('group')}</p>}
        </>
      )}
      {action.type === 'set_owner' && (
        <>
          {action.target_id && <p>{nameOf(action.target_id, 'person')}</p>}
          <SubjectPicker
            label={required(t('ruleChain.pick_user'))}
            usersOnly
            onPick={(entry) => set({ target_id: entry.id })}
          />
          {errorOf('owner') && <p className="field-error">{errorOf('owner')}</p>}
        </>
      )}
      {action.type === 'new_from_template' && (
        <>
          <Field label={required(t('ruleChain.field.template'))} error={errorOf('template')}>
            <select
              value={action.target_id ?? ''}
              onChange={(e) => set({ target_id: e.target.value || undefined })}
            >
              <option value="">{t('ruleChain.chooseTemplate')}</option>
              {action.target_id && !templates.data?.templates.some((tpl) => tpl.id === action.target_id) && (
                <option value={action.target_id}>{nameOf(action.target_id, 'template')}</option>
              )}
              {templates.data?.templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </Field>
          <TextWithValues
            label={required(t('ruleChain.field.title'))}
            value={action.title ?? ''}
            error={errorOf('title')}
            values={values}
            onChange={(title) => set({ title })}
            onSay={onSay}
          />
        </>
      )}
    </>
  );
}

/** The form of the selected step, by its kind. */
export function StepForm(props: FormProps) {
  const { card } = props;
  switch (card.kind) {
    case 'trigger':
      return <TriggerForm {...props} card={card} />;
    case 'condition':
      return <ConditionForm {...props} card={card} />;
    case 'group':
      return <GroupForm {...props} card={card} />;
    default:
      return <ActionForm {...props} card={card} />;
  }
}
