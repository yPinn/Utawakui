import { describe, expect, it } from 'vitest';
import {
  performanceArchiveDate,
  performanceArchiveRows,
} from './performanceArchivePresentation.js';
describe('archive presentation', () => {
  it('formats a date-only subtitle while retaining the detailed default', () => {
    const value = new Date(2026, 9, 20, 20, 30).toISOString();
    expect(performanceArchiveDate(value, { includeTime: false })).toBe(
      '2026/10/20',
    );
    expect(performanceArchiveDate(value)).toMatch(/^2026\/10\/20\s20:30$/u);
    expect(performanceArchiveDate(null, { includeTime: false })).toBe('—');
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
        progress: 'skipped',
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
    expect(rows[2].status).toBe('手動曲目 · 略過');
    expect(rows[3].status).toBe('無本機曲目 · 中止');
    expect(items).toHaveLength(4);
  });
  it('does not invent dates or items for absent data', () => {
    expect(performanceArchiveDate(null)).toBe('—');
    expect(performanceArchiveDate('invalid')).toBe('—');
    expect(performanceArchiveRows(null, [])).toEqual([]);
  });
});
