import { describe, expect, it } from 'vitest';
import {
  deriveReleaseDetail,
  formatReleaseDate,
} from './releaseDetailPresentation.js';

const track = (id = 'a') => ({ id, title: `Song ${id}`, duration: 180 });
function collection(ids = ['a'], totalTrackCount = null) {
  return {
    id: 'release',
    kind: 'album',
    trackIds: ids,
    resolvedRelease: {
      type: 'single',
      totalTrackCount,
      date: null,
      leadTrackId: null,
      conflicts: [],
    },
  };
}
describe('Single detail presentation', () => {
  it('matches the album summary density for a fully collected Single', () => {
    const input = collection(['a'], 1);
    input.resolvedRelease.date = { value: '2026-10-24', precision: 'day' };
    expect(
      deriveReleaseDetail({ collection: input, tracks: [track()] }).fields,
    ).toEqual(['2026-10-24', '1 首曲目，3 分']);
  });
  it('uses the same album table for one, multiple and partially collected Singles', () => {
    for (const [ids, total] of [
      [['a'], 1],
      [['a', 'b'], 2],
      [['a'], 3],
    ]) {
      expect(
        deriveReleaseDetail({
          collection: collection(ids, total),
          tracks: [track()],
        }).layout,
      ).toBe('album');
    }
  });
  it.each([
    null,
    {},
    { kind: 'playlist', resolvedRelease: { type: 'single' } },
    { kind: 'album' },
    { ...collection(), resolvedRelease: { type: 'album' } },
    { ...collection(), resolvedRelease: { type: 'ep' } },
    { ...collection(), resolvedRelease: { type: 'unknown' } },
  ])('does not infer Single from legacy membership: %j', (entry) => {
    expect(
      deriveReleaseDetail({ collection: entry, tracks: [track()] }).isSingle,
    ).toBe(false);
  });
  it.each([
    [['a'], 1, 'album'],
    [['a'], null, 'album'],
    [['a'], 3, 'album'],
    [['a', 'b'], 2, 'album'],
    [['a', 'b'], null, 'album'],
    [[], null, 'album'],
    [[], 3, 'album'],
  ])(
    'uses durable members and official total for %j / %j',
    (ids, total, layout) => {
      const result = deriveReleaseDetail({
        collection: collection(ids, total),
        tracks: [],
      });
      expect(result.layout).toBe(layout);
      expect(result.memberCount).toBe(ids.length);
    },
  );
  it('distinguishes partial collection, available audio and partial duration', () => {
    const result = deriveReleaseDetail({
      collection: collection(['a', 'b'], 3),
      tracks: [track('b')],
    });
    expect(result.fields).toEqual(['已收錄 2／3 首，可播放曲長 3 分']);
    expect(result.message).toContain('可播放 1 首');
    expect(result.canStart).toBe(true);
    expect(result.canShuffle).toBe(false);
  });
  it('never labels unknown single membership as a complete release', () => {
    expect(
      deriveReleaseDetail({ collection: collection(), tracks: [track()] })
        .fields,
    ).toEqual(['1 首曲目，3 分']);
  });
  it('uses an official complete duration only when all registered and official members are available', () => {
    const result = deriveReleaseDetail({
      collection: collection(['a', 'b'], 2),
      tracks: [track(), track('b')],
    });
    expect(result.fields).toContain('2 首曲目，6 分');
    expect(result.canShuffle).toBe(true);
  });
  it('never presents a partial known duration as the complete release duration', () => {
    const result = deriveReleaseDetail({
      collection: collection(['a', 'b'], 2),
      tracks: [track(), { id: 'b', title: 'Unknown duration' }],
    });
    expect(result.fields).toContain('2 首曲目，已知曲長 3 分');
  });
  it.each(['idle', 'pending', 'error'])(
    'does not show unavailable members as absent while %s',
    (state) => {
      const result = deriveReleaseDetail({
        collection: collection(['a', 'b'], 3),
        tracks: [track()],
        verification: { state, error: state === 'error' ? '讀取未完成' : '' },
      });
      expect(result.layout).toBe('album');
      expect(result.canStart).toBe(false);
      expect(result.fields.join(' ')).not.toContain('可播放 0 首');
      expect(result.message).toContain(
        state === 'error' ? '讀取未完成' : '確認',
      );
    },
  );
  it('keeps unavailable Single membership and its repair message', () => {
    const result = deriveReleaseDetail({
      collection: collection(['a'], 1),
      tracks: [],
    });
    expect(result.layout).toBe('album');
    expect(result.canStart).toBe(false);
    expect(result.message).toContain('目前沒有可播放');
  });
  it('uses only registered unique playable tracks, ignoring invalid durations', () => {
    const result = deriveReleaseDetail({
      collection: collection(['a'], 1),
      tracks: [track(), track(), track('foreign'), { id: 'a', duration: NaN }],
    });
    expect(result.playableCount).toBe(1);
    expect(result.fields).toContain('1 首曲目，3 分');
  });
  it('does not project lead badges or change stored designation and order', () => {
    const input = collection(['a', 'b'], 2);
    input.resolvedRelease.leadTrackId = 'b';
    const result = deriveReleaseDetail({
      collection: input,
      tracks: [track(), track('b')],
    });
    expect(result.lead).toBeUndefined();
    expect(result.leadMessage).toBeUndefined();
    expect(input.resolvedRelease.leadTrackId).toBe('b');
    expect(input.trackIds).toEqual(['a', 'b']);
    const missing = deriveReleaseDetail({
      collection: input,
      tracks: [track()],
    });
    expect(missing.message).toContain('可播放 1 首');
    expect(missing.message).not.toContain('主打');
  });
  it('does not invent a lead for missing, invalid or pending designations', () => {
    const input = collection();
    expect(deriveReleaseDetail({ collection: input }).lead).toBeUndefined();
    input.resolvedRelease.leadTrackId = 'foreign';
    expect(deriveReleaseDetail({ collection: input }).lead).toBeUndefined();
    input.resolvedRelease.leadTrackId = 'a';
    expect(
      deriveReleaseDetail({
        collection: input,
        verification: { state: 'pending' },
      }).leadMessage,
    ).toBeUndefined();
  });
  it('shows provider conflicts and never borrows a scalar track year', () => {
    const input = collection();
    input.resolvedRelease.conflicts = ['totalTrackCount'];
    const result = deriveReleaseDetail({
      collection: input,
      tracks: [{ ...track(), releaseYear: 1999 }],
    });
    expect(result.conflictMessage).toContain('發行資料');
    expect(result.fields.join(' ')).not.toContain('1999');
  });
  it('keeps empty releases distinct from failed media verification', () => {
    expect(
      deriveReleaseDetail({ collection: collection([], 3) }).message,
    ).toContain('尚未收錄');
  });
});
describe('release date precision', () => {
  it.each([
    [{ value: '2026', precision: 'year' }, '2026'],
    [{ value: '2026-07', precision: 'month' }, '2026-07'],
    [{ value: '2026-07-25', precision: 'day' }, '2026-07-25'],
    [null, ''],
    [{ value: '2026', precision: 'day' }, ''],
    [{ value: '2026/07', precision: 'month' }, ''],
    [{ value: '2026-13', precision: 'month' }, ''],
  ])('formats %j without inferring missing precision', (date, expected) =>
    expect(formatReleaseDate(date)).toBe(expected),
  );
});
