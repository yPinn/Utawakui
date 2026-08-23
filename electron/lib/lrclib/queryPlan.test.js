import { describe, expect, it } from 'vitest';
import { buildLrclibQueryPlan } from './query.js';

describe('buildLrclibQueryPlan', () => {
  it('uses editable title and artist as one exact plus one structured lookup', () => {
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
        albumName: 'Original album',
      },
      broaden: { q: 'Edited title Edited artist' },
    });
    expect(track).toEqual({
      title: 'Original title',
      artist: 'Original artist',
      album: 'Original album',
      duration: 180,
    });
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
