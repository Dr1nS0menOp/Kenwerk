// SPDX-License-Identifier: Apache-2.0
// Administration, Security, Assistants: the instance's switch for assistants (spec 096, D10).
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { ErrorNote, Loading } from '../components/ui';

type AssistantsMode = 'on' | 'read_only' | 'off';

interface AssistantsSettings {
  mode: AssistantsMode;
}

const MODES: { mode: AssistantsMode; label: string; help: string }[] = [
  { mode: 'on', label: 'assistantsAdmin.on', help: 'assistantsAdmin.onHelp' },
  { mode: 'read_only', label: 'assistantsAdmin.readOnly', help: 'assistantsAdmin.readOnlyHelp' },
  { mode: 'off', label: 'assistantsAdmin.off', help: 'assistantsAdmin.offHelp' },
];

const SECTION = '/admin/settings/assistants';

export function AssistantsTab() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['settings', 'assistants'],
    queryFn: () => api.get<AssistantsSettings>(SECTION),
  });
  const save = useMutation({
    mutationFn: (mode: AssistantsMode) => api.put<AssistantsSettings>(SECTION, { mode }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['settings', 'assistants'] }),
  });
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const current = q.data.mode;
  return (
    <>
      <fieldset>
        <legend>{t('assistantsAdmin.mode')}</legend>
        {MODES.map(({ mode, label, help }) => (
          <label key={mode} className="check">
            <input
              type="radio"
              name="assistants-mode"
              checked={current === mode}
              disabled={save.isPending}
              onChange={() => save.mutate(mode)}
            />
            <span>
              {t(label)}
              <span className="muted"> {t(help)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ErrorNote error={save.error} />
      <p className="muted">
        {t('assistantsAdmin.address')} <code>{window.location.origin + '/mcp'}</code>
      </p>
    </>
  );
}
