// SPDX-License-Identifier: Apache-2.0
// One step of the security overview (ADM-128): a full-width outlined row that is one link, with
// a square tile that shows the state by tint and symbol and says it in words to screen readers,
// a bold title, one softer line, the sub-steps as bullets, and at the end a small outlined count
// with its unit word before an arrow.
import { useTranslation } from 'react-i18next';
import { Link } from '../router';
import {
  figuresShown,
  stepAddress,
  type SecurityState,
  type SecurityStep as Step,
} from '../views/security-overview-model';
import { IconChevronRight, IconOpenCircle, IconPanelWarning, IconTick } from './icons';

const TILE_ICON = 18;
const ARROW_ICON = 16;
/** The unit of a count not known yet reads in the plural: "– days". */
const UNKNOWN_PLURAL = 2;

const STATE_ICONS = { done: IconTick, attention: IconPanelWarning, not_started: IconOpenCircle } as const;

function StateTile({ state }: { state: SecurityState }) {
  const Icon = STATE_ICONS[state];
  return (
    <span className={`security-tile security-tile-${state}`}>
      <Icon size={TILE_ICON} />
    </span>
  );
}

function StepCount({ count }: { count: NonNullable<Step['count']> }) {
  const { t } = useTranslation();
  const unit = `securityOverview.unit_${count.unit}`;
  if (count.value === null) {
    // A value not known yet is a dash, which a screen reader hears as not known (ADM-124).
    return (
      <span className="security-count">
        <span aria-hidden="true">–</span>
        <span className="visually-hidden">{t('securityOverview.notKnown')}</span>{' '}
        {t(unit, { count: UNKNOWN_PLURAL, value: '' }).trim()}
      </span>
    );
  }
  return <span className="security-count">{t(unit, { count: count.value, value: count.value })}</span>;
}

export function SecurityStep({ step }: { step: Step }) {
  const { t } = useTranslation();
  const figures = figuresShown(step.figures);
  return (
    <Link href={stepAddress(step.link)} className="security-step">
      <StateTile state={step.state} />
      <span className="security-step-text">
        <span className="security-step-title">
          <span className="visually-hidden">{t(`securityOverview.state_${step.state}`)}: </span>
          {t(`securityOverview.step_${step.id}`)}
        </span>
        <span className="security-step-why">
          {t(`securityOverview.why_${step.id}`)}
          {step.node_fact && ` ${t('securityOverview.nodeFact')}`}
        </span>
        {figures.length > 0 && (
          <span className="security-step-figures">
            {figures
              .map(([name, value]) => t(`securityOverview.figure_${name}`, { count: value }))
              .join(' · ')}
          </span>
        )}
        <span className="security-substeps">
          {step.substeps.map((sub) => (
            <span key={sub.id} className={`security-substep security-substep-${sub.state}`}>
              {t(`securityOverview.sub_${sub.id}`)}{' '}
              <span className="security-substep-state">{t(`securityOverview.state_${sub.state}`)}</span>
            </span>
          ))}
        </span>
      </span>
      {step.count && <StepCount count={step.count} />}
      <span className="security-step-arrow">
        <IconChevronRight size={ARROW_ICON} />
      </span>
    </Link>
  );
}
