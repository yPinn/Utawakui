import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppNotifications } from '../useAppNotifications.js';
import { useOutputClipboard } from './useOutputClipboard.js';

const notifications = useAppNotifications();
afterEach(() => {
  for (const item of notifications.items.value) notifications.clear(item.key);
});

describe('Output clipboard notifications', () => {
  it('keeps a newer failure when an older copy succeeds late', async () => {
    let finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const bridge = {
      copyOutputUrl: vi
        .fn()
        .mockReturnValueOnce(pending)
        .mockRejectedValueOnce(new Error('new failure')),
    };
    const owner = useOutputClipboard({ bridge });
    const first = owner.copy('lyrics');
    await owner.copy('lyrics');
    const id = notifications.items.value[0].id;
    finish();
    await first;
    expect(notifications.items.value[0]).toMatchObject({ id, tone: 'danger' });
  });

  it('uses the available desktop bridge by default and reports an absent one without throwing', async () => {
    const bridge = { copyOutputUrl: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('window', { Utawakui: bridge });
    try {
      await expect(useOutputClipboard().copy('lyrics')).resolves.toBe(true);
      expect(bridge.copyOutputUrl).toHaveBeenCalledWith('lyrics');
      vi.stubGlobal('window', undefined);
      await expect(useOutputClipboard().copy('lyrics')).resolves.toBe(false);
      expect(notifications.items.value[0].tone).toBe('danger');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('copies only the main-owned kind intent and publishes one transient result', async () => {
    const bridge = { copyOutputUrl: vi.fn().mockResolvedValue(undefined) };
    await expect(useOutputClipboard({ bridge }).copy('lyrics')).resolves.toBe(
      true,
    );
    expect(bridge.copyOutputUrl).toHaveBeenCalledExactlyOnceWith('lyrics');
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0]).toMatchObject({
      tone: 'success',
      lifecycle: 'transient',
    });
    expect(notifications.items.value[0].title).toContain('歌詞');
  });

  it('keeps failures persistent and retries the original kind after another type is copied', async () => {
    const bridge = {
      copyOutputUrl: vi
        .fn()
        .mockRejectedValueOnce(new Error('http://private-url'))
        .mockResolvedValue(undefined),
    };
    const owner = useOutputClipboard({ bridge });
    await owner.copy('lyrics');
    const failed = notifications.items.value[0];
    expect(failed).toMatchObject({
      tone: 'danger',
      lifecycle: 'persistent',
      actionLabel: '重試',
    });
    expect(JSON.stringify(failed)).not.toContain('private-url');
    await owner.copy('now-playing');
    await notifications.runAction(failed.id);
    expect(bridge.copyOutputUrl.mock.calls.map(([kind]) => kind)).toEqual([
      'lyrics',
      'now-playing',
      'lyrics',
    ]);
    expect(
      notifications.items.value.filter((item) => item.key === failed.key),
    ).toHaveLength(1);
    expect(
      notifications.items.value.find((item) => item.key === failed.key).tone,
    ).toBe('success');
  });

  it('ignores an older copy result even when the newer attempt uses another consumer', async () => {
    let fail;
    const pending = new Promise((_, reject) => {
      fail = reject;
    });
    const bridge = {
      copyOutputUrl: vi
        .fn()
        .mockReturnValueOnce(pending)
        .mockResolvedValue(undefined),
    };
    const first = useOutputClipboard({ bridge }).copy('lyrics');
    await useOutputClipboard({ bridge }).copy('lyrics');
    const id = notifications.items.value[0].id;
    fail(new Error('old failure'));
    await first;
    expect(notifications.items.value[0].id).toBe(id);
    expect(notifications.items.value[0].tone).toBe('success');
  });

  it('bounds unavailable clipboard errors and ignores unsupported kinds', async () => {
    const bridge = {};
    const owner = useOutputClipboard({ bridge });
    await expect(owner.copy('unknown')).resolves.toBe(false);
    expect(notifications.items.value).toHaveLength(0);
    await expect(owner.copy('setlist')).resolves.toBe(false);
    expect(notifications.items.value[0].tone).toBe('danger');
  });
});
