// SPDX-License-Identifier: Apache-2.0
// The answer of the security overview (spec 088) and what the screen does with it, apart from
// drawing it, so it can be tested without a browser.

/** How a step stands (ADM-125). The server works it out; nobody ticks a step. */
export type SecurityState = 'done' | 'attention' | 'not_started';

export interface SecuritySubstep {
  id: string;
  state: SecurityState;
}

export interface SecurityStep {
  id: string;
  state: SecurityState;
  substeps: SecuritySubstep[];
  /** A null value is not known yet, and shows as a dash (ADM-124). */
  count?: { value: number | null; unit: string };
  /** Further counts in words, such as how many tokens reach Administration. */
  figures?: Record<string, number>;
  /** A section of the administration's registry and the filters it opens with (D15). */
  link: { section: string; query?: Record<string, string> };
  /** The step reads the configuration of the node that answered (D12). */
  node_fact: boolean;
}

export interface SecurityGroup {
  id: string;
  steps: SecurityStep[];
}

export interface SecurityOverview {
  as_of: string;
  groups: SecurityGroup[];
  attention: number;
}

/** The parameter of the address that hides the steps already done (ADM-191, D11). */
export const HIDE_DONE_PARAM = 'done';
export const HIDE_DONE_VALUE = 'hidden';

/** The groups to show: with done steps hidden, a group left without steps goes too. */
export function visibleGroups(groups: SecurityGroup[], hideDone: boolean): SecurityGroup[] {
  if (!hideDone) return groups;
  return groups
    .map((group) => ({ ...group, steps: group.steps.filter((step) => step.state !== 'done') }))
    .filter((group) => group.steps.length > 0);
}

/** The address of the section where a step is done, with its filters. */
export function stepAddress(link: SecurityStep['link']): string {
  const query = new URLSearchParams(link.query ?? {}).toString();
  return `/admin/${link.section}${query ? `?${query}` : ''}`;
}

/** The figures of a step in a fixed order, leaving out those that are zero. */
export function figuresShown(figures: Record<string, number> | undefined): [string, number][] {
  return Object.entries(figures ?? {})
    .filter(([, value]) => value > 0)
    .sort(([a], [b]) => a.localeCompare(b));
}
