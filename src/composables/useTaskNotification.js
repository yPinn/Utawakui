import { useAppNotifications } from './useAppNotifications.js';

// A per-attempt projection handle, never a task registry. Domain owners own
// requests, progress, busy flags and cancellation. Closing this view cancels none.
export function useTaskNotification({
  key,
  title,
  actionLabel = '查看設定',
  action,
}) {
  const notifications = useAppNotifications();
  const id = notifications.notify({
    key,
    title,
    tone: 'info',
    lifecycle: 'progress',
    progress: null,
    priority: -1,
    actionLabel,
    action,
    consumeAction: false,
  });
  let settled = false;
  function progress(message, value = null) {
    if (settled) return false;
    return notifications.update(id, {
      message,
      progress: value,
      announcement: 'off',
    });
  }
  function finish({
    title: resultTitle,
    message = '',
    tone = 'success',
    actionLabel: resultLabel = actionLabel,
    action: resultAction = action,
  }) {
    if (settled) return false;
    settled = true;
    const result = {
      title: resultTitle,
      message,
      tone,
      lifecycle: tone === 'success' ? 'transient' : 'persistent',
      progress: null,
      priority: tone === 'danger' ? 1 : 0,
      announcement: 'polite',
      actionLabel: resultLabel,
      action: resultAction,
      consumeAction: true,
    };
    if (notifications.update(id, result)) return true;
    // Manual dismissal can suppress progress while still allowing one result.
    // A newer attempt with the same key always owns the result surface.
    if (!notifications.isCurrent(key, id)) return false;
    notifications.notify({ key, ...result });
    return true;
  }
  function discard() {
    settled = true;
    notifications.dismiss(id);
  }
  return { progress, finish, discard };
}
