// SPDX-License-Identifier: Apache-2.0
// The strip above the row of tools (EDT-165, spec 082): what the page is at the start, and at
// the end what happens to it, with Publish as the one primary button and Close last.
import type { MouseEvent, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { pagePath } from '../addresses';
import type { PageDetail } from '../api';
import { Link } from '../router';
import { KindMark } from '../components/kind-mark';
import { IconInvite } from '../components/icons';
import { EditingTogether } from '../components/presence';
import { TogetherPeople, type LinkState, type Together } from '../components/editor/together';
import { PublicMark } from './exchange';

const INVITE_ICON_SIZE = 18;

/** Where the draft stands, in the muted words of the strip (PAG-012). */
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function SaveStatus({ state, together, link }: { state: SaveState; together: boolean; link: LinkState }) {
  const { t } = useTranslation();
  return (
    <span role="status" className="muted edit-status">
      {state === 'saving' && t('editor.saving')}
      {state === 'saved' && t('editor.saved')}
      {state === 'failed' && t('editor.saveFailed')}
      {together && t(`together.link_${link}`)}
    </span>
  );
}

export function EditStrip({
  page,
  title,
  emoji,
  changed,
  together,
  link,
  state,
  publishButton,
  onClose,
  onPublish,
  onInvite,
}: {
  page: PageDetail;
  /** The title as it is typed in the sheet. */
  title: string;
  emoji: string;
  /** Whether a published page has changes that are not published yet. */
  changed: boolean;
  together: Together | null;
  link: LinkState;
  state: SaveState;
  publishButton: Ref<HTMLButtonElement>;
  onClose: (e: MouseEvent) => void;
  onPublish: () => void;
  onInvite: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="edit-bar">
      <div className="edit-strip-start">
        <KindMark item={{ kind: page.kind, emoji }} />
        {/* The heading is the title field in the sheet; this repeats it for the eye. */}
        <span className="edit-title" aria-hidden="true">
          {title || t('editor.titlePlaceholder')}
        </span>
        {changed && <span className="lozenge">{t('editor.unpublishedChanges')}</span>}
        <PublicMark pageId={page.id} />
      </div>
      <div className="edit-strip-end">
        <SaveStatus state={state} together={!!together} link={link} />
        {together ? <TogetherPeople together={together} /> : <EditingTogether pageId={page.id} />}
        {together && (
          <button
            type="button"
            className="icon"
            aria-label={t('together.invite')}
            title={t('together.invite')}
            onClick={onInvite}
          >
            <IconInvite size={INVITE_ICON_SIZE} />
          </button>
        )}
        <button ref={publishButton} type="button" className="primary" onClick={onPublish}>
          {t('editor.publishStep')}
        </button>
        <Link className="button quiet edit-close" href={pagePath(page.id)} onClick={onClose}>
          {t('editor.close')}
        </Link>
      </div>
    </div>
  );
}
