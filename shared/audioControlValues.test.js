import { describe, expect, it } from 'vitest';
import values from './audioControlValues.json';

describe('audio control values', () => {
  it('defines one canonical default and range contract for every persisted audio control', () => {
    expect(values).toEqual({
      performanceVolume: {
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
      },
      captureVolume: { defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
      performanceMutedDefault: false,
      monitorGuideVocalLevel: {
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
      captureGuideVocalLevel: {
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
      },
      bgmVolume: {
        defaultValue: 0.25,
        min: 0,
        max: 1,
        step: 0.01,
      },
      bgmMutedDefault: false,
      bgmDimDb: {
        defaultValue: -12,
        min: -30,
        max: -6,
        step: 1,
      },
    });
  });
});
