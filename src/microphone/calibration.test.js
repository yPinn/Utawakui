import { describe, expect, it } from 'vitest';
import {
  recommendMicrophoneThreshold,
  recommendMicrophoneActivityThresholds,
} from './calibration.js';

const conditions = {
  selectedDeviceId: 'mic-a',
  controls: { noiseFloor: -55, sensitivity: 1, smoothingMs: 150 },
  inputOptions: { gainDb: 0, highPassHz: 0 },
  settings: { sampleRate: 48000, channelCount: 1 },
};
const result = (changes = {}) => ({
  count: 100,
  p10Dbfs: -66,
  medianDbfs: -64,
  p95Dbfs: -62,
  maxDbfs: -60,
  nearClipCount: 0,
  conditions,
  ...changes,
});
const pair = (offset = 0) => ({
  quiet: result({
    p10Dbfs: -66 + offset,
    medianDbfs: -64 + offset,
    p95Dbfs: -62 + offset,
    maxDbfs: -60 + offset,
  }),
  voice: result({
    p10Dbfs: -42 + offset,
    medianDbfs: -38 + offset,
    p95Dbfs: -32 + offset,
    maxDbfs: -28 + offset,
  }),
});

describe('microphone threshold calibration candidate', () => {
  it('requires room for two 3dB margins and 6dB hysteresis, without weakening either', () => {
    expect(recommendMicrophoneActivityThresholds(pair())).toMatchObject({
      status: 'ready',
      openThreshold: -52,
      closeThreshold: -58,
    });
    const p = pair();
    expect(
      recommendMicrophoneActivityThresholds({
        ...p,
        voice: { ...p.voice, p10Dbfs: -50 },
      }),
    ).toMatchObject({
      status: 'ready',
      openThreshold: -53,
      closeThreshold: -59,
    });
    expect(
      recommendMicrophoneActivityThresholds({
        ...p,
        voice: { ...p.voice, p10Dbfs: -53 },
      }).status,
    ).toBe('overlap');
    expect(recommendMicrophoneActivityThresholds({}).status).toBe('incomplete');
  });
  it('needs two complete windows and never substitutes a fixed threshold', () => {
    expect(recommendMicrophoneThreshold({})).toEqual({ status: 'incomplete' });
    expect(recommendMicrophoneThreshold({ quiet: result() })).toEqual({
      status: 'incomplete',
    });
  });
  it('uses relative quiet and soft-voice distributions across input levels', () => {
    const a = recommendMicrophoneThreshold(pair());
    const b = recommendMicrophoneThreshold(pair(10));
    expect(a).toMatchObject({
      status: 'ready',
      thresholdDbfs: -52,
      quietDbfs: -62,
      voiceDbfs: -42,
      separationDb: 20,
    });
    expect(b.thresholdDbfs).toBe(a.thresholdDbfs + 10);
  });
  it('rejects overlapping samples, insufficient windows and clipping', () => {
    const p = pair();
    expect(
      recommendMicrophoneThreshold({
        ...p,
        voice: result({
          p10Dbfs: -57,
          medianDbfs: -54,
          p95Dbfs: -50,
          maxDbfs: -48,
        }),
      }).status,
    ).toBe('overlap');
    expect(
      recommendMicrophoneThreshold({ ...p, quiet: result({ count: 79 }) })
        .status,
    ).toBe('invalid');
    expect(
      recommendMicrophoneThreshold({
        ...p,
        voice: result({ nearClipCount: 1 }),
      }).status,
    ).toBe('clipped');
  });
  it('does not infer a noise floor from digital silence or accept unbounded data', () => {
    expect(
      recommendMicrophoneThreshold({
        ...pair(),
        quiet: result({
          p10Dbfs: -100,
          medianDbfs: -100,
          p95Dbfs: -100,
          maxDbfs: -100,
        }),
      }).status,
    ).toBe('floor');
    for (const p95Dbfs of [NaN, Infinity, 1, -101])
      expect(
        recommendMicrophoneThreshold({ ...pair(), quiet: result({ p95Dbfs }) })
          .status,
      ).toBe('invalid');
    expect(
      recommendMicrophoneThreshold({
        ...pair(),
        voice: result({ p10Dbfs: -50 }),
      }).status,
    ).toBe('invalid');
  });
  it('rejects different processing/format and respects the product threshold range', () => {
    const p = pair();
    expect(
      recommendMicrophoneThreshold({
        ...p,
        voice: result({
          conditions: { ...conditions, inputOptions: { gainDb: 6 } },
        }),
      }).status,
    ).toBe('conditions');
    expect(recommendMicrophoneThreshold(pair(-45)).status).toBe('invalid');
    expect(
      recommendMicrophoneThreshold({
        quiet: result({
          p10Dbfs: -17,
          medianDbfs: -15,
          p95Dbfs: -12,
          maxDbfs: -11,
        }),
        voice: result({
          p10Dbfs: -5,
          medianDbfs: -4,
          p95Dbfs: -2,
          maxDbfs: -1,
        }),
      }).status,
    ).toBe('bounds');
  });
  it('keeps both margins when rounding and accepts the minimum separated interval', () => {
    const p = pair();
    const voice = result({
      p10Dbfs: -56,
      medianDbfs: -54,
      p95Dbfs: -50,
      maxDbfs: -48,
    });
    expect(recommendMicrophoneThreshold({ ...p, voice })).toMatchObject({
      status: 'ready',
      thresholdDbfs: -59,
    });
    expect(
      recommendMicrophoneThreshold({
        ...p,
        quiet: result({ p95Dbfs: -62.2 }),
        voice: { ...voice, p10Dbfs: -56.2 },
      }).status,
    ).toBe('bounds');
  });
  it('rejects unknown conditions, device changes, and requested or reported automatic gain', () => {
    const p = pair();
    expect(
      recommendMicrophoneThreshold({
        ...p,
        quiet: result({ conditions: undefined }),
      }).status,
    ).toBe('conditions');
    expect(
      recommendMicrophoneThreshold({
        ...p,
        voice: {
          ...p.voice,
          conditions: { ...conditions, selectedDeviceId: 'other' },
        },
      }).status,
    ).toBe('conditions');
    for (const field of ['inputOptions', 'settings']) {
      const changed = {
        ...conditions,
        [field]: { ...conditions[field], autoGainControl: true },
      };
      expect(
        recommendMicrophoneThreshold({
          quiet: { ...p.quiet, conditions: changed },
          voice: { ...p.voice, conditions: changed },
        }).status,
      ).toBe('auto-gain');
    }
  });
});
