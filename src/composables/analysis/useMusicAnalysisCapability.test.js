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
  it('projects bounded status labels and read failures', async () => {
    const harness = createHarness({ capability: { status: 'damaged' } });
    harness.bridge.getMusicStructureCapabilityStatus.mockRejectedValue(
      new Error('private runtime path'),
    );

    expect(harness.owner.stageLabel.value).toBe('分析功能需要修復');
    await harness.owner.refreshStatus();
    expect(harness.state.capabilityError).toBe(
      '目前無法讀取分析功能狀態，請重新啟動後再試。',
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

    harness.owner.dispose();
    harness.progress({ stage: 'ready', percent: 100 });
    harness.owner.subscribeProgress();
    expect(harness.state.capabilityProgress.stage).toBe('downloading-runtime');
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it('maps prepare and remove failures without leaking private errors', async () => {
    const harness = createHarness();
    harness.bridge.prepareMusicStructureCapability.mockRejectedValue(
      new Error('C:\\private\\runtime'),
    );
    harness.bridge.removeMusicStructureCapability.mockRejectedValue(
      new Error('EPERM'),
    );

    await expect(harness.owner.prepare()).resolves.toBeNull();
    expect(harness.state.capabilityError).toBe(
      '分析功能安裝未完成，請檢查網路連線後再試一次。',
    );
    await expect(harness.owner.remove()).resolves.toBeNull();
    expect(harness.state.capabilityError).toBe(
      '分析功能移除未完成，請再試一次。',
    );
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
