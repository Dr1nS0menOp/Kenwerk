// SPDX-License-Identifier: Apache-2.0
// Zooming a canvas in steps (PLT-140): out, the percentage, in. Each step is a class, because
// the design check allows no inline style (D12).
import { useTranslation } from 'react-i18next';
import { IconZoomIn, IconZoomOut } from './icons';

export const ZOOM_STEPS = [50, 75, 100, 125, 150] as const;
export type Zoom = (typeof ZOOM_STEPS)[number];
export const DEFAULT_ZOOM: Zoom = 100;

/** The next step out (-1) or in (+1), never past the first or the last. */
export function nextZoom(zoom: Zoom, direction: -1 | 1): Zoom {
  const i = ZOOM_STEPS.indexOf(zoom) + direction;
  return ZOOM_STEPS[Math.min(Math.max(i, 0), ZOOM_STEPS.length - 1)] ?? zoom;
}

const ICON_SIZE = 18;

export function ZoomControl({ zoom, onChange }: { zoom: Zoom; onChange: (next: Zoom) => void }) {
  const { t } = useTranslation();
  const first = ZOOM_STEPS[0];
  const last = ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return (
    <div className="zoom-control" role="group" aria-label={t('zoom.label')}>
      <button
        type="button"
        className="icon"
        aria-label={t('zoom.out')}
        title={t('zoom.out')}
        disabled={zoom === first}
        onClick={() => onChange(nextZoom(zoom, -1))}
      >
        <IconZoomOut size={ICON_SIZE} />
      </button>
      <output className="zoom-value" aria-live="polite">
        {t('zoom.percent', { value: zoom })}
      </output>
      <button
        type="button"
        className="icon"
        aria-label={t('zoom.in')}
        title={t('zoom.in')}
        disabled={zoom === last}
        onClick={() => onChange(nextZoom(zoom, 1))}
      >
        <IconZoomIn size={ICON_SIZE} />
      </button>
    </div>
  );
}
