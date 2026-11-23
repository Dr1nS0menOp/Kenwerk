// SPDX-License-Identifier: Apache-2.0
// Security (spec 084, ACC-108): the password, two-step verification and passkeys, then the parts
// that lead on to Tokens and Sessions. A wrong password shows the server's own words, so nothing
// here tells a wrong password from a stopped one (spec 046, D4).
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Me } from '../api';
import { Link, useLocation } from '../router';
import { AccountSectionHead } from '../components/account-frame';
import { GuideLink } from '../components/guide-link';
import { Notice } from '../components/notice';
import { Dialog, ErrorNote, Field, NewPasswordField } from '../components/ui';
import { SIGN_IN_GUIDE, TOKENS_GUIDE } from './account-sections';

/** How the person signs in, as `GET /me/security` says. */
export interface SecuritySummary {
  has_password: boolean;
  totp_enabled: boolean;
  passkeys: number;
  source: string;
}

export const securityQuery = {
  queryKey: ['security'],
  queryFn: () => api.get<SecuritySummary>('/me/security'),
};

/** Whether an identity provider handles the account's password, second factor and address. */
export const isProviderAccount = (security: SecuritySummary) => security.source !== 'local';

interface Passkey {
  id: string;
  name: string;
  created_at: string;
}

/** A part of Security: a bold heading close to one sentence, its guide link, then the content. */
function Part({
  title,
  intro,
  guide,
  children,
}: {
  title: string;
  intro?: string;
  guide?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="account-part">
      <h2>{title}</h2>
      {intro && (
        <p className="muted">
          {intro}
          {guide && (
            <>
              {' '}
              <GuideLink path={guide}>{t('settingsSection.guide')}</GuideLink>
            </>
          )}
        </p>
      )}
      {children}
    </section>
  );
}

/** Changing the password is an action, not a setting: one primary button, no Reset (D20). */
function PasswordForm() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/me/password', { current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        change.mutate();
      }}
    >
      <ErrorNote error={change.error} />
      {change.isSuccess && <Notice kind="info">{t('profile.passwordChanged')}</Notice>}
      <Field label={t('profile.currentPassword')}>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <NewPasswordField label={t('profile.newPassword')} value={next} onChange={setNext} />
      <button type="submit" className="primary" disabled={change.isPending}>
        {t('profile.changePassword')}
      </button>
    </form>
  );
}

/** A session someone stole survives the removal of a factor, so this is offered then. */
function EndOtherSessionsOffer() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const end = useMutation({
    mutationFn: () => api.post('/me/sessions/end-others'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['sessions'] }),
  });
  if (end.isSuccess) return <Notice kind="info">{t('account.otherSessionsEnded')}</Notice>;
  return (
    <Notice
      kind="info"
      actions={
        <button type="button" onClick={() => end.mutate()}>
          {t('account.endOtherSessions')}
        </button>
      }
    >
      {t('account.endOtherSessionsHelp')}
      <ErrorNote error={end.error} />
    </Notice>
  );
}

function TOTPSetup({
  setup,
  onConfirm,
  busy,
}: {
  setup: { secret: string; qr_code: string };
  onConfirm: (code: string) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onConfirm(code);
      }}
    >
      <p>{t('profile.totpScan')}</p>
      <img src={setup.qr_code} alt={t('profile.totpScan')} width={240} height={240} />
      <p>
        {t('profile.totpSecret')} <code data-testid="totp-secret">{setup.secret}</code>
      </p>
      <Field label={t('profile.totpCode')}>
        <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required />
      </Field>
      <button type="submit" className="primary" disabled={busy}>
        {t('profile.totpConfirm')}
      </button>
    </form>
  );
}

function TwoStep({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ secret: string; qr_code: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['security'] });
    await client.invalidateQueries({ queryKey: ['me'] });
  };
  const begin = useMutation({
    mutationFn: () => api.post<{ secret: string; qr_code: string }>('/me/totp/begin', { password }),
    onSuccess: (s) => {
      setSetup(s);
      setPassword('');
    },
  });
  const confirm = useMutation({
    mutationFn: (code: string) => api.post<{ recovery_codes: string[] }>('/me/totp/confirm', { code }),
    onSuccess: async (r) => {
      setRecovery(r.recovery_codes);
      setSetup(null);
      await refresh();
    },
  });
  const disable = useMutation({
    mutationFn: () => api.post('/me/totp/disable', { password }),
    onSuccess: async () => {
      setPassword('');
      await refresh();
    },
  });
  return (
    <Part title={t('account.twoStep')} intro={t('account.twoStepIntro')} guide={SIGN_IN_GUIDE}>
      <p>{enabled ? t('profile.totpOn') : t('profile.totpOff')}</p>
      <ErrorNote error={begin.error ?? confirm.error ?? disable.error} />
      {disable.isSuccess && !enabled && <EndOtherSessionsOffer />}
      {!setup && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (enabled) disable.mutate();
            else begin.mutate();
          }}
        >
          <Field label={t('profile.currentPassword')}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <button type="submit">{enabled ? t('profile.totpDisable') : t('profile.totpStart')}</button>
        </form>
      )}
      {setup && (
        <TOTPSetup setup={setup} busy={confirm.isPending} onConfirm={(code) => confirm.mutate(code)} />
      )}
      {recovery && (
        <Dialog title={t('profile.recoveryTitle')} onClose={() => setRecovery(null)}>
          <p>{t('profile.recoveryHelp')}</p>
          <ul className="codes">
            {recovery.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </Part>
  );
}

function Passkeys() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => api.get<{ passkeys: Passkey[] }>('/me/passkeys'),
  });
  const [name, setName] = useState('');
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['passkeys'] });
    await client.invalidateQueries({ queryKey: ['security'] });
    await client.invalidateQueries({ queryKey: ['me'] });
  };
  const add = useMutation({
    mutationFn: async () => {
      const begin = await api.post<{
        options: { publicKey: PublicKeyCredentialCreationOptionsJSON };
        token: string;
      }>('/me/passkeys/begin');
      const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(begin.options.publicKey);
      const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
      if (!credential) throw new Error('no credential');
      await api.post('/me/passkeys/finish', { token: begin.token, name, response: credential.toJSON() });
    },
    onSuccess: async () => {
      setName('');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/me/passkeys/${id}`),
    onSettled: refresh,
  });
  return (
    <Part title={t('profile.passkeys')} intro={t('account.passkeysIntro')} guide={SIGN_IN_GUIDE}>
      <ErrorNote error={add.error ?? remove.error} />
      {remove.isSuccess && <EndOtherSessionsOffer />}
      {q.data?.passkeys.length === 0 && <p className="muted">{t('profile.passkeyNone')}</p>}
      <ul className="plain-list">
        {q.data?.passkeys.map((p) => (
          <li key={p.id} className="row">
            {p.name}
            <button type="button" className="ghost" onClick={() => remove.mutate(p.id)}>
              {t('common.remove')}
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label={t('profile.passkeyName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <button type="submit">{t('profile.passkeyAdd')}</button>
      </form>
    </Part>
  );
}

/** What a stronger sign-in matters for, and the welcome after the first setup, as notices. */
function SignInNotices({ me }: { me: Me }) {
  const { t } = useTranslation();
  // Right after the first setup: the new administrator's account reaches everything.
  const welcome = useLocation().searchParams.get('welcome') === '1';
  return (
    <>
      {welcome && <Notice kind="info">{t('setup.welcome')}</Notice>}
      {me.needs_second_factor && (
        <Notice kind="warning" title={t('account.secondFactorTitle')}>
          {t('account.secondFactorRequired')}
        </Notice>
      )}
      {!me.needs_second_factor && me.sign_in.weak && <Notice kind="info">{t('site.signInHelp')}</Notice>}
    </>
  );
}

export function SecurityView({ me }: { me: Me }) {
  const { t } = useTranslation();
  const security = useQuery(securityQuery);
  const summary = security.data;
  return (
    <AccountSectionHead id="security" notices={<SignInNotices me={me} />}>
      <ErrorNote error={security.error} />
      {summary && (
        <section className="account-part">
          <h2>{t('account.password')}</h2>
          {summary.has_password ? (
            <PasswordForm />
          ) : (
            <Notice kind="info">
              {isProviderAccount(summary) ? t('account.passwordAtProvider') : t('account.noPassword')}
            </Notice>
          )}
        </section>
      )}
      {summary?.has_password && <TwoStep enabled={summary.totp_enabled} />}
      <Passkeys />
      {/* The server refuses Tokens and Sessions until a second factor exists. */}
      {!me.needs_second_factor && (
        <>
          <Part title={t('account.tokensPart')} intro={t('account.tokensPartIntro')} guide={TOKENS_GUIDE}>
            <p>
              <Link href="/me/tokens">{t('account.manageTokens')}</Link>
            </p>
          </Part>
          <Part title={t('account.devicesPart')} intro={t('account.devicesPartIntro')} guide={SIGN_IN_GUIDE}>
            <p>
              <Link href="/me/sessions">{t('account.seeSessions')}</Link>
            </p>
          </Part>
        </>
      )}
    </AccountSectionHead>
  );
}
