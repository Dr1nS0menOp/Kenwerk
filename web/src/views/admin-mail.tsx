// SPDX-License-Identifier: Apache-2.0
// The mail server of Administration, Mail (spec 098): set by a system administrator with a
// second factor, shown read-only while the environment holds it, and tested with a mail that
// says what the server answered.
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { ErrorNote, Field, Loading } from '../components/ui';
import { Notice } from '../components/notice';
import { differs, SaveReset } from '../components/save-reset';
import { ConfirmFields, type Confirmation } from '../components/confirm-change';

type Encryption = 'starttls' | 'implicit' | 'none';
const ENCRYPTIONS: Encryption[] = ['starttls', 'implicit', 'none'];

/** What a change does with the stored password; only `set` carries a value. */
type PasswordChange = { action: 'keep' } | { action: 'remove' } | { action: 'set'; value: string };

interface ServerFields {
  host: string;
  port: number;
  tls: Encryption;
  username: string;
  from_address: string;
  from_name: string;
  reply_to: string;
}

/** The server in force, as `GET /admin/mail/server` gives it: never its password. */
interface MailServerView extends ServerFields {
  password_set: boolean;
  source: 'database' | 'environment' | 'none';
  locked: { setting: string; source: string } | null;
  updated_at: string | null;
}

interface ServerForm extends ServerFields {
  password: PasswordChange;
}

type TestStep = 'compose' | 'connect' | 'tls' | 'login' | 'sender' | 'recipient' | 'message';

type TestResult =
  { delivered: true; to: string } | { delivered: false; to: string; step: TestStep; error: string };

const SERVER_KEY = ['mail-server'];

const fieldsOf = (v: MailServerView): ServerForm => ({
  host: v.host,
  port: v.port,
  tls: v.tls,
  username: v.username,
  from_address: v.from_address,
  from_name: v.from_name,
  reply_to: v.reply_to,
  password: { action: 'keep' },
});

/** The choice beside the password: keep what is stored, set a new one, or remove it. */
function PasswordField({
  isSet,
  value,
  disabled,
  onChange,
}: {
  isSet: boolean;
  value: PasswordChange;
  disabled: boolean;
  onChange: (next: PasswordChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Field
        label={t('mailServer.password')}
        help={isSet ? t('mailServer.passwordSet') : t('mailServer.passwordNotSet')}
      >
        <select
          value={value.action}
          disabled={disabled}
          onChange={(e) => {
            const action = e.target.value;
            onChange(
              action === 'set'
                ? { action, value: '' }
                : action === 'remove'
                  ? { action }
                  : { action: 'keep' },
            );
          }}
        >
          <option value="keep">{isSet ? t('mailServer.passwordKeep') : t('mailServer.passwordNone')}</option>
          <option value="set">{t('mailServer.passwordChange')}</option>
          {isSet && <option value="remove">{t('mailServer.passwordRemove')}</option>}
        </select>
      </Field>
      {value.action === 'set' && (
        <Field label={t('mailServer.newPassword')}>
          <input
            type="password"
            autoComplete="new-password"
            value={value.value}
            onChange={(e) => onChange({ action: 'set', value: e.target.value })}
          />
        </Field>
      )}
    </>
  );
}

/** Sends a test mail now, with the server that is saved, and shows what came back. */
function MailTest({ ready }: { ready: boolean }) {
  const { t } = useTranslation();
  const test = useMutation({ mutationFn: () => api.post<TestResult>('/admin/mail/test') });
  const result = test.data;
  return (
    <section className="settings-unit">
      <h2>{t('mailServer.testTitle')}</h2>
      <p className="muted">{t('mailServer.testIntro')}</p>
      <ErrorNote error={test.error} />
      {result?.delivered === true && (
        <Notice kind="info">{t('mailServer.testSent', { to: result.to })}</Notice>
      )}
      {result?.delivered === false && (
        <Notice kind="error" title={t(`mailServer.step_${result.step}`)}>
          {result.error}
        </Notice>
      )}
      <p>
        <button type="button" disabled={!ready || test.isPending} onClick={() => test.mutate()}>
          {t('mailServer.testButton')}
        </button>
      </p>
      {!ready && <p className="muted">{t('mailServer.testWhenSaved')}</p>}
    </section>
  );
}

/** The mail server and its test, first in the Mail section. */
export function MailServerPart({ isSystem }: { isSystem: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const q = useQuery({ queryKey: SERVER_KEY, queryFn: () => api.get<MailServerView>('/admin/mail/server') });
  const [changes, setChanges] = useState<Partial<ServerForm>>({});
  const [confirm, setConfirm] = useState<Confirmation>({ code: '', reason: '' });
  const save = useMutation({
    mutationFn: (form: ServerForm) =>
      api.put<MailServerView>('/admin/mail/server', { ...form, code: confirm.code.trim() }),
    onSuccess: async () => {
      setChanges({});
      setConfirm({ code: '', reason: '' });
      await client.invalidateQueries({ queryKey: SERVER_KEY });
      await client.invalidateQueries({ queryKey: ['mail-queue'] });
    },
  });
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const view = q.data;
  const stored = fieldsOf(view);
  const form: ServerForm = { ...stored, ...changes };
  const changed = differs(stored, form);
  const readOnly = !isSystem || view.locked !== null;
  const set = (change: Partial<ServerForm>) => setChanges({ ...changes, ...change });
  const reset = () => {
    setChanges({});
    setConfirm({ code: '', reason: '' });
    save.reset();
  };
  return (
    <>
      <section className="settings-unit">
        <h2>{t('mailServer.title')}</h2>
        {view.locked && (
          <Notice kind="warning" title={t('mailServer.lockedTitle')}>
            {t('mailServer.locked', { setting: view.locked.setting, source: view.locked.source })}
          </Notice>
        )}
        {!view.locked && !isSystem && <Notice kind="info">{t('mailServer.onlySystem')}</Notice>}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <ErrorNote error={save.error} />
          {save.isSuccess && <Notice kind="info">{t('admin.saved')}</Notice>}
          <fieldset className="plain-fieldset" disabled={readOnly}>
            <Field label={t('mailServer.host')} help={t('mailServer.hostHelp')}>
              <input value={form.host} onChange={(e) => set({ host: e.target.value })} autoComplete="off" />
            </Field>
            <Field label={t('mailServer.port')}>
              <input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => set({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('mailServer.encryption')}>
              <select value={form.tls} onChange={(e) => set({ tls: e.target.value as Encryption })}>
                {ENCRYPTIONS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`mailServer.tls_${kind}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('mailServer.username')} help={t('mailServer.usernameHelp')}>
              <input
                value={form.username}
                onChange={(e) => set({ username: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <PasswordField
              isSet={view.password_set}
              value={form.password}
              disabled={readOnly}
              onChange={(password) => set({ password })}
            />
            <Field label={t('mailServer.fromAddress')}>
              <input
                type="email"
                value={form.from_address}
                onChange={(e) => set({ from_address: e.target.value })}
              />
            </Field>
            <Field label={t('mailServer.fromName')}>
              <input value={form.from_name} onChange={(e) => set({ from_name: e.target.value })} />
            </Field>
            <Field label={t('mailServer.replyTo')}>
              <input type="email" value={form.reply_to} onChange={(e) => set({ reply_to: e.target.value })} />
            </Field>
          </fieldset>
          {!readOnly && changed && (
            <ConfirmFields value={confirm} onChange={setConfirm} note={t('mailServer.confirmNote')} />
          )}
          {!readOnly && <SaveReset changed={changed} busy={save.isPending} onReset={reset} />}
        </form>
      </section>
      <MailTest ready={view.source !== 'none' && !changed} />
    </>
  );
}
