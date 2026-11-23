// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { Profile } from '../api';
import { audienceOf, savedOnLeaving, withAudience, withField } from './account-profile-edit';

const stored: Profile = {
  id: 'p1',
  name: 'Ann',
  type: 'local',
  active: true,
  job_title: 'Writer',
  department: 'Docs',
  has_picture: false,
  email: 'ann@example.com',
  location: 'Utrecht',
  about: 'Writes things down.',
  time_zone: '',
  visibility: { location: 'members' },
  is_self: true,
};

describe('editing the profile in place', () => {
  it('sends nothing when Escape leaves the field', () => {
    expect(savedOnLeaving('Writer', 'Editor', 'escape')).toBeNull();
  });

  it('sends nothing when the field is left unchanged', () => {
    expect(savedOnLeaving('Writer', 'Writer', 'leave')).toBeNull();
  });

  it('saves what was typed when a changed field is left', () => {
    expect(savedOnLeaving('Writer', 'Editor', 'leave')).toBe('Editor');
    expect(savedOnLeaving('Writer', '', 'leave')).toBe('');
  });

  it('sends the stored profile with only that one change', () => {
    expect(withField(stored, 'job_title', 'Editor')).toEqual({
      job_title: 'Editor',
      department: 'Docs',
      location: 'Utrecht',
      about: 'Writes things down.',
      visibility: { location: 'members' },
    });
  });

  it('changes one audience and keeps the others', () => {
    expect(withAudience(stored, 'email', 'me')).toEqual({
      job_title: 'Writer',
      department: 'Docs',
      location: 'Utrecht',
      about: 'Writes things down.',
      visibility: { location: 'members', email: 'me' },
    });
  });

  it('shows the address to members and every other field to everyone until chosen', () => {
    expect(audienceOf(stored, 'email')).toBe('members');
    expect(audienceOf(stored, 'job_title')).toBe('everyone');
    expect(audienceOf(stored, 'location')).toBe('members');
    expect(audienceOf({ ...stored, visibility: { about: 'nobody' } }, 'about')).toBe('everyone');
  });
});
