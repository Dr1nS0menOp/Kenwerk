// SPDX-License-Identifier: Apache-2.0
// E-mail (spec 084, ACC-112, ACC-113, D5): the address of the account and how the person signs
// in. No address of an account can be changed here yet, and the section says who changes it.
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Me } from '../api';
import { Link } from '../router';
import { AccountSectionHead } from '../components/account-frame';
import { IconKey } from '../components/icons';
import { Notice } from '../components/notice';
import { ErrorNote } from '../components/ui';
import { isProviderAccount, securityQuery, type SecuritySummary } from './account-security';

const ICON_SIZE = 16;

/** The words for how the person signs in, from what `GET /me/security` says. */
export function signInWay(
  security: SecuritySummary,
): 'provider' | 'passwordTotp' | 'passwordPasskeys' | 'password' | 'passkeys' {
  if (isProviderAccount(security)) return 'provider';
  if (!security.has_password) return 'passkeys';
  if (security.totp_enabled) return 'passwordTotp';
  return security.passkeys > 0 ? 'passwordPasskeys' : 'password';
}

export function EmailView({ me }: { me: Me }) {
  const { t } = useTranslation();
  const security = useQuery(securityQuery);
  const summary = security.data;
  return (
    <AccountSectionHead id="email">
      <section className="account-part">
        <h2>{t('account.emailAddress')}</h2>
        <p>
          {t('account.emailIs')} <strong>{me.user.email}</strong>
        </p>
        <ErrorNote error={security.error} />
        {summary && (
          <>
            <p className="account-sign-in">
              <IconKey size={ICON_SIZE} /> {t(`account.signIn_${signInWay(summary)}`)}
            </p>
            <Notice kind="info">
              {isProviderAccount(summary) ? t('account.emailAtProvider') : t('account.emailFixed')}
            </Notice>
          </>
        )}
      </section>
      <section className="account-part">
        <h2>{t('account.emailFromUs')}</h2>
        <p className="muted">{t('account.emailFromUsHelp')}</p>
        <p>
          <Link href="/me/notifications">{t('account.toNotifications')}</Link>
        </p>
      </section>
    </AccountSectionHead>
  );
}
