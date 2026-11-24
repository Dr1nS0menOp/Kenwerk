// SPDX-License-Identifier: Apache-2.0
// Header and footer in the administration (spec 089, ADM-149): the header field, then the footer
// field, then Save and Reset changes as one unit, then who changed them last. Saving asks for a
// fresh login when the last one is older than ten minutes, through the dialog every screen shares.
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Json, type Person } from '../api';
import { useCapabilities } from '../capabilities';
import { ExperimentalOff } from '../components/experimental-off';
import { HeaderFooterField } from '../components/header-footer-field';
import { headerFooterKey } from '../components/instance-note';
import { Notice } from '../components/notice';
import { PersonMark } from '../components/person';
import { SaveReset } from '../components/save-reset';
import { ErrorNote, Loading, RelativeTime } from '../components/ui';

type FieldName = 'header' | 'footer';

interface Limits {
  characters: number;
  paragraphs: number;
  links: number;
  statuses: number;
  bytes: number;
}

/** What `GET /admin/header-footer` gives. */
interface StoredNote {
  header: Json | null;
  footer: Json | null;
  changed_at: string | null;
  changed_by: { id: string; name: string; active: boolean } | null;
  limits: Limits;
}

const adminKey = ['admin-header-footer'];
/** The rest of a person, which the mark of an active or no longer active person does not read. */
const MARK_ONLY: Omit<Person, 'id' | 'name' | 'active'> = {
  type: 'member',
  job_title: '',
  department: '',
  has_picture: false,
};
const FIELDS: FieldName[] = ['header', 'footer'];

/** A refusal of the server that names a field, in words that name it too. */
function Refusal({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const named =
    error instanceof ApiError
      ? error.fields.find((f) => f.field === 'header' || f.field === 'footer')
      : undefined;
  if (!named) return <ErrorNote error={error} />;
  return (
    <Notice kind="error" title={t(`headerFooter.refused_${named.field}`)}>
      {t(`headerFooter.problem_${named.problem}`, { defaultValue: named.message })}
    </Notice>
  );
}

function LastChanged({ stored }: { stored: StoredNote }) {
  const { t } = useTranslation();
  if (!stored.changed_at || !stored.changed_by) return null;
  const person = stored.changed_by;
  return (
    <dl className="facts">
      <dt>{t('headerFooter.lastChanged')}</dt>
      <dd>
        {person.name || t('headerFooter.someoneRemoved')}{' '}
        <PersonMark person={{ ...MARK_ONLY, id: person.id, name: person.name, active: person.active }} />{' '}
        <RelativeTime value={stored.changed_at} />
      </dd>
    </dl>
  );
}

const same = (a: Json | null, b: Json | null) => JSON.stringify(a) === JSON.stringify(b);

export function HeaderFooterTab() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const on = useCapabilities().header_footer;
  const stored = useQuery({
    queryKey: adminKey,
    queryFn: () => api.get<StoredNote>('/admin/header-footer'),
    enabled: on,
  });
  const [typed, setTyped] = useState<Partial<Record<FieldName, Json | null>>>({});
  // Each round starts the fields anew from what is stored: after a save and after Reset changes.
  const [round, setRound] = useState(0);
  const save = useMutation({
    mutationFn: (body: Record<FieldName, Json | null>) => api.put<StoredNote>('/admin/header-footer', body),
    onSuccess: async (saved) => {
      client.setQueryData(adminKey, saved);
      setTyped({});
      setRound((r) => r + 1);
      await client.invalidateQueries({ queryKey: headerFooterKey });
    },
  });
  if (!on) return <ExperimentalOff />;
  if (stored.error) return <ErrorNote error={stored.error} />;
  if (!stored.data) return <Loading />;
  const now = stored.data;
  const value = (field: FieldName) => (field in typed ? (typed[field] ?? null) : now[field]);
  const changed = FIELDS.some((field) => !same(value(field), now[field]));
  const limits = now.limits;
  const hint = t('headerFooter.hint', { characters: limits.characters, links: limits.links });
  return (
    <form
      className="settings-unit"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate({ header: value('header'), footer: value('footer') });
      }}
    >
      {save.error ? <Refusal error={save.error} /> : null}
      {save.isSuccess && <Notice kind="info">{t('admin.saved')}</Notice>}
      {FIELDS.map((field) => (
        <HeaderFooterField
          key={`${field}-${round}`}
          label={t(`headerFooter.${field}`)}
          hint={hint}
          value={value(field)}
          onChange={(next) => setTyped((before) => ({ ...before, [field]: next }))}
        />
      ))}
      <SaveReset
        changed={changed}
        busy={save.isPending}
        onReset={() => {
          setTyped({});
          setRound((r) => r + 1);
          save.reset();
        }}
      />
      <LastChanged stored={now} />
    </form>
  );
}
