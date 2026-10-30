import {
  RIGHT_DOCK_SURFACE_PREPARATION,
  useAppRightDock,
} from './useAppRightDock.js';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';

const OPEN = new Set(['pending', 'checking', 'running']);
const emptyCounts = () => ({
  completed: 0,
  skipped: 0,
  failed: 0,
  cancelled: 0,
});

// Observe domain transitions, never historical terminal snapshots or view mounts.
// Completed rows may be cleared while the rest of a round is still running.
export function useSeparationQueueNotifications(notify) {
  const observed = new Map();
  let retired = emptyCounts();
  return function observe(queue) {
    const items = queue?.items ?? [];
    const present = new Set(items.map((item) => item.itemId));
    for (const [id, status] of observed) {
      if (present.has(id)) continue;
      retired[OPEN.has(status) ? 'cancelled' : status]++;
      observed.delete(id);
    }
    for (const item of items) {
      if (OPEN.has(item.status) || observed.has(item.itemId)) {
        observed.set(item.itemId, item.status);
      }
    }
    if ([...observed.values()].some((status) => OPEN.has(status))) return;
    const counts = { ...retired };
    for (const status of observed.values()) counts[status]++;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (!total) return;
    observed.clear();
    retired = emptyCounts();
    const { completed, skipped, failed, cancelled } = counts;
    const tone = failed
      ? completed || skipped
        ? 'warning'
        : 'danger'
      : cancelled
        ? 'info'
        : 'success';
    const message = [
      completed ? `${completed} 首完成` : '',
      skipped ? `${skipped} 首已有伴奏` : '',
      failed ? `${failed} 首失敗` : '',
      cancelled ? `${cancelled} 首已停止` : '',
    ]
      .filter(Boolean)
      .join('，');
    notify({
      key: NOTIFICATION_KEYS.SEPARATION_QUEUE_RESULT,
      title:
        failed && !completed && !skipped
          ? '伴奏處理未完成'
          : cancelled
            ? '伴奏處理已停止'
            : '伴奏處理完成',
      message,
      tone,
      lifecycle: failed ? 'persistent' : 'transient',
      // Transient results carry no action; the queue tab keeps the details.
      ...(failed && {
        actionLabel: '查看處理清單',
        action() {
          const dock = useAppRightDock();
          dock.selectPreparationTab('separation');
          dock.showSurface(RIGHT_DOCK_SURFACE_PREPARATION);
        },
      }),
    });
  };
}
