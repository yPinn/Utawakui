import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { openSupportPackage } from '../../scripts/open-support-package.cjs';
import {
  buildDiagnosticsSupportBundle,
  packageDiagnostics,
} from './diagnosticsExport.js';

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

describe('support package', () => {
  const timestamp = '2026-11-19T04:42:06.000Z';
  const bundle = buildDiagnosticsSupportBundle({
    events: [
      {
        level: 'warning',
        timestamp,
        code: 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE',
        message: 'raw message',
        stack: 'at publish (app:main.js:1:2)\nat read ([path])',
        context: { secret: 'raw context' },
      },
      { level: 'debug', timestamp, code: 'LYRICS_QUERY_SUMMARY' },
    ],
  });

  it('keeps only the time range and counts without a configured key', async () => {
    const pkg = await packageDiagnostics(bundle, { reference: 'report-1' });
    expect(pkg).toEqual({
      format: 'utawakui-support-v1',
      reference: 'report-1',
      eventCount: 1,
      from: timestamp,
      to: timestamp,
      levelCounts: { error: 0, warning: 1, info: 0, debug: 0 },
    });
  });

  it('opens only allowlisted details from both export formats and binds them to their reference', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const pkg = await packageDiagnostics(bundle, {
      reference: 'report-1',
      publicKey,
    });
    expect(JSON.stringify(pkg)).not.toContain(
      'AUDIO_OUTPUT_DEVICE_UNAVAILABLE',
    );
    const opened = openSupportPackage(pkg, privateKey);
    expect(
      openSupportPackage(
        {
          reportId: 'report-1',
          diagnostics: pkg,
          description: 'private user text',
        },
        privateKey,
      ),
    ).toEqual(opened);
    expect(() =>
      openSupportPackage(
        { reportId: 'different', diagnostics: pkg },
        privateKey,
      ),
    ).toThrow();
    expect(opened.events).toHaveLength(1);
    expect(opened.events[0]).toMatchObject({
      timestamp,
      level: 'warning',
      code: 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE',
      appFrames: ['at publish (app:main.js:1:2)'],
    });
    expect(JSON.stringify(opened)).not.toMatch(
      /raw message|raw context|\[path\]/u,
    );
    expect(() =>
      openSupportPackage({ ...pkg, reference: 'different' }, privateKey),
    ).toThrow();
  });
});
