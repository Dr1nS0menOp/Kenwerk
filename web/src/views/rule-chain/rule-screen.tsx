// SPDX-License-Identifier: Apache-2.0
// The screen of one rule as a chain of cards (spec 091, PLT-129 to PLT-152): a header strip, a
// canvas with the steps, and a panel. It saves through the routes every client uses, and what a
// rule still needs comes only from the server's check (D5).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Space } from '../../api';
import { useKnownCapabilities } from '../../capabilities';
import { ExperimentalOff } from '../../components/experimental-off';
import { spaceByKeyQuery } from '../../components/frame';
import { IconArrowBack, IconAutomation } from '../../components/icons';
import { Menu, MenuItem, MenuSeparator } from '../../components/menu';
import { Notice } from '../../components/notice';
import { useDelayed } from '../../components/quick-search';
import { SplitButton } from '../../components/split-button';
import { useToast } from '../../components/toast';
import { ConfirmDialog, Dialog, ErrorNote, Loading } from '../../components/ui';
import { DEFAULT_ZOOM, type Zoom } from '../../components/zoom-control';
import { guardLeaving, navigate } from '../../router';
import { AdminFrame } from '../admin';
import {
  RULE_TEMPLATES,
  ruleCheckPath,
  ruleListPath,
  type Checked,
  type Definition,
  type Rule,
} from '../rule-definition';
import { RuleView, RunLog, TestRun } from '../rules';
import { SpaceToolFrame } from '../space-settings-frame';
import { Canvas } from './chain';
import {
  canonical,
  emptyChain,
  isPlaceholder,
  placeholderCount,
  placeProblems,
  toChain,
  toDefinition,
  type Chain,
} from './chain-model';
import { Panel } from './panel';

/** How long the screen waits after the last change before it asks the server to check (point 27). */
const CHECK_PAUSE_MS = 400;

/** Where a rule is kept: its space, or the instance. */
interface Place {
  spaceId: string | null;
  /** The address of the list of rules, where Back leads. */
  listAddress: string;
}

/** A rule, as the form or as cards, whichever the installation has on (D1). */
export function RuleScreen({ ruleId }: { ruleId: string }) {
  const capabilities = useKnownCapabilities();
  if (!capabilities) return <Loading />;
  if (!capabilities.rule_cards) return <RuleView ruleId={ruleId} />;
  return <SavedRuleChain ruleId={ruleId} />;
}

function SavedRuleChain({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['rule', ruleId], queryFn: () => api.get<Rule>(`/rules/${ruleId}`) });
  // Someone who may not manage a rule learns nothing of it, not even that it exists.
  const refused = q.error instanceof ApiError && (q.error.status === 403 || q.error.status === 404);
  if (q.error) {
    return (
      <main id="main" className="plain reading">
        {refused ? <p role="alert">{t('app.notFound')}</p> : <ErrorNote error={q.error} />}
      </main>
    );
  }
  if (!q.data) return <Loading />;
  const rule = q.data;
  return (
    <RuleFrame spaceId={rule.space_id}>
      {(place) => (
        <RuleEditor
          key={rule.id}
          place={place}
          saved={rule}
          start={toChain(rule.definition)}
          startName={rule.name}
        />
      )}
    </RuleFrame>
  );
}

/** A new rule of a space (by key) or of the instance: a draft in the browser until saved (D8). */
export function NewRuleChainView({
  spaceKey,
  template,
}: {
  spaceKey: string | null;
  template: string | null;
}) {
  const { t } = useTranslation();
  const capabilities = useKnownCapabilities();
  const space = useQuery({ ...spaceByKeyQuery(spaceKey ?? ''), enabled: spaceKey !== null });
  if (!capabilities || (spaceKey !== null && !space.data && !space.error)) return <Loading />;
  if (!capabilities.rule_cards) return <ExperimentalOff />;
  if (space.error) {
    return (
      <main id="main" className="plain reading">
        <ErrorNote error={space.error} />
      </main>
    );
  }
  const chosen = RULE_TEMPLATES.find((tpl) => tpl.key === template);
  const start = chosen ? toChain(chosen.definition) : emptyChain();
  const startName = chosen ? t(`rules2.template_${chosen.key}`) : t('rules2.newName');
  return (
    <RuleFrame spaceId={space.data?.id ?? null} space={space.data}>
      {(place) => (
        <RuleEditor place={place} saved={null} start={start} startName={startName} fromTemplate={!!chosen} />
      )}
    </RuleFrame>
  );
}

/** The Settings frame of the rule's space, or of the administration (E2), at full width. */
function RuleFrame({
  spaceId,
  space,
  children,
}: {
  spaceId: string | null;
  space?: Space;
  children: (place: Place) => ReactNode;
}) {
  const q = useQuery({
    queryKey: ['space-id', spaceId],
    queryFn: () => api.get<Space>(`/spaces/${spaceId}`),
    enabled: spaceId !== null && !space,
  });
  if (spaceId === null) {
    return (
      <AdminFrame current="automation" width="full">
        {children({ spaceId: null, listAddress: '/admin/automation' })}
      </AdminFrame>
    );
  }
  const shown = space ?? q.data;
  if (q.error) return <ErrorNote error={q.error} />;
  if (!shown) return <Loading />;
  return (
    <SpaceToolFrame space={shown} entry="automation">
      {children({ spaceId, listAddress: `/spaces/${shown.key}/settings/automation` })}
    </SpaceToolFrame>
  );
}

/** What the header says about saving (PLT-130). */
type SaveState = 'saved' | 'new' | 'changed' | 'savedOff';

function useLeaveGuard(dirty: boolean, onBlocked: (to: string) => void) {
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;
  useEffect(() => {
    if (!dirty) return;
    guardLeaving((to) => {
      blocked.current(to);
      return false;
    });
    // Closing or reloading the tab is warned by the browser itself (point 33).
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      guardLeaving(null);
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);
}

function download(name: string, definition: Definition) {
  const link = document.createElement('a');
  const raw = JSON.stringify({ name, definition }, null, 2);
  link.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  link.download = `${name}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** What saving sends: the same JSON every client sends (spec 091, "Through the API"). */
interface SaveBody {
  name: string;
  enabled: boolean;
  definition: Definition;
  take_over?: boolean;
}

function RuleEditor({
  place,
  saved,
  start,
  startName,
  fromTemplate = false,
}: {
  place: Place;
  saved: Rule | null;
  start: Chain;
  startName: string;
  fromTemplate?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToast();
  const [chain, setChain] = useState(start);
  const [name, setName] = useState(startName);
  // A new rule opens with its trigger placeholder selected (PLT-136).
  const [selected, setSelected] = useState<number | null>(saved ? null : 0);
  const [zoom, setZoom] = useState<Zoom>(DEFAULT_ZOOM);
  const [said, setSaid] = useState('');
  const [leaving, setLeaving] = useState<string | null>(null);
  const [asking, setAsking] = useState<'takeOver' | 'delete' | 'test' | 'log' | null>(null);

  const definition = toDefinition(chain);
  const raw = canonical(definition);
  const dirty = !saved || raw !== canonical(saved.definition) || name !== saved.name;
  useLeaveGuard(dirty, setLeaving);

  const checkedRaw = useDelayed(raw, CHECK_PAUSE_MS);
  const check = useQuery({
    queryKey: ['rule-check', place.spaceId, checkedRaw],
    queryFn: () =>
      api.post<Checked>(ruleCheckPath(place.spaceId), { definition: JSON.parse(checkedRaw) as unknown }),
    placeholderData: (previous) => previous,
    retry: false,
  });
  const problems = check.data?.problems ?? [];
  const names = check.data?.names ?? {};
  const placed = placeProblems(chain, problems);
  const placeholders = placeholderCount(chain);
  const needInput = chain.cards.filter(
    (card, i) => isPlaceholder(card) || (placed.byCard[i] ?? []).length > 0,
  ).length;
  const hasTrigger = definition.trigger.kind !== '';

  const afterSave = (rule: Rule) => {
    client.setQueryData(['rule', rule.id], rule);
    void client.invalidateQueries({ queryKey: ['rules', place.spaceId] });
    if (!saved) {
      // The draft's address gives way to the rule's, so Back does not return to an empty draft (point 3).
      guardLeaving(null);
      navigate(`/rules/${rule.id}`, true);
    }
  };

  const save = useMutation({
    mutationFn: async (body: SaveBody) => {
      const send = (b: SaveBody) =>
        saved ? api.put<Rule>(`/rules/${saved.id}`, b) : api.post<Rule>(ruleListPath(place.spaceId), b);
      try {
        return await send(body);
      } catch (err) {
        // The server is the judge: a rule it will not switch on is saved off, and says why (D6).
        if (err instanceof ApiError && err.code === 'rule_not_ready' && body.enabled) {
          return send({ ...body, enabled: false });
        }
        throw err;
      }
    },
    onSuccess: (rule) => {
      setSaid(rule.enabled ? t('ruleChain.saidOn') : t('ruleChain.saidOff'));
      afterSave(rule);
    },
  });

  const saveWith = (enable: boolean) => {
    if (!hasTrigger) return;
    // Placeholders are not saved, and a rule with open problems or placeholders stays off (D6).
    const enabled = enable && problems.length === 0 && placeholders === 0;
    if (saved && !saved.you_hold) {
      setAsking('takeOver');
      return;
    }
    save.mutate({ name, enabled, definition });
  };

  const turnOff = useMutation({
    mutationFn: () => {
      if (!saved) throw new Error('nothing saved');
      // The saved rule, unchanged and off: anyone who manages it may do this (spec 092, D2).
      return api.put<Rule>(`/rules/${saved.id}`, {
        name: saved.name,
        enabled: false,
        definition: saved.definition,
      });
    },
    onSuccess: afterSave,
  });
  const copy = useMutation({
    mutationFn: () => {
      if (!saved) throw new Error('nothing saved');
      return api.post<Rule>(ruleListPath(place.spaceId), {
        name: t('rules2.copyName', { name: saved.name }),
        enabled: false,
        definition: saved.definition,
      });
    },
    onSuccess: (rule) => {
      void client.invalidateQueries({ queryKey: ['rules', place.spaceId] });
      toast({
        message: t('ruleChain.copied'),
        action: { label: t('ruleChain.openCopy'), run: () => navigate(`/rules/${rule.id}`) },
      });
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (saved) await api.del(`/rules/${saved.id}`);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['rules', place.spaceId] });
      guardLeaving(null);
      navigate(place.listAddress);
    },
  });

  // A saved rule that is off while it still needs something says so (D6); the page of a new rule
  // gives way to the rule's own after its first save, so this is read from the rule, not remembered.
  const savedOff = !!saved && !saved.enabled && needInput > 0;
  const state: SaveState = !saved ? 'new' : dirty ? 'changed' : savedOff ? 'savedOff' : 'saved';
  const failure = save.error ?? turnOff.error ?? copy.error ?? remove.error;
  return (
    <div className="rule-screen">
      <header className="rule-strip">
        <button type="button" className="boxed" onClick={() => navigate(place.listAddress)}>
          <IconArrowBack size={18} />
          <span className="visually-hidden">{t('ruleChain.back')}</span>
        </button>
        <span className="rule-strip-icon">
          <IconAutomation size={18} />
        </span>
        <h1 className="rule-strip-name">{name || t('rules2.newName')}</h1>
        <span className="rule-strip-state" role="status">
          {state === 'savedOff' ? (
            t('ruleChain.savedOff', { count: needInput })
          ) : (
            <>
              {saved?.enabled ? t('ruleChain.on') : t('ruleChain.off')}
              {', '}
              {t(`ruleChain.state_${state}`)}
            </>
          )}
        </span>
        <span className="lozenge">{t('adminFrame.experimental')}</span>
        <span className="rule-strip-end">
          <SplitButton
            label={t('ruleChain.saveOn')}
            onClick={() => saveWith(true)}
            disabled={!hasTrigger || save.isPending}
            why={hasTrigger ? undefined : t('ruleChain.chooseTriggerFirst')}
            menuLabel={t('ruleChain.saveChoices')}
          >
            <MenuItem onClick={() => saveWith(false)}>{t('ruleChain.saveOff')}</MenuItem>
          </SplitButton>
          <Menu label={t('ruleChain.more')} className="boxed" trigger={<span>{t('ruleChain.more')}</span>}>
            {saved?.enabled && <MenuItem onClick={() => turnOff.mutate()}>{t('ruleChain.turnOff')}</MenuItem>}
            {saved && <MenuItem onClick={() => copy.mutate()}>{t('ruleChain.copy')}</MenuItem>}
            <MenuItem onClick={() => download(saved?.name ?? name, saved?.definition ?? definition)}>
              {t('rules2.export')}
            </MenuItem>
            {saved && <MenuItem onClick={() => setAsking('test')}>{t('ruleChain.test')}</MenuItem>}
            {saved && <MenuItem onClick={() => setAsking('log')}>{t('ruleChain.log')}</MenuItem>}
            <MenuSeparator />
            <MenuItem onClick={() => setAsking('delete')}>{t('common.delete')}</MenuItem>
          </Menu>
        </span>
      </header>
      <div className="visually-hidden" role="status">
        {said}
      </div>
      <ErrorNote error={failure} />
      {saved && !saved.you_hold && (
        <Notice kind="info">{t('ruleChain.heldBy', { name: saved.owner_name })}</Notice>
      )}
      {check.isError && <p className="muted">{t('ruleChain.checkStale')}</p>}
      <div className="rule-body">
        <Canvas
          chain={chain}
          names={names}
          problems={placed.byCard}
          selected={selected}
          zoom={zoom}
          onZoom={setZoom}
          onChange={setChain}
          onSelect={setSelected}
          onSay={setSaid}
        />
        <Panel
          chain={chain}
          place={place}
          saved={saved}
          name={name}
          names={names}
          problems={placed}
          needInput={needInput}
          fromTemplate={fromTemplate && !saved}
          selected={selected}
          onName={setName}
          onChange={setChain}
          onSelect={setSelected}
          onSay={setSaid}
          onCheck={() => void check.refetch()}
        />
      </div>
      {leaving !== null && (
        <ConfirmDialog
          title={t('ruleChain.leaveTitle')}
          message={t('ruleChain.leaveMessage')}
          confirmLabel={t('ruleChain.leave')}
          onConfirm={() => {
            guardLeaving(null);
            navigate(leaving);
          }}
          onClose={() => setLeaving(null)}
        />
      )}
      {asking === 'takeOver' && saved && (
        <ConfirmDialog
          title={t('ruleChain.takeOverTitle')}
          message={t('ruleChain.takeOverMessage', { name: saved.owner_name })}
          confirmLabel={t('ruleChain.takeOver')}
          tone="primary"
          onConfirm={() =>
            // A take-over always starts off (spec 092, D3); switching on is the new holder's next save.
            save.mutate({ name, enabled: false, definition, take_over: true })
          }
          onClose={() => setAsking(null)}
        />
      )}
      {asking === 'delete' && (
        <ConfirmDialog
          title={t('common.delete')}
          message={saved ? t('rules2.deleteConfirm', { name: saved.name }) : t('ruleChain.discardDraft')}
          confirmLabel={t('common.delete')}
          onConfirm={() => remove.mutate()}
          onClose={() => setAsking(null)}
        />
      )}
      {asking === 'test' && saved && (
        <Dialog title={t('ruleChain.test')} onClose={() => setAsking(null)}>
          <p className="muted">{saved.you_hold ? t('ruleChain.testAsAccount') : t('ruleChain.testAsYou')}</p>
          <TestRun rule={saved} />
        </Dialog>
      )}
      {asking === 'log' && saved && (
        <Dialog title={t('ruleChain.log')} onClose={() => setAsking(null)}>
          <RunLog rule={saved} />
        </Dialog>
      )}
    </div>
  );
}
