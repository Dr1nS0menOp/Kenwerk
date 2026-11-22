// SPDX-License-Identifier: Apache-2.0
// What a person sees at the address of a page or space they may not see (spec 094, section 5).
// The space chose it: not found, no access, or no access with a way to ask. The screen names
// nothing of what was refused, and never changes the address (rule 25).
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { Link } from '../router';
import { ErrorNote } from './ui';

/** The refusal codes of spec 094, as the server sends them. */
type Refusal = 'no_access' | 'no_access_ask';

/** The refusal an error carries, when it is one a space chose rather than "not found". */
export function refusalOf(error: unknown): Refusal | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null;
  return error.code === 'no_access' || error.code === 'no_access_ask' ? error.code : null;
}

/** The screen for a page someone may not see, or for something that is not there. */
export function PageRefused({ pageId, error }: { pageId: string; error: unknown }) {
  const refusal = refusalOf(error);
  if (!refusal) {
    return (
      <main id="main" className="plain reading">
        <ErrorNote error={error} />
      </main>
    );
  }
  return <NoAccess what="page" pageId={refusal === 'no_access_ask' ? pageId : null} />;
}

/** The screen for a space someone may not see. Asking to enter a space is not built, so it never offers to ask (rule 27). */
export function SpaceRefused({ error }: { error: unknown }) {
  if (!refusalOf(error)) {
    return (
      <main id="main" className="plain reading">
        <ErrorNote error={error} />
      </main>
    );
  }
  return <NoAccess what="space" pageId={null} />;
}

/** Centred: a heading, a line, and the buttons (rule 30). With a page to ask for, asking is the main action. */
function NoAccess({ what, pageId }: { what: 'page' | 'space'; pageId: string | null }) {
  const { t } = useTranslation();
  const ask = useMutation({
    mutationFn: () => api.post(`/pages/${pageId}/access-requests`, { kind: 'view' }),
  });
  return (
    <main id="main" className="plain">
      <section className="no-access" aria-labelledby="no-access-title">
        <h1 id="no-access-title">{what === 'page' ? t('noAccess.pageTitle') : t('noAccess.spaceTitle')}</h1>
        <p>{pageId ? t('noAccess.askLine') : t('noAccess.line')}</p>
        <ErrorNote error={ask.error} />
        {ask.isSuccess && (
          <p role="status" className="note">
            {t('share.asked')}
          </p>
        )}
        <div className="no-access-actions">
          {pageId && !ask.isSuccess && (
            <button type="button" className="primary" disabled={ask.isPending} onClick={() => ask.mutate()}>
              {t('share.askForAccess')}
            </button>
          )}
          <Link href="/" className="button">
            {t('noAccess.toStart')}
          </Link>
        </div>
      </section>
    </main>
  );
}
