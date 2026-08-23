import { describe, expect, it } from 'vitest';
import { buildLrclibQueryPlan } from './query.js';

describe('buildLrclibQueryPlan', () => {
  it('keeps album on the exact fast path but not the general structured lookup', () => {
    const track = {
      title: 'Original title',
      artist: 'Original artist',
      album: 'Original album',
      duration: 180,
    };

    expect(
      buildLrclibQueryPlan(track, {
        title: 'Edited title',
        artist: 'Edited artist',
      }),
    ).toEqual({
      identity: {
        trackName: 'Edited title',
        artistName: 'Edited artist',
        albumName: 'Original album',
        duration: 180,
        source: 'manual',
      },
      exact: {
        trackName: 'Edited title',
        artistName: 'Edited artist',
        albumName: 'Original album',
        duration: 180,
      },
      structured: {
        trackName: 'Edited title',
        artistName: 'Edited artist',
      },
      structuredQueries: [
        {
          trackName: 'Edited title',
          artistName: 'Edited artist',
        },
      ],
      recoveryQueries: [{ trackName: 'Edited title' }],
      broaden: { q: 'Edited title Edited artist' },
    });
    expect(track).toEqual({
      title: 'Original title',
      artist: 'Original artist',
      album: 'Original album',
      duration: 180,
    });
  });

  it('builds a bounded union for dash-separated cross-script titles', () => {
    const plan = buildLrclibQueryPlan(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        album: '15',
        duration: 243,
      },
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
      },
    );

    expect(plan.structuredQueries).toEqual([
      {
        trackName: '月面着陸計画 - Moon Landing Plan',
        artistName: 'tuki.',
      },
      { trackName: '月面着陸計画', artistName: 'tuki.' },
      { trackName: 'Moon Landing Plan', artistName: 'tuki.' },
    ]);
    expect(plan.structuredQueries).toHaveLength(3);
    expect(plan.structuredQueries.every((query) => !query.albumName)).toBe(
      true,
    );
    expect(plan.recoveryQueries).toEqual([
      { trackName: '月面着陸計画 - Moon Landing Plan' },
      { trackName: '月面着陸計画' },
      { trackName: 'Moon Landing Plan' },
    ]);
  });

  it('builds native and Latin variants for a parenthesized bilingual title', () => {
    const plan = buildLrclibQueryPlan(
      {
        title: '궁금해 (Next Page)',
        artist: 'IVE',
        duration: 199,
      },
      { title: '궁금해 (Next Page)', artist: 'IVE' },
    );

    expect(plan.structuredQueries).toEqual([
      { trackName: '궁금해 (Next Page)', artistName: 'IVE' },
      { trackName: '궁금해', artistName: 'IVE' },
      { trackName: 'Next Page', artistName: 'IVE' },
    ]);
    expect(plan.recoveryQueries).toEqual([
      { trackName: '궁금해 (Next Page)' },
      { trackName: '궁금해' },
      { trackName: 'Next Page' },
    ]);
  });

  it('adds trusted metadata artist aliases without adding title-only queries', () => {
    const plan = buildLrclibQueryPlan(
      {
        title: 'Kakurenbo',
        artist: 'Yuuri',
        duration: 271,
        metadataCandidates: [
          {
            title: 'Kakurenbo',
            artist: '優里',
            source: 'provider-artifact',
          },
        ],
      },
      { title: 'Kakurenbo', artist: 'Yuuri' },
    );

    expect(plan.structuredQueries).toEqual([
      { trackName: 'Kakurenbo', artistName: 'Yuuri' },
      { trackName: 'Kakurenbo', artistName: '優里' },
    ]);
    expect(plan.structuredQueries.every((query) => query.artistName)).toBe(
      true,
    );
    expect(plan.recoveryQueries).toEqual([{ trackName: 'Kakurenbo' }]);
  });

  it('caps artist-constrained and recovery searches to six total requests', () => {
    const plan = buildLrclibQueryPlan(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        metadataCandidates: Array.from({ length: 8 }, (_, index) => ({
          title: '月面着陸計画 - Moon Landing Plan',
          artist: `Alias ${index}`,
          source: `provider-${index}`,
        })),
      },
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
      },
    );

    expect(
      plan.structuredQueries.length + plan.recoveryQueries.length,
    ).toBeLessThanOrEqual(6);
  });

  it('prefers a high-confidence extracted metadata identity by default', () => {
    const plan = buildLrclibQueryPlan({
      title: 'Label Channel - Long Official MV Title',
      artist: 'Label Channel Music',
      duration: 260,
      metadataCandidates: [
        {
          title: 'Canonical Title',
          artist: 'Actual Artist',
          duration: 211,
          platform: 'spotify',
        },
      ],
    });

    expect(plan.identity).toEqual({
      trackName: 'Canonical Title',
      artistName: 'Actual Artist',
      albumName: null,
      duration: 211,
      source: 'spotify',
    });
  });

  it('omits invalid provider duration and does not mix q with structured fields', () => {
    const plan = buildLrclibQueryPlan({
      title: 'Song',
      artist: 'Artist',
      duration: 0,
    });

    expect(plan.exact).not.toHaveProperty('duration');
    expect(plan.structured).not.toHaveProperty('duration');
    expect(plan.broaden).toEqual({ q: 'Song Artist' });
  });
});
