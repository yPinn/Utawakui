import outputValues from '../../../shared/outputTemplateValues.json';
import { notificationKey } from '../../constants/notificationKeys.js';
import { useAppNotifications } from '../useAppNotifications.js';

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
        title: `${label}網址已複製`,
        message: '可貼到 OBS 的瀏覽器來源。',
      });
      return true;
    } catch (error) {
      if (latest.get(kind) !== attempt) return false;
      notifications.notifyFailure({
        key,
        title: `無法複製${label}網址`,
        message: '請再試一次。',
        error,
        code: 'OUTPUT_COPY_URL_FAILED',
        source: 'output',
        operation: 'copy-url',
        actionLabel: '重試',
        action: () => copy(kind),
      });
      return false;
    }
  }

  return { copy };
}
