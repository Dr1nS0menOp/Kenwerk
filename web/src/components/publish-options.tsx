// SPDX-License-Identifier: Apache-2.0
// The step that Publish opens: what changed, the publish options and Discard draft (EDT-166,
// spec 082). Ctrl Enter in the text skips it and publishes with the choices as they stand.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type Json, type PageDetail, type Stage } from '../api';
import { DocumentView } from './editor/editor';
import { ConfirmDialog, Dialog, ErrorNote, Field } from './ui';

const SUMMARY_MAX = 500;

/** What the step remembers while the editor is open, so a second Publish shows it again. */
export interface PublishChoices {
  summary: string;
  silent: boolean;
  stage: Stage | null;
  /** A moment in the form of a datetime-local field; empty publishes now. */
  at: string;
}

export const NO_CHOICES: PublishChoices = { summary: '', silent: false, stage: null, at: '' };

interface DocNode {
  type?: string;
  content?: DocNode[];
}

/** What a reader will see: instruction text is left out. */
export function forReaders(document: Json): Json {
  const strip = (node: DocNode): DocNode => ({
    ...node,
    ...(node.content ? { content: node.content.filter((c) => c.type !== 'instruction').map(strip) } : {}),
  });
  return strip(document as DocNode) as Json;
}

export function PreviewDialog({ document, onClose }: { document: Json; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog title={t('organise.preview')} onClose={onClose} wide>
      <DocumentView document={forReaders(document)} plain />
    </Dialog>
  );
}

/** How the draft can be thrown away from the step; absent while editing together. */
export type DiscardOffer = { kind: 'discard' } | { kind: 'revert' } | { kind: 'none' };

function DiscardButton({ offer, onDiscard }: { offer: DiscardOffer; onDiscard: () => void }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  if (offer.kind === 'none') return null;
  const label = offer.kind === 'revert' ? t('editor.revert') : t('editor.discard');
  const message = offer.kind === 'revert' ? t('editor.confirmRevert') : t('editor.confirmDiscard');
  return (
    <>
      <button type="button" className="danger publish-step-discard" onClick={() => setAsking(true)}>
        {label}
      </button>
      {asking && (
        <ConfirmDialog
          title={label}
          message={message}
          confirmLabel={label}
          onConfirm={onDiscard}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}

function StageChoice({
  page,
  choices,
  onChange,
}: {
  page: PageDetail;
  choices: PublishChoices;
  onChange: (next: PublishChoices) => void;
}) {
  const { t } = useTranslation();
  const statuses = useQuery({
    queryKey: ['statuses', page.space_id],
    queryFn: () => api.get<{ statuses: Stage[]; free: boolean }>(`/spaces/${page.space_id}/statuses`),
  });
  return (
    <Field label={t('organise.status')}>
      <select
        value={choices.stage?.text ?? ''}
        onChange={(e) =>
          onChange({
            ...choices,
            stage: statuses.data?.statuses.find((s) => s.text === e.target.value) ?? null,
          })
        }
      >
        <option value="">{t('organise.keepStatus')}</option>
        {statuses.data?.statuses.map((s) => (
          <option key={s.text} value={s.text}>
            {s.text}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * The publish step: the summary first, then the options of PAG-024, then the actions, with
 * Discard draft apart at the start side. Its primary button reads Schedule while a date is set.
 */
export function PublishStep({
  page,
  choices,
  onChange,
  discard,
  scheduled,
  onPublish,
  onDiscard,
  onCancelSchedule,
  onPreview,
  onMove,
  onClose,
}: {
  page: PageDetail;
  choices: PublishChoices;
  onChange: (next: PublishChoices) => void;
  discard: DiscardOffer;
  /** Whether a publish at a date is waiting, which the step can cancel. */
  scheduled: boolean;
  /** Publishes, or schedules while a date is set; the step closes first, so errors show in the strip. */
  onPublish: () => void;
  onDiscard: () => void;
  onCancelSchedule: () => Promise<void>;
  onPreview: () => void;
  onMove: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const summary = useRef<HTMLInputElement>(null);
  // The dialog moves the focus to its first control when it opens; the summary comes first.
  useEffect(() => summary.current?.focus(), []);
  const cancel = useMutation({ mutationFn: onCancelSchedule });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onPublish();
  };
  return (
    <Dialog title={t('editor.publish')} onClose={onClose}>
      <form className="publish-step" onSubmit={submit}>
        <ErrorNote error={cancel.error} />
        <Field label={t('editor.summary')}>
          <input
            ref={summary}
            value={choices.summary}
            maxLength={SUMMARY_MAX}
            onChange={(e) => onChange({ ...choices, summary: e.target.value })}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={!choices.silent}
            onChange={(e) => onChange({ ...choices, silent: !e.target.checked })}
          />
          {t('organise.notifyWatchers')}
        </label>
        <StageChoice page={page} choices={choices} onChange={onChange} />
        <Field label={t('organise.publishAt')} help={t('organise.publishAtHelp')}>
          <input
            type="datetime-local"
            value={choices.at}
            onChange={(e) => onChange({ ...choices, at: e.target.value })}
          />
        </Field>
        <div className="row">
          <button type="button" onClick={onPreview}>
            {t('organise.preview')}
          </button>
          <button type="button" onClick={onMove}>
            {t('organise.location')}
          </button>
          {scheduled && (
            <button
              type="button"
              className="quiet"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {t('organise.cancelSchedule')}
            </button>
          )}
        </div>
        <div className="dialog-actions">
          <DiscardButton offer={discard} onDiscard={onDiscard} />
          <button type="button" className="quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="primary">
            {choices.at ? t('organise.schedule') : t('editor.publish')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
