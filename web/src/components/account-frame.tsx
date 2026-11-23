// SPDX-License-Identifier: Apache-2.0
// The frame of Your account (spec 084, ACC-102 to ACC-104, D2): a bar of its own in place of the
// top bar, with the logo, the words Your account, the tabs, help and the account menu; under it
// one centred column of reading width, with no sidebar, breadcrumbs, back link or save bar.
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Me } from '../api';
import { appearanceQuery } from '../appearance';
import { Link } from '../router';
import {
  ACCOUNT_SECTIONS,
  accountIntroKey,
  accountNameKey,
  selectedTab,
  tabsOffered,
  type AccountSection,
  type AccountSectionId,
} from '../views/account-sections';
import { Logo } from './icons';
import { SettingsSection } from './settings-section';
import { AccountMenu, HelpMenu } from './topbar';

/** The instance's own logo when an administrator set one, or ours. */
export function BrandMark() {
  const logo = useQuery(appearanceQuery).data?.logo;
  return logo ? <img src={logo} alt="" className="brand-logo" /> : <Logo />;
}

function AccountTabs({
  current,
  needsSecondFactor,
}: {
  current: AccountSection;
  needsSecondFactor: boolean;
}) {
  const { t } = useTranslation();
  const row = useRef<HTMLElement>(null);
  const selected = selectedTab(current);
  // On a narrow screen the row scrolls sideways; the selected tab is brought into view once.
  useEffect(() => {
    row.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, []);
  const tabs = tabsOffered(needsSecondFactor);
  if (tabs.length === 0) return null;
  return (
    <nav ref={row} className="account-tabs" aria-label={t('account.sections')}>
      {tabs.map((section) => (
        <Link
          key={section.id}
          href={section.address}
          aria-current={section.id === selected ? 'page' : undefined}
        >
          {t(accountNameKey(section.id))}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The bar of Your account. Without `onLogout` it has no account menu: while a second factor is
 * required every entry of that menu would lead to a route the server refuses.
 */
export function AccountBar({
  me,
  current,
  onLogout,
}: {
  me: Me;
  current: AccountSection;
  onLogout?: () => void;
}) {
  const { t } = useTranslation();
  const instance = useQuery(appearanceQuery).data?.name || t('app.name');
  return (
    <header className="account-bar">
      <div className="account-bar-start">
        <Link href="/" className="brand" aria-label={instance}>
          <BrandMark />
        </Link>
        <span className="account-bar-title">{t('profile.title')}</span>
      </div>
      <AccountTabs current={current} needsSecondFactor={me.needs_second_factor} />
      <div className="account-bar-end">
        <HelpMenu />
        {onLogout && <AccountMenu me={me} onLogout={onLogout} />}
      </div>
    </header>
  );
}

/** The one centred column under the bar; the page scrolls as a whole (ACC-104). */
export function AccountMain({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="account-main">
      <div className="column settings-area centred">{children}</div>
    </main>
  );
}

/** The head of a section of Your account: its name, one sentence, a guide link, notices. */
export function AccountSectionHead({
  id,
  notices,
  children,
}: {
  id: AccountSectionId;
  notices?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const doc = ACCOUNT_SECTIONS.find((section) => section.id === id)?.doc;
  return (
    <SettingsSection title={t(accountNameKey(id))} intro={t(accountIntroKey(id))} doc={doc} notices={notices}>
      {children}
    </SettingsSection>
  );
}
