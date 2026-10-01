import { shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
} from '../constants/separationPresets.js';
import { useSeparationPreparation } from './useSeparationPreparation.js';

function setup({ enabled = true } = {}) {
  const enqueue = vi.fn().mockResolvedValue({});
  const requireFeatureGate = vi.fn().mockResolvedValue(enabled);
  const preparation = useSeparationPreparation({
    enqueue,
    playbackQueue: {
      currentTrack: shallowRef({ id: 'current', duration: 60 }),
      queuedTracks: shallowRef([
        { id: 'manual', duration: 120 },
        { id: 'current', duration: 60 },
      ]),
      sourceUpcomingTracks: shallowRef([{ id: 'source', duration: 180 }]),
    },
    featureGateAccess: { requireFeatureGate },
  });
  return { enqueue, preparation, requireFeatureGate };
}

afterEach(() => {
  const { selectedMode, prepareAgain } = setup().preparation;
  selectedMode.value = DEFAULT_SEPARATION_PRESET_ID;
  prepareAgain.value = false;
});

describe('useSeparationPreparation', () => {
  it('shares one ordered playback plan and concise upper-bound hint', () => {
    const { preparation } = setup();
    expect(preparation.plannedTracks.value.map(({ id }) => id)).toEqual([
      'current',
      'manual',
      'source',
    ]);
    expect(preparation.planHint.value).toBe('3 首 · 最多新增約 121 MB');
    expect(preparation.selectedMode.value).toBe(DEFAULT_SEPARATION_PRESET_ID);
    expect(preparation.modeOptions).toEqual(
      SEPARATION_PRESET_OPTIONS.map(({ id, label }) => ({
        value: id,
        label,
      })),
    );
  });

  it('checks the feature gate before enqueueing shared mode choices', async () => {
    const { enqueue, preparation, requireFeatureGate } = setup();
    preparation.selectedMode.value = 'quick';
    preparation.prepareAgain.value = true;

    await preparation.preparePlaylist();

    expect(requireFeatureGate).toHaveBeenCalledWith(
      'audio-processing-flow',
      expect.objectContaining({ operation: 'enqueue' }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      ['current', 'manual', 'source'],
      'quick',
      true,
    );
    expect(preparation.isAdding.value).toBe(false);
  });

  it('does not enqueue when setup is unavailable', async () => {
    const { enqueue, preparation } = setup({ enabled: false });
    await preparation.preparePlaylist();
    expect(enqueue).not.toHaveBeenCalled();
    expect(preparation.isAdding.value).toBe(false);
  });
});
