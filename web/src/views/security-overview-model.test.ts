// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { adminSection } from './admin-sections';
import {
  figuresShown,
  stepAddress,
  visibleGroups,
  type SecurityGroup,
  type SecurityStep,
} from './security-overview-model';

const step = (id: string, state: SecurityStep['state']): SecurityStep => ({
  id,
  state,
  substeps: [{ id, state }],
  link: { section: 'login' },
  node_fact: false,
});

const GROUPS: SecurityGroup[] = [
  { id: 'sign_in', steps: [step('second_factor', 'attention'), step('two_administrators', 'done')] },
  { id: 'installation', steps: [step('https', 'done')] },
  { id: 'access', steps: [step('guests', 'not_started')] },
];

describe('the security overview', () => {
  it('shows every step while the switch is off', () => {
    expect(visibleGroups(GROUPS, false)).toBe(GROUPS);
  });

  it('hides the steps that are done, and a group left without steps (ADM-191)', () => {
    const shown = visibleGroups(GROUPS, true);
    expect(shown.map((g) => [g.id, g.steps.map((s) => s.id)])).toEqual([
      ['sign_in', ['second_factor']],
      ['access', ['guests']],
    ]);
  });

  it('shows nothing when every step is done and done steps are hidden', () => {
    const allDone = GROUPS.map((g) => ({
      ...g,
      steps: g.steps.map((s) => ({ ...s, state: 'done' as const })),
    }));
    expect(visibleGroups(allDone, true)).toEqual([]);
  });

  it('keeps the order of the groups and the steps', () => {
    const shown = visibleGroups(GROUPS, false);
    expect(shown.map((g) => g.id)).toEqual(['sign_in', 'installation', 'access']);
  });

  it('leads a step to its section, with its filters in the address', () => {
    expect(stepAddress({ section: 'backups' })).toBe('/admin/backups');
    expect(stepAddress({ section: 'users', query: { role: 'administrator' } })).toBe(
      '/admin/users?role=administrator',
    );
  });

  it('leads only to sections the administration has', () => {
    for (const section of [
      'login',
      'users',
      'backups',
      'audit',
      'configuration',
      'export',
      'service-accounts',
    ]) {
      expect(adminSection(section)?.id, section).toBe(section);
    }
    expect(adminSection('security-overview')?.experimental).toBe('security_overview');
  });

  it('names the figures that are not zero, in one order', () => {
    expect(figuresShown({ unused: 0, writing: 2, administration: 1 })).toEqual([
      ['administration', 1],
      ['writing', 2],
    ]);
    expect(figuresShown(undefined)).toEqual([]);
  });
});
