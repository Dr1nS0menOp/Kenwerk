// SPDX-License-Identifier: Apache-2.0
import { pagePath } from '../addresses';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  GLOBAL_PERMISSIONS,
  type AuditEvent,
  type DirectoryEntry,
  type Group,
  type MailEntry,
  type Me,
  type ResetLink,
  type Space,
  type UserDetail,
} from '../api';
import { Link, navigate } from '../router';
import { PersonName } from '../components/person';
import { SubjectPicker } from '../components/picker';
import { Dialog, ErrorNote, Field, Loading } from '../components/ui';
import { useDates } from '../dates';
import { useCapabilities } from '../capabilities';
import { AnalyticsTab, InsightsTab, OutgoingTab } from './admin-platform';
import { RuleList } from './rules';
import { WebhookList } from './webhooks';
import { OrganisingTab, SpaceDefaultsTab, TemplatesTab } from './admin-organising';
import { CareTab } from './admin-care';
import { ExportTab, ImportSpaceTab } from './exchange';
import { AnnouncementsTab, LookTab } from './admin-look';
import {
  AnonymiseButton,
  BulkBar,
  ExpiryField,
  InvitationsTab,
  NameDialog,
  ServiceAccounts,
  TypeChange,
} from './admin-people';
import { InstancePermissionsTab, LoginTab, PermissionsTab, RulesTab } from './admin-rules';
import { SpacesTab, SpacesTrashTab } from './admin-spaces';
import { SettingsSearch, SummaryTab } from './admin-summary';
import { HealthBand, HealthChecks } from './admin-health';
import { BackupsTab, ConfigurationTab, SessionsTab } from './admin-running';
import {
  AuditSignatures,
  DiskThresholds,
  EventsTab,
  LogLevelLine,
  MonitoringFiles,
  UpgradesTab,
} from './admin-installation';
import { SettingsFrame, type SettingsGroup } from '../components/settings-frame';
import { SettingsSection, SectionActions } from '../components/settings-section';
import { EmptyState } from '../components/empty-state';
import { Notice } from '../components/notice';
import { differs, SaveReset } from '../components/save-reset';
import { ControlTab } from './admin-control';
import { MailServerPart } from './admin-mail';
import { HelperServicesParts } from './admin-connections';
import { TableBox, TableEmpty } from '../components/table-box';
import {
  FilterDate,
  FilterPerson,
  FilterText,
  ToolRow,
  usePersonWords,
  type ToolFilter,
} from '../components/tool-row';
import { choiceFilter } from '../components/tool-row-model';
import { SortHeading } from '../components/sort-heading';
import { BOTH_WAYS, nextSort, queryOf, sortStateOf, useListAddress } from '../components/list-address';
import {
  IconClock,
  IconFolder,
  IconKey,
  IconLock,
  IconPage,
  IconPeople,
  IconPerson,
  IconStatus,
} from '../components/icons';
import { pageTitle } from '../page-name';
import {
  ADMIN_GROUPS,
  adminSection,
  sectionIntroKey,
  sectionNameKey,
  sectionsShown,
  type AdminSection,
} from './admin-sections';

/** The parameters of GET /admin/users that the screen sends, as the address holds them (spec 100). */
const USER_PARAMS = ['q', 'type', 'status', 'source', 'role', 'space_id', 'group_id', 'idle_days', 'sort'];
const USER_SORT_DEFAULT = 'name';
/** The global permissions the server can filter people on. */
const USER_ROLES = ['administrator', 'system_administrator', 'create_space', 'invite_people'];
const USER_TYPES = ['member', 'guest'];
const USER_STATUSES = ['active', 'disabled'];
const USER_SOURCES = ['local', 'oidc', 'scim'];
const IDLE_DAYS = [30, 90, 365];
/** The parameters of GET /admin/audit-events that the screen sends; its export takes the same. */
const AUDIT_PARAMS = [
  'actor_id',
  'action',
  'object_type',
  'object_id',
  'space_id',
  'result',
  'since',
  'until',
];
const AUDIT_RESULTS = ['success', 'denied', 'failure'];
const AUDIT_PAGE = 100;
const FILTER_ICON = 16;
const SYSTEM_POLL_MS = 10_000;
const USER_COLUMNS = 7;
const AUDIT_COLUMNS = 6;
const MAIL_SWITCHES = ['mail_enabled', 'mail_excerpts', 'reactions_enabled', 'group_mentions'] as const;

function GlobalPermissions({ current, onChange }: { current: string[]; onChange: (next: string[]) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="matrix">
      <legend>{t('admin.globalPermissions')}</legend>
      {GLOBAL_PERMISSIONS.map((p) => (
        <label key={p}>
          <input
            type="checkbox"
            checked={current.includes(p)}
            onChange={(e) => onChange(e.target.checked ? [...current, p] : current.filter((x) => x !== p))}
          />
          {t(`admin.perm_${p}`)}
        </label>
      ))}
    </fieldset>
  );
}

/** Groups, spaces and the number of pages a person owns, without titles (ADM-010). */
function UserReach({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['user-reach', userId],
    queryFn: () =>
      api.get<{ groups: string[]; spaces: string[]; pages_owned: number }>(`/admin/users/${userId}/reach`),
  });
  if (!q.data) return <ErrorNote error={q.error} />;
  const none = t('admin.reachNone');
  return (
    <dl className="facts">
      <dt>{t('admin.reachGroups')}</dt>
      <dd>{q.data.groups.join(', ') || none}</dd>
      <dt>{t('admin.reachSpaces')}</dt>
      <dd>{q.data.spaces.join(', ') || none}</dd>
      <dt>{t('admin.reachPages')}</dt>
      <dd>{q.data.pages_owned}</dd>
    </dl>
  );
}

/**
 * The right to sign, given per person by an administrator who confirmed who they are, never
 * through a role (DOC-014, DOC-751). How they were identified is a choice, so the record that
 * is kept for good holds no number of an identity document.
 */
function SigningRight({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = ['signing-right', userId];
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<{
        right: { enabled: boolean; enabled_by: string; identified_by: string; enabled_at: string | null };
        methods: string[];
      }>(`/admin/users/${userId}/signing`),
  });
  const [method, setMethod] = useState('');
  const change = useMutation({
    mutationFn: (on: boolean) =>
      on
        ? api.put(`/admin/users/${userId}/signing`, { identified_by: method })
        : api.del(`/admin/users/${userId}/signing`),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  if (!q.data) return <ErrorNote error={q.error} />;
  const { right, methods } = q.data;
  return (
    <fieldset>
      <legend>{t('signing.rightTitle')}</legend>
      <ErrorNote error={change.error} />
      {right.enabled ? (
        <div className="row">
          <p>
            {t('signing.rightEnabled', {
              name: right.enabled_by,
              method: t(`signing.identified_${right.identified_by}`),
            })}
          </p>
          <button type="button" onClick={() => change.mutate(false)} disabled={change.isPending}>
            {t('signing.rightDisable')}
          </button>
        </div>
      ) : (
        <>
          <p className="muted">{t('signing.rightHelp')}</p>
          <Field label={t('signing.identifiedBy')}>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">{t('signing.identifiedChoose')}</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {t(`signing.identified_${m}`)}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={() => change.mutate(true)}
            disabled={change.isPending || method === ''}
          >
            {t('signing.rightEnable')}
          </button>
        </>
      )}
    </fieldset>
  );
}

function UserDialog({ user, onClose }: { user: UserDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [perms, setPerms] = useState(user.global_permissions);
  const refresh = () => client.invalidateQueries({ queryKey: ['admin-users'] });
  const finish = async () => {
    await refresh();
    onClose();
  };
  const act = useMutation({
    mutationFn: (path: string) => api.post(`/admin/users/${user.id}/${path}`),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const save = useMutation({
    mutationFn: (next: string[]) => api.put(`/admin/users/${user.id}/permissions`, { permissions: next }),
    onSuccess: refresh,
  });
  // The person sets their own password through a link: mailed when mail is on,
  // otherwise shown here once for the administrator to hand over.
  const reset = useMutation({
    mutationFn: () => api.post<ResetLink>(`/admin/users/${user.id}/reset-password`),
  });
  return (
    <Dialog title={user.display_name} onClose={onClose}>
      <p className="muted">
        {user.email} · {t(`admin.source_${user.source}`)}
      </p>
      <ErrorNote error={act.error ?? save.error ?? reset.error} />
      {user.password_locked && (
        <div className="row" role="status">
          <p>{t('admin.passwordLocked')}</p>
          <button type="button" onClick={() => act.mutate('unlock-password')}>
            {t('admin.liftPasswordLock')}
          </button>
        </div>
      )}
      <UserReach userId={user.id} />
      <GlobalPermissions
        current={perms}
        onChange={(next) => {
          setPerms(next);
          save.mutate(next);
        }}
      />
      <div className="row">
        {user.status === 'active' ? (
          <button type="button" className="danger" onClick={() => act.mutate('disable')}>
            {t('admin.disable')}
          </button>
        ) : (
          <button type="button" onClick={() => act.mutate('enable')}>
            {t('admin.enable')}
          </button>
        )}
        {user.totp_enabled && (
          <button type="button" onClick={() => act.mutate('reset-mfa')}>
            {t('admin.resetMfa')}
          </button>
        )}
        <TypeChange user={user} onDone={() => void finish()} />
        <AnonymiseButton user={user} onDone={() => void finish()} />
      </div>
      <ExpiryField user={user} onDone={() => void finish()} />
      {user.type === 'member' && <SigningRight userId={user.id} />}
      {user.source === 'local' && user.type !== 'service' && user.status === 'active' && (
        <div className="row">
          <button type="button" onClick={() => reset.mutate()} disabled={reset.isPending}>
            {t('admin.sendResetLink')}
          </button>
        </div>
      )}
      {reset.data && (
        <Notice kind="info">
          {reset.data.mailed
            ? t('admin.resetLinkMailed')
            : t('admin.resetLinkOnce', { link: reset.data.link })}
        </Notice>
      )}
    </Dialog>
  );
}

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [form, setForm] = useState({ email: '', display_name: '', type: 'member', password: '' });
  const create = useMutation({
    mutationFn: () => api.post('/admin/users', form),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
    },
  });
  return (
    <Dialog title={t('admin.newUser')} onClose={onClose}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <ErrorNote error={create.error} />
        <Field label={t('common.email')}>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            autoFocus
          />
        </Field>
        <Field label={t('admin.displayName')}>
          <input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            required
          />
        </Field>
        <Field label={t('admin.userType')}>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="member">{t('admin.member')}</option>
            <option value="guest">{t('admin.guest')}</option>
          </select>
        </Field>
        <Field label={t('common.password')}>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            required
          />
        </Field>
        <div className="dialog-actions">
          <button type="submit" className="primary">
            {t('common.create')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The filters of Users (spec 100): type, role and group in the row, the rest behind More filters. */
function useUserFilters(): ToolFilter[] {
  const { t } = useTranslation();
  const groups = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => api.get<{ groups: Group[] }>('/admin/groups'),
  });
  const spaces = useQuery({
    queryKey: ['admin-spaces'],
    queryFn: () => api.get<{ spaces: Space[] }>('/admin/spaces'),
  });
  return [
    choiceFilter({
      param: 'type',
      label: t('common.type'),
      icon: <IconPerson size={FILTER_ICON} />,
      place: 'row',
      values: USER_TYPES,
      name: (o) => t(`admin.${o}`),
    }),
    choiceFilter({
      param: 'role',
      label: t('admin.role'),
      icon: <IconKey size={FILTER_ICON} />,
      place: 'row',
      values: USER_ROLES,
      name: (o) => t(`permissions.global_${o}`),
    }),
    {
      kind: 'choice',
      param: 'group_id',
      label: t('admin.group'),
      icon: <IconPeople size={FILTER_ICON} />,
      place: 'row',
      options: groups.data?.groups.map((g) => ({ value: g.id, label: g.name })) ?? [],
    },
    choiceFilter({
      param: 'status',
      label: t('common.status'),
      icon: <IconStatus size={FILTER_ICON} />,
      place: 'more',
      values: USER_STATUSES,
      name: (o) => t(`admin.${o}`),
    }),
    {
      kind: 'choice',
      param: 'space_id',
      label: t('admin.space'),
      icon: <IconFolder size={FILTER_ICON} />,
      place: 'more',
      options: spaces.data?.spaces.map((s) => ({ value: s.id, label: s.name })) ?? [],
    },
    choiceFilter({
      param: 'idle_days',
      label: t('admin.lastLogin'),
      icon: <IconClock size={FILTER_ICON} />,
      place: 'more',
      values: IDLE_DAYS,
      name: (o) => t('admin.idleDays', { count: o }),
    }),
    choiceFilter({
      param: 'source',
      label: t('admin.howTheyLogIn'),
      icon: <IconLock size={FILTER_ICON} />,
      place: 'more',
      values: USER_SOURCES,
      name: (o) => t(`admin.source_${o}`),
    }),
  ];
}

function UserTable({
  users,
  picked,
  onToggle,
  onOpen,
}: {
  users: UserDetail[];
  picked: string[];
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const dates = useDates();
  const { params, set } = useListAddress();
  const sort = params.get('sort') ?? '';
  const heading = (column: string, label: string) => (
    <SortHeading
      label={label}
      state={sortStateOf(sort, column, USER_SORT_DEFAULT, BOTH_WAYS)}
      onSort={() => set('sort', nextSort(sort, column, USER_SORT_DEFAULT, BOTH_WAYS))}
    />
  );
  return (
    <TableBox>
      <table>
        <thead>
          <tr>
            <th>
              <span className="visually-hidden">{t('admin.select')}</span>
            </th>
            {heading('name', t('common.name'))}
            {heading('email', t('common.email'))}
            <th>{t('common.type')}</th>
            <th>{t('admin.source')}</th>
            <th>{t('common.status')}</th>
            {heading('last_login', t('admin.lastLogin'))}
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && <TableEmpty columns={USER_COLUMNS}>{t('admin.usersNoneFit')}</TableEmpty>}
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={t('admin.selectUser', { name: u.display_name })}
                  checked={picked.includes(u.id)}
                  onChange={() => onToggle(u.id)}
                />
              </td>
              <td>
                <button type="button" className="ghost" onClick={() => onOpen(u.id)}>
                  {u.display_name}
                </button>
              </td>
              <td className="email">{u.email}</td>
              <td>
                {t(`admin.${u.type}`)}
                {u.type === 'guest' && (
                  <span className="muted">
                    {' · '}
                    {u.spaces?.length ? u.spaces.join(', ') : t('admin.guestNoSpaces')}
                  </span>
                )}
              </td>
              <td>{t(`admin.source_${u.source}`)}</td>
              <td>{u.status === 'active' ? t('admin.active') : t('admin.disabled')}</td>
              <td>{dates.moment(u.last_login_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableBox>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { params } = useListAddress();
  const filters = useUserFilters();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const query = queryOf(params, USER_PARAMS);
  const q = useQuery({
    queryKey: ['admin-users', query],
    queryFn: () => api.get<{ users: UserDetail[]; total: number }>(`/admin/users?${query}`),
    // The search reaches the address after a pause, so a person can already be open when the
    // list asks again: keeping the old rows until the new ones come keeps their dialog, and
    // what is open in it, from closing and opening afresh.
    placeholderData: (previous) => previous,
  });
  const selected = q.data?.users.find((u) => u.id === open);
  const toggle = (id: string) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <>
      <SectionActions>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          {t('admin.newUser')}
        </button>
      </SectionActions>
      <ToolRow
        label={t('toolRow.findPeople')}
        search={{ label: t('toolRow.searchPeople'), placeholder: t('toolRow.searchPeople') }}
        filters={filters}
        sortParam="sort"
        count={q.data ? t('toolRow.countPeople', { count: q.data.total }) : undefined}
      />
      <ErrorNote error={q.error} />
      {picked.length > 0 && (
        <BulkBar
          users={picked}
          onDone={() => {
            setPicked([]);
            void client.invalidateQueries({ queryKey: ['admin-users'] });
          }}
        />
      )}
      {q.isPending && <Loading />}
      {q.data && <UserTable users={q.data.users} picked={picked} onToggle={toggle} onOpen={setOpen} />}
      {adding && <NewUserDialog onClose={() => setAdding(false)} />}
      {selected && <UserDialog user={selected} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Says which spaces and restrictions use a group, before it goes (spec 013, F8). */
function GroupDeleteDialog({
  group,
  onDelete,
  onClose,
}: {
  group: Group;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['group-impact', group.id],
    queryFn: () =>
      api.get<{ spaces: string[]; restrictions: number; leaves_space_without_admin: boolean }>(
        `/admin/groups/${group.id}/impact`,
      ),
  });
  return (
    <Dialog title={t('admin.groupDelete', { name: group.name })} onClose={onClose}>
      <ErrorNote error={q.error} />
      {q.data && (
        <>
          <p>{t('admin.groupSpaces', { list: q.data.spaces.join(', ') || '-' })}</p>
          <p>{t('admin.groupRestrictions', { count: q.data.restrictions })}</p>
          {q.data.leaves_space_without_admin && <Notice kind="error">{t('admin.groupLastAdmin')}</Notice>}
        </>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="danger"
          disabled={!q.data || q.data.leaves_space_without_admin}
          onClick={() => {
            onClose();
            onDelete();
          }}
        >
          {t('common.delete')}
        </button>
      </div>
    </Dialog>
  );
}

function GroupDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = ['group-members', group.id];
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: key });
    await client.invalidateQueries({ queryKey: ['admin-groups'] });
  };
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<{ members: { id: string; email: string; display_name: string }[] }>(
        `/admin/groups/${group.id}/members`,
      ),
  });
  const [perms, setPerms] = useState(group.global_permissions);
  const add = useMutation({
    mutationFn: (id: string) => api.put(`/admin/groups/${group.id}/members/${id}`),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/groups/${group.id}/members/${id}`),
    onSettled: refresh,
  });
  const save = useMutation({
    mutationFn: (next: string[]) => api.put(`/admin/groups/${group.id}/permissions`, { permissions: next }),
    onSettled: refresh,
  });
  const del = useMutation({
    mutationFn: () => api.del(`/admin/groups/${group.id}`),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const [owners, setOwners] = useState<DirectoryEntry[]>([]);
  const saveOwners = useMutation({
    mutationFn: (next: DirectoryEntry[]) =>
      api.put(`/admin/groups/${group.id}/owners`, { owners: next.map((o) => o.id) }),
  });
  const pickOwner = (entry: DirectoryEntry) => {
    const next = [...owners, entry];
    setOwners(next);
    saveOwners.mutate(next);
  };
  const [deleting, setDeleting] = useState(false);
  const managed = group.source !== 'local';
  return (
    <Dialog title={group.name} onClose={onClose}>
      {managed && <Notice kind="info">{t('admin.managed')}</Notice>}
      <ErrorNote error={add.error ?? remove.error ?? save.error ?? del.error ?? saveOwners.error} />
      <h3>{t('admin.members')}</h3>
      <ul className="plain-list">
        {q.data?.members.map((m) => (
          <li key={m.id} className="row">
            {m.display_name} <span className="muted">{m.email}</span>
            {!managed && (
              <button type="button" className="ghost" onClick={() => remove.mutate(m.id)}>
                {t('common.remove')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!managed && <SubjectPicker label={t('admin.addMember')} usersOnly onPick={(e) => add.mutate(e.id)} />}
      <h3>{t('admin.groupOwners')}</h3>
      <p className="muted">{t('admin.groupOwnersHelp')}</p>
      <ul className="plain-list">
        {owners.map((o) => (
          <li key={o.id}>{o.name}</li>
        ))}
      </ul>
      <SubjectPicker label={t('admin.addOwner')} usersOnly onPick={pickOwner} />
      <GlobalPermissions
        current={perms}
        onChange={(next) => {
          setPerms(next);
          save.mutate(next);
        }}
      />
      {!managed && (
        <button type="button" className="danger" onClick={() => setDeleting(true)}>
          {t('common.delete')}
        </button>
      )}
      {deleting && (
        <GroupDeleteDialog group={group} onDelete={() => del.mutate()} onClose={() => setDeleting(false)} />
      )}
    </Dialog>
  );
}

function GroupsTab() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => api.get<{ groups: Group[] }>('/admin/groups'),
  });
  const create = useMutation({
    mutationFn: (name: string) => api.post('/admin/groups', { name }),
    onSuccess: async () => {
      setCreating(false);
      await client.invalidateQueries({ queryKey: ['admin-groups'] });
    },
  });
  const selected = q.data?.groups.find((g) => g.id === open);
  const isEmpty = q.data?.groups.length === 0;
  const newGroup = (
    <button type="button" className="primary" onClick={() => setCreating(true)}>
      {t('admin.newGroup')}
    </button>
  );
  return (
    <>
      {/* While there is no group, the empty block holds the one button that makes the first (NAV-173). */}
      {q.data && !isEmpty && <SectionActions>{newGroup}</SectionActions>}
      <ErrorNote error={q.error} />
      {q.isPending && <Loading />}
      {q.data && (
        <TableBox>
          <table>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('admin.members')}</th>
                <th>{t('admin.source')}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.groups.map((g) => (
                <tr key={g.id}>
                  <td>
                    <button type="button" className="ghost" onClick={() => setOpen(g.id)}>
                      {g.name}
                    </button>
                  </td>
                  <td>{g.members}</td>
                  <td>{g.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      )}
      {/* An empty table keeps its heading row, with the block of NAV-173 in place of its rows. */}
      {isEmpty && (
        <EmptyState title={t('admin.groupsEmptyTitle')} action={newGroup}>
          {t('admin.groupsEmptyText')}
        </EmptyState>
      )}
      {selected && <GroupDialog group={selected} onClose={() => setOpen(null)} />}
      {creating && (
        <NameDialog
          title={t('admin.newGroup')}
          label={t('common.name')}
          error={create.error}
          busy={create.isPending}
          onCreate={(name) => create.mutate(name)}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

/** A page in the log, by its id. A title the reader may not see comes censored. */
function auditObject(e: AuditEvent): string {
  const title = e.details?.title;
  return [e.object_id, typeof title === 'string' ? title : ''].filter(Boolean).join(' ');
}

interface PageNote {
  id: string;
  title: string;
  space_key: string;
  space_name: string;
  status: string;
  restricted: boolean;
  readable: boolean;
}

/** What an administrator may know of a page from the log (ADR-029). */
function PageNoteFacts({ id }: { id: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['page-note', id],
    queryFn: () => api.get<PageNote>(`/admin/pages/${id}`),
    retry: false,
  });
  if (q.error) return <p className="muted">{t('admin.pageGone')}</p>;
  if (!q.data) return <Loading />;
  const note = q.data;
  return (
    <dl className="facts">
      <dt>{t('page.title')}</dt>
      <dd>
        {note.readable ? (
          <Link href={pagePath(id)}>{pageTitle(t, note.title)}</Link>
        ) : (
          pageTitle(t, note.title)
        )}
      </dd>
      <dt>{t('admin.spaces')}</dt>
      <dd>{note.space_name}</dd>
      <dt>{t('common.status')}</dt>
      <dd>{note.status}</dd>
      <dt>{t('page.restrictions')}</dt>
      <dd>{note.restricted ? t('common.yes') : t('common.no')}</dd>
    </dl>
  );
}

/** The filters of the Audit log (spec 100): person and time in the row, the rest behind More filters. */
function useAuditFilters(params: URLSearchParams): ToolFilter[] {
  const { t } = useTranslation();
  const dates = useDates();
  const actor = usePersonWords(params.get('actor_id') ?? '');
  const spaces = useQuery({
    queryKey: ['admin-spaces'],
    queryFn: () => api.get<{ spaces: Space[] }>('/admin/spaces'),
  });
  const since = params.get('since') ?? '';
  const until = params.get('until') ?? '';
  const time = [
    since && t('toolRow.from', { day: dates.day(since) }),
    until && t('toolRow.until', { day: dates.day(until) }),
  ]
    .filter(Boolean)
    .join(' ');
  return [
    {
      kind: 'field',
      params: ['actor_id'],
      label: t('admin.actor'),
      icon: <IconPerson size={FILTER_ICON} />,
      place: 'row',
      valueText: actor,
      field: <FilterPerson param="actor_id" label={t('admin.filterActor')} />,
    },
    {
      kind: 'field',
      params: ['since', 'until'],
      label: t('toolRow.time'),
      icon: <IconClock size={FILTER_ICON} />,
      place: 'row',
      valueText: time,
      field: (
        <>
          <FilterDate param="since" label={t('admin.since')} as="moment" />
          <FilterDate param="until" label={t('admin.until')} as="moment" />
        </>
      ),
    },
    {
      kind: 'field',
      params: ['object_type'],
      label: t('admin.object'),
      icon: <IconPage size={FILTER_ICON} />,
      place: 'more',
      valueText: params.get('object_type') ?? '',
      field: <FilterText param="object_type" label={t('admin.filterObject')} />,
    },
    {
      kind: 'field',
      params: ['object_id'],
      label: t('admin.objectId'),
      icon: <IconKey size={FILTER_ICON} />,
      place: 'more',
      valueText: params.get('object_id') ?? '',
      field: <FilterText param="object_id" label={t('admin.filterObjectId')} />,
    },
    {
      kind: 'choice',
      param: 'space_id',
      label: t('admin.space'),
      icon: <IconFolder size={FILTER_ICON} />,
      place: 'more',
      options: spaces.data?.spaces.map((s) => ({ value: s.id, label: s.name })) ?? [],
    },
    choiceFilter({
      param: 'result',
      label: t('admin.result'),
      icon: <IconStatus size={FILTER_ICON} />,
      place: 'more',
      values: AUDIT_RESULTS,
      name: (r) => t(`toolRow.result_${r}`),
    }),
  ];
}

function AuditTab() {
  const { t } = useTranslation();
  const dates = useDates();
  const { params } = useListAddress();
  const filters = useAuditFilters(params);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const query = queryOf(params, AUDIT_PARAMS);
  const q = useQuery({
    queryKey: ['audit', query],
    queryFn: () => api.get<{ events: AuditEvent[] }>(`/admin/audit-events?limit=${AUDIT_PAGE}&${query}`),
  });
  const verify = useMutation({
    mutationFn: () =>
      api.get<{ ok: boolean; checked: number; first_bad_seq?: number; reason?: string }>(
        '/admin/audit-events/verify',
      ),
  });
  return (
    <>
      <SectionActions>
        {/* The export holds the rows of the view: the same filters go to it (spec 100, D13). */}
        <a className="button" href={`/api/v1/admin/audit-events/export${query ? `?${query}` : ''}`}>
          {t('admin.exportCsv')}
        </a>
        <button type="button" onClick={() => verify.mutate()}>
          {t('admin.verify')}
        </button>
      </SectionActions>
      <ToolRow
        label={t('toolRow.findEvents')}
        search={{
          label: t('toolRow.searchAction'),
          placeholder: t('toolRow.searchActionHint'),
          param: 'action',
        }}
        filters={filters}
      />
      <ErrorNote error={q.error ?? verify.error} />
      {verify.data && (
        <Notice kind={verify.data.ok ? 'info' : 'error'}>
          {verify.data.ok
            ? t('admin.verifyOk', { checked: verify.data.checked })
            : t('admin.verifyBad', { seq: verify.data.first_bad_seq, reason: verify.data.reason })}
        </Notice>
      )}
      <AuditSignatures />
      <TableBox>
        <table>
          <thead>
            <tr>
              <SortHeading label={t('admin.when')} state="descending" />
              <th>{t('admin.actor')}</th>
              <th>{t('admin.action')}</th>
              <th>{t('admin.object')}</th>
              <th>{t('admin.result')}</th>
              <th>{t('admin.ip')}</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.events.length === 0 && (
              <TableEmpty columns={AUDIT_COLUMNS}>{t('admin.auditNoneFit')}</TableEmpty>
            )}
            {q.data?.events.map((e) => (
              <tr key={e.id}>
                <td>
                  <button type="button" className="ghost" onClick={() => setOpen(e)}>
                    {dates.moment(e.occurred_at)}
                  </button>
                </td>
                <td>{e.actor_id ? <PersonName id={e.actor_id} name={e.actor_id} /> : e.actor_type}</td>
                <td>{e.action}</td>
                <td>
                  {e.object_type} <span className="muted">{auditObject(e)}</span>
                </td>
                <td>{e.result}</td>
                <td>{e.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
      {open && (
        <Dialog title={open.action} onClose={() => setOpen(null)}>
          {open.object_type === 'page' && open.object_id && <PageNoteFacts id={open.object_id} />}
          {/* Focusable, so the keyboard can scroll it (WCAG 2.1.1). */}
          <pre className="audit-details" tabIndex={0}>
            {JSON.stringify(open, null, 2)}
          </pre>
        </Dialog>
      )}
    </>
  );
}

interface Settings {
  trash_retention_days: number;
  max_upload_mib: number;
  blocked_file_types: string[];
}

function ExampleSpaceSection() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const add = useMutation({
    mutationFn: () => api.post<{ key: string }>('/admin/example-space'),
    onSuccess: async ({ key }) => {
      await client.invalidateQueries({ queryKey: ['spaces'] });
      navigate(`/spaces/${key}`);
    },
  });
  return (
    <section className="settings-unit">
      <h2>{t('admin.exampleTitle')}</h2>
      <p className="muted">{t('admin.exampleHelp')}</p>
      <ErrorNote error={add.error} />
      <button type="button" disabled={add.isPending} onClick={() => add.mutate()}>
        {t('admin.exampleAdd')}
      </button>
    </section>
  );
}

/** The fields of the general settings this form shows; the section holds more, such as mail. */
const pickGeneral = (s: Settings): Settings => ({
  trash_retention_days: s.trash_retention_days,
  max_upload_mib: s.max_upload_mib,
  blocked_file_types: s.blocked_file_types,
});

/**
 * General (the section `settings`): limits on the trash and on files, the health of the disk,
 * and the helper services and the metrics token (spec 101).
 */
function SettingsTab({ me }: { me: Me }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/admin/settings') });
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (q.data) setForm(pickGeneral(q.data));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put('/admin/settings', form),
    onSuccess: async () => {
      setSaved(true);
      await client.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  if (q.error) return <ErrorNote error={q.error} />;
  if (!form || !q.data) return <Loading />;
  const stored = pickGeneral(q.data);
  return (
    <>
      <form
        className="settings-unit"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <h2>{t('admin.limitsTitle')}</h2>
        <ErrorNote error={save.error} />
        {saved && <Notice kind="info">{t('admin.saved')}</Notice>}
        <Field label={t('admin.retention')}>
          <input
            type="number"
            min={1}
            max={3650}
            value={form.trash_retention_days}
            onChange={(e) => setForm({ ...form, trash_retention_days: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('admin.maxUpload')}>
          <input
            type="number"
            min={1}
            max={10240}
            value={form.max_upload_mib}
            onChange={(e) => setForm({ ...form, max_upload_mib: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('admin.blockedTypes')} help={t('admin.blockedTypesHelp')}>
          <input
            value={form.blocked_file_types.join(',')}
            onChange={(e) => setForm({ ...form, blocked_file_types: e.target.value.split(',') })}
          />
        </Field>
        <SaveReset changed={differs(stored, form)} busy={save.isPending} onReset={() => setForm(stored)} />
      </form>
      <DiskThresholds isSystem={me.global_permissions.includes('system_administrator')} />
      <ExampleSpaceSection />
      <HelperServicesParts isSystem={me.global_permissions.includes('system_administrator')} />
    </>
  );
}

type MailSettings = Record<(typeof MAIL_SWITCHES)[number], boolean>;

function MailQueue({ entries }: { entries: MailEntry[] }) {
  const { t } = useTranslation();
  const dates = useDates();
  if (entries.length === 0) return <p className="muted">{t('admin.mailEmpty')}</p>;
  return (
    <TableBox>
      <table>
        <thead>
          <tr>
            <th>{t('admin.when')}</th>
            <th>{t('common.type')}</th>
            <th>{t('common.status')}</th>
            <th>{t('admin.mailAttempts')}</th>
            <th>{t('admin.mailError')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((m) => (
            <tr key={m.id}>
              <td>{dates.moment(m.created_at)}</td>
              <td>{m.kind}</td>
              <td>{m.status}</td>
              <td>{m.attempts}</td>
              <td>{m.last_error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableBox>
  );
}

const pickMail = (s: MailSettings): MailSettings =>
  Object.fromEntries(MAIL_SWITCHES.map((name) => [name, s[name]])) as MailSettings;

/** What the instance sends by mail: one unit that saves apart (NAV-163). */
function MailSwitches({ stored }: { stored: MailSettings }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [form, setForm] = useState(stored);
  const save = useMutation({
    mutationFn: () => api.put('/admin/settings', form),
    onSuccess: () => client.invalidateQueries({ queryKey: ['settings'] }),
  });
  return (
    <form
      className="settings-unit"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2>{t('admin.mailSwitches')}</h2>
      <ErrorNote error={save.error} />
      {MAIL_SWITCHES.map((name) => (
        <label key={name} className="check">
          <input
            type="checkbox"
            checked={form[name]}
            onChange={(e) => setForm({ ...form, [name]: e.target.checked })}
          />
          {t(`admin.${name}`)}
        </label>
      ))}
      <SaveReset changed={differs(stored, form)} busy={save.isPending} onReset={() => setForm(stored)} />
    </form>
  );
}

function MailTab({ me }: { me: Me }) {
  const { t } = useTranslation();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<MailSettings>('/admin/settings'),
  });
  const mail = useQuery({
    queryKey: ['mail-queue'],
    queryFn: () => api.get<{ configured: boolean; queue: MailEntry[] }>('/admin/mail'),
  });
  if (settings.error || mail.error) return <ErrorNote error={settings.error ?? mail.error} />;
  if (!settings.data || !mail.data) return <Loading />;
  const stored = pickMail(settings.data);
  return (
    <>
      {!mail.data.configured && (
        <Notice kind="warning" title={t('admin.mailOffTitle')}>
          {t('admin.mailOff')}
        </Notice>
      )}
      <MailServerPart isSystem={me.global_permissions.includes('system_administrator')} />
      <MailSwitches key={JSON.stringify(stored)} stored={stored} />
      <section className="settings-unit">
        <h2>{t('admin.mailQueue')}</h2>
        <MailQueue entries={mail.data.queue} />
      </section>
    </>
  );
}

interface ScimToken {
  id: string;
  name: string;
  expires_at: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function ScimTab() {
  const { t } = useTranslation();
  const dates = useDates();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [until, setUntil] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['scim-tokens'],
    queryFn: () => api.get<{ tokens: ScimToken[] }>('/admin/scim-tokens'),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['scim-tokens'] });
  const create = useMutation({
    mutationFn: () =>
      api.post<{ secret: string }>('/admin/scim-tokens', {
        name,
        expires_at: until ? new Date(until).toISOString() : undefined,
      }),
    onSuccess: async (r) => {
      setSecret(r.secret);
      setName('');
      setUntil('');
      await refresh();
    },
  });
  const rotate = useMutation({
    mutationFn: (id: string) => api.post<{ secret: string }>(`/admin/scim-tokens/${id}/rotate`),
    onSuccess: async (r) => {
      setSecret(r.secret);
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/admin/scim-tokens/${id}`),
    onSettled: refresh,
  });
  return (
    <>
      <p>
        {t('admin.scimUrl')}: <code>{window.location.origin + '/scim/v2'}</code>
      </p>
      <form
        className="row"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t('admin.tokenName')}
          placeholder={t('admin.tokenName')}
          required
        />
        <input
          type="date"
          value={until}
          aria-label={t('admin.tokenEnds')}
          title={t('admin.tokenEndsHelp')}
          onChange={(e) => setUntil(e.target.value)}
        />
        <button type="submit" className="primary">
          {t('admin.newToken')}
        </button>
      </form>
      <p className="muted">{t('admin.tokenEndsHelp')}</p>
      <ErrorNote error={q.error ?? create.error ?? revoke.error ?? rotate.error} />
      {q.data?.tokens.length === 0 ? (
        <p className="muted">{t('admin.noTokens')}</p>
      ) : (
        <TableBox>
          <table>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('admin.created')}</th>
                <th>{t('admin.tokenEnds')}</th>
                <th>{t('admin.lastUsed')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.tokens.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>{dates.moment(k.created_at)}</td>
                  <td>{dates.day(k.expires_at)}</td>
                  <td>{dates.moment(k.last_used_at)}</td>
                  <td className="row">
                    {k.revoked_at ? (
                      t('admin.revoked')
                    ) : (
                      <>
                        <button type="button" className="ghost" onClick={() => rotate.mutate(k.id)}>
                          {t('admin.rotate')}
                        </button>
                        <button type="button" className="ghost" onClick={() => revoke.mutate(k.id)}>
                          {t('admin.revoke')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      )}
      {secret && (
        <Dialog title={t('admin.newToken')} onClose={() => setSecret(null)}>
          <p>{t('admin.tokenHelp')}</p>
          <p className="muted">{t('admin.rotateHelp')}</p>
          <code className="secret">{secret}</code>
        </Dialog>
      )}
    </>
  );
}

interface System {
  version: string;
  build_date: string;
  ready: string;
  storage: string;
  queue_healthy: boolean;
  nodes: { id: string; role: string; version: string; last_seen_at: string; live: boolean }[];
  migrations_applied: number;
  contract_pending: number;
  outbox_unpublished: number;
  jobs_queued: number;
  jobs_failed_7d: number;
  trash_items: number;
}

function SystemTab({ me }: { me: Me }) {
  const { t } = useTranslation();
  const dates = useDates();
  const q = useQuery({
    queryKey: ['system'],
    queryFn: () => api.poll<System>('/admin/system'),
    refetchInterval: SYSTEM_POLL_MS,
  });
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return <Loading />;
  const s = q.data;
  const state = (ok: boolean) => (ok ? t('admin.ok') : t('admin.problem'));
  const rows: [string, string | number][] = [
    [t('admin.version'), s.version],
    ...(s.build_date ? [[t('health.builtOn'), s.build_date] as [string, string]] : []),
    [t('admin.ready'), s.ready],
    [t('admin.storage'), state(s.storage === 'ok')],
    [t('admin.queue'), state(s.queue_healthy)],
    [t('admin.migrations'), s.migrations_applied],
    [t('admin.contractPending'), s.contract_pending],
    [t('admin.outbox'), s.outbox_unpublished],
    [t('admin.jobsQueued'), s.jobs_queued],
    [t('admin.jobsFailed'), s.jobs_failed_7d],
    [t('admin.trashItems'), s.trash_items],
  ];
  return (
    <>
      <HealthChecks />
      <h2>{t('admin.nodesAndQueues')}</h2>
      <TableBox>
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
      <h2>{t('admin.nodes')}</h2>
      <TableBox>
        <table>
          <thead>
            <tr>
              <th>{t('admin.role')}</th>
              <th>{t('admin.version')}</th>
              <th>{t('admin.lastSeen')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {s.nodes.map((n) => (
              <tr key={n.id}>
                <td>{n.role}</td>
                <td>{n.version}</td>
                <td>{dates.moment(n.last_seen_at)}</td>
                <td>{n.live ? t('admin.live') : t('admin.gone')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
      <MonitoringFiles />
      <LogLevelLine me={me} />
    </>
  );
}

/** The content of one section, by its id. Every part calls the routes it called before the move. */
function SectionContent({ id, me }: { id: string; me: Me }) {
  switch (id) {
    case 'summary':
      return <SummaryTab />;
    case 'insights':
      return <InsightsTab />;
    case 'analytics':
      return <AnalyticsTab />;
    case 'audit':
      return <AuditTab />;
    case 'system':
      return <SystemTab me={me} />;
    case 'events':
      return <EventsTab />;
    case 'upgrades':
      return <UpgradesTab />;
    case 'configuration':
      return <ConfigurationTab />;
    case 'automation':
      return <RuleList spaceId={null} />;
    case 'spaces':
      return <SpacesTab />;
    case 'announcements':
      return <AnnouncementsTab />;
    case 'users':
      return <UsersTab />;
    case 'groups':
      return <GroupsTab />;
    case 'invitations':
      return <InvitationsTab />;
    case 'service-accounts':
      return <ServiceAccounts />;
    case 'settings':
      return <SettingsTab me={me} />;
    case 'rules':
      return <RulesTab me={me} />;
    case 'organising':
      return <OrganisingTab />;
    case 'mail':
      return <MailTab me={me} />;
    case 'templates':
      return <TemplatesTab />;
    case 'control':
      return <ControlTab />;
    case 'login':
      return <LoginTab me={me} />;
    case 'sessions':
      return <SessionsTab />;
    case 'scim':
      return <ScimTab />;
    case 'export':
      return <ExportTab />;
    case 'outgoing':
      return <OutgoingTab />;
    case 'instance-permissions':
      return <InstancePermissionsTab />;
    case 'permissions':
      return <PermissionsTab />;
    case 'space-defaults':
      return <SpaceDefaultsTab />;
    case 'look':
      return <LookTab />;
    case 'care':
      return <CareTab me={me} />;
    case 'backups':
      return <BackupsTab me={me} />;
    case 'import-space':
      return <ImportSpaceTab />;
    case 'spaces-trash':
      return <SpacesTrashTab />;
    case 'webhooks':
      return <WebhookList path="/admin/webhooks" />;
    default:
      return null;
  }
}

export function AdminView({ tab, me }: { tab: string; me: Me }) {
  const { t } = useTranslation();
  const capabilities = useCapabilities();
  const section = adminSection(tab);
  // The server refuses every route of the administration to anyone else; this only spares a
  // person a broken screen. An unknown address is not found either.
  if (!me.global_permissions.includes('administrator') || !section) {
    return (
      <main id="main" className="plain reading">
        <p role="alert">{t('app.notFound')}</p>
      </main>
    );
  }
  const shown = sectionsShown(capabilities);
  const entry = (s: AdminSection) => ({
    id: s.id,
    label: t(sectionNameKey(s.id)),
    href: `/admin/${s.id}`,
    icon: s.icon,
    mark: s.experimental ? t('adminFrame.experimental') : undefined,
  });
  const groupsOf = (tier: 'tool' | 'settings'): SettingsGroup[] =>
    ADMIN_GROUPS.filter((group) => group.tier === tier).map((group) => ({
      id: group.id,
      title: t(`adminGroups.${group.id}`),
      items: shown.filter((s) => s.group === group.id).map(entry),
    }));
  return (
    <SettingsFrame
      title={t('admin.title')}
      sidebar={{
        kind: 'admin',
        back: { href: '/', label: t('adminFrame.back') },
        search: <SettingsSearch shown={shown} />,
        tools: groupsOf('tool'),
        settingsTitle: t('adminFrame.settings'),
      }}
      groups={groupsOf('settings')}
      current={section.id}
      width={section.width}
    >
      <SettingsSection
        title={t(sectionNameKey(section.id))}
        intro={t(sectionIntroKey(section.id))}
        doc={section.doc}
        notices={<HealthBand />}
      >
        <SectionContent id={section.id} me={me} />
      </SettingsSection>
    </SettingsFrame>
  );
}
