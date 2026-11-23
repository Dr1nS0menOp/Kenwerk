// SPDX-License-Identifier: Apache-2.0
// Preferences (spec 084, ACC-025, NAV-161): choices that apply at once and say so, then the part
// that asks an administrator to remove the account (ACC-109).
import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Preferences } from '../api';
import { DATE_FORMATS } from '../dates';
import { usePreferences } from '../preferences';
import { AccountSectionHead } from '../components/account-frame';
import { Notice } from '../components/notice';
import { Switch } from '../components/switch';
import { useSaved } from '../components/toast';
import { ConfirmButton, ErrorNote, Field } from '../components/ui';

const THEMES = ['system', 'light', 'dark'];
const LANGUAGES = ['en'];
const FIRST_DAYS = [1, 0, 6];

type OnOff = keyof Pick<
  Preferences,
  'shortcuts' | 'contents' | 'hover_cards' | 'hide_follows' | 'show_presence' | 'typing_help'
>;

/** The choices that are on or off, with the words that explain one where it needs them. */
const SWITCHES: { key: OnOff; label: string; help?: string }[] = [
  { key: 'shortcuts', label: 'preferences.shortcuts', help: 'preferences.shortcutsHelp' },
  { key: 'contents', label: 'preferences.contents' },
  { key: 'hover_cards', label: 'preferences.hoverCards' },
  { key: 'hide_follows', label: 'preferences.hideFollows' },
  { key: 'show_presence', label: 'preferences.showPresence' },
  { key: 'typing_help', label: 'preferences.typingHelp', help: 'preferences.typingHelpHelp' },
];

/** Removal is an administrator's job; this part asks them, and says so (ACC-109, ACC-110). */
function RemovalPart() {
  const { t } = useTranslation();
  const removal = useMutation({ mutationFn: () => api.post('/me/removal-request') });
  return (
    <section className="account-part">
      <h2>{t('account.removalPart')}</h2>
      <ErrorNote error={removal.error} />
      {removal.isSuccess ? (
        <Notice kind="info">{t('account.removalSent')}</Notice>
      ) : (
        <Notice
          kind="info"
          actions={
            <ConfirmButton
              label={t('account.removal')}
              message={t('account.removalConfirm')}
              onConfirm={() => removal.mutate()}
            />
          }
        >
          {t('account.removalHelp')}
        </Notice>
      )}
    </section>
  );
}

/** Keeps its own state, so a click shows at once while the server answers. */
function PreferenceSwitch({
  value,
  onChange,
  children,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  const [checked, setChecked] = useState(value);
  const [stored, setStored] = useState(value);
  if (value !== stored) {
    setStored(value);
    setChecked(value);
  }
  return (
    <Switch
      checked={checked}
      onChange={(next) => {
        setChecked(next);
        onChange(next);
      }}
    >
      {children}
    </Switch>
  );
}

function Choices() {
  const { t } = useTranslation();
  const { preferences, update, error } = usePreferences();
  const saved = useSaved();
  const set = (change: Partial<Preferences>) => update(change, saved);
  return (
    <>
      <ErrorNote error={error} />
      <Field label={t('preferences.theme')}>
        <select value={preferences.theme} onChange={(e) => set({ theme: e.target.value })}>
          {THEMES.map((theme) => (
            <option key={theme} value={theme}>
              {t(`preferences.theme_${theme}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('preferences.language')}>
        <select value={preferences.language} onChange={(e) => set({ language: e.target.value })}>
          {LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {t(`preferences.language_${language}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('preferences.timeZone')}>
        <select value={preferences.time_zone} onChange={(e) => set({ time_zone: e.target.value })}>
          <option value="">{t('preferences.timeZoneDevice')}</option>
          {Intl.supportedValuesOf('timeZone').map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('preferences.dateFormat')}>
        <select value={preferences.date_format} onChange={(e) => set({ date_format: e.target.value })}>
          {DATE_FORMATS.map((format) => (
            <option key={format} value={format}>
              {t(`preferences.dateFormat_${format}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('preferences.firstDay')} help={t('preferences.firstDayHelp')}>
        <select value={preferences.first_day} onChange={(e) => set({ first_day: Number(e.target.value) })}>
          {FIRST_DAYS.map((day) => (
            <option key={day} value={day}>
              {t(`preferences.firstDay_${day}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('preferences.startScreen')}>
        <select
          value={preferences.start_screen ?? ''}
          onChange={(e) => set({ start_screen: e.target.value })}
        >
          <option value="">{t('preferences.start_company')}</option>
          <option value="personal">{t('preferences.start_personal')}</option>
        </select>
      </Field>
      <ul className="settings-card settings-card-rows switch-rows">
        {SWITCHES.map(({ key, label, help }) => (
          <li key={key} className={help ? 'settings-card-row with-help' : 'settings-card-row'}>
            <PreferenceSwitch value={preferences[key]} onChange={(on) => set({ [key]: on })}>
              {t(label)}
            </PreferenceSwitch>
            {help && <p className="muted">{t(help)}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function PreferencesView() {
  return (
    <AccountSectionHead id="preferences">
      <Choices />
      <RemovalPart />
    </AccountSectionHead>
  );
}
