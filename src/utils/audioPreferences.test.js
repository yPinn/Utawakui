import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIO_PREFERENCES,
  normalizeAudioPreferences,
  projectAudioPreferences,
} from './audioPreferences.js';

describe('renderer audio preferences', () => {
  it('defaults older preferences to 50% capture and preserves an explicit silent capture', () => {
    expect(normalizeAudioPreferences({}).captureVolume).toBe(0.5);
    expect(normalizeAudioPreferences({ captureVolume: 0 }).captureVolume).toBe(
      0,
    );
    expect(normalizeAudioPreferences({ captureVolume: 2 }).captureVolume).toBe(
      0.5,
    );
    expect(projectAudioPreferences({ captureVolume: 0.3 }).captureVolume).toBe(
      0.3,
    );
  });
  it('uses canonical defaults and preserves valid fields beside invalid data', () => {
    expect(DEFAULT_AUDIO_PREFERENCES).toEqual({
      performanceVolume: 0.5,
      captureVolume: 0.5,
      performanceMuted: false,
      monitorGuideVocalLevel: 0.5,
      captureGuideVocalLevel: 0,
    });
    expect(
      normalizeAudioPreferences({
        performanceVolume: 0.7,
        captureVolume: 0.5,
        performanceMuted: 'yes',
        monitorGuideVocalLevel: 2,
        captureGuideVocalLevel: 0.2,
      }),
    ).toEqual({
      performanceVolume: 0.7,
      captureVolume: 0.5,
      performanceMuted: false,
      monitorGuideVocalLevel: 0.5,
      captureGuideVocalLevel: 0.2,
    });
  });

  it('projects only persisted audio fields from player state', () => {
    expect(
      projectAudioPreferences({
        volume: 0.64,
        isMuted: true,
        guideVocalValue: 0.45,
        captureGuideVocalValue: 0.25,
        guideVocalOn: false,
        captureGuideVocalOn: true,
        privatePath: 'E:\\private.wav',
      }),
    ).toEqual({
      performanceVolume: 0.64,
      captureVolume: 0.5,
      performanceMuted: true,
      monitorGuideVocalLevel: 0.45,
      captureGuideVocalLevel: 0.25,
    });
  });
});
