import { describe, expect, it } from 'vitest';
import { buildDiagnosticsSupportBundle } from './diagnosticsExport.js';

describe('buildDiagnosticsSupportBundle', () => {
  it('wraps events with bundle metadata and level counts', () => {
    const events = [
      { level: 'error', message: 'a' },
      { level: 'error', message: 'b' },
      { level: 'warning', message: 'c' },
    ];

    const bundle = buildDiagnosticsSupportBundle({
      events,
      appVersion: '1.2.3',
      electronVersion: '30.0.0',
      exportedAt: '2026-09-04T00:00:00.000Z',
    });

    expect(bundle).toEqual({
      bundleVersion: 1,
      schemaVersion: 1,
      exportedAt: '2026-09-04T00:00:00.000Z',
      appVersion: '1.2.3',
      electronVersion: '30.0.0',
      eventCount: 3,
      levelCounts: { debug: 0, info: 0, warning: 1, error: 2 },
      events,
    });
  });

  it('defaults to an empty event list and a generated timestamp', () => {
    const bundle = buildDiagnosticsSupportBundle({});

    expect(bundle.events).toEqual([]);
    expect(bundle.eventCount).toBe(0);
    expect(bundle.levelCounts).toEqual({
      debug: 0,
      info: 0,
      warning: 0,
      error: 0,
    });
    expect(bundle.appVersion).toBe('');
    expect(bundle.electronVersion).toBe('');
    expect(() => new Date(bundle.exportedAt).toISOString()).not.toThrow();
  });

  it('ignores a non-array events input', () => {
    const bundle = buildDiagnosticsSupportBundle({ events: null });
    expect(bundle.events).toEqual([]);
    expect(bundle.eventCount).toBe(0);
  });

  it('does not count an unrecognized level', () => {
    const bundle = buildDiagnosticsSupportBundle({
      events: [{ level: 'fatal', message: 'x' }],
    });
    expect(bundle.levelCounts).toEqual({
      debug: 0,
      info: 0,
      warning: 0,
      error: 0,
    });
    expect(bundle.eventCount).toBe(1);
  });
});
