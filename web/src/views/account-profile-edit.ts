// SPDX-License-Identifier: Apache-2.0
// What editing the profile in place sends (spec 084, ACC-116, D18): `PUT /me/profile` takes the
// whole profile, so leaving a field sends the stored profile with that one change, and Escape or
// an unchanged field sends nothing.
import type { Profile } from '../api';

export const PROFILE_TEXT_FIELDS = ['job_title', 'department', 'location', 'about'] as const;
export type ProfileTextField = (typeof PROFILE_TEXT_FIELDS)[number];

/** The fields whose audience the person chooses; the address is one of them. */
export type VisibleField = ProfileTextField | 'email';

export const AUDIENCES = ['everyone', 'members', 'me'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** The body of `PUT /me/profile`. */
export interface ProfileUpdate {
  job_title: string;
  department: string;
  location: string;
  about: string;
  visibility: Record<string, string>;
}

/** How a field was left: by moving on, which saves a change, or by Escape, which undoes it. */
export type Leaving = 'leave' | 'escape';

function storedUpdate(profile: Profile): ProfileUpdate {
  return {
    job_title: profile.job_title,
    department: profile.department,
    location: profile.location,
    about: profile.about,
    visibility: { ...profile.visibility },
  };
}

/** The stored profile with one field changed. */
export function withField(profile: Profile, field: ProfileTextField, value: string): ProfileUpdate {
  return { ...storedUpdate(profile), [field]: value };
}

/** The stored profile with the audience of one field changed. */
export function withAudience(profile: Profile, field: VisibleField, audience: Audience): ProfileUpdate {
  const update = storedUpdate(profile);
  return { ...update, visibility: { ...update.visibility, [field]: audience } };
}

/** Who sees a field: what the person chose, or the server's default (members for the address). */
export function audienceOf(profile: Profile, field: VisibleField): Audience {
  const chosen = profile.visibility?.[field];
  const known = AUDIENCES.find((audience) => audience === chosen);
  if (known) return known;
  return field === 'email' ? 'members' : 'everyone';
}

/** The value to save when a field is left, or null when nothing is to be sent. */
export function savedOnLeaving(stored: string, typed: string, how: Leaving): string | null {
  if (how === 'escape' || typed === stored) return null;
  return typed;
}
