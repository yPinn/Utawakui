import { describe, expect, it } from 'vitest';
import {
  alignSessionTimepoints,
  buildSessionMarkerCsv,
  groupSessionTimepoints,
} from './sessionExportTimepoints.mjs';

describe('session export timepoints', () => {
  it('keeps explicit output generations and legacy clock resets separate', () => {
    const entries = [
      ['00:00:35.122', '2026-11-06T00:00:35Z'],
      ['00:00:34.954', '2026-11-06T00:00:50Z'],
      ['00:03:10.000', '2026-11-06T00:04:00Z', 'new-output'],
      ['00:03:11.000', '2026-11-06T00:04:01Z', 'new-output'],
    ].map(([timecode, occurredAt, segmentId]) => ({
      occurredAt,
      record: { timecode, segmentId },
    }));
    const { segments, missingCount } = groupSessionTimepoints(
      [...entries, { record: null }],
      'record',
    );
    expect(segments.map((rows) => rows.length)).toEqual([1, 1, 2]);
    expect(missingCount).toBe(1);
    expect(alignSessionTimepoints(segments[1], 35_000)).toEqual({
      rows: [],
      trimmedCount: 1,
    });
  });

  it('writes independent equal-time points at millisecond precision and protects spreadsheet cells', () => {
    const rows = [
      {
        ms: 12_345,
        entry: { type: 'track', title: '=HYPERLINK("x")', artist: '甲,乙' },
      },
      { ms: 12_345, entry: { type: 'marker', label: '標記' } },
    ];
    const csv = buildSessionMarkerCsv(rows, 'record');
    expect(csv).toMatch(/^\uFEFFtime,elapsed_ms,type,title,artist,source\r\n/u);
    expect(csv.match(/00:00:12\.345/gu)).toHaveLength(2);
    expect(csv).toContain(`"'=HYPERLINK(""x"")","甲,乙"`);
    expect(csv).toContain('"marker","標記"');
  });
});
