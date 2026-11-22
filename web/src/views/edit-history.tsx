// SPDX-License-Identifier: Apache-2.0
// History beside the draft (EDT-172, spec 082 behaviour 42 and 43): the published versions in
// a panel at the end side, one of them, or two compared, and a way to put one into the draft.
// The draft stays open and editable beside it; nothing is asked of the server until it opens.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { api, type Json, type Version } from '../api';
import { DocumentView } from '../components/editor/editor';
import { endUndoStep } from '../components/editor/together';
import { IconClose } from '../components/icons';
import { ErrorNote, Loading } from '../components/ui';
import { useDates } from '../dates';
import { pageTitle } from '../page-name';
import { Changes, comparisonQuery } from './history';

/**
 * Replaces the text of the draft with a version's, as one step for Undo of its own, in the
 * history of the page and on a shared document alike.
 */
export function restoreText(editor: Editor, document: Json) {
  endUndoStep(editor.state);
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      closeHistory(tr);
      return true;
    })
    .setContent(document)
    .run();
  endUndoStep(editor.state);
}

type Shown =
  { kind: 'list' } | { kind: 'version'; number: number } | { kind: 'compare'; from: number; to: number };

/** Two chosen at most: a third choice lets go of the oldest one. */
export function pickVersion(picked: number[], number: number): number[] {
  if (picked.includes(number)) return picked.filter((n) => n !== number);
  return [...picked.slice(-1), number];
}

function VersionList({
  pageId,
  onShow,
  onCompare,
}: {
  pageId: string;
  onShow: (number: number) => void;
  onCompare: (from: number, to: number) => void;
}) {
  const { t } = useTranslation();
  const dates = useDates();
  const [picked, setPicked] = useState<number[]>([]);
  const q = useQuery({
    queryKey: ['versions', pageId],
    queryFn: () => api.get<{ versions: Version[] }>(`/pages/${pageId}/versions`),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const versions = q.data.versions.filter((v) => !v.removed);
  if (versions.length === 0) return <p className="muted">{t('editor.historyEmpty')}</p>;
  const pair = [...picked].sort((a, b) => a - b);
  return (
    <>
      <p className="muted">{t('editor.historyPick')}</p>
      <ul className="history-list">
        {versions.map((v) => (
          <li key={v.number}>
            {versions.length > 1 && (
              <input
                type="checkbox"
                aria-label={t('history.version', { number: v.number })}
                checked={picked.includes(v.number)}
                onChange={() => setPicked((p) => pickVersion(p, v.number))}
              />
            )}
            <button type="button" className="ghost history-entry" onClick={() => onShow(v.number)}>
              <strong>{t('history.version', { number: v.number })}</strong>
              <span className="muted">
                {t('history.by', { name: v.author_name || t('history.bySystem') })} ·{' '}
                {dates.moment(v.created_at)}
              </span>
              {v.summary && <span>{v.summary}</span>}
            </button>
          </li>
        ))}
      </ul>
      {pair.length === 2 && (
        <button type="button" onClick={() => onCompare(pair[0] ?? 0, pair[1] ?? 0)}>
          {t('editor.historyCompare')}
        </button>
      )}
    </>
  );
}

function OneVersion({
  pageId,
  number,
  onRestore,
}: {
  pageId: string;
  number: number;
  onRestore: (version: Version) => void;
}) {
  const { t } = useTranslation();
  const dates = useDates();
  const q = useQuery({
    queryKey: ['version', pageId, number],
    queryFn: () => api.get<Version>(`/pages/${pageId}/versions/${number}`),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const version = q.data;
  return (
    <>
      <p className="muted">
        {t('history.oldVersion', {
          number: version.number,
          name: version.author_name || t('history.bySystem'),
          date: dates.moment(version.created_at),
        })}
      </p>
      <div className="dialog-actions">
        <button type="button" className="primary" onClick={() => onRestore(version)}>
          {t('editor.historyRestore')}
        </button>
      </div>
      <h3>{pageTitle(t, version.title)}</h3>
      {version.document && <DocumentView document={version.document} plain />}
    </>
  );
}

function TwoVersions({ pageId, from, to }: { pageId: string; from: number; to: number }) {
  const { t } = useTranslation();
  const q = useQuery(comparisonQuery(pageId, from, to));
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  return (
    <>
      <p className="muted">{t('history.comparing', { from, to })}</p>
      <Changes comparison={q.data} />
    </>
  );
}

export function EditHistoryPanel({
  pageId,
  onRestore,
  onClose,
}: {
  pageId: string;
  onRestore: (version: Version) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const [shown, setShown] = useState<Shown>({ kind: 'list' });

  useEffect(() => {
    const opener = document.activeElement;
    heading.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Only inside the panel: in the text, Escape belongs to the editor (it goes to the row).
  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (shown.kind === 'list') onClose();
    else setShown({ kind: 'list' });
  };

  return createPortal(
    <aside className="details-panel history-panel" aria-labelledby="edit-history-title" onKeyDown={keys}>
      <header className="dialog-head">
        <h2 id="edit-history-title" ref={heading} tabIndex={-1}>
          {t('editor.history')}
        </h2>
        <button
          type="button"
          className="icon"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={onClose}
        >
          <IconClose />
        </button>
      </header>
      <section aria-label={t('editor.historyPanel')}>
        {shown.kind !== 'list' && (
          <p>
            <button type="button" className="ghost" onClick={() => setShown({ kind: 'list' })}>
              {t('editor.historyBack')}
            </button>
          </p>
        )}
        {shown.kind === 'list' && (
          <VersionList
            pageId={pageId}
            onShow={(number) => setShown({ kind: 'version', number })}
            onCompare={(from, to) => setShown({ kind: 'compare', from, to })}
          />
        )}
        {shown.kind === 'version' && (
          <OneVersion pageId={pageId} number={shown.number} onRestore={onRestore} />
        )}
        {shown.kind === 'compare' && <TwoVersions pageId={pageId} from={shown.from} to={shown.to} />}
      </section>
    </aside>,
    document.body,
  );
}
