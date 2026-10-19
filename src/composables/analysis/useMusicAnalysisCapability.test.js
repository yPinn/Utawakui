import { reactive, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useMusicAnalysisCapability } from './useMusicAnalysisCapability.js';

function createHarness(options = {}) {
  const state = reactive({
    capabilityProgress: null,
    capabilityBusy: false,
    capabilityError: '',
  });
  const capability = shallowRef(options.capability ?? null);
  let progressListener;
  const unsubscribe = vi.fn();
  const bridge = {
    getMusicStructureCapabilityStatus: vi.fn().mockResolvedValue({
      status: 'ready',
      installed: true,
    }),
    prepareMusicStructureCapability: vi.fn(),
    repairMusicStructureCapability: vi.fn(),
    removeMusicStructureCapability: vi.fn(),
    onMusicStructureCapabilityProgress: vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    }),
    ...options.bridge,
  };
  const owner = useMusicAnalysisCapability({
    state,
    capability,
    bridge,
    isBatchActive: options.isBatchActive,
  });

  return {
    state,
    capability,
    bridge,
    owner,
    progress: (payload) => progressListener?.(payload),
    unsubscribe,
  };
}

describe('Music Analysis capability owner', () => {
  it('separates read failures from action errors and clears each on recovery', async () => {
    const harness = createHarness();
    harness.bridge.getMusicStructureCapabilityStatus.mockRejectedValueOnce(
      new Error('private read failure'),
    );
    await harness.owner.refreshStatus();
    expect(harness.owner.readError.value).toBeTruthy();
    expect(harness.owner.error.value).toBe('');

    await harness.owner.refreshStatus();
    expect(harness.owner.readError.value).toBe('');
    expect(harness.state.capabilityError).toBe('');
    expect(harness.owner.stageLabel.value).toBe('分析功能已就緒');

    harness.bridge.repairMusicStructureCapability.mockRejectedValueOnce(
      new Error('private repair failure'),
    );
    await harness.owner.repair();
    const actionError = harness.owner.error.value;
    expect(actionError).toBe('分析功能修復未完成，請再試一次。');
    harness.bridge.getMusicStructureCapabilityStatus.mockRejectedValueOnce(
      new Error('private read failure'),
    );
    await harness.owner.refreshStatus();
    expect(harness.owner.readError.value).toBeTruthy();
    expect(harness.owner.error.value).toBe(actionError);
    await harness.owner.refreshStatus();
    expect(harness.owner.readError.value).toBe('');
    expect(harness.owner.error.value).toBe(actionError);

    harness.bridge.repairMusicStructureCapability.mockResolvedValueOnce({
      status: 'ready',
      installed: true,
    });
    await harness.owner.repair();
    expect(harness.owner.error.value).toBe('');
  });

  it.each([null, {}, { status: 7 }])(
    'rejects malformed status %j while retaining the last valid capability',
    async (status) => {
      const harness = createHarness({ capability: { status: 'missing' } });
      harness.bridge.getMusicStructureCapabilityStatus.mockResolvedValue(
        status,
      );
      await harness.owner.refreshStatus();
      expect(harness.capability.value).toEqual({ status: 'missing' });
      expect(harness.owner.readError.value).toBe(
        '目前無法讀取分析功能狀態，請重新讀取。',
      );
    },
  );

  it.each(['resolve', 'reject'])(
    'ignores a stale status %s after maintenance changes the capability',
    async (settlement) => {
      const harness = createHarness();
      let settle;
      harness.bridge.getMusicStructureCapabilityStatus.mockReturnValue(
        new Promise((resolve, reject) => {
          settle = () =>
            settlement === 'resolve'
              ? resolve({ status: 'missing' })
              : reject(new Error('stale private failure'));
        }),
      );
      const reading = harness.owner.refreshStatus();
      const installed = { status: 'ready', installed: true };
      harness.bridge.prepareMusicStructureCapability.mockResolvedValue(
        installed,
      );
      await harness.owner.prepare();
      settle();
      await reading;
      expect(harness.capability.value).toBe(installed);
      expect(harness.owner.readError.value).toBe('');
      expect(harness.owner.error.value).toBe('');
    },
  );

  it('falls back safely when status and progress bridges are unavailable', async () => {
    const harness = createHarness({
      bridge: {
        getMusicStructureCapabilityStatus: undefined,
        onMusicStructureCapabilityProgress: undefined,
      },
    });
    harness.owner.subscribeProgress();
    await harness.owner.refreshStatus();
    expect(harness.capability.value).toMatchObject({
      status: 'unavailable',
      installed: false,
      canPrepare: false,
    });
    expect(harness.owner.stageLabel.value).toBe('目前無法管理分析功能');
    expect(harness.owner.readError.value).toContain('重新啟動');
    harness.owner.dispose();
    expect(harness.unsubscribe).not.toHaveBeenCalled();
  });

  it('blocks concurrent maintenance and status reads until work settles', async () => {
    const harness = createHarness();
    let finish;
    harness.bridge.prepareMusicStructureCapability.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const preparing = harness.owner.prepare();
    expect(harness.owner.busy.value).toBe(true);
    await harness.owner.refreshStatus();
    await harness.owner.remove();
    expect(
      harness.bridge.getMusicStructureCapabilityStatus,
    ).not.toHaveBeenCalled();
    expect(
      harness.bridge.removeMusicStructureCapability,
    ).not.toHaveBeenCalled();
    finish({ status: 'ready', installed: true });
    await preparing;
    expect(harness.owner.busy.value).toBe(false);
  });

  it('accepts indeterminate progress but rejects non-finite percentages', () => {
    const harness = createHarness();
    harness.owner.subscribeProgress();
    harness.progress({ stage: 'installing-runtime' });
    expect(harness.state.capabilityProgress).toEqual({
      stage: 'installing-runtime',
    });
    expect(harness.owner.progressPercent.value).toBeNull();
    harness.progress({ stage: 'ready', percent: Number.NaN });
    harness.progress({ stage: 'ready', percent: Infinity });
    expect(harness.state.capabilityProgress.stage).toBe('installing-runtime');
    harness.progress({ stage: 'downloading-runtime', percent: -5 });
    expect(harness.owner.progressPercent.value).toBe(0);
    harness.owner.dispose();
  });

  it('projects bounded status labels and read failures', async () => {
    const harness = createHarness({ capability: { status: 'damaged' } });
    harness.bridge.getMusicStructureCapabilityStatus.mockRejectedValue(
      new Error('private runtime path'),
    );

    expect(harness.owner.stageLabel.value).toBe('分析功能需要修復');
    await harness.owner.refreshStatus();
    expect(harness.state.capabilityError).toBe(
      '目前無法讀取分析功能狀態，請重新讀取。',
    );

    harness.capability.value = { status: 'missing' };
    expect(harness.owner.stageLabel.value).toBe('尚未安裝分析功能');
    harness.state.capabilityProgress = { stage: 'future-stage' };
    expect(harness.owner.stageLabel.value).toBe('準備分析功能');
    expect(harness.owner.progressPercent.value).toBeNull();
  });

  it('bounds progress and stops accepting events after disposal', () => {
    const harness = createHarness();
    harness.owner.subscribeProgress();
    harness.owner.subscribeProgress();

    harness.progress(null);
    harness.progress({ stage: 7 });
    harness.progress({ stage: 'downloading-runtime', percent: 120 });
    expect(harness.state.capabilityProgress).toEqual({
      stage: 'downloading-runtime',
      percent: 100,
    });
    expect(
      harness.bridge.onMusicStructureCapabilityProgress,
    ).toHaveBeenCalledOnce();
    expect(harness.owner.stageLabel.value).toBe('下載分析元件');

    harness.owner.dispose();
    harness.progress({ stage: 'ready', percent: 100 });
    harness.owner.subscribeProgress();
    expect(harness.state.capabilityProgress.stage).toBe('downloading-runtime');
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it('maps maintenance failures without leaking private errors', async () => {
    const harness = createHarness();
    harness.bridge.prepareMusicStructureCapability.mockRejectedValue(
      new Error('C:\\private\\runtime'),
    );
    harness.bridge.repairMusicStructureCapability.mockRejectedValue(
      new Error('private repair command'),
    );
    harness.bridge.removeMusicStructureCapability.mockRejectedValue(
      new Error('EPERM'),
    );

    await expect(harness.owner.prepare()).resolves.toBeNull();
    expect(harness.state.capabilityError).toBe(
      '分析功能安裝未完成，請檢查網路連線後再試一次。',
    );
    await expect(harness.owner.repair()).resolves.toBeNull();
    expect(harness.state.capabilityError).toBe(
      '分析功能修復未完成，請再試一次。',
    );
    await expect(harness.owner.remove()).resolves.toBeNull();
    expect(harness.state.capabilityError).toBe(
      '分析功能移除未完成，請再試一次。',
    );
  });

  it('projects successful install and removal results without stale progress', async () => {
    const harness = createHarness();
    const installed = { status: 'ready', installed: true };
    const removed = { status: 'missing', installed: false };
    harness.bridge.prepareMusicStructureCapability.mockResolvedValue(installed);
    harness.bridge.removeMusicStructureCapability.mockResolvedValue(removed);

    await expect(harness.owner.prepare()).resolves.toBe(installed);
    expect(harness.capability.value).toBe(installed);
    expect(harness.state.capabilityProgress).toEqual({
      stage: 'ready',
      percent: 100,
    });
    expect(harness.owner.ready.value).toBe(true);

    await expect(harness.owner.remove()).resolves.toBe(removed);
    expect(harness.capability.value).toBe(removed);
    expect(harness.state.capabilityProgress).toBeNull();
    expect(harness.owner.ready.value).toBe(false);
    expect(harness.owner.busy.value).toBe(false);
  });

  it('blocks maintenance while a batch is active or a method is unavailable', async () => {
    let batchActive = true;
    const harness = createHarness({
      isBatchActive: () => batchActive,
    });

    await expect(harness.owner.repair()).resolves.toBeNull();
    batchActive = false;
    delete harness.bridge.repairMusicStructureCapability;
    await expect(harness.owner.repair()).resolves.toBeNull();
    expect(
      harness.bridge.prepareMusicStructureCapability,
    ).not.toHaveBeenCalled();
  });
});
