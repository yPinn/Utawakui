import { describe, expect, it, vi } from 'vitest';
import { t } from '../../utils/i18n.js';
import {
  confirmPerformanceSessionItemRemoval,
  performanceSessionItemMenu,
} from './performanceSessionItemActions.js';

describe('performance item removal', () => {
  it.each(['queued', 'completed', 'skipped', 'interrupted'])(
    'uses the menu wording and names the selected %s item in the confirmation',
    async (progress) => {
      const history = progress !== 'queued';
      const confirm = vi.fn().mockResolvedValue(true);
      const item = { displayTitle: 'Selected item', progress };
      const menu = performanceSessionItemMenu({ history, disabled: false });
      const remove = menu.groups.at(-1).items[0];
      expect(await confirmPerformanceSessionItemRemoval(confirm, item)).toBe(
        true,
      );
      expect(confirm).toHaveBeenCalledWith({
        title: t(
          history
            ? 'session.workspace.removeHistoryTitle'
            : 'session.workspace.removeQueuedTitle',
        ),
        subject: item.displayTitle,
        message: t('session.workspace.removeMessage'),
        confirmLabel: remove.label,
        intent: 'danger',
      });
    },
  );
});
