import { nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createAudioPreferencesPersistence } from './useAudioPreferencesPersistence.js';

describe('audio preference persistence', () => {
  it('coalesces live changes and persists preferences without requiring a track', async () => {
    vi.useFakeTimers();
    const playerState = reactive({
      track: null,
      volume: 0.5,
      captureVolume: 0.5,
      isMuted: false,
      guideVocalValue: 0.5,
      captureGuideVocalValue: 0,
    });
    const bridge = { setAudioPreferences: vi.fn().mockResolvedValue({}) };
    const persistence = createAudioPreferencesPersistence({
      playerState,
      bridge,
      saveDelayMs: 200,
    });

    persistence.initialize();
    playerState.volume = 0.61;
    playerState.volume = 0.62;
    playerState.guideVocalValue = 0.4;
    playerState.captureVolume = 0.3;
    await nextTick();

    expect(bridge.setAudioPreferences).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);

    expect(bridge.setAudioPreferences).toHaveBeenCalledOnce();
    expect(bridge.setAudioPreferences).toHaveBeenCalledWith({
      performanceVolume: 0.62,
      captureVolume: 0.3,
      performanceMuted: false,
      monitorGuideVocalLevel: 0.4,
      captureGuideVocalLevel: 0,
    });

    await persistence.dispose();
    vi.useRealTimers();
  });

  it('flushes a pending final value when disposed', async () => {
    vi.useFakeTimers();
    const playerState = reactive({
      track: null,
      volume: 0.5,
      isMuted: false,
      guideVocalValue: 0.5,
      captureGuideVocalValue: 0,
    });
    const bridge = { setAudioPreferences: vi.fn().mockResolvedValue({}) };
    const persistence = createAudioPreferencesPersistence({
      playerState,
      bridge,
      saveDelayMs: 200,
    });

    persistence.initialize();
    playerState.isMuted = true;
    await nextTick();
    await persistence.dispose();

    expect(bridge.setAudioPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ performanceMuted: true }),
    );
    vi.useRealTimers();
  });
});
