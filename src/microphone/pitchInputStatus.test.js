import { expect, it } from 'vitest';
import {
  formatMicrophoneDbfs,
  microphonePitchStatus,
  microphoneMeterPercent,
  microphonePitchTone,
  peakDbfs,
} from './pitchInputStatus.js';
import { PITCH_MIN_DBFS } from './inputProcessing.js';

it('distinguishes the level gate, the pitch result, and both clipping sources', () => {
  expect(microphonePitchStatus()).toBe('waiting');
  expect(microphonePitchStatus({ dbfs: PITCH_MIN_DBFS, hz: null })).toBe(
    'quiet',
  );
  expect(microphonePitchStatus({ dbfs: PITCH_MIN_DBFS + 0.01, hz: null })).toBe(
    'noPitch',
  );
  expect(microphonePitchStatus({ dbfs: PITCH_MIN_DBFS + 0.01, hz: 440 })).toBe(
    'voiced',
  );
  expect(
    microphonePitchStatus({ dbfs: -60 }, { rawClipped: true, clipped: true }),
  ).toBe('rawClipping');
  expect(microphonePitchStatus({ dbfs: -40 }, { clipped: true })).toBe(
    'analysisClipping',
  );
  expect(microphonePitchTone('noPitch')).toBe('warning');
  expect(microphonePitchTone('rawClipping')).toBe('danger');
});

it('maps the threshold and peak to a bounded meter scale', () => {
  expect(microphoneMeterPercent(-100)).toBe(0);
  expect(microphoneMeterPercent(-30)).toBe(50);
  expect(microphoneMeterPercent(-30.4)).toBe(50);
  expect(microphoneMeterPercent(-30.6)).toBe(microphoneMeterPercent(-31));
  expect(microphoneMeterPercent(0)).toBe(100);
  expect(microphoneMeterPercent(PITCH_MIN_DBFS)).toBeGreaterThan(0);
});

it('displays one decimal place without negative zero', () => {
  expect(formatMicrophoneDbfs(-55.56)).toBe('-55.6 dBFS');
  expect(formatMicrophoneDbfs(-55.04)).toBe('-55.0 dBFS');
  expect(formatMicrophoneDbfs(peakDbfs(0.999))).toBe('0.0 dBFS');
  expect(formatMicrophoneDbfs(peakDbfs(0))).toBe('−∞ dBFS');
});
