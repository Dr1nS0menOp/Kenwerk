// SPDX-License-Identifier: Apache-2.0
// The reduced byline between the title and the text while writing (EDT-174): who owns the page
// and, under document control, the control that applies. No views, reactions or status.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageDetail } from '../api';
import { ReviewPanel } from '../components/review-panel';
import { Avatar } from '../components/ui';
import { ControlState } from './page-head';

export function EditorByline({ page }: { page: PageDetail }) {
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState(false);
  const owner = page.owner_name || page.created_by_name || t('common.unknown');
  return (
    <div className="byline editor-byline">
      <Avatar name={owner} size="small" />
      <span>{t('page.byline', { name: owner })}</span>
      <ControlState page={page} onReview={() => setReviewing(true)} />
      {reviewing && <ReviewPanel page={page} onClose={() => setReviewing(false)} />}
    </div>
  );
}
