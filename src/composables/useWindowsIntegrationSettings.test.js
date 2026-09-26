import { describe, expect, it, vi } from 'vitest';
import { useWindowsIntegrationSettings } from './useWindowsIntegrationSettings.js';

function createDeferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createHarness(overrides = {}) {
  const bridge = {
    getWindowCloseBehavior: vi.fn().mockResolvedValue('ask'),
    setWindowCloseBehavior: vi.fn(async (behavior) => behavior),
    ...overrides,
  };
  return {
    bridge,
    settings: useWindowsIntegrationSettings({ bridge }),
  };
}

describe('Windows integration settings owner', () => {
  it('loads ask as the default close behavior', async () => {
    const { settings } = createHarness();

    await expect(settings.refreshPreference()).resolves.toBe('ask');
    expect(settings.windowCloseBehavior.value).toBe('ask');
    expect(settings.preferenceError.value).toBe('');
  });

  it.each(['ask', 'tray', 'quit'])(
    'persists the explicit close behavior %s',
    async (behavior) => {
      const { bridge, settings } = createHarness();

      await expect(settings.setWindowCloseBehavior(behavior)).resolves.toBe(
        true,
      );

      expect(bridge.setWindowCloseBehavior).toHaveBeenCalledWith(behavior);
      expect(settings.windowCloseBehavior.value).toBe(behavior);
    },
  );

  it('rejects invalid renderer choices before IPC', async () => {
    const { bridge, settings } = createHarness();

    await expect(settings.setWindowCloseBehavior('close')).resolves.toBe(false);

    expect(bridge.setWindowCloseBehavior).not.toHaveBeenCalled();
    expect(settings.windowCloseBehavior.value).toBe('ask');
  });

  it('restores the prior choice with bounded copy when saving fails', async () => {
    const { settings } = createHarness({
      setWindowCloseBehavior: vi
        .fn()
        .mockRejectedValue(new Error('private native tray failure')),
    });

    await expect(settings.setWindowCloseBehavior('tray')).resolves.toBe(false);

    expect(settings.windowCloseBehavior.value).toBe('ask');
    expect(settings.preferenceError.value).toBe(
      '目前無法儲存關閉行為，請再試一次。',
    );
  });

  it('keeps preference writes single-flight', async () => {
    const pending = createDeferred();
    const { bridge, settings } = createHarness({
      setWindowCloseBehavior: vi.fn(() => pending.promise),
    });

    const first = settings.setWindowCloseBehavior('tray');
    await expect(settings.setWindowCloseBehavior('quit')).resolves.toBe(false);
    expect(bridge.setWindowCloseBehavior).toHaveBeenCalledOnce();

    pending.resolve('tray');
    await expect(first).resolves.toBe(true);
  });

  it('does not let a refresh supersede an in-flight preference write', async () => {
    const pendingWrite = createDeferred();
    const getWindowCloseBehavior = vi.fn().mockResolvedValue('ask');
    const { settings } = createHarness({
      getWindowCloseBehavior,
      setWindowCloseBehavior: vi.fn(() => pendingWrite.promise),
    });

    const write = settings.setWindowCloseBehavior('tray');
    await expect(settings.refreshPreference()).resolves.toBe('tray');
    expect(getWindowCloseBehavior).not.toHaveBeenCalled();

    pendingWrite.resolve('tray');
    await expect(write).resolves.toBe(true);
    expect(settings.windowCloseBehavior.value).toBe('tray');
    expect(settings.preferenceBusy.value).toBe(false);
  });

  it('does not let an older refresh overwrite a newer saved choice', async () => {
    const pendingRead = createDeferred();
    const { settings } = createHarness({
      getWindowCloseBehavior: vi.fn(() => pendingRead.promise),
    });

    const refresh = settings.refreshPreference();
    await settings.setWindowCloseBehavior('tray');
    pendingRead.resolve('ask');
    await refresh;

    expect(settings.windowCloseBehavior.value).toBe('tray');
  });

  it('fails closed on a malformed bridge response', async () => {
    const { settings } = createHarness({
      getWindowCloseBehavior: vi.fn().mockResolvedValue('close'),
    });

    await expect(settings.refreshPreference()).resolves.toBe('ask');

    expect(settings.windowCloseBehavior.value).toBe('ask');
    expect(settings.preferenceError.value).toBe(
      '目前無法讀取關閉行為，請重新啟動後再試。',
    );
  });
});
