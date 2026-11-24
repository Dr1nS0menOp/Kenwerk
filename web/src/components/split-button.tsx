// SPDX-License-Identifier: Apache-2.0
// A primary button with a second, rarer choice behind an arrow joined to it (PLT-131): the main
// part does the usual thing, the arrow opens a menu with the other.
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown } from './icons';
import { Menu } from './menu';

const ARROW_SIZE = 16;

export function SplitButton({
  label,
  onClick,
  disabled,
  why,
  menuLabel,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Unavailable, with the reason in words for screen readers and on hover. */
  disabled?: boolean;
  why?: string;
  /** The name of the arrow's menu, for screen readers. */
  menuLabel: string;
  /** The entries of the menu: `MenuItem`s. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const whyId = useId();
  return (
    <span className="split-button">
      {why && (
        <span id={whyId} hidden>
          {why}
        </span>
      )}
      <button
        type="button"
        className="primary split-main"
        aria-disabled={disabled || undefined}
        title={disabled ? why : undefined}
        aria-describedby={disabled && why ? whyId : undefined}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        {label}
      </button>
      {disabled ? (
        <button
          type="button"
          className="primary split-arrow"
          aria-label={menuLabel}
          title={why}
          aria-disabled="true"
          aria-describedby={why ? whyId : undefined}
        >
          <IconChevronDown size={ARROW_SIZE} />
        </button>
      ) : (
        <Menu
          label={menuLabel || t('common.more')}
          className="primary split-arrow"
          trigger={<IconChevronDown size={ARROW_SIZE} />}
        >
          {children}
        </Menu>
      )}
    </span>
  );
}
