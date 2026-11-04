import outputValues from '../../../shared/outputTemplateValues.json';
import { notificationKey } from '../../constants/notificationKeys.js';
import { useAppNotifications } from '../useAppNotifications.js';
import { t } from '../../utils/i18n.js';

const labels = new Map(outputValues.slots.map(({ id, label }) => [id, label]));
const attempts = new WeakMap();

export function useOutputClipboard({
  bridge = globalThis.window?.Utawakui,
} = {}) {
  const notifications = useAppNotifications();
  const target = bridge ?? {};
  if (!attempts.has(target)) attempts.set(target, new Map());
  const latest = attempts.get(target);

  async function copy(kind) {
    const label = labels.get(kind);
    if (!label) return false;
    const attempt = {};
    const key = notificationKey.outputCopy(kind);
    latest.set(kind, attempt);
    notifications.clear(key);
    try {
      // Main derives the current URL; neither a URL nor a path crosses IPC.
      await target.copyOutputUrl(kind);
      if (latest.get(kind) !== attempt) return false;
      notifications.notify({
        key,
        title: t('outputPanel.clipboard.copiedNamed', { label }),
        message: t('outputPanel.clipboard.pasteHint'),
      });
      return true;
    } catch (error) {
      if (latest.get(kind) !== attempt) return false;
      notifications.notifyFailure({
        key,
        title: t('outputPanel.clipboard.failedNamed', { label }),
        message: t('outputPanel.clipboard.tryAgain'),
        error,
        code: 'OUTPUT_COPY_URL_FAILED',
        source: 'output',
        operation: 'copy-url',
        actionLabel: t('outputPanel.clipboard.retry'),
        action: () => copy(kind),
      });
      return false;
    }
  }

  return { copy };
}
