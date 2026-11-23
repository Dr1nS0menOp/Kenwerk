// SPDX-License-Identifier: Apache-2.0
// The sections of Your account and their addresses (spec 084, ACC-103, ACC-105, ACC-108): seven
// tabs in a fixed order, and two screens below Security that keep it selected. The bar, the
// routes and the head of every section read this one list.

export type AccountSectionId =
  | 'profile'
  | 'email'
  | 'security'
  | 'privacy'
  | 'preferences'
  | 'notifications'
  | 'watches'
  | 'tokens'
  | 'sessions';

export interface AccountSection {
  id: AccountSectionId;
  /** The address that opens it; the addresses of before this wave keep their ids (D3). */
  address: string;
  /** A screen below a tab: it is no tab itself, and its parent stays selected (D16). */
  parent?: 'security';
  /** A document of our documentation, relative to its root, linked from the introduction. */
  doc?: string;
}

/** What a person can do to keep their account safe, and what to do when it is not. */
export const SIGN_IN_GUIDE = 'security/risks.md';
/** How tokens and their scopes work. */
export const TOKENS_GUIDE = 'api/README.md';

/** Security, the one section that opens while a second factor is required. */
export const SECURITY_SECTION: AccountSection = {
  id: 'security',
  address: '/me/security',
  doc: SIGN_IN_GUIDE,
};

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { id: 'profile', address: '/me' },
  { id: 'email', address: '/me/email' },
  SECURITY_SECTION,
  { id: 'privacy', address: '/me/data' },
  { id: 'preferences', address: '/me/preferences' },
  { id: 'notifications', address: '/me/notifications' },
  { id: 'watches', address: '/me/watches' },
  { id: 'tokens', address: '/me/tokens', parent: 'security', doc: TOKENS_GUIDE },
  { id: 'sessions', address: '/me/sessions', parent: 'security', doc: SIGN_IN_GUIDE },
];

/** The section at an address, or nothing for an address outside Your account. */
export function accountSectionAt(pathname: string): AccountSection | undefined {
  return ACCOUNT_SECTIONS.find((section) => section.address === pathname);
}

/** The tabs of the bar, in the order of ACC-105. */
export function accountTabs(): AccountSection[] {
  return ACCOUNT_SECTIONS.filter((section) => !section.parent);
}

/** The tab that is selected while a section is open: its own, or its parent's. */
export function selectedTab(section: AccountSection): AccountSectionId {
  return section.parent ?? section.id;
}

/**
 * The tabs the bar shows. While a second factor is required the server refuses the routes
 * behind every other section, so the bar shows none and Security is all that opens.
 */
export function tabsOffered(needsSecondFactor: boolean): AccountSection[] {
  return needsSecondFactor ? [] : accountTabs();
}

/** The translation key of a section's name, the same words in the bar and as its title. */
export const accountNameKey = (id: AccountSectionId) => `accountSections.${id}.name`;

/** The translation key of the one sentence that starts a section (ACC-107). */
export const accountIntroKey = (id: AccountSectionId) => `accountSections.${id}.intro`;
