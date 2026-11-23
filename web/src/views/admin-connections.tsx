// SPDX-License-Identifier: Apache-2.0
// The outside services of the installation, set in the administration (spec 101): the identity
// provider under Login, the helper services and the metrics token under General. Each part saves
// apart, with a second factor; a part the environment sets shows read-only under a notice.
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { ErrorNote, Field, Loading } from '../components/ui';
import { Notice } from '../components/notice';
import { differs, SaveReset } from '../components/save-reset';
import { ConfirmFields, type Confirmation } from '../components/confirm-change';
import { SecretField, type SecretChange, type SecretWords } from '../components/secret-field';

/** Where a part in force comes from, and the setting of the environment that locks it. */
interface Origin {
  source: 'database' | 'environment' | 'none';
  locked: { setting: string; source: string } | null;
}

interface ProviderFields {
  issuer: string;
  client_id: string;
  display_name: string;
  auto_create: boolean;
  allow_unverified_email: boolean;
  groups_claim: string;
}

/** Every part in force, as `GET /admin/connections` gives it: never a secret. */
interface ConnectionsView {
  identity_provider: Origin & ProviderFields & { client_secret_set: boolean };
  pdf: Origin & { url: string; password_set: boolean };
  office: Origin & { url: string };
  drawing: Origin & { url: string };
  metrics: Origin & { token_set: boolean };
  updated_at: string | null;
}

type Part = 'identity_provider' | 'pdf' | 'office' | 'drawing' | 'metrics';

const CONNECTIONS_KEY = ['connections'];

const ROUTES: Record<Part, string> = {
  identity_provider: '/admin/connections/identity-provider',
  pdf: '/admin/connections/pdf',
  office: '/admin/connections/office',
  drawing: '/admin/connections/drawing',
  metrics: '/admin/connections/metrics',
};

const KEEP: SecretChange = { action: 'keep' };

/** The words of one secret, from its keys under `connections`. */
function secretWords(t: TFunction, name: 'clientSecret' | 'pdfPassword' | 'token'): SecretWords {
  return {
    label: t(`connections.${name}`),
    isSet: t(`connections.${name}Set`),
    notSet: t(`connections.${name}NotSet`),
    keep: t(`connections.${name}Keep`),
    none: t(`connections.${name}None`),
    change: t(`connections.${name}Change`),
    remove: t(`connections.${name}Remove`),
    newValue: t(`connections.${name}New`),
  };
}

function useConnections() {
  return useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: () => api.get<ConnectionsView>('/admin/connections'),
  });
}

/** One part: its notice when locked, its fields, the second factor and Save. */
function PartForm<F extends object>({
  part,
  title,
  intro,
  view,
  stored,
  isSystem,
  children,
}: {
  part: Part;
  title: string;
  intro: string;
  view: ConnectionsView;
  stored: F;
  isSystem: boolean;
  children: (form: F, set: (change: Partial<F>) => void, readOnly: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [changes, setChanges] = useState<Partial<F>>({});
  const [confirm, setConfirm] = useState<Confirmation>({ code: '', reason: '' });
  const save = useMutation({
    mutationFn: (form: F) => api.put<ConnectionsView>(ROUTES[part], { ...form, code: confirm.code.trim() }),
    onSuccess: (next) => {
      setChanges({});
      setConfirm({ code: '', reason: '' });
      client.setQueryData(CONNECTIONS_KEY, next);
    },
  });
  const locked = view[part].locked;
  const form: F = { ...stored, ...changes };
  const changed = differs(stored, form);
  const readOnly = !isSystem || locked !== null;
  const reset = () => {
    setChanges({});
    setConfirm({ code: '', reason: '' });
    save.reset();
  };
  return (
    <section className="settings-unit">
      <h2>{title}</h2>
      <p className="muted">{intro}</p>
      {locked && (
        <Notice kind="warning" title={t('connections.lockedTitle')}>
          {t('connections.locked', { setting: locked.setting, source: locked.source })}
        </Notice>
      )}
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <ErrorNote error={save.error} />
        {save.isSuccess && <Notice kind="info">{t('admin.saved')}</Notice>}
        <fieldset className="plain-fieldset" disabled={readOnly}>
          {children(form, (change) => setChanges({ ...changes, ...change }), readOnly)}
        </fieldset>
        {!readOnly && changed && (
          <ConfirmFields value={confirm} onChange={setConfirm} note={t('connections.confirmNote')} />
        )}
        {!readOnly && <SaveReset changed={changed} busy={save.isPending} onReset={reset} />}
      </form>
    </section>
  );
}

function ProviderPart({ view, isSystem }: { view: ConnectionsView; isSystem: boolean }) {
  const { t } = useTranslation();
  const p = view.identity_provider;
  const stored = {
    issuer: p.issuer,
    client_id: p.client_id,
    client_secret: KEEP,
    display_name: p.display_name,
    auto_create: p.auto_create,
    allow_unverified_email: p.allow_unverified_email,
    groups_claim: p.groups_claim,
  };
  return (
    <PartForm
      part="identity_provider"
      title={t('connections.providerTitle')}
      intro={t('connections.providerIntro')}
      view={view}
      stored={stored}
      isSystem={isSystem}
    >
      {(form, set, readOnly) => (
        <>
          <Field label={t('connections.issuer')} help={t('connections.issuerHelp')}>
            <input type="url" value={form.issuer} onChange={(e) => set({ issuer: e.target.value })} />
          </Field>
          <Field label={t('connections.clientId')}>
            <input
              value={form.client_id}
              onChange={(e) => set({ client_id: e.target.value })}
              autoComplete="off"
            />
          </Field>
          <SecretField
            words={secretWords(t, 'clientSecret')}
            isSet={p.client_secret_set}
            value={form.client_secret}
            disabled={readOnly}
            onChange={(client_secret) => set({ client_secret })}
          />
          <Field label={t('connections.button')} help={t('connections.buttonHelp')}>
            <input value={form.display_name} onChange={(e) => set({ display_name: e.target.value })} />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={form.auto_create}
              onChange={(e) => set({ auto_create: e.target.checked })}
            />
            {t('connections.autoCreate')}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.allow_unverified_email}
              onChange={(e) => set({ allow_unverified_email: e.target.checked })}
            />
            {t('connections.allowUnverified')}
          </label>
          <Field label={t('connections.groupsClaim')} help={t('connections.groupsClaimHelp')}>
            <input value={form.groups_claim} onChange={(e) => set({ groups_claim: e.target.value })} />
          </Field>
        </>
      )}
    </PartForm>
  );
}

/** The identity provider, at the foot of Security, Login. */
export function IdentityProviderPart({ isSystem }: { isSystem: boolean }) {
  const { t } = useTranslation();
  const q = useConnections();
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  return (
    <>
      {!isSystem && <Notice kind="info">{t('connections.onlySystem')}</Notice>}
      <ProviderPart view={q.data} isSystem={isSystem} />
    </>
  );
}

/** One address of a helper, the office service or the drawing service. */
function AddressPart({
  part,
  view,
  isSystem,
}: {
  part: 'office' | 'drawing';
  view: ConnectionsView;
  isSystem: boolean;
}) {
  const { t } = useTranslation();
  return (
    <PartForm
      part={part}
      title={t(`connections.${part}Title`)}
      intro={t(`connections.${part}Intro`)}
      view={view}
      stored={{ url: view[part].url }}
      isSystem={isSystem}
    >
      {(form, set) => (
        <Field label={t('connections.address')} help={t(`connections.${part}Help`)}>
          <input type="url" value={form.url} onChange={(e) => set({ url: e.target.value })} />
        </Field>
      )}
    </PartForm>
  );
}

function PDFPart({ view, isSystem }: { view: ConnectionsView; isSystem: boolean }) {
  const { t } = useTranslation();
  return (
    <PartForm
      part="pdf"
      title={t('connections.pdfTitle')}
      intro={t('connections.pdfIntro')}
      view={view}
      stored={{ url: view.pdf.url, password: KEEP }}
      isSystem={isSystem}
    >
      {(form, set, readOnly) => (
        <>
          <Field label={t('connections.address')} help={t('connections.pdfHelp')}>
            <input type="url" value={form.url} onChange={(e) => set({ url: e.target.value })} />
          </Field>
          <SecretField
            words={secretWords(t, 'pdfPassword')}
            isSet={view.pdf.password_set}
            value={form.password}
            disabled={readOnly}
            onChange={(password) => set({ password })}
          />
        </>
      )}
    </PartForm>
  );
}

/** A new token from the browser: 32 random bytes, written in the alphabet a scraper sends. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function MetricsPart({ view, isSystem }: { view: ConnectionsView; isSystem: boolean }) {
  const { t } = useTranslation();
  return (
    <PartForm
      part="metrics"
      title={t('connections.metricsTitle')}
      intro={t('connections.metricsIntro')}
      view={view}
      stored={{ token: KEEP }}
      isSystem={isSystem}
    >
      {(form, set, readOnly) => (
        <>
          <SecretField
            words={secretWords(t, 'token')}
            isSet={view.metrics.token_set}
            value={form.token}
            disabled={readOnly}
            onChange={(token) => set({ token })}
          />
          {form.token.action === 'set' && form.token.value !== '' && (
            <p className="muted">
              {t('connections.tokenShown')} <code>{form.token.value}</code>
            </p>
          )}
          {!readOnly && (
            <p>
              <button type="button" onClick={() => set({ token: { action: 'set', value: newToken() } })}>
                {t('connections.tokenMake')}
              </button>
            </p>
          )}
        </>
      )}
    </PartForm>
  );
}

/** The helper services and the metrics token, under Instance, General. */
export function HelperServicesParts({ isSystem }: { isSystem: boolean }) {
  const { t } = useTranslation();
  const q = useConnections();
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  return (
    <>
      {!isSystem && <Notice kind="info">{t('connections.onlySystem')}</Notice>}
      <PDFPart view={q.data} isSystem={isSystem} />
      <AddressPart part="office" view={q.data} isSystem={isSystem} />
      <AddressPart part="drawing" view={q.data} isSystem={isSystem} />
      <MetricsPart view={q.data} isSystem={isSystem} />
    </>
  );
}
