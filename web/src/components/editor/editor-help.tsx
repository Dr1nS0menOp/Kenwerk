// SPDX-License-Identifier: Apache-2.0
// The small round help button in the bottom start corner of the editor (EDT-173). It opens the
// overview of shortcuts with the editor's own groups first; Ctrl / and the Help entry of the
// insert menus open the same overview (EDT-197).
import { useTranslation } from 'react-i18next';
import { IconHelp } from '../icons';
import { ShortcutsDialog } from '../shortcuts';

export function EditorHelp({
  open,
  onOpen,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="editor-help">
      <button
        type="button"
        className="icon"
        aria-label={t('editor.help')}
        title={t('editor.helpTitle')}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <IconHelp />
      </button>
      {open && <ShortcutsDialog place="editor" onClose={onClose} />}
    </div>
  );
}
