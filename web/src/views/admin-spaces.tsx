// SPDX-License-Identifier: Apache-2.0
// Administration: every space of the instance (a tool section), and the spaces in the trash (a
// settings section of Data, ADM-075). Both call the routes they called as one screen.
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Space, type TrashItem } from '../api';
import { Link } from '../router';
import { ConfirmButton, Dialog, ErrorNote, Field, formatSize, Loading } from '../components/ui';
import { TableBox, TableEmpty } from '../components/table-box';
import { useDates } from '../dates';
import { StorageLimitDialog } from './admin-storage';
import { FilterNumber, ToolRow, type ToolFilter } from '../components/tool-row';
import { choiceFilter } from '../components/tool-row-model';
import { SortHeading } from '../components/sort-heading';
import { BOTH_WAYS, nextSort, queryOf, sortStateOf, useListAddress } from '../components/list-address';
import { IconClock, IconFolder, IconPage, IconStatus } from '../components/icons';

interface SpaceTotal {
  id: string;
  pages: number;
  bytes: number;
  last_activity: string | null;
  limit_mib: number;
}

const MEBIBYTE = 1 << 20;
const SPACE_COLUMNS = 7;
/** The parameters of GET /admin/spaces that the screen sends (spec 100). */
const SPACE_PARAMS = ['q', 'status', 'quiet_months', 'min_pages', 'min_mib', 'sort'];
const SPACE_SORT_DEFAULT = 'name';
const SPACE_STATUSES = ['active', 'archived'];
/** Months without any change that make a space quiet. */
const QUIET_MONTHS = [1, 3, 6, 12];
const FILTER_ICON = 16;
const TRASH_COLUMNS = 3;

function RecoverDialog({ space, onClose }: { space: Space; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const recover = useMutation({
    mutationFn: () => api.post(`/admin/spaces/${space.id}/recover`, { reason }),
    onSuccess: async () => {
      onClose();
      await client.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
  return (
    <Dialog title={t('admin.recover')} onClose={onClose}>
      <p>{t('admin.recoverHelp')}</p>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          recover.mutate();
        }}
      >
        <ErrorNote error={recover.error} />
        <Field label={t('admin.reason')}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
        </Field>
        <div className="dialog-actions">
          <button type="submit" className="primary">
            {t('admin.recover')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The filters of Spaces (spec 100): status and quiet in the row, the sizes behind More filters. */
function useSpaceFilters(): ToolFilter[] {
  const { t } = useTranslation();
  const { params } = useListAddress();
  return [
    choiceFilter({
      param: 'status',
      label: t('common.status'),
      icon: <IconStatus size={FILTER_ICON} />,
      place: 'row',
      values: SPACE_STATUSES,
      name: (s) => t(`toolRow.spaceStatus_${s}`),
    }),
    choiceFilter({
      param: 'quiet_months',
      label: t('admin.spaceQuiet'),
      icon: <IconClock size={FILTER_ICON} />,
      place: 'row',
      values: QUIET_MONTHS,
      name: (m) => t('toolRow.months', { count: m }),
    }),
    {
      kind: 'field',
      params: ['min_pages'],
      label: t('admin.spaceMinPages'),
      icon: <IconPage size={FILTER_ICON} />,
      place: 'more',
      valueText: params.get('min_pages') ?? '',
      field: <FilterNumber param="min_pages" label={t('admin.spaceMinPages')} />,
    },
    {
      kind: 'field',
      params: ['min_mib'],
      label: t('admin.spaceMinMiB'),
      icon: <IconFolder size={FILTER_ICON} />,
      place: 'more',
      valueText: params.get('min_mib') ?? '',
      field: <FilterNumber param="min_mib" label={t('admin.spaceMinMiB')} />,
    },
  ];
}

export function SpacesTab() {
  const { t } = useTranslation();
  const dates = useDates();
  const { params, set } = useListAddress();
  const filters = useSpaceFilters();
  // The server filters and sorts the list; the screen sends what the address holds (spec 100, D9).
  const query = queryOf(params, SPACE_PARAMS);
  const q = useQuery({
    queryKey: ['admin-spaces', query],
    queryFn: () =>
      api.get<{ spaces: Space[]; totals: SpaceTotal[]; total: number }>(`/admin/spaces?${query}`),
  });
  const [recovering, setRecovering] = useState<Space | null>(null);
  const [limiting, setLimiting] = useState<Space | null>(null);
  const totalOf = (id: string) => q.data?.totals.find((row) => row.id === id);
  const shown = q.data?.spaces ?? [];
  const sort = params.get('sort') ?? '';
  const heading = (column: string, label: string) => (
    <SortHeading
      label={label}
      state={sortStateOf(sort, column, SPACE_SORT_DEFAULT, BOTH_WAYS)}
      onSort={() => set('sort', nextSort(sort, column, SPACE_SORT_DEFAULT, BOTH_WAYS))}
    />
  );
  return (
    <>
      <ErrorNote error={q.error} />
      <ToolRow
        label={t('toolRow.findSpaces')}
        search={{ label: t('admin.spaceFind'), placeholder: t('admin.spaceFind') }}
        filters={filters}
        sortParam="sort"
        count={q.data ? t('toolRow.countSpaces', { count: shown.length, total: q.data.total }) : undefined}
      />
      <TableBox>
        <table>
          <thead>
            <tr>
              {heading('name', t('common.name'))}
              {heading('key', t('space.key'))}
              <th>{t('common.status')}</th>
              {heading('pages', t('admin.spacePages'))}
              {heading('storage', t('admin.spaceStorage'))}
              {heading('activity', t('admin.spaceActivity'))}
              <th>
                <span className="visually-hidden">{t('common.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {q.data && shown.length === 0 && (
              <TableEmpty columns={SPACE_COLUMNS}>{t('admin.spaceNoneFit')}</TableEmpty>
            )}
            {shown.map((s) => {
              const total = totalOf(s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <Link href={`/spaces/${s.key}`}>{s.name}</Link>
                  </td>
                  <td>{s.key}</td>
                  <td>{s.status}</td>
                  <td>{total?.pages ?? 0}</td>
                  <td>
                    {formatSize(total?.bytes ?? 0)}
                    {total?.limit_mib ? ` / ${formatSize(total.limit_mib * MEBIBYTE)}` : ''}
                  </td>
                  <td>{total?.last_activity ? dates.moment(total.last_activity) : ''}</td>
                  <td className="row-actions">
                    <button type="button" className="ghost" onClick={() => setLimiting(s)}>
                      {t('admin.storageLimit')}
                    </button>
                    <button type="button" className="ghost" onClick={() => setRecovering(s)}>
                      {t('admin.recover')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableBox>
      {limiting && (
        <StorageLimitDialog
          space={limiting}
          limitMiB={totalOf(limiting.id)?.limit_mib ?? 0}
          onClose={() => setLimiting(null)}
        />
      )}
      {recovering && <RecoverDialog space={recovering} onClose={() => setRecovering(null)} />}
    </>
  );
}

/** Spaces in the trash (ADM-075): each waits until its time is up, and can come back until then. */
export function SpacesTrashTab() {
  const { t } = useTranslation();
  const dates = useDates();
  const client = useQueryClient();
  const trashed = useQuery({
    queryKey: ['admin-trash'],
    queryFn: () => api.get<{ items: TrashItem[] }>('/admin/trash/spaces'),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['admin-trash'] });
    await client.invalidateQueries({ queryKey: ['admin-spaces'] });
  };
  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/trash/${id}/restore`),
    onSettled: refresh,
  });
  const purge = useMutation({ mutationFn: (id: string) => api.del(`/trash/${id}`), onSettled: refresh });
  if (trashed.error) return <ErrorNote error={trashed.error} />;
  if (!trashed.data) return <Loading />;
  return (
    <>
      <ErrorNote error={restore.error ?? purge.error} />
      <p className="warning-line">{t('admin.purgeWarning')}</p>
      <TableBox>
        <table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('admin.purgeAfter')}</th>
              <th>
                <span className="visually-hidden">{t('common.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {trashed.data.items.length === 0 && (
              <TableEmpty columns={TRASH_COLUMNS}>{t('admin.trashEmpty')}</TableEmpty>
            )}
            {trashed.data.items.map((i) => (
              <tr key={i.id}>
                <td>{i.title}</td>
                <td>{dates.moment(i.purge_after)}</td>
                <td className="row-actions">
                  <button type="button" className="ghost" onClick={() => restore.mutate(i.id)}>
                    {t('trash.restore')}
                  </button>
                  <ConfirmButton
                    label={t('trash.purge')}
                    message={t('trash.confirmPurge')}
                    className="danger"
                    onConfirm={() => purge.mutate(i.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
    </>
  );
}
