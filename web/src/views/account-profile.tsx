// SPDX-License-Identifier: Apache-2.0
// Profile and visibility (spec 084, ACC-114 to ACC-117, ACC-120): three cards a shade off the
// page, whose rows are edited in place and saved when left, each with who may see it at its end;
// then the groups the person belongs to.
import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Me, type MemberGroup, type Profile } from '../api';
import { Link } from '../router';
import { AccountSectionHead } from '../components/account-frame';
import { CropDialog } from '../components/crop-dialog';
import { IconChevronDown, IconEye, IconLock, IconPeople, IconTick } from '../components/icons';
import { Menu } from '../components/menu';
import { Notice } from '../components/notice';
import { PersonPicture } from '../components/person';
import { useSaved } from '../components/toast';
import { ErrorNote, FilePicker, Loading } from '../components/ui';
import type { Crop } from '../crop';
import {
  AUDIENCES,
  audienceOf,
  savedOnLeaving,
  withAudience,
  withField,
  type Audience,
  type Leaving,
  type ProfileTextField,
  type ProfileUpdate,
  type VisibleField,
} from './account-profile-edit';

const PICTURE_TYPES = 'image/png,image/jpeg,image/gif';
const ICON_SIZE = 16;
const AUDIENCE_ICONS = { everyone: IconEye, members: IconPeople, me: IconLock } as const;

function PictureCard({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['profile', profile.id] });
    await client.invalidateQueries({ queryKey: ['person', profile.id] });
  };
  const save = useMutation({
    mutationFn: (crop: Crop) => {
      if (!file) throw new Error(t('app.error'));
      return api.replace(`/me/picture?x=${crop.x}&y=${crop.y}&size=${crop.size}`, file);
    },
    onSuccess: async () => {
      setFile(null);
      await refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => api.del('/me/picture'), onSuccess: refresh });
  return (
    <section>
      <h2>{t('account.picture')}</h2>
      <div className="settings-card shaded profile-picture">
        <PersonPicture person={profile} size="large" />
        <div className="profile-picture-actions">
          <div className="row">
            <FilePicker label={t('account.pictureUpload')} accept={PICTURE_TYPES} onPick={setFile} />
            {profile.has_picture && (
              <button type="button" onClick={() => remove.mutate()}>
                {t('common.remove')}
              </button>
            )}
          </div>
          <p className="muted">{t('account.pictureHelp')}</p>
        </div>
      </div>
      <ErrorNote error={save.error ?? remove.error} />
      {file && (
        <CropDialog
          file={file}
          busy={save.isPending}
          onSave={(crop) => save.mutate(crop)}
          onClose={() => setFile(null)}
        />
      )}
    </section>
  );
}

/** Who sees one field: a borderless button with the audience, opening a choice of three (D17). */
function AudienceChooser({
  field,
  audience,
  onChoose,
}: {
  field: VisibleField;
  audience: Audience;
  onChoose: (next: Audience) => void;
}) {
  const { t } = useTranslation();
  const Icon = AUDIENCE_ICONS[audience];
  const label = t('account.whoSeesNow', {
    field: t(`people.field_${field}`),
    audience: t(`account.visible_${audience}`),
  });
  return (
    <Menu
      label={label}
      className="audience-button"
      trigger={
        <>
          <Icon size={ICON_SIZE} />
          <span>{t(`account.visible_${audience}`)}</span>
          <IconChevronDown size={ICON_SIZE} />
        </>
      }
    >
      {AUDIENCES.map((choice) => (
        <button
          key={choice}
          type="button"
          role="menuitemradio"
          aria-checked={choice === audience}
          onClick={() => onChoose(choice)}
        >
          <span className="menu-tick">{choice === audience && <IconTick size={ICON_SIZE} />}</span>
          {t(`account.visible_${choice}`)}
        </button>
      ))}
    </Menu>
  );
}

/** A row at rest: its label and value, or a dim line that invites the person to add one. */
function RowText({ label, value, invite }: { label: string; value: string; invite: string }) {
  return (
    <>
      <span className="profile-label">{label}</span>
      {value ? (
        <span className="profile-value">{value}</span>
      ) : (
        <span className="profile-invite">{invite}</span>
      )}
    </>
  );
}

function EditField({
  field,
  stored,
  onLeave,
}: {
  field: ProfileTextField;
  stored: string;
  onLeave: (typed: string, how: Leaving) => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState(stored);
  // Escape removes the input, and a browser may still send it a blur: that must not save.
  const undone = useRef(false);
  const id = `profile-${field}`;
  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    undone.current = true;
    onLeave(typed, 'escape');
  };
  const props = {
    id,
    value: typed,
    autoFocus: true,
    onKeyDown: keys,
    onBlur: () => {
      if (!undone.current) onLeave(typed, 'leave');
    },
  };
  return (
    <>
      <label className="profile-label" htmlFor={id}>
        {t(`people.field_${field}`)}
      </label>
      {field === 'about' ? (
        <textarea rows={3} {...props} onChange={(e) => setTyped(e.target.value)} />
      ) : (
        <input {...props} onChange={(e) => setTyped(e.target.value)} />
      )}
    </>
  );
}

interface Editing {
  open: ProfileTextField | null;
  setOpen: (field: ProfileTextField | null) => void;
  save: (update: ProfileUpdate, done?: () => void) => void;
}

function EditableRow({
  profile,
  field,
  editing,
}: {
  profile: Profile;
  field: ProfileTextField;
  editing: Editing;
}) {
  const { t } = useTranslation();
  const stored = profile[field];
  const locked = profile.locked_fields?.includes(field) ?? false;
  const chooser = (
    <AudienceChooser
      field={field}
      audience={audienceOf(profile, field)}
      onChoose={(next) => editing.save(withAudience(profile, field, next))}
    />
  );
  const text = (
    <RowText label={t(`people.field_${field}`)} value={stored} invite={t(`account.add_${field}`)} />
  );
  if (locked) {
    return (
      <div className="settings-card-row profile-row">
        <div className="profile-text">
          {text}
          <span className="profile-locked">
            <IconLock size={ICON_SIZE} /> {t('account.lockedByProvider')}
          </span>
        </div>
        {chooser}
      </div>
    );
  }
  const rowButton = `profile-edit-${field}`;
  const leave = (typed: string, how: Leaving) => {
    const value = savedOnLeaving(stored, typed, how);
    if (value !== null) {
      editing.save(withField(profile, field, value), () => editing.setOpen(null));
      return;
    }
    editing.setOpen(null);
    // Escape keeps the keyboard where it was: on the row, which is drawn again in the next frame.
    if (how === 'escape') requestAnimationFrame(() => document.getElementById(rowButton)?.focus());
  };
  return (
    <div className="settings-card-row profile-row">
      {editing.open === field ? (
        <div className="profile-text profile-editing">
          <EditField field={field} stored={stored} onLeave={leave} />
        </div>
      ) : (
        <button
          id={rowButton}
          type="button"
          className="profile-text profile-edit"
          onClick={() => editing.setOpen(field)}
        >
          {text}
        </button>
      )}
      {chooser}
    </div>
  );
}

/** The time in the person's own time zone, or Not set with the way to set it (ACC-120). */
function LocalTimeRow({ zone }: { zone: string }) {
  const { t } = useTranslation();
  const time = zone
    ? new Intl.DateTimeFormat(undefined, { timeStyle: 'short', timeZone: zone }).format(new Date())
    : '';
  return (
    <div className="settings-card-row profile-row">
      <div className="profile-text">
        <span className="profile-label">{t('account.localTime')}</span>
        {time ? (
          <span className="profile-value">{t('account.localTimeIn', { time, zone })}</span>
        ) : (
          <span className="profile-invite">
            {t('account.notSet')} <Link href="/me/preferences">{t('account.setTimeZone')}</Link>
          </span>
        )}
      </div>
    </div>
  );
}

function CardHead({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="profile-card-head">
      <h2>{title}</h2>
      <span className="muted">{t('account.whoSeesCaption')}</span>
    </div>
  );
}

function AboutCard({ profile, editing }: { profile: Profile; editing: Editing }) {
  const { t } = useTranslation();
  return (
    <section>
      <CardHead title={t('account.aboutYou')} />
      <div className="settings-card shaded">
        <div className="settings-card-row profile-row">
          <div className="profile-text">
            <RowText label={t('common.name')} value={profile.name} invite="" />
          </div>
        </div>
        <EditableRow profile={profile} field="job_title" editing={editing} />
        <EditableRow profile={profile} field="department" editing={editing} />
        <EditableRow profile={profile} field="location" editing={editing} />
        <LocalTimeRow zone={profile.time_zone} />
        <EditableRow profile={profile} field="about" editing={editing} />
      </div>
    </section>
  );
}

function ContactCard({ profile, editing }: { profile: Profile; editing: Editing }) {
  const { t } = useTranslation();
  return (
    <section>
      <CardHead title={t('account.contact')} />
      <div className="settings-card shaded">
        <div className="settings-card-row profile-row">
          <div className="profile-text">
            <RowText label={t('common.email')} value={profile.email} invite="" />
          </div>
          <AudienceChooser
            field="email"
            audience={audienceOf(profile, 'email')}
            onChoose={(next) => editing.save(withAudience(profile, 'email', next))}
          />
        </div>
      </div>
    </section>
  );
}

function OwnGroups() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['my-groups'],
    queryFn: () => api.get<{ groups: MemberGroup[] }>('/me/groups'),
  });
  if ((q.data?.groups.length ?? 0) === 0) return <ErrorNote error={q.error} />;
  return (
    <section>
      <h2>{t('account.groups')}</h2>
      <ul className="plain-list">
        {q.data?.groups.map((g) => (
          <li key={g.id}>
            {g.owner ? <Link href={`/groups/${g.id}`}>{g.name}</Link> : g.name}{' '}
            {g.owner && <span className="lozenge">{t('account.groupOwner')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function useProfileSave(profile: Profile | undefined) {
  const client = useQueryClient();
  const saved = useSaved();
  return useMutation({
    mutationFn: (update: ProfileUpdate) => api.put('/me/profile', update),
    onSuccess: async () => {
      saved();
      if (!profile) return;
      await client.invalidateQueries({ queryKey: ['profile', profile.id] });
      await client.invalidateQueries({ queryKey: ['person', profile.id] });
    },
  });
}

export function ProfileView({ me }: { me: Me }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['profile', me.user.id],
    queryFn: () => api.get<Profile>(`/people/${me.user.id}`),
  });
  const [open, setOpen] = useState<ProfileTextField | null>(null);
  const saving = useProfileSave(q.data);
  const editing: Editing = {
    open,
    setOpen,
    save: (update, done) => saving.mutate(update, { onSuccess: done }),
  };
  const locked = (q.data?.locked_fields?.length ?? 0) > 0;
  return (
    <AccountSectionHead
      id="profile"
      notices={locked && <Notice kind="info">{t('account.lockedNotice')}</Notice>}
    >
      {q.isPending && <Loading />}
      <ErrorNote error={q.error} />
      {q.data && (
        <>
          <PictureCard profile={q.data} />
          <AboutCard profile={q.data} editing={editing} />
          <ContactCard profile={q.data} editing={editing} />
          <ErrorNote error={saving.error} />
        </>
      )}
      <OwnGroups />
    </AccountSectionHead>
  );
}
