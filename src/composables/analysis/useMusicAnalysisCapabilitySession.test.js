import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

it.each(['prepare', 'repair', 'remove'])(
  'keeps %s failures public and retries only safe matching operations',
  async (operation) => {
    const method = `${operation}MusicStructureCapability`;
    const bridge = {
      [method]: vi
        .fn()
        .mockRejectedValueOnce(new Error('private path'))
        .mockResolvedValue({ status: 'ready', installed: true }),
      onMusicStructureCapabilityProgress: () => vi.fn(),
    };
    vi.stubGlobal('window', { Utawakui: bridge });
    const { useMusicAnalysisCapabilitySession } =
      await import('./useMusicAnalysisCapabilitySession.js');
    const session = useMusicAnalysisCapabilitySession();
    await session.owner[operation]();
    const notifications = (
      await import('../useAppNotifications.js')
    ).useAppNotifications();
    expect(notifications.items.value[0].tone).toBe('danger');
    expect(JSON.stringify(notifications.items.value)).not.toContain(
      'private path',
    );
    await notifications.runAction(notifications.items.value[0].id);
    if (operation === 'remove') {
      expect(bridge[method]).toHaveBeenCalledOnce();
      expect(
        (await import('../useAppView.js')).useAppView().settingsSection.value,
      ).toBe('processing');
    } else {
      expect(bridge[method]).toHaveBeenCalledTimes(2);
      expect(notifications.items.value[0].tone).toBe('success');
    }
  },
);

it('shares capability management across Settings remounts and keeps one subscription during a task', async () => {
  let progress, finish;
  const bridge = {
    getAutoMusicAnalysis: vi.fn().mockResolvedValue(true),
    getMusicStructureCapabilityStatus: vi
      .fn()
      .mockResolvedValue({ status: 'missing', installed: false }),
    onMusicStructureCapabilityProgress: vi.fn((handler) => {
      progress = handler;
      return vi.fn();
    }),
    prepareMusicStructureCapability: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  const { useMusicAnalysisSettings } =
    await import('../useMusicAnalysisSettings.js');
  const first = useMusicAnalysisSettings();
  await first.initialize();
  const pending = first.prepare();
  const second = useMusicAnalysisSettings();
  await second.initialize();
  expect(second.capabilityBusy.value).toBe(true);
  expect(bridge.onMusicStructureCapabilityProgress).toHaveBeenCalledOnce();
  progress({ stage: 'downloading-model', percent: 42 });
  expect(second.progressPercent.value).toBe(42);
  finish({ status: 'ready', installed: true });
  await pending;
  expect(second.capability.value.status).toBe('ready');
});
