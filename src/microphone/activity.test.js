import { describe, expect, it } from 'vitest';
import {
  createMicrophoneActivity,
  normalizeMicrophoneActivityOptions,
  MICROPHONE_ACTIVITY_DEFAULTS,
} from './activity.js';

const options = {
  ...MICROPHONE_ACTIVITY_DEFAULTS,
  mode: 'manual',
  openThreshold: -50,
  closeThreshold: -56,
};
describe('microphone activity projection', () => {
  it('starts uncalibrated, bounds timing and rejects reversed thresholds', () => {
    expect(MICROPHONE_ACTIVITY_DEFAULTS).toMatchObject({
      mode: 'calibration',
      attackMs: 25,
      holdMs: 200,
      releaseMs: 150,
    });
    expect(
      normalizeMicrophoneActivityOptions({ ...options, closeThreshold: -40 }),
    ).toBeNull();
    expect(
      normalizeMicrophoneActivityOptions({ ...options, holdMs: 9999 }).holdMs,
    ).toBe(2000);
    expect(
      createMicrophoneActivity().observe(-20, 0, options, false),
    ).toMatchObject({ phase: 'uncalibrated', intensity: 0 });
  });
  it('requires continuous above-open confirmation and uses strict thresholds', () => {
    const owner = createMicrophoneActivity();
    expect(owner.observe(-50, 0, options).phase).toBe('armed');
    expect(owner.observe(-40, 10, options).phase).toBe('confirming');
    expect(owner.observe(-55, 30, options).phase).toBe('armed');
    owner.observe(-40, 40, options);
    expect(owner.observe(-40, 64, options).intensity).toBe(0);
    expect(owner.observe(-40, 65, options)).toMatchObject({
      phase: 'active',
      intensity: 1,
    });
    expect(owner.observe(-53, 100, options).phase).toBe('active');
  });
  it('holds low samples then fades only the projection and resumes through a fresh attack', () => {
    const owner = createMicrophoneActivity();
    owner.observe(-40, 0, options);
    owner.observe(-40, 25, options);
    expect(owner.observe(-56, 50, options).phase).toBe('holding');
    expect(owner.observe(-70, 249, options).intensity).toBe(1);
    expect(owner.observe(-70, 250, options).phase).toBe('releasing');
    expect(owner.observe(-70, 325, options).intensity).toBeCloseTo(0.5);
    expect(owner.observe(-40, 330, options).phase).toBe('releasing');
    expect(owner.observe(-40, 355, options).phase).toBe('active');
    owner.observe(-70, 400, options);
    expect(owner.observe(-55, 550, options).phase).toBe('active');
    owner.observe(-70, 600, options);
    owner.observe(-70, 800, options);
    expect(owner.observe(-70, 950, options)).toMatchObject({
      phase: 'armed',
      intensity: 0,
    });
  });
  it('clears timers on invalid, reversed time, long gaps and explicit reset', () => {
    const owner = createMicrophoneActivity();
    owner.observe(-40, 0, options);
    owner.observe(-40, 33, options);
    expect(owner.observe(-40, 600, options).phase).toBe('confirming');
    expect(owner.observe(-40, 599, options).intensity).toBe(0);
    expect(owner.observe(NaN, 650, options).intensity).toBe(0);
    owner.observe(-40, 700, options);
    owner.observe(-40, 733, options);
    expect(owner.reset('paused')).toEqual({
      phase: 'paused',
      active: false,
      intensity: 0,
    });
    expect(owner.observe(-40, 800, options).phase).toBe('confirming');
  });
  it('supports zero timing without synthetic intermediate activity', () => {
    const owner = createMicrophoneActivity();
    const instant = { ...options, attackMs: 0, holdMs: 0, releaseMs: 0 };
    expect(owner.observe(-40, 0, instant).phase).toBe('active');
    expect(owner.observe(-70, 1, instant)).toMatchObject({
      phase: 'armed',
      intensity: 0,
    });
  });
});
