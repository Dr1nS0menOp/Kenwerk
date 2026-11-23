// SPDX-License-Identifier: Apache-2.0
// Every file of a space in one list (FIL-010). The server leaves out what the reader
// may not see, so nothing here decides about access.
import { pagePath } from '../addresses';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Space } from '../api';
import { Link } from '../router';
import { Frame, spaceByKeyQuery } from '../components/frame';
import { ConfirmButton, ErrorNote, formatSize, Loading } from '../components/ui';
import { useDates } from '../dates';
import { pageTitle } from '../page-name';
import { ToolRow, type ToolFilter } from '../components/tool-row';
import { choiceFilter } from '../components/tool-row-model';
import { queryOf, useListAddress } from '../components/list-address';
import { IconPage, IconPerson, IconStatus } from '../components/icons';

const FILES_PAGE_SIZE = 50;
const FILE_KINDS = ['image', 'media', 'pdf', 'text', 'office', 'other'] as const;

interface SpaceFile {
  id: string;
  filename: string;
  size: number;
  page_id: string;
  page_title: string;
  uploader: string;
  updated_at: string;
  labels: string[];
}

interface Usage {
  bytes: number;
  limit_bytes: number;
  largest: SpaceFile[];
}

interface FileChoices {
  labels: string[];
  uploaders: { id: string; name: string }[];
}

/** The parameters of GET /spaces/{id}/files that the list sends, as the address holds them (spec 100). */
const FILE_PARAMS = ['q', 'kind', 'label', 'uploader'];
const FILTER_ICON = 16;

function FileTable({
  files,
  picked,
  onPick,
}: {
  files: SpaceFile[];
  /** Only someone who may delete in bulk gets boxes to tick. */
  picked?: string[];
  onPick?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const dates = useDates();
  return (
    <div className="block-frame">
      <table className="file-table">
        <thead>
          <tr>
            {picked && <th>{t('files.pick')}</th>}
            <th>{t('files.name')}</th>
            <th>{t('files.page')}</th>
            <th>{t('files.size')}</th>
            <th>{t('files.uploader')}</th>
            <th>{t('files.changed')}</th>
            <th>{t('files.labels')}</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              {picked && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('files.pickFile', { name: file.filename })}
                    checked={picked.includes(file.id)}
                    onChange={() => onPick?.(file.id)}
                  />
                </td>
              )}
              <td>
                <a href={`/api/v1/attachments/${file.id}/content?download=1`}>{file.filename}</a>
              </td>
              <td>
                <Link href={pagePath(file.page_id)}>{pageTitle(t, file.page_title)}</Link>
              </td>
              <td>{formatSize(file.size)}</td>
              <td>{file.uploader}</td>
              <td>{dates.day(file.updated_at)}</td>
              <td>{file.labels.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SpaceUsage({ space }: { space: Space }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['file-usage', space.id],
    queryFn: () => api.get<Usage>(`/spaces/${space.id}/files/usage`),
  });
  return (
    <section aria-label={t('files.usage')}>
      <ErrorNote error={q.error} />
      {q.data && (
        <>
          <p>
            {q.data.limit_bytes > 0
              ? t('files.totalOfLimit', {
                  size: formatSize(q.data.bytes),
                  limit: formatSize(q.data.limit_bytes),
                })
              : t('files.total', { size: formatSize(q.data.bytes) })}
          </p>
          {q.data.largest.length > 0 && (
            <>
              <h2>{t('files.largest')}</h2>
              <FileTable files={q.data.largest} />
            </>
          )}
        </>
      )}
    </section>
  );
}

/** The choices come from the server, so they hold nothing from a page this person cannot see. */
function useFileFilters(space: Space): { filters: ToolFilter[]; error: unknown } {
  const { t } = useTranslation();
  const choices = useQuery({
    queryKey: ['file-choices', space.id],
    queryFn: () => api.get<FileChoices>(`/spaces/${space.id}/files/filters`),
  });
  const filters: ToolFilter[] = [
    choiceFilter({
      param: 'kind',
      label: t('files.filterKind'),
      icon: <IconPage size={FILTER_ICON} />,
      place: 'row',
      values: FILE_KINDS,
      name: (kind) => t(`files.kind_${kind}`),
    }),
    choiceFilter({
      param: 'label',
      label: t('files.filterLabel'),
      icon: <IconStatus size={FILTER_ICON} />,
      place: 'row',
      values: choices.data?.labels ?? [],
      name: (label) => label,
    }),
    {
      kind: 'choice',
      param: 'uploader',
      label: t('files.filterPerson'),
      icon: <IconPerson size={FILTER_ICON} />,
      place: 'row',
      options: choices.data?.uploaders.map((p) => ({ value: p.id, label: p.name })) ?? [],
    },
  ];
  return { filters, error: choices.error };
}

function BulkDelete({ space, picked, onDone }: { space: Space; picked: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      api.post<{ deleted: number; skipped: number }>(`/spaces/${space.id}/files/delete`, { ids: picked }),
    onSuccess: onDone,
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ['space-files', space.id] });
      await client.invalidateQueries({ queryKey: ['file-usage', space.id] });
    },
  });
  return (
    <>
      <ErrorNote error={remove.error} />
      {remove.data && (
        <p role="status" className="note">
          {t('files.deleted', { count: remove.data.deleted })}{' '}
          {remove.data.skipped > 0 && t('files.skipped', { count: remove.data.skipped })}
        </p>
      )}
      {picked.length > 0 && (
        <ConfirmButton
          label={t('files.deletePicked', { count: picked.length })}
          message={t('files.confirmDeletePicked', { count: picked.length })}
          className="danger"
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  );
}

export function FileList({ space }: { space: Space }) {
  const { t } = useTranslation();
  const { params } = useListAddress();
  const { filters, error } = useFileFilters(space);
  const [picked, setPicked] = useState<string[]>([]);
  const query = queryOf(params, FILE_PARAMS);
  const q = useInfiniteQuery({
    queryKey: ['space-files', space.id, query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<{ files: SpaceFile[] }>(`/spaces/${space.id}/files?${query}&offset=${pageParam}`),
    getNextPageParam: (last, pages) =>
      last.files.length === FILES_PAGE_SIZE ? pages.length * FILES_PAGE_SIZE : undefined,
  });
  const files = q.data?.pages.flatMap((page) => page.files) ?? [];
  const canDelete = space.can?.['space.administer'] ?? false;
  const pick = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  return (
    <>
      <ToolRow
        label={t('files.find')}
        search={{ label: t('files.search'), placeholder: t('files.search') }}
        filters={filters}
      />
      <ErrorNote error={error} />
      {canDelete && <BulkDelete space={space} picked={picked} onDone={() => setPicked([])} />}
      {q.isPending && <Loading />}
      <ErrorNote error={q.error} />
      {q.data && files.length === 0 && <p className="muted">{t('files.none')}</p>}
      {files.length > 0 && <FileTable files={files} picked={canDelete ? picked : undefined} onPick={pick} />}
      {q.hasNextPage && (
        <button type="button" onClick={() => void q.fetchNextPage()}>
          {t('files.more')}
        </button>
      )}
    </>
  );
}

export function FilesView({ spaceKey }: { spaceKey: string }) {
  const { t } = useTranslation();
  const q = useQuery(spaceByKeyQuery(spaceKey));
  const space = q.data;
  if (q.error) {
    return (
      <main id="main" className="plain reading">
        <ErrorNote error={q.error} />
      </main>
    );
  }
  if (!space) return <Loading />;
  return (
    <Frame space={space}>
      <h1>{t('files.title')}</h1>
      <FileList space={space} />
      {space.can?.['space.administer'] && <SpaceUsage space={space} />}
    </Frame>
  );
}
