import { describe, expect, it } from 'vitest';
import {
  formatRelativeTime,
  groupDiagnosticIssues,
  issueFingerprint,
  issueToMarkdown,
  parseDiagnosticsBundle,
  sessionTrail,
} from './diagnosticIssues.js';

function event(overrides) {
  return {
    id: overrides.id,
    timestamp: '2026-10-30T12:00:00.000Z',
    level: 'error',
    process: 'main',
    source: 'lyrics-provider-review',
    operation: 'load',
    code: 'LYRICS_PROVIDER_REVIEW_LOAD_FAILED',
    message: 'ENOENT: candidate file missing',
    sessionId: 'session-a',
    context: { appVersion: '0.5.2', errno: 'ENOENT' },
    ...overrides,
  };
}

describe('groupDiagnosticIssues', () => {
  it('folds repeated events into one issue with counts, sessions and spread', () => {
    const issues = groupDiagnosticIssues([
      event({ id: 'a', timestamp: '2026-10-30T12:00:00.000Z' }),
      event({
        id: 'b',
        timestamp: '2026-10-30T12:05:00.000Z',
        sessionId: 'session-b',
        context: { appVersion: '0.5.1', errno: 'EACCES' },
      }),
      event({
        id: 'c',
        level: 'warning',
        source: 'player',
        operation: 'play',
        code: 'PLAYBACK_FAILED',
        message: 'Unable to play track',
      }),
    ]);

    expect(issues).toHaveLength(2);
    const [lyrics, player] = issues;
    expect(lyrics).toMatchObject({
      level: 'error',
      count: 2,
      sessionCount: 2,
      firstSeen: '2026-10-30T12:00:00.000Z',
      lastSeen: '2026-10-30T12:05:00.000Z',
      versions: { '0.5.2': 1, '0.5.1': 1 },
      context: { errno: { ENOENT: 1, EACCES: 1 } },
    });
    expect(lyrics.latest.id).toBe('b');
    expect(lyrics.context).not.toHaveProperty('appVersion');
    expect(player.level).toBe('warning');
  });

  it('ranks errors before warnings, then by most recent occurrence', () => {
    const issues = groupDiagnosticIssues([
      event({
        id: 'w',
        level: 'warning',
        code: 'W',
        timestamp: '2026-10-30T13:00:00.000Z',
      }),
      event({ id: 'old', code: 'OLD', timestamp: '2026-10-30T10:00:00.000Z' }),
      event({ id: 'new', code: 'NEW', timestamp: '2026-10-30T11:00:00.000Z' }),
    ]);

    expect(issues.map((issue) => issue.code)).toEqual(['NEW', 'OLD', 'W']);
  });

  it('separates identical codes raised by different processes', () => {
    expect(issueFingerprint(event({ process: 'main' }))).not.toBe(
      issueFingerprint(event({ process: 'renderer' })),
    );
  });
});

describe('sessionTrail', () => {
  it('returns earlier events from the same session in time order', () => {
    const events = [
      event({ id: 'later', timestamp: '2026-10-30T12:10:00.000Z' }),
      event({ id: 'target', timestamp: '2026-10-30T12:05:00.000Z' }),
      event({ id: 'first', timestamp: '2026-10-30T12:01:00.000Z' }),
      event({
        id: 'other',
        sessionId: 'session-b',
        timestamp: '2026-10-30T12:02:00.000Z',
      }),
    ];

    expect(sessionTrail(events, events[1]).map((item) => item.id)).toEqual([
      'first',
    ]);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-30T12:00:00.000Z');

  it.each([
    ['2026-10-30T11:59:30.000Z', '剛剛'],
    ['2026-10-30T11:45:00.000Z', '15 分鐘前'],
    ['2026-10-30T09:00:00.000Z', '3 小時前'],
    ['2026-10-27T12:00:00.000Z', '3 天前'],
    ['not a time', ''],
  ])('formats %s as %s', (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, now)).toBe(expected);
  });
});

describe('parseDiagnosticsBundle', () => {
  it('reads the Settings export bundle and bare event arrays', () => {
    const events = [event({ id: 'a' })];
    expect(
      parseDiagnosticsBundle(JSON.stringify({ bundleVersion: 1, events })),
    ).toEqual(events);
    expect(parseDiagnosticsBundle(JSON.stringify(events))).toEqual(events);
  });

  it('rejects malformed files and drops malformed events', () => {
    expect(parseDiagnosticsBundle('{')).toBeNull();
    expect(parseDiagnosticsBundle('{"events": 1}')).toBeNull();
    expect(
      parseDiagnosticsBundle(
        JSON.stringify([{ level: 'error' }, event({ id: 'ok' })]),
      ),
    ).toHaveLength(1);
  });
});

describe('issueToMarkdown', () => {
  it('writes one checklist item with location, counts and context spread', () => {
    const [issue] = groupDiagnosticIssues([
      event({ id: 'a' }),
      event({ id: 'b', timestamp: '2026-10-30T12:05:00.000Z' }),
    ]);

    expect(issueToMarkdown(issue)).toBe(
      [
        '- [ ] [error] LYRICS_PROVIDER_REVIEW_LOAD_FAILED — ENOENT: candidate file missing',
        '  - lyrics-provider-review/load（main）· 2 次 · 1 次啟動 · 2026-10-30T12:00:00.000Z → 2026-10-30T12:05:00.000Z',
        '  - 版本：0.5.2×2',
        '  - 附帶資訊：errno: ENOENT×2',
      ].join('\n'),
    );
  });
});
