// SPDX-License-Identifier: Apache-2.0
// Your account at one of its addresses (spec 084): the section of the registry, in its column.
import type { Me } from '../api';
import { AccountBar, AccountMain, AccountSectionHead } from '../components/account-frame';
import { PersonalDataView, TokensView } from './account';
import { EmailView } from './account-email';
import { ProfileView } from './account-profile';
import { SECURITY_SECTION, type AccountSection } from './account-sections';
import { SecurityView } from './account-security';
import { SessionsView } from './account-sessions';
import { NotificationSettingsView, WatchList } from './notifications';
import { PreferencesView } from './preferences';

function Section({ me, section }: { me: Me; section: AccountSection }) {
  switch (section.id) {
    case 'profile':
      return <ProfileView me={me} />;
    case 'email':
      return <EmailView me={me} />;
    case 'security':
      return <SecurityView me={me} />;
    case 'privacy':
      return <PersonalDataView />;
    case 'preferences':
      return <PreferencesView />;
    case 'notifications':
      return <NotificationSettingsView />;
    case 'watches':
      return (
        <AccountSectionHead id="watches">
          <WatchList />
        </AccountSectionHead>
      );
    case 'tokens':
      // The body of the Tokens screen is wave MC2's; this wave only gives it the frame.
      return (
        <AccountSectionHead id="tokens">
          <TokensView />
        </AccountSectionHead>
      );
    case 'sessions':
      return <SessionsView />;
  }
}

/** One section of Your account, in the column under the bar. */
export function AccountView({ me, section }: { me: Me; section: AccountSection }) {
  return (
    <AccountMain>
      <Section me={me} section={section} />
    </AccountMain>
  );
}

/**
 * While a second factor is required every address shows Security, in the bar without tabs or
 * account menu, because the server refuses every other route until a factor exists.
 */
export function SecondFactorAccount({ me }: { me: Me }) {
  return (
    <>
      <AccountBar me={me} current={SECURITY_SECTION} />
      <AccountView me={me} section={SECURITY_SECTION} />
    </>
  );
}
