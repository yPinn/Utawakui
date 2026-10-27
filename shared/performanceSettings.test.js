import { describe, expect, it } from 'vitest';
import {
  PERFORMANCE_SETTINGS_DEFAULTS as defaults,
  validPerformanceSettings,
  validPerformanceSlot,
} from './performanceSettings.mjs';

describe('performance control values shared by Main and renderer', () => {
  it.each([1, 2, 3])('accepts setting slot %s', (slot) =>
    expect(validPerformanceSlot(slot)).toBe(true),
  );
  it.each([0, 4, -1, 1.5, '1', null])('rejects setting slot %s', (slot) =>
    expect(validPerformanceSlot(slot)).toBe(false),
  );
  it.each([
    defaults,
    { ...defaults, transposeSemitones: -12, pitchCents: -50, tempoRate: 0.5 },
    {
      ...defaults,
      transposeSemitones: 12,
      pitchCents: 50,
      tempoRate: 1.5,
      monitorGuideVocalEnabled: false,
    },
  ])('accepts canonical complete values %j', (values) =>
    expect(validPerformanceSettings(values)).toBe(true),
  );
  it.each([
    null,
    [],
    'values',
    {},
    { ...defaults, volume: 1 },
    { ...defaults, transposeSemitones: '1' },
    { ...defaults, transposeSemitones: -13 },
    { ...defaults, transposeSemitones: 13 },
    { ...defaults, pitchCents: -51 },
    { ...defaults, pitchCents: 51 },
    { ...defaults, pitchCents: 0.5 },
    { ...defaults, tempoRate: 0.4 },
    { ...defaults, tempoRate: 1.6 },
    { ...defaults, tempoRate: NaN },
    { ...defaults, tempoRate: Infinity },
    { ...defaults, tempoRate: 0.91 },
    { ...defaults, monitorGuideVocalEnabled: 1 },
  ])('rejects invalid snapshots without normalization %j', (value) =>
    expect(validPerformanceSettings(value)).toBe(false),
  );
});
