import { describe, expect, it } from 'vitest';
import {
  groupPerformanceArchiveDays,
  performanceArchiveDate,
  performanceArchivePostmarkDate,
  performanceArchiveSummary,
  performanceArchiveRows,
  performancePlaylistName,
} from './performanceArchivePresentation.js';
describe('archive presentation', () => {
  it('groups by the first local day and orders same-day records from early to late', () => {
    const date = (day, hour, minute = 0) =>
      new Date(2026, 10, day, hour, minute).toISOString();
    const midnight = {
      id: 'night',
      startedAt: date(6, 23, 30),
      endedAt: date(7, 0, 18),
    };
    const afternoon = { id: 'afternoon', startedAt: date(6, 14) };
    const saved = { id: 'saved', endedAt: date(12, 21, 10) };
    const unknown = { id: 'unknown' };

    expect(
      groupPerformanceArchiveDays([midnight, afternoon, saved, unknown]).map(
        ({ key, archives }) => [key, archives.map(({ id }) => id)],
      ),
    ).toEqual([
      ['2026-11-12', ['saved']],
      ['2026-11-06', ['afternoon', 'night']],
      ['unknown', ['unknown']],
    ]);
    expect(
      performanceArchiveSummary(saved, { compact: true, timeOnly: true }),
    ).toBe('保存於 21:10');
  });
  it('retains local dates across months and years with unknown dates last', () => {
    const october = new Date(2026, 9, 31, 23, 50).toISOString();
    const november = new Date(2026, 10, 1, 0, 20).toISOString();
    const december = new Date(2025, 11, 31, 23, 59).toISOString();
    const olderOctober = new Date(2026, 9, 10, 8, 0).toISOString();
    const archives = [
      { id: 'november', startedAt: 'invalid', endedAt: november },
      { id: 'late-saved', startedAt: october, endedAt: november },
      { id: 'older-october', startedAt: olderOctober, endedAt: november },
      { id: 'previous-year', endedAt: december },
      { id: 'unknown' },
    ];
    expect(
      groupPerformanceArchiveDays(archives).map(
        ({ key, archives: entries }) => [key, entries[0].id],
      ),
    ).toEqual([
      ['2026-11-01', 'november'],
      ['2026-10-31', 'late-saved'],
      ['2026-10-10', 'older-october'],
      ['2025-12-31', 'previous-year'],
      ['unknown', 'unknown'],
    ]);
  });
  it('prefills YYMMDD from the local start date and uses the save date for unstarted sessions', () => {
    const startedAt = new Date(2026, 10, 6, 23, 50).toISOString();
    const now = new Date(2026, 10, 7, 0, 30);
    expect(performancePlaylistName({ startedAt, now, name: '秋日歌回' })).toBe(
      '261106 - 秋日歌回',
    );
    expect(performancePlaylistName({ now })).toBe('261107 - 演出歌單');
    expect(
      performancePlaylistName({
        startedAt,
        now,
        name: '秋日歌回',
        existing: ['261106 - 秋日歌回'],
      }),
    ).toBe('261106 - 秋日歌回 (2)');
  });
  it('formats a date-only subtitle while retaining the detailed default', () => {
    const value = new Date(2026, 9, 20, 20, 30).toISOString();
    expect(performanceArchiveDate(value, { includeTime: false })).toBe(
      '2026/10/20',
    );
    expect(performanceArchiveDate(value)).toMatch(/^2026\/10\/20\s20:30$/u);
    expect(performanceArchiveDate(null, { includeTime: false })).toBe('—');
  });
  it('prints the first local record date or falls back to the local save date', () => {
    const startedAt = new Date(2026, 10, 6, 23, 30).toISOString();
    const endedAt = new Date(2026, 10, 7, 0, 18).toISOString();
    expect(performanceArchivePostmarkDate({ startedAt, endedAt })).toBe(
      '11/06',
    );
    expect(
      performanceArchivePostmarkDate({ startedAt: 'invalid', endedAt }),
    ).toBe('11/07');
    expect(performanceArchivePostmarkDate({})).toBe('');
  });
  it('labels the first recorded time or saved time and shows completed versus planned', () => {
    const startedAt = new Date(2026, 9, 20, 20, 30).toISOString();
    const endedAt = new Date(2026, 9, 21, 1, 0).toISOString();
    const counts = { completedCount: 8, performedCount: 10, itemCount: 16 };
    expect(
      performanceArchiveSummary({ startedAt, endedAt, ...counts }),
    ).toMatch(
      /^2026\/10\/20\s20:30 · 演出\u00a010\u00a0項 · 完成\u00a08\u00a0項$/u,
    );
    expect(
      performanceArchiveSummary({ endedAt, ...counts }, { multiline: true }),
    ).toMatch(
      /^保存於 2026\/10\/21\s01:00\n演出\u00a010\u00a0項 · 完成\u00a08\u00a0項$/u,
    );
    expect(
      performanceArchiveSummary(
        { startedAt, endedAt, ...counts },
        { compact: true },
      ),
    ).toMatch(/^10\/20\s20:30 · 演出\u00a010\u00a0項 · 完成\u00a08\u00a0項$/u);
  });
  it('preserves occurrence keys, original order and saved identity for repeated, manual and missing tracks', () => {
    const items = [
      {
        itemId: 'one',
        trackId: 'song',
        displayTitle: 'Saved title',
        displayArtist: 'Saved artist',
        progress: 'completed',
      },
      {
        itemId: 'two',
        trackId: 'song',
        displayTitle: 'Repeat',
        displayArtist: '',
        progress: 'completed',
      },
      {
        itemId: 'three',
        mode: 'manual',
        displayTitle: 'Manual',
        progress: 'completed',
      },
      {
        itemId: 'four',
        trackId: 'missing',
        displayTitle: 'Missing',
        progress: 'interrupted',
      },
    ];
    const canonical = { id: 'song', title: 'Renamed', duration: 125 };
    const rows = performanceArchiveRows({ items }, [canonical]);
    expect(rows.map((r) => r.key)).toEqual(['one', 'two', 'three', 'four']);
    expect(rows.map((r) => r.ordinal)).toEqual([1, 2, 3, 4]);
    expect(rows[0].title).toBe('Saved title');
    expect(rows[1].track).toBe(canonical);
    expect(rows[2]).toMatchObject({ status: '完成', statusDetail: '手動曲目' });
    expect(rows[3]).toMatchObject({
      status: '中止',
      statusDetail: '無本機曲目',
    });
    expect(items).toHaveLength(4);
  });
  it('lists recorded starts in time order, including repeated and removed items, without unsung plans', () => {
    const items = [
      { itemId: 'later', progress: 'interrupted' },
      { itemId: 'first', progress: 'completed' },
      { itemId: 'never', progress: 'queued' },
      { itemId: 'skipped', progress: 'skipped' },
    ];
    const event = (id, itemId, seconds) => ({
      id,
      itemId,
      type: 'track',
      trackId: 'song',
      title: 'Song',
      occurredAt: `2026-10-20T12:00:${seconds}Z`,
    });
    const timeline = [
      event('c', 'later', '30'),
      { type: 'marker', label: 'Talk' },
      event('b', 'removed', '20'),
      event('a', 'first', '10'),
    ];
    const rows = performanceArchiveRows({ items, timeline }, []);
    expect(rows.map(({ key, status }) => [key, status])).toEqual([
      ['a', '完成'],
      ['b', '已開始'],
      ['c', '中止'],
    ]);
  });
  it('does not invent dates or items for absent data', () => {
    expect(performanceArchiveDate(null)).toBe('—');
    expect(performanceArchiveDate('invalid')).toBe('—');
    expect(performanceArchiveRows(null, [])).toEqual([]);
  });
});
