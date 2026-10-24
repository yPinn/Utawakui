import { describe, expect, it } from 'vitest';
import {
  validateManifest,
  validateCatalog,
  reconcileCatalog,
  slotKey,
  slotIdentity,
  publicCatalogPage,
  catalogMemberMatches,
} from './catalog.js';
import { validateReleaseInfo, reconcileReleaseMembership } from './schema.js';

const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
const alternate = { ...binding, value: 'b'.repeat(64) };
const video = 'rgNdeflYdYw';
const second = 'qFeKKGDoF2E';
const manifest = () => ({
  playlistId: 'OLAK5uy_test',
  browseId: 'MPREb_test',
  title: 'Album',
  artist: 'Artist',
  type: 'album',
  year: '2021',
  reportedTotal: 2,
  completeness: 'complete',
  slots: [second, video].map((videoId, index) => ({
    position: index + 1,
    videoId,
    title: `Song ${index}`,
    artist: 'Artist',
    duration: 200,
    available: true,
  })),
});
const collection = () => ({
  id: 'collection',
  name: 'Personal name',
  kind: 'album',
  source: { platform: 'youtube', id: 'OLAK5uy_test' },
  description: 'keep',
  coverImage: 'cover.jpg',
  trackIds: [],
  addedAt: {},
  releaseInfo: { revision: 4, observed: {}, overrides: { type: 'ep' } },
});

describe('release source catalog', () => {
  it('excludes stale linked identities from every membership consumer while preserving unmatched legacy members', () => {
    const next = reconcileCatalog(
      collection(),
      manifest(),
      { [video]: binding },
      '2026-10-24T00:00:00Z',
    );
    expect(catalogMemberMatches(next, video)).toBe(true);
    next.releaseInfo.catalog.manifest.slots[1].title = 'Changed version';
    expect(catalogMemberMatches(next, video)).toBe(false);
    expect(catalogMemberMatches(next, 'local-extra')).toBe(true);
    next.releaseInfo.catalog.manifest.slots.pop();
    expect(catalogMemberMatches(next, video)).toBe(false);
  });
  it('survives release validation and prunes removed private membership', () => {
    const next = reconcileCatalog(
      collection(),
      manifest(),
      { [video]: binding },
      '2026-10-24T00:00:00Z',
    );
    expect(validateReleaseInfo(next.releaseInfo, next)).toEqual(
      next.releaseInfo,
    );
    const removed = reconcileReleaseMembership(next, []);
    expect(removed.releaseInfo.catalog.links).toEqual({});
    expect(removed.releaseInfo.catalog.bindings).toEqual({});
    expect(removed.releaseInfo.catalog.manifest.slots).toHaveLength(2);
  });
  it('uses formal source positions, retains earlier members and manual metadata', () => {
    const first = reconcileCatalog(
      collection(),
      manifest(),
      { [video]: binding },
      '2026-10-24T00:00:00Z',
    );
    const next = reconcileCatalog(
      first,
      manifest(),
      { [second]: binding, [video]: binding },
      '2026-10-24T00:01:00Z',
    );
    expect(next.trackIds).toEqual([second, video]);
    expect(next.name).toBe('Personal name');
    expect(next.releaseInfo.overrides).toEqual({ type: 'ep' });
    expect(next.addedAt[video]).toBe(first.addedAt[video]);
    expect(next.releaseInfo.catalog.links[slotKey(2)].trackId).toBe(video);
    expect(validateCatalog(next.releaseInfo.catalog, next)).toEqual(
      next.releaseInfo.catalog,
    );
  });
  it('does not replace a complete manifest with a partial response', () => {
    const first = reconcileCatalog(
      collection(),
      manifest(),
      { [video]: binding },
      '2026-10-24T00:00:00Z',
    );
    const partial = {
      ...manifest(),
      completeness: 'partial',
      slots: manifest().slots.slice(0, 1),
    };
    expect(reconcileCatalog(first, partial, {}, '2026-10-24T00:01:00Z')).toBe(
      first,
    );
    const added = reconcileCatalog(
      first,
      partial,
      { [second]: binding },
      '2026-10-24T00:01:00Z',
    );
    expect(added.trackIds).toEqual([second, video]);
    expect(added.releaseInfo.catalog.fetchedAt).toBe(
      first.releaseInfo.catalog.fetchedAt,
    );
  });
  it('establishes a first source binding when an unresolved legacy member returns', () => {
    const existing = { ...collection(), trackIds: [video] };
    const first = reconcileCatalog(
      existing,
      manifest(),
      { [video]: null },
      '2026-10-24T00:00:00Z',
    );
    const next = reconcileCatalog(
      first,
      manifest(),
      { [video]: binding },
      '2026-10-24T00:01:00Z',
    );
    expect(next.releaseInfo.catalog.bindings[video]).toEqual(binding);
  });
  it('does not silently accept changed audio or revive a rejected link', () => {
    const first = reconcileCatalog(
      collection(),
      manifest(),
      { [video]: binding },
      '2026-10-24T00:00:00Z',
    );
    const next = reconcileCatalog(
      first,
      manifest(),
      { [video]: alternate },
      '2026-10-24T00:01:00Z',
    );
    expect(next.releaseInfo.catalog.bindings[video]).toEqual(binding);
    delete first.releaseInfo.catalog.links[slotKey(2)];
    first.releaseInfo.catalog.rejected = [video];
    expect(
      reconcileCatalog(
        first,
        manifest(),
        { [video]: binding },
        '2026-10-24T00:01:00Z',
      ).releaseInfo.catalog.links,
    ).toEqual({});
  });
  it('preserves unmatched legacy members and repeats source slots without duplicating files', () => {
    const value = manifest();
    value.slots[0].videoId = video;
    const existing = { ...collection(), trackIds: ['local-extra'] };
    const next = reconcileCatalog(
      existing,
      value,
      { [video]: binding, 'local-extra': binding },
      '2026-10-24T00:00:00Z',
    );
    expect(next.trackIds).toEqual([video, 'local-extra']);
    expect(Object.keys(next.releaseInfo.catalog.links)).toHaveLength(2);
    expect(slotIdentity(value.slots[0])).not.toBe('');
  });
  it('rejects forged source, unknown fields, count inconsistencies and duplicate positions', () => {
    for (const value of [
      { ...manifest(), url: 'https://bad.test' },
      { ...manifest(), playlistId: 'https://bad.test' },
      { ...manifest(), reportedTotal: 1 },
      { ...manifest(), slots: [manifest().slots[0], manifest().slots[0]] },
    ])
      expect(() => validateManifest(value)).toThrow();
    expect(() =>
      validateCatalog(
        {
          manifest: manifest(),
          links: {},
          bindings: {},
          rejected: [],
          fetchedAt: '2026-10-24T00:00:00Z',
        },
        {
          ...collection(),
          source: { platform: 'youtube', id: 'OLAK5uy_other' },
        },
      ),
    ).toThrow();
  });
  it('projects slot states without disclosing source IDs or media bindings', () => {
    const next = reconcileCatalog(
      collection(),
      manifest(),
      { [video]: binding },
      '2026-10-24T00:00:00Z',
    );
    const page = publicCatalogPage(next, new Map([[video, 'current']]), {
      offset: 0,
      limit: 1,
    });
    expect(page.rows[0]).toMatchObject({
      position: 1,
      state: 'not-imported',
      localTrackId: null,
    });
    expect(page).toMatchObject({
      availableCount: 1,
      totalTrackCount: 2,
      hasMore: true,
      nextOffset: 1,
    });
    const owned = publicCatalogPage(next, new Map([[video, 'changed']]), {
      offset: 1,
      limit: 1,
    });
    expect(owned.rows[0].state).toBe('needs-confirmation');
    expect(JSON.stringify(owned)).not.toContain(binding.value);
    expect(JSON.stringify(owned)).not.toContain('videoId');
  });
  it('returns only verified availability fields with a structure version independent from local state', () => {
    const next = reconcileCatalog(
      collection(),
      manifest(),
      { [video]: binding },
      '2026-10-24T00:00:00Z',
    );
    const full = publicCatalogPage(next, new Map([[video, 'current']]));
    const delta = publicCatalogPage(next, new Map([[video, 'missing']]), {
      availabilityOnly: true,
    });
    expect(delta.availabilityOnly).toBe(true);
    expect(delta.structureVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(delta.structureVersion).toBe(full.structureVersion);
    expect(delta.rows[1]).toEqual({
      key: 'slot-2',
      position: 2,
      state: 'missing',
      localTrackId: null,
      linkedTrackId: video,
      localCandidateTrackId: null,
    });
    expect(delta.rows[1]).not.toHaveProperty('title');
    expect(delta.rows[1]).not.toHaveProperty('artist');
    expect(JSON.stringify(delta)).not.toContain(binding.value);
    const changed = structuredClone(next);
    changed.releaseInfo.catalog.manifest.slots[0].title = 'Changed recording';
    expect(
      publicCatalogPage(changed, new Map(), { availabilityOnly: true })
        .structureVersion,
    ).not.toBe(full.structureVersion);
  });
});
