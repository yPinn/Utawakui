import { beforeEach, expect, it } from 'vitest';
import { useSeparationQueueNotifications as createSeparationQueueNotifications } from './useSeparationQueueNotifications.js';
import { useAppNotifications } from './useAppNotifications.js';
import { useAppRightDock } from './useAppRightDock.js';

const notifications = useAppNotifications();
beforeEach(() => {
  for (const item of notifications.items.value) notifications.clear(item.key);
});
const queue = (pairs) => ({
  items: pairs.map(([itemId, status]) => ({ itemId, status })),
});

it('keeps one summary when finished history is cleared while the remaining work continues', () => {
  const observe = createSeparationQueueNotifications(notifications.notify);
  observe(
    queue([
      ['a', 'running'],
      ['b', 'pending'],
      ['c', 'pending'],
    ]),
  );
  observe(
    queue([
      ['a', 'completed'],
      ['b', 'running'],
      ['c', 'pending'],
    ]),
  );
  observe(queue([['b', 'running']])); // Clear completed a and remove waiting c.
  expect(notifications.items.value).toHaveLength(0);
  observe(queue([['b', 'skipped']]));
  expect(notifications.items.value).toHaveLength(1);
  expect(notifications.items.value[0]).toMatchObject({
    message: '1 首完成，1 首已有伴奏，1 首已停止',
    tone: 'info',
  });
  observe(null);
  expect(notifications.items.value).toHaveLength(1);
});

it('opens the preparation list only when the result action is used', async () => {
  const observe = createSeparationQueueNotifications(notifications.notify);
  observe(queue([['a', 'checking']]));
  observe(queue([['a', 'completed']]));
  await notifications.runAction(notifications.items.value[0].id);
  const dock = useAppRightDock();
  expect(dock.preparationTab.value).toBe('separation');
  expect(dock.isExpanded.value).toBe(true);
});

it('makes an all-existing round successful without claiming a new artifact was produced', () => {
  const observe = createSeparationQueueNotifications(notifications.notify);
  observe(queue([['a', 'checking']]));
  observe(queue([['a', 'skipped']]));
  expect(notifications.items.value[0]).toMatchObject({
    message: '1 首已有伴奏',
    tone: 'success',
  });
});

it('retains a failed summary and replaces it with the same-item retry result', () => {
  const observe = createSeparationQueueNotifications(notifications.notify);
  observe(queue([['a', 'running']]));
  observe(queue([['a', 'failed']]));
  expect(notifications.items.value[0]).toMatchObject({
    tone: 'danger',
    lifecycle: 'persistent',
  });
  observe(queue([['a', 'pending']]));
  observe(queue([['a', 'completed']]));
  expect(notifications.items.value).toHaveLength(1);
  expect(notifications.items.value[0]).toMatchObject({
    tone: 'success',
    lifecycle: 'transient',
  });
});

it('does not report saved historical results on initialization or repeated reads', () => {
  const observe = createSeparationQueueNotifications(notifications.notify);
  observe(
    queue([
      ['a', 'failed'],
      ['b', 'completed'],
    ]),
  );
  observe(null);
  expect(notifications.items.value).toHaveLength(0);
});
