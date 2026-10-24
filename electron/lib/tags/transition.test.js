import { describe, it, expect } from 'vitest';
import {
  transitionReferences,
  eligibleTagReleases,
  tagValues,
} from './transition.js';

const old = 'a'.repeat(64),
  next = 'b'.repeat(64),
  stale = 'c'.repeat(64);
const binding = (value) => ({ kind: 'audio-content-sha256', value });
const local = (id, hash = old) => ({
  id,
  kind: 'album',
  name: id,
  trackIds: ['t'],
  releaseInfo: {
    revision: 2,
    observed: {},
    overrides: {
      date: { value: '2024-10', precision: 'month' },
      totalTrackCount: 12,
    },
    localMemberBindings: { t: hash === null ? null : binding(hash) },
  },
});
describe('explicit tag-only media transition', () => {
  it('migrates only verified previous bindings and retains immutable receipts and stale relations', () => {
    const source = {
      ...local('source'),
      source: { platform: 'youtube', id: 'source' },
    };
    delete source.releaseInfo.localMemberBindings;
    source.releaseInfo.catalog = {
      bindings: { t: binding(old) },
      links: { 'slot-1': { trackId: 't', slotIdentity: 'evidence' } },
      manifest: { slots: [] },
    };
    const playlists = {
      version: 4,
      playlists: [
        local('local'),
        local('stale', stale),
        local('null', null),
        source,
      ],
      reconciliation: {
        pendingReleases: [local('pending')],
        merges: [{ before: { kept: local('receipt') } }],
      },
    };
    const works = {
      version: 1,
      revision: 3,
      trackProfiles: {
        t: { binding: binding(old), workLink: { workId: 'w' } },
      },
      pendingTrackDeletions: {},
    };
    const result = transitionReferences(
      {
        playlists,
        index: {
          version: 2,
          tracks: { t: { contentHash: old, unknown: 'keep' } },
        },
        works,
      },
      't',
      old,
      next,
    );
    expect(
      result.playlists.playlists[0].releaseInfo.localMemberBindings.t.value,
    ).toBe(next);
    expect(result.playlists.playlists[0].releaseInfo.revision).toBe(3);
    expect(result.playlists.playlists[1]).toEqual(playlists.playlists[1]);
    expect(result.playlists.playlists[2]).toEqual(playlists.playlists[2]);
    expect(
      result.playlists.playlists[3].releaseInfo.catalog.bindings.t.value,
    ).toBe(next);
    expect(
      result.playlists.reconciliation.pendingReleases[0].releaseInfo
        .localMemberBindings.t.value,
    ).toBe(next);
    expect(result.playlists.reconciliation.merges).toEqual(
      playlists.reconciliation.merges,
    );
    expect(result.works.trackProfiles.t.binding.value).toBe(next);
    expect(result.works.revision).toBe(4);
    expect(result.index.tracks.t).toEqual({
      contentHash: next,
      unknown: 'keep',
    });
    expect(playlists.playlists[0].releaseInfo.localMemberBindings.t.value).toBe(
      old,
    );
  });
  it('blocks pending deletion and never refreshes an already stale work profile', () => {
    const docs = {
      playlists: { playlists: [] },
      index: { tracks: { t: {} } },
      works: {
        revision: 0,
        trackProfiles: { t: { binding: binding(stale) } },
        pendingTrackDeletions: {},
      },
    };
    expect(transitionReferences(docs, 't', old, next).works).toEqual(
      docs.works,
    );
    docs.works.pendingTrackDeletions.x = { trackId: 't' };
    expect(() => transitionReferences(docs, 't', old, next)).toThrow();
  });
  it('requires an explicit primary release and a verified position before writing album tags', () => {
    const releases = eligibleTagReleases(
      [local('first'), local('other'), local('stale', stale)],
      't',
      old,
    );
    expect(releases.map((r) => r.collectionId)).toEqual(['first', 'other']);
    expect(
      tagValues({ title: 'Title', artist: 'Artist', album: 'ambiguous' }, null),
    ).toEqual({ title: 'Title', artist: 'Artist' });
    expect(
      tagValues({ title: 'Title', artist: 'Artist' }, releases[0]),
    ).toMatchObject({
      album: 'first',
      releaseDate: '2024-10',
      trackNumber: 1,
      trackTotal: 12,
    });
  });
  it('blocks a stale binding which would coincidentally become fresh after writing historical tags', () => {
    const documents = {
      playlists: { playlists: [local('stale', next)] },
      index: { tracks: { t: {} } },
      works: null,
    };
    expect(() => transitionReferences(documents, 't', old, next)).toThrow();
    documents.playlists.playlists = [];
    documents.works = {
      revision: 0,
      trackProfiles: { t: { binding: binding(next) } },
      pendingTrackDeletions: {},
    };
    expect(() => transitionReferences(documents, 't', old, next)).toThrow();
  });
  it('offers only fresh matching source slots, preserving partial-catalog uncertainty and excluding user playlists', () => {
    const slot = {
      position: 1,
      videoId: '01234567890',
      title: 'Song',
      artist: 'Artist',
      duration: 2,
      available: true,
    };
    const source = {
      id: 'source',
      kind: 'album',
      name: 'Source album',
      source: { platform: 'yt-music', id: 'OLAK5uy_tags' },
      trackIds: ['t'],
      releaseInfo: {
        revision: 1,
        observed: {},
        overrides: {},
        catalog: {
          manifest: {
            playlistId: 'OLAK5uy_tags',
            browseId: 'MPREb_tags',
            title: 'Source album',
            artist: 'Artist',
            type: 'album',
            year: '2024',
            reportedTotal: 1,
            completeness: 'complete',
            slots: [slot],
          },
          links: {
            'slot-1': {
              trackId: 't',
              evidence: 'manual',
              slotIdentity: JSON.stringify([
                slot.videoId,
                slot.title,
                slot.artist,
              ]),
            },
          },
          bindings: { t: binding(old) },
          rejected: [],
          fetchedAt: '2026-10-24T00:00:00.000Z',
        },
      },
    };
    expect(
      eligibleTagReleases(
        [source, { ...local('playlist'), kind: 'playlist' }],
        't',
        old,
      ),
    ).toMatchObject([
      { collectionId: 'source', artist: 'Artist', position: 1, total: 1 },
    ]);
    source.releaseInfo.catalog.manifest.completeness = 'partial';
    source.releaseInfo.catalog.manifest.reportedTotal = null;
    expect(eligibleTagReleases([source], 't', old)[0].total).toBe(null);
    source.releaseInfo.catalog.links['slot-1'].slotIdentity = 'obsolete';
    expect(eligibleTagReleases([source], 't', old)).toEqual([]);
  });
});
