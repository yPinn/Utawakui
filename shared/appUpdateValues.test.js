import { describe, expect, it } from 'vitest';
import values from './appUpdateValues.json';

describe('app update values', () => {
  it('keeps the packaged update channel enabled with bounded timers', () => {
    expect(values.runtimeEnabled).toBe(true);
    expect(Number.isSafeInteger(values.startupCheckDelayMs)).toBe(true);
    expect(values.startupCheckDelayMs).toBeGreaterThan(0);
  });

  it('rechecks on a multi-hour interval well above the startup delay', () => {
    expect(Number.isSafeInteger(values.recheckIntervalMs)).toBe(true);
    // A background recheck is a courtesy, not a poll: keep it hours apart so a
    // long streaming session still learns about a release without turning the
    // GitHub feed into a heartbeat.
    expect(values.recheckIntervalMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(values.recheckIntervalMs).toBeGreaterThan(
      values.startupCheckDelayMs,
    );
  });
});
