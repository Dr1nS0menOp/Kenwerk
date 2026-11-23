// SPDX-License-Identifier: Apache-2.0
// The Content screen: one table to keep a space tidy (spec 011, D12).
import { pagePath } from '../addresses';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BulkFailure, type ContentRow, type DirectoryEntry, type Job, type TreeNode } from '../api';
import { Link } from '../router';
import { spaceByKeyQuery } from '../components/frame';
import { SpaceToolFrame } from './space-settings-frame';
import { SubjectPicker } from '../components/picker';
import { StageMark } from '../components/page-marks';
import { Dialog, ErrorNote, Field, Loading, RelativeTime } from '../components/ui';
import { TableBox, TableEmpty } from '../components/table-box';
import { pageTitle } from '../page-name';
import { useDates } from '../dates';
import {
  FilterDate,
  FilterPerson,
  FilterText,
  ToolRow,
  usePersonWords,
  type ToolFilter,
} from '../components/tool-row';
import { choiceFilter } from '../components/tool-row-model';
import { SortHeading } from '../components/sort-heading';
import { nextSort, sortStateOf, useListAddress, type SortRule } from '../components/list-address';
import {
  IconClock,
  IconDate,
  IconFilter,
  IconPage,
  IconPeople,
  IconPerson,
  IconStatus,
} from '../components/icons';

const FLAGS = ['owner_disabled', 'restricted', 'broken_links', 'orphaned', 'past_review', 'with_parents'];
const ACTIONS = ['archive', 'delete', 'owner', 'stage', 'label_add', 'label_remove', 'move'] as const;
type Action = (typeof ACTIONS)[number];
const MONTHS = [1, 3, 6, 12];
const ROWS = 50;
const FILTER_ICON = 16;
const CONTENT_COLUMNS = 7;
/** Without a sort the list goes by title; each other column sorts the one way that makes sense (D7). */
const CONTENT_SORT_DEFAULT = 'title';
const FROM_A: SortRule = { kind: 'one', direction: 'ascending' };
const NEWEST_FIRST: SortRule = { kind: 'one', direction: 'descending' };
/** A flag is set with 1, the value the route takes. */
const FLAG_ON = '1';

interface Plan {
  pages: number;
  allowed: number;
  refused: BulkFailure[];
}

interface JobResult {
  done?: number;
  failed?: BulkFailure[];
}

/** Selecting a parent selects its children, which can be cleared one by one. */
export function selectWithChildren(rows: ContentRow[], picked: string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  const children = rows.filter((r) => r.parent_id === id).map((r) => r.id);
  return [...new Set([...picked, id, ...children])];
}

/** The words of a range of days, such as "from 1 Nov until 30 Nov". */
function useDayRange(params: URLSearchParams, from: string, until: string): string {
  const { t } = useTranslation();
  const dates = useDates();
  const first = params.get(from) ?? '';
  const last = params.get(until) ?? '';
  return [
    first && t('toolRow.from', { day: dates.day(first) }),
    last && t('toolRow.until', { day: dates.day(last) }),
  ]
    .filter(Boolean)
    .join(' ');
}

/** The filters of Content (spec 100): status, label and owner in the row, the rest behind More filters. */
function useContentFilters(params: URLSearchParams): ToolFilter[] {
  const { t } = useTranslation();
  const owner = usePersonWords(params.get('owner_id') ?? '');
  const contributor = usePersonWords(params.get('contributor_id') ?? '');
  const changed = useDayRange(params, 'changed_from', 'changed_until');
  const created = useDayRange(params, 'created_from', 'created_until');
  const text = (param: string, label: string, icon: ReactNode): ToolFilter => ({
    kind: 'field',
    params: [param],
    label,
    icon,
    place: 'row',
    valueText: params.get(param) ?? '',
    field: <FilterText param={param} label={label} />,
  });
  const days = ({
    from,
    until,
    label,
    words,
  }: {
    from: string;
    until: string;
    label: string;
    words: string;
  }): ToolFilter => ({
    kind: 'field',
    params: [from, until],
    label,
    icon: <IconDate size={FILTER_ICON} />,
    place: 'more',
    valueText: words,
    field: (
      <>
        <FilterDate param={from} label={t(`content.${from}`)} as="day" />
        <FilterDate param={until} label={t(`content.${until}`)} as="day" />
      </>
    ),
  });
  return [
    text('stage', t('organise.status'), <IconStatus size={FILTER_ICON} />),
    text('label', t('organise.labels'), <IconPage size={FILTER_ICON} />),
    {
      kind: 'field',
      params: ['owner_id'],
      label: t('content.owner'),
      icon: <IconPerson size={FILTER_ICON} />,
      place: 'row',
      valueText: owner,
      field: <FilterPerson param="owner_id" label={t('content.owner')} />,
    },
    choiceFilter({
      param: 'inactive_months',
      label: t('content.inactive'),
      icon: <IconClock size={FILTER_ICON} />,
      place: 'more',
      values: MONTHS,
      name: (m) => t('content.months', { count: m }),
    }),
    {
      kind: 'field',
      params: ['contributor_id'],
      label: t('content.contributor'),
      icon: <IconPeople size={FILTER_ICON} />,
      place: 'more',
      valueText: contributor,
      field: <FilterPerson param="contributor_id" label={t('content.contributor')} />,
    },
    days({ from: 'changed_from', until: 'changed_until', label: t('toolRow.changed'), words: changed }),
    days({ from: 'created_from', until: 'created_until', label: t('toolRow.created'), words: created }),
    ...FLAGS.map((flag) =>
      choiceFilter({
        param: flag,
        label: t(`content.flag_${flag}`),
        icon: <IconFilter size={FILTER_ICON} />,
        place: 'more',
        values: [FLAG_ON],
        name: () => t('toolRow.yes'),
      }),
    ),
  ];
}

function ActionDialog({
  spaceId,
  action,
  ids,
  onClose,
  onDone,
}: {
  spaceId: string;
  action: Action;
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [owner, setOwner] = useState<DirectoryEntry | null>(null);
  const [word, setWord] = useState('');
  const [parent, setParent] = useState('');
  const [job, setJob] = useState<string | null>(null);
  const tree = useQuery({
    queryKey: ['tree', spaceId],
    queryFn: () => api.get<{ pages: TreeNode[] }>(`/spaces/${spaceId}/tree`),
    enabled: action === 'move',
  });
  const body = {
    action,
    page_ids: ids,
    ...(owner ? { owner_id: owner.id } : {}),
    ...(action === 'stage' ? { stage_text: word, stage_color: 'grey' } : {}),
    ...(action.startsWith('label') ? { label: word } : {}),
    ...(action === 'move' ? { parent_id: parent || null } : {}),
  };
  const plan = useQuery({
    queryKey: ['content-plan', action, ids],
    queryFn: () => api.post<Plan>(`/spaces/${spaceId}/content/preview`, body),
  });
  const run = useMutation({
    mutationFn: () => api.post<{ job_id: string }>(`/spaces/${spaceId}/content/run`, body),
    onSuccess: (r) => setJob(r.job_id),
  });
  const status = useQuery({
    queryKey: ['job', job],
    queryFn: () => api.get<Job>(`/jobs/${job}`),
    enabled: !!job,
    refetchInterval: (q) => (['done', 'failed'].includes(q.state.data?.status ?? '') ? false : 1000),
  });
  const finished = status.data?.status === 'done' || status.data?.status === 'failed';
  useEffect(() => {
    if (finished) onDone();
  }, [finished, onDone]);
  const result = status.data?.result as JobResult | undefined;
  const needsWord = action === 'stage' || action.startsWith('label');
  const ready = (action !== 'owner' || owner) && (!needsWord || word.trim() !== '');
  return (
    <Dialog title={t(`content.action_${action}`)} onClose={onClose}>
      <ErrorNote error={plan.error ?? run.error} />
      {plan.data && !job && (
        <p>
          {t('content.summary', { allowed: plan.data.allowed, pages: plan.data.pages })}
          {plan.data.refused.length > 0 && ` ${t('content.refused', { count: plan.data.refused.length })}`}
        </p>
      )}
      {action === 'owner' && !job && (
        <>
          <SubjectPicker label={t('content.newOwner')} usersOnly onPick={setOwner} />
          {owner && <p>{owner.name}</p>}
        </>
      )}
      {needsWord && !job && (
        <Field label={action === 'stage' ? t('organise.statusWord') : t('organise.addLabel')}>
          <input value={word} onChange={(e) => setWord(e.target.value)} />
        </Field>
      )}
      {action === 'move' && !job && (
        <Field label={t('page.moveTo')}>
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">{t('page.topLevel')}</option>
            {tree.data?.pages
              .filter((n) => !ids.includes(n.id) && n.status === 'published')
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {pageTitle(t, n.title)}
                </option>
              ))}
          </select>
        </Field>
      )}
      {job && !finished && (
        <p role="status" className="muted">
          {t('content.working')}
        </p>
      )}
      {finished && (
        <div role="status">
          <p>{t('content.report', { done: result?.done ?? 0, failed: result?.failed?.length ?? 0 })}</p>
          <ul className="plain-list">
            {result?.failed?.map((f) => (
              <li key={f.id}>
                <Link href={pagePath(f.id)}>{f.id}</Link> <span className="muted">{f.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="quiet" onClick={onClose}>
          {job ? t('organise.done') : t('common.cancel')}
        </button>
        {!job && (
          <button
            type="button"
            className="primary"
            disabled={!ready || run.isPending}
            onClick={() => run.mutate()}
          >
            {t(`content.action_${action}`)}
          </button>
        )}
      </div>
    </Dialog>
  );
}

export function ContentView({ spaceKey }: { spaceKey: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const q = useQuery(spaceByKeyQuery(spaceKey));
  const space = q.data;
  const { params, set } = useListAddress();
  const filters = useContentFilters(params);
  const offset = Number(params.get('offset') ?? 0);
  const [picked, setPicked] = useState<string[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const query = params.toString();
  const rows = useQuery({
    queryKey: ['content', space?.id, query],
    queryFn: () =>
      api.get<{ pages: ContentRow[]; total: number }>(`/spaces/${space?.id}/content?${query}&limit=${ROWS}`),
    enabled: !!space,
  });
  const list = rows.data?.pages ?? [];
  const total = rows.data?.total ?? 0;
  const sort = params.get('sort') ?? '';
  const heading = (column: string, label: string, rule: SortRule) => (
    <SortHeading
      label={label}
      state={sortStateOf(sort, column, CONTENT_SORT_DEFAULT, rule)}
      onSort={() => set('sort', nextSort(sort, column, CONTENT_SORT_DEFAULT, rule))}
    />
  );
  if (q.error) {
    return (
      <main id="main" className="plain reading">
        <ErrorNote error={q.error} />
      </main>
    );
  }
  if (!space) return <Loading />;
  return (
    <SpaceToolFrame space={space} entry="content">
      <div className="wide-area">
        <h1>{t('content.title')}</h1>
        <ToolRow
          label={t('content.filters')}
          search={{ label: t('content.search'), placeholder: t('content.search') }}
          filters={filters}
          sortParam="sort"
          count={rows.data ? t('content.count', { count: total }) : undefined}
        />
        <ErrorNote error={rows.error} />
        {rows.isPending && <Loading />}
        {picked.length > 0 && (
          <div className="row content-actions" role="group" aria-label={t('content.actions')}>
            <span>{t('content.selected', { count: picked.length })}</span>
            {ACTIONS.map((a) => (
              <button key={a} type="button" onClick={() => setAction(a)}>
                {t(`content.action_${a}`)}
              </button>
            ))}
          </div>
        )}
        {rows.data && (
          <TableBox>
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label={t('content.selectAll')}
                      disabled={list.length === 0}
                      checked={list.length > 0 && list.every((r) => picked.includes(r.id))}
                      onChange={(e) => setPicked(e.target.checked ? list.map((r) => r.id) : [])}
                    />
                  </th>
                  {heading(CONTENT_SORT_DEFAULT, t('page.title'), FROM_A)}
                  {heading('owner', t('content.owner'), FROM_A)}
                  <th>{t('organise.status')}</th>
                  <th>{t('organise.labels')}</th>
                  {heading('created', t('toolRow.created'), NEWEST_FIRST)}
                  {heading('changed', t('directory.lastChange'), NEWEST_FIRST)}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <TableEmpty columns={CONTENT_COLUMNS}>{t('content.noneFit')}</TableEmpty>
                )}
                {list.map((r) => (
                  <tr key={r.id} className={picked.includes(r.id) ? 'picked' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('favourites.pick', { title: pageTitle(t, r.title) })}
                        checked={picked.includes(r.id)}
                        onChange={() => setPicked(selectWithChildren(list, picked, r.id))}
                      />
                    </td>
                    <td>
                      <Link href={pagePath(r.id)}>{pageTitle(t, r.title)}</Link>
                    </td>
                    <td>
                      {r.owner_name}
                      {r.owner_disabled && <span className="muted"> {t('content.noLongerActive')}</span>}
                    </td>
                    <td>
                      <StageMark text={r.stage_text} color={r.stage_color} />
                    </td>
                    <td>{r.labels.join(', ')}</td>
                    <td>
                      <RelativeTime value={r.created_at} />
                    </td>
                    <td>
                      <RelativeTime value={r.updated_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableBox>
        )}
        {offset + list.length < total && (
          <button type="button" onClick={() => set('offset', String(offset + ROWS))}>
            {t('common.more')}
          </button>
        )}
        {action && (
          <ActionDialog
            spaceId={space.id}
            action={action}
            ids={picked}
            onClose={() => setAction(null)}
            onDone={() => {
              setPicked([]);
              void client.invalidateQueries({ queryKey: ['content'] });
              void client.invalidateQueries({ queryKey: ['tree', space.id] });
            }}
          />
        )}
      </div>
    </SpaceToolFrame>
  );
}
