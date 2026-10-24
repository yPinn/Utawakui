import { describe, expect, it } from 'vitest';
import {
  releaseCard,
  releaseTypeLabel,
  releaseMetadataLabel,
  releaseYearFromDate,
  filterReleases,
  createReleaseDraft,
  releaseDraftIntent,
} from './releasePresentation.js';

describe('release presentation and bounded editing', () => {
  it('ignores unsupported date precision without treating object prototype keys as formats', () => {
    expect(
      releaseYearFromDate({ value: '2024', precision: 'constructor' }),
    ).toBeUndefined();
  });
  it('uses one Chinese release vocabulary and year-first metadata without empty separators', () => {
    expect(releaseTypeLabel('ep')).toBe('迷你專輯');
    expect(releaseMetadataLabel('ep', 2026)).toBe('2026 · 迷你專輯');
    expect(releaseMetadataLabel('album', 2024)).toBe('2024 · 專輯');
    expect(releaseMetadataLabel('single')).toBe('單曲');
    expect(releaseMetadataLabel('single', 0)).toBe('單曲');
    expect(releaseYearFromDate({ value: '2024', precision: 'year' })).toBe(
      2024,
    );
    expect(
      releaseYearFromDate({ value: '2024-02-31', precision: 'day' }),
    ).toBeUndefined();
    expect(
      releaseYearFromDate({ value: 2024, precision: 'year' }),
    ).toBeUndefined();
  });
  it('does not infer release type or date from import time, kind or scalar track metadata', () => {
    expect(
      releaseCard(
        { id: 'a', kind: 'album', name: 'RASEN', importedAt: '2026-10-23' },
        [{ id: 'x', releaseYear: 2026 }],
      ),
    ).toMatchObject({ releaseType: 'unknown', releaseYear: undefined });
    expect(releaseTypeLabel('unknown')).toBe('未分類');
  });
  it('projects the effective precision and classification supplied by Main', () => {
    expect(
      releaseCard(
        {
          id: 'a',
          name: 'RASEN',
          resolvedRelease: {
            type: 'single',
            date: { value: '2026-07', precision: 'month' },
          },
        },
        [],
      ),
    ).toMatchObject({
      releaseType: 'single',
      releaseYear: 2026,
      releaseDate: { value: '2026-07', precision: 'month' },
    });
  });
  it('keeps unknown types in All only and never groups by work identity', () => {
    const list = ['unknown', 'album', 'single', 'ep'].map(
      (releaseType, index) => ({ id: index, releaseType, workId: 'same' }),
    );
    expect(filterReleases(list, 'all')).toEqual(list);
    expect(
      filterReleases(list, 'albums').map((item) => item.releaseType),
    ).toEqual(['album']);
    expect(
      filterReleases(list, 'singles-ep').map((item) => item.releaseType),
    ).toEqual(['single', 'ep']);
  });
  it('distinguishes restoring source values from explicitly clearing known facts', () => {
    const release = {
      revision: 2,
      effective: { type: 'single', date: null, totalTrackCount: null },
      overrides: { type: 'single', date: null },
      sourceValues: { date: { value: '2026', precision: 'year' } },
      leadTrackId: 'a',
      memberCount: 1,
    };
    const draft = createReleaseDraft(release);
    expect(draft.date.mode).toBe('clear');
    draft.date.mode = 'source';
    draft.totalTrackCount.mode = 'clear';
    draft.leadTrackId = '';
    expect(releaseDraftIntent(release, draft)).toEqual({
      set: { type: 'single', totalTrackCount: null },
      remove: ['date'],
      leadTrackId: null,
    });
  });
  it.each([
    ['2024-02-29', 'day', true],
    ['2023-02-29', 'day', false],
    ['2026-13', 'month', false],
    ['0000', 'year', false],
    ['', 'year', false],
  ])('validates calendar precision %s', (value, precision, valid) => {
    const release = { effective: {}, overrides: {}, memberCount: 1 };
    const draft = createReleaseDraft(release);
    draft.date = { mode: 'manual', value, precision };
    if (valid)
      expect(releaseDraftIntent(release, draft).set.date).toEqual({
        value,
        precision,
      });
    else expect(() => releaseDraftIntent(release, draft)).toThrow('發行日期');
  });
  it('rejects an invalid count or a count below the persisted membership', () => {
    const release = { effective: {}, overrides: {}, memberCount: 2 };
    const draft = createReleaseDraft(release);
    draft.totalTrackCount = { mode: 'manual', value: '1' };
    expect(() => releaseDraftIntent(release, draft)).toThrow('總曲數');
    draft.totalTrackCount.value = '2';
    expect(releaseDraftIntent(release, draft).set.totalTrackCount).toBe(2);
  });
});
