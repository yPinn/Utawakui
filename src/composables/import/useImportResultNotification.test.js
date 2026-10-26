import { beforeEach, expect, it, vi } from 'vitest';
import { useImportResultNotification } from './useImportResultNotification.js';
import { useAppNotifications } from '../useAppNotifications.js';
import { useAppRightDock } from '../useAppRightDock.js';

const notifications = useAppNotifications();
const notifyImportResult = (batch, notify) =>
  useImportResultNotification(notify)(batch);
beforeEach(() => {
  for (const item of notifications.items.value) notifications.clear(item.key);
});
function batch(patch = {}) {
  return {
    id: 'test',
    kind: 'playlist',
    phase: 'completed',
    tracks: [{ downloadRequired: true, status: 'done' }],
    ...patch,
  };
}

it('keeps collection-save failure recoverable even after every audio download succeeded', () => {
  notifyImportResult(batch({ saveError: true }), notifications.notify);
  expect(notifications.items.value[0]).toMatchObject({
    title: '下載未完成',
    tone: 'warning',
    lifecycle: 'persistent',
  });
  expect(notifications.items.value[0].message).toContain('播放清單未儲存');
});

it('separates stopped and failed outcomes from successful downloads', () => {
  const notify = vi.fn();
  notifyImportResult(
    batch({
      phase: 'cancelled',
      tracks: [{ downloadRequired: true, status: 'cancelled' }],
    }),
    notify,
  );
  expect(notify.mock.calls[0][0]).toMatchObject({
    title: '下載已停止',
    tone: 'info',
    lifecycle: 'transient',
  });
  notifyImportResult(
    batch({
      phase: 'failed',
      tracks: [{ downloadRequired: true, status: 'error' }],
    }),
    notify,
  );
  expect(notify.mock.calls[1][0]).toMatchObject({
    tone: 'danger',
    lifecycle: 'persistent',
  });
});

it('does not double-notify a setup recovery and does not count existing audio as a download', () => {
  const notify = vi.fn();
  notifyImportResult(batch({ setupRequired: true }), notify);
  expect(notify).not.toHaveBeenCalled();
  notifyImportResult(
    batch({ tracks: [{ downloadRequired: false, status: 'done' }] }),
    notify,
  );
  expect(notify.mock.calls[0][0]).toMatchObject({
    title: '匯入完成',
    message: '0 首下載完成，1 首已在曲庫',
  });
});

it('bounds single-track text and opens the existing import results on action', async () => {
  notifyImportResult(
    batch({ kind: 'single', resultTitle: 'a'.repeat(250) }),
    notifications.notify,
  );
  expect(notifications.items.value[0].message).toHaveLength(200);
  await notifications.runAction(notifications.items.value[0].id);
  expect(useAppRightDock().preparationTab.value).toBe('import');
});

it('falls back to the accepted track title when the provider omits a title', () => {
  const notify = vi.fn();
  notifyImportResult(batch({ kind: 'single', title: 'Accepted song' }), notify);
  expect(notify.mock.calls[0][0].message).toBe('Accepted song');
  notifyImportResult(batch({ kind: 'single' }), notify);
  expect(notify.mock.calls[1][0].message).toBe('歌曲已加入曲庫');
});
