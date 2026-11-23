// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type TrashItem } from '../api';
import { SpaceShell, spaceByKeyQuery } from '../components/frame';
import { SpaceRefused } from '../components/no-access';
import { PageView } from './page';
import { ConfirmButton, ErrorNote, Loading } from '../components/ui';
import { useDates } from '../dates';
import { TableBox, TableEmpty } from '../components/table-box';
import { SpaceToolFrame } from './space-settings-frame';
import { ToolRow } from '../components/tool-row';
import { SortHeading } from '../components/sort-heading';
import { nextSort, queryOf, sortStateOf, useListAddress, type SortRule } from '../components/list-address';

/** The parameters of GET /spaces/{id}/trash that the screen sends (spec 100). */
const TRASH_PARAMS = ['q', 'sort'];
/** Without a sort the trash shows the newest deletion first; title sorts by name (spec 100, D7). */
const TRASH_SORT_DEFAULT = 'deleted';
const BY_NAME: SortRule = { kind: 'one', direction: 'ascending' };
const NEWEST_FIRST: SortRule = { kind: 'one', direction: 'descending' };
const TRASH_COLUMNS = 7;

function useSpaceByKey(key: string) {
  return useQuery(spaceByKeyQuery(key));
}

/** The home page of a space, at the space's own address (spec 094, rule 1). The frame then puts the current key in the bar. */
export function SpaceHome({ spaceKey }: { spaceKey: string }) {
  const space = useSpaceByKey(spaceKey);
  if (space.error) return <SpaceRefused error={space.error} />;
  const home = space.data?.home_page_id;
  if (!home) return <Loading />;
  return (
    <SpaceShell pageId={home}>
      <PageView pageId={home} />
    </SpaceShell>
  );
}

export function TrashView({ spaceKey }: { spaceKey: string }) {
  const { t } = useTranslation();
  const dates = useDates();
  const client = useQueryClient();
  const q = useSpaceByKey(spaceKey);
  const space = q.data;
  const { params, set } = useListAddress();
  const [picked, setPicked] = useState<string[]>([]);
  const query = queryOf(params, TRASH_PARAMS);
  const items = useQuery({
    queryKey: ['trash', space?.id, query],
    queryFn: () => api.get<{ items: TrashItem[] }>(`/spaces/${space?.id}/trash?${query}`),
    enabled: !!space,
  });
  const sort = params.get('sort') ?? '';
  const heading = (column: string, label: string, rule: SortRule) => (
    <SortHeading
      label={label}
      state={sortStateOf(sort, column, TRASH_SORT_DEFAULT, rule)}
      onSort={() => set('sort', nextSort(sort, column, TRASH_SORT_DEFAULT, rule))}
    />
  );
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['trash', space?.id] });
    await client.invalidateQueries({ queryKey: ['tree', space?.id] });
  };
  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/trash/${id}/restore`),
    onSettled: refresh,
  });
  const purge = useMutation({ mutationFn: (id: string) => api.del(`/trash/${id}`), onSettled: refresh });
  const bulk = useMutation({
    mutationFn: (action: 'restore' | 'purge') =>
      api.post(`/spaces/${space?.id}/trash/bulk`, { action, ids: picked }),
    onSuccess: () => setPicked([]),
    onSettled: refresh,
  });
  if (q.error) {
    return (
      <main id="main" className="plain reading">
        <ErrorNote error={q.error} />
      </main>
    );
  }
  if (!space) return <Loading />;
  return (
    <SpaceToolFrame space={space} entry="trash">
      <h1>{t('trash.title')}</h1>
      <ErrorNote error={items.error ?? restore.error ?? purge.error ?? bulk.error} />
      <ToolRow
        label={t('trash.find')}
        search={{ label: t('trash.filter'), placeholder: t('trash.filter') }}
        sortParam="sort"
      />
      {picked.length > 0 && (
        <div className="row" role="group" aria-label={t('content.actions')}>
          <span>{t('content.selected', { count: picked.length })}</span>
          <button type="button" onClick={() => bulk.mutate('restore')}>
            {t('trash.restore')}
          </button>
          <ConfirmButton
            label={t('trash.purge')}
            message={t('trash.confirmPurgeMany', { count: picked.length })}
            className="danger"
            onConfirm={() => bulk.mutate('purge')}
          />
        </div>
      )}
      {items.data && (
        <TableBox>
          <table>
            <thead>
              <tr>
                <th>
                  <span className="visually-hidden">{t('history.pick')}</span>
                </th>
                {heading('title', t('common.name'), BY_NAME)}
                <th>{t('common.type')}</th>
                <th>{t('trash.deletedBy')}</th>
                {heading(TRASH_SORT_DEFAULT, t('trash.deleted'), NEWEST_FIRST)}
                <th>{t('trash.purgeAfter')}</th>
                <th>
                  <span className="visually-hidden">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.data.items.length === 0 && (
                <TableEmpty columns={TRASH_COLUMNS}>
                  {query ? t('trash.noneFit') : t('trash.empty')}
                </TableEmpty>
              )}
              {items.data.items.map((i) => (
                <tr key={i.id} className={picked.includes(i.id) ? 'picked' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t('favourites.pick', { title: i.hidden ? t('trash.restricted') : i.title })}
                      checked={picked.includes(i.id)}
                      onChange={(e) =>
                        setPicked(e.target.checked ? [...picked, i.id] : picked.filter((x) => x !== i.id))
                      }
                    />
                  </td>
                  <td>{i.hidden ? t('trash.restricted') : i.title}</td>
                  <td>{i.object_type}</td>
                  <td>{i.deleted_by_name || t('common.unknown')}</td>
                  <td>{dates.moment(i.deleted_at)}</td>
                  <td>{dates.moment(i.purge_after)}</td>
                  <td className="row-actions">
                    <button type="button" className="ghost" onClick={() => restore.mutate(i.id)}>
                      {t('trash.restore')}
                    </button>
                    {!i.hidden && (
                      <ConfirmButton
                        label={t('trash.purge')}
                        message={t('trash.confirmPurge')}
                        className="danger"
                        onConfirm={() => purge.mutate(i.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      )}
    </SpaceToolFrame>
  );
}
