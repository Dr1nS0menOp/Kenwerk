// SPDX-License-Identifier: Apache-2.0
// The security overview (spec 088, ADM-125 to ADM-128, ADM-191): the steps that make the
// installation safer, in groups, each with the state the server works out, and a link to the
// section where it is done. It only reads: nothing here changes the installation.
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { ErrorNote, Loading } from '../components/ui';
import { GuideLink } from '../components/guide-link';
import { IconFileText, IconHelp } from '../components/icons';
import { Notice } from '../components/notice';
import { Link } from '../router';
import { SecurityStep } from '../components/security-step';
import { Switch } from '../components/switch';
import { useListAddress } from '../components/list-address';
import {
  HIDE_DONE_PARAM,
  HIDE_DONE_VALUE,
  visibleGroups,
  type SecurityOverview,
} from './security-overview-model';

const CARD_ICON = 20;
/** What the operator's document of the overview is called below the documentation address. */
const OVERVIEW_DOC = 'operations/security-overview.md';

/** The cards under the steps (ADM-127): the audit log, and the documentation. */
function ShortcutCards() {
  const { t } = useTranslation();
  return (
    <div className="security-cards">
      <section className="security-card">
        <span className="security-card-icon">
          <IconFileText size={CARD_ICON} />
        </span>
        <h3>{t('securityOverview.cardAudit')}</h3>
        <p>{t('securityOverview.cardAuditText')}</p>
        <Link href="/admin/audit" className="button">
          {t('securityOverview.cardAuditOpen')}
        </Link>
      </section>
      <section className="security-card">
        <span className="security-card-icon">
          <IconHelp size={CARD_ICON} />
        </span>
        <h3>{t('securityOverview.cardGuide')}</h3>
        <p>{t('securityOverview.cardGuideText')}</p>
        <GuideLink path={OVERVIEW_DOC}>{t('securityOverview.cardGuideOpen')}</GuideLink>
      </section>
    </div>
  );
}

export function SecurityOverviewTab() {
  const { t } = useTranslation();
  const { params, set } = useListAddress();
  const hideDone = params.get(HIDE_DONE_PARAM) === HIDE_DONE_VALUE;
  const q = useQuery({
    queryKey: ['security-overview'],
    queryFn: () => api.get<SecurityOverview>('/admin/security-overview'),
  });
  // The part is off: say so and where it is turned on, rather than that the page does not exist.
  if (q.error instanceof ApiError && q.error.code === 'experimental_off') {
    return <Notice kind="info">{t('securityOverview.off')}</Notice>;
  }
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const groups = visibleGroups(q.data.groups, hideDone);
  return (
    <>
      <div className="security-steps-head">
        <h2>{t('securityOverview.steps')}</h2>
        <Switch checked={hideDone} onChange={(on) => set(HIDE_DONE_PARAM, on ? HIDE_DONE_VALUE : '')}>
          {t('securityOverview.hideDone')}
        </Switch>
      </div>
      {groups.length === 0 && <p className="muted">{t('securityOverview.allDone')}</p>}
      {groups.map((group) => (
        <section key={group.id} className="security-group" aria-labelledby={`security-group-${group.id}`}>
          <h3 id={`security-group-${group.id}`}>{t(`securityOverview.group_${group.id}`)}</h3>
          <ul className="security-steps">
            {group.steps.map((step) => (
              <li key={step.id}>
                <SecurityStep step={step} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ShortcutCards />
    </>
  );
}
