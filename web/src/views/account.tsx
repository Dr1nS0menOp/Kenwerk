// SPDX-License-Identifier: Apache-2.0
// Your account: your tokens (whose screen wave MC2 rebuilds) and your data.
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Space, type Token } from '../api';
import { useDates } from '../dates';
import { AccountSectionHead } from '../components/account-frame';
import { useCopy } from '../components/toast';
import { ConfirmButton, Dialog, ErrorNote, Field } from '../components/ui';
import { TableBox } from '../components/table-box';

const DAY_MS = 86_400_000;
const DEFAULT_TOKEN_DAYS = 90;
const MAX_TOKEN_DAYS = 365;

const TOKEN_SCOPES = [
  'content:read',
  'content:write',
  'content:delete',
  'content:share',
  'content:export',
  'spaces:manage',
  'people:read',
  'account:read',
  'account:write',
  'admin:read',
] as const;
/** What a new token reads by default: read only. */
const READ_SCOPES = ['content:read', 'people:read', 'account:read'];
/** How many spaces a token may be limited to. */
const MAX_TOKEN_SPACES = 50;

/** The translation key of a scope: a colon would split it into a namespace. */
const scopeKey = (scope: string) => `account.scope_${scope.replace(':', '_')}`;

function TokenSpaces({
  chosen,
  onChange,
}: {
  chosen: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const { t } = useTranslation();
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: () => api.get<{ spaces: Space[] }>('/spaces') });
  const list = chosen ?? [];
  const nameOf = (id: string) => spaces.data?.spaces.find((s) => s.id === id)?.name ?? id;
  const left = (spaces.data?.spaces ?? []).filter((s) => !list.includes(s.id));
  return (
    <>
      <fieldset className="matrix">
        <legend>{t('account.tokenSpaces')}</legend>
        <label className="check">
          <input type="radio" name="token-spaces" checked={chosen === null} onChange={() => onChange(null)} />
          {t('account.tokenEverySpace')}
        </label>
        <label className="check">
          <input type="radio" name="token-spaces" checked={chosen !== null} onChange={() => onChange(list)} />
          {t('account.tokenChosenSpaces')}
        </label>
      </fieldset>
      {chosen !== null && (
        <>
          <ul className="chip-list">
            {list.map((id) => (
              <li key={id} className="chip">
                {nameOf(id)}
                <button
                  type="button"
                  className="ghost"
                  aria-label={t('account.tokenRemoveSpace', { name: nameOf(id) })}
                  onClick={() => onChange(list.filter((s) => s !== id))}
                >
                  {t('common.remove')}
                </button>
              </li>
            ))}
          </ul>
          {list.length < MAX_TOKEN_SPACES ? (
            <Field label={t('account.tokenAddSpace')}>
              <select value="" onChange={(e) => e.target.value && onChange([...list, e.target.value])}>
                <option value="">{t('account.tokenPickSpace')}</option>
                {left.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="muted">{t('account.tokenSpacesMost', { most: MAX_TOKEN_SPACES })}</p>
          )}
          {list.length === 0 && <p className="muted">{t('account.tokenNoSpaceYet')}</p>}
        </>
      )}
    </>
  );
}

function NewTokenForm({ onCreated }: { onCreated: (secret: string) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const dayAfter = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(READ_SCOPES);
  // null is every space the person reaches, the default (decided by the product owner on 2026-11-22).
  const [spaces, setSpaces] = useState<string[] | null>(null);
  const [assistant, setAssistant] = useState(false);
  const [until, setUntil] = useState(() => dayAfter(DEFAULT_TOKEN_DAYS));
  const create = useMutation({
    mutationFn: () =>
      api.post<{ secret: string }>('/me/tokens', {
        name,
        scopes,
        ...(spaces === null ? {} : { spaces }),
        assistant,
        expires_at: new Date(until).toISOString(),
      }),
    onSuccess: async (r) => {
      setName('');
      onCreated(r.secret);
      await client.invalidateQueries({ queryKey: ['tokens'] });
    },
  });
  const limited = spaces !== null;
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <ErrorNote error={create.error} />
      <Field label={t('common.name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label={t('account.tokenExpires')} help={t('account.tokenExpiresHelp')}>
        <input
          type="date"
          value={until}
          min={dayAfter(1)}
          max={dayAfter(MAX_TOKEN_DAYS)}
          onChange={(e) => setUntil(e.target.value)}
          required
        />
      </Field>
      <fieldset className="matrix">
        <legend>{t('account.tokenScope')}</legend>
        {TOKEN_SCOPES.map((scope) => (
          <label key={scope}>
            <input
              type="checkbox"
              checked={scopes.includes(scope)}
              // A token limited to some spaces never reaches Administration.
              disabled={limited && scope.startsWith('admin:')}
              onChange={(e) =>
                setScopes(e.target.checked ? [...scopes, scope] : scopes.filter((s) => s !== scope))
              }
            />
            {t(scopeKey(scope))}
          </label>
        ))}
      </fieldset>
      <TokenSpaces
        chosen={spaces}
        onChange={(next) => {
          setSpaces(next);
          if (next !== null) setScopes((held) => held.filter((s) => !s.startsWith('admin:')));
        }}
      />
      <label className="check">
        <input type="checkbox" checked={assistant} onChange={(e) => setAssistant(e.target.checked)} />
        {t('account.tokenAssistant')}
      </label>
      <p className="muted">{t('account.tokenAssistantHelp')}</p>
      <button
        type="submit"
        className="primary"
        disabled={create.isPending || (limited && spaces.length === 0)}
      >
        {t('account.tokenNew')}
      </button>
    </form>
  );
}

export function TokensView() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const dates = useDates();
  const copy = useCopy();
  const [secret, setSecret] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['tokens'], queryFn: () => api.get<{ tokens: Token[] }>('/me/tokens') });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/me/tokens/${id}`),
    onSettled: () => client.invalidateQueries({ queryKey: ['tokens'] }),
  });
  return (
    <>
      <p className="muted">{t('account.tokensHelp')}</p>
      <ErrorNote error={q.error ?? revoke.error} />
      {q.data?.tokens.length === 0 && <p className="muted">{t('account.tokensNone')}</p>}
      {(q.data?.tokens.length ?? 0) > 0 && (
        <TableBox>
          <table>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('account.tokenScope')}</th>
                <th>{t('account.tokenSpaces')}</th>
                <th>{t('account.tokenExpires')}</th>
                <th>{t('admin.lastUsed')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.tokens.map((k) => (
                <tr key={k.id}>
                  <td>
                    {k.name}
                    {k.assistant && <span className="lozenge">{t('account.tokenAssistantMark')}</span>}
                  </td>
                  <td>{k.scopes.map((scope) => t(scopeKey(scope))).join(', ')}</td>
                  <td>
                    {k.spaces.length === 0
                      ? t('account.tokenEverySpaceShort')
                      : t('account.tokenSomeSpaces', { count: k.spaces.length })}
                  </td>
                  <td>{dates.day(k.expires_at)}</td>
                  <td>{dates.moment(k.last_used_at)}</td>
                  <td>
                    <ConfirmButton
                      label={t('admin.revoke')}
                      message={t('account.tokenRevokeHelp', { name: k.name })}
                      className="ghost"
                      onConfirm={() => revoke.mutate(k.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      )}
      <section>
        <h2>{t('account.tokenNew')}</h2>
        <NewTokenForm onCreated={setSecret} />
      </section>
      {secret && (
        <Dialog title={t('account.tokenNew')} onClose={() => setSecret(null)}>
          <p>{t('admin.tokenHelp')}</p>
          <code className="secret" data-testid="token-secret">
            {secret}
          </code>
          <div className="dialog-actions">
            <button type="button" onClick={() => void copy(secret, t('account.tokenCopied'))}>
              {t('account.tokenCopy')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function saveAsFile(name: string, content: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Privacy (ACC-109): what the instance holds about the person, to take along. */
export function PersonalDataView() {
  const { t } = useTranslation();
  const download = useMutation({
    mutationFn: () => api.post<unknown>('/me/export'),
    onSuccess: (data) => saveAsFile('my-kenwerk-data.json', data),
  });
  return (
    <AccountSectionHead id="privacy">
      <section className="account-part">
        <h2>{t('account.download')}</h2>
        <p className="muted">{t('account.downloadHelp')}</p>
        <ErrorNote error={download.error} />
        <button type="button" disabled={download.isPending} onClick={() => download.mutate()}>
          {t('account.download')}
        </button>
      </section>
    </AccountSectionHead>
  );
}
