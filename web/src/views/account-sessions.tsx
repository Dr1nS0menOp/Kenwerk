// SPDX-License-Identifier: Apache-2.0
// Sessions, a screen below Security (spec 084, ACC-074 to ACC-078, ACC-017): the sessions that
// still work, with the device and program read from each one's user agent, and the recent logins.
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type LoginEntry } from '../api';
import { useDates } from '../dates';
import { AccountSectionHead } from '../components/account-frame';
import { IconComputer, IconPhone } from '../components/icons';
import { TableBox, TableEmpty } from '../components/table-box';
import { ConfirmButton, ErrorNote } from '../components/ui';
import { readUserAgent, type UserAgentReading } from '../user-agent';

interface Session {
  id: string;
  last_seen_at: string;
  ip: string;
  user_agent: string;
  current: boolean;
}

const DEVICE_ICON_SIZE = 20;
const SESSION_COLUMNS = 5;
const LOGIN_COLUMNS = 4;

/** Two lines of a row: the main words, and the muted detail under them (ACC-085). */
function TwoLines({ main, detail }: { main: string; detail: string }) {
  return (
    <span className="two-lines">
      <span>{main}</span>
      {detail && <span className="muted">{detail}</span>}
    </span>
  );
}

function DeviceCell({ reading }: { reading: UserAgentReading }) {
  const { t } = useTranslation();
  const Icon = reading.kind === 'phone' || reading.kind === 'tablet' ? IconPhone : IconComputer;
  const system = [reading.system, reading.systemVersion].filter(Boolean).join(' ');
  return (
    <span className="device-cell">
      <Icon size={DEVICE_ICON_SIZE} />
      <TwoLines main={t(`account.device_${reading.kind}`)} detail={system} />
    </span>
  );
}

function ProgramCell({ reading }: { reading: UserAgentReading }) {
  const { t } = useTranslation();
  return <TwoLines main={reading.program || t('account.programUnknown')} detail={reading.programVersion} />;
}

function RunningSessions() {
  const { t } = useTranslation();
  const dates = useDates();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<{ sessions: Session[] }>('/me/sessions'),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['sessions'] });
  const end = useMutation({ mutationFn: (id: string) => api.del(`/me/sessions/${id}`), onSettled: refresh });
  const endOthers = useMutation({
    mutationFn: () => api.post('/me/sessions/end-others'),
    onSettled: refresh,
  });
  const sessions = q.data?.sessions ?? [];
  return (
    <section className="account-part">
      <div className="part-head">
        <h2>{t('account.runningSessions')}</h2>
        {sessions.some((s) => !s.current) && (
          <ConfirmButton
            label={t('account.endAllOthers')}
            message={t('account.endAllOthersConfirm')}
            className="danger"
            tone="danger"
            onConfirm={() => endOthers.mutate()}
          />
        )}
      </div>
      <ErrorNote error={q.error ?? end.error ?? endOthers.error} />
      <TableBox>
        <table className="airy">
          <thead>
            <tr>
              <th>{t('account.loginDevice')}</th>
              <th>{t('account.program')}</th>
              <th>{t('admin.ip')}</th>
              <th>{t('account.lastActive')}</th>
              <th>
                <span className="visually-hidden">{t('common.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {q.data && sessions.length === 0 && (
              <TableEmpty columns={SESSION_COLUMNS}>{t('account.sessionsNone')}</TableEmpty>
            )}
            {sessions.map((s) => {
              const reading = readUserAgent(s.user_agent);
              return (
                <tr key={s.id}>
                  <td>
                    <DeviceCell reading={reading} />
                  </td>
                  <td>
                    <ProgramCell reading={reading} />
                  </td>
                  <td>{s.ip}</td>
                  <td>{s.current ? t('account.activeNow') : dates.moment(s.last_seen_at)}</td>
                  <td>
                    {s.current ? (
                      <span className="session-mark">{t('profile.thisSession')}</span>
                    ) : (
                      <button type="button" onClick={() => end.mutate(s.id)}>
                        {t('account.endSession')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableBox>
    </section>
  );
}

function RecentLogins() {
  const { t } = useTranslation();
  const dates = useDates();
  const q = useQuery({
    queryKey: ['logins'],
    queryFn: () => api.get<{ logins: LoginEntry[] }>('/me/logins'),
  });
  const logins = q.data?.logins ?? [];
  return (
    <section className="account-part">
      <h2>{t('account.logins')}</h2>
      <ErrorNote error={q.error} />
      <TableBox>
        <table className="airy">
          <thead>
            <tr>
              <th>{t('admin.when')}</th>
              <th>{t('account.loginMethod')}</th>
              <th>{t('admin.ip')}</th>
              <th>{t('account.loginDevice')}</th>
            </tr>
          </thead>
          <tbody>
            {q.data && logins.length === 0 && (
              <TableEmpty columns={LOGIN_COLUMNS}>{t('account.loginsNone')}</TableEmpty>
            )}
            {logins.map((l) => {
              const reading = readUserAgent(l.user_agent);
              return (
                <tr key={l.at}>
                  <td>{dates.moment(l.at)}</td>
                  <td>{l.method}</td>
                  <td>{l.ip}</td>
                  <td>
                    <TwoLines
                      main={reading.program || t('account.programUnknown')}
                      detail={[reading.system, reading.systemVersion].filter(Boolean).join(' ')}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableBox>
    </section>
  );
}

export function SessionsView() {
  return (
    <AccountSectionHead id="sessions">
      <RunningSessions />
      <RecentLogins />
    </AccountSectionHead>
  );
}
