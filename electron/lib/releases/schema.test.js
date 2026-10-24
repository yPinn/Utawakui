import { describe, expect, it } from 'vitest';
import {
  createReleaseInfo,
  observeReleaseInfo,
  reconcileReleaseMembership,
  resolveReleaseInfo,
  updateReleaseInfo,
  validateReleaseInfo,
} from './schema.js';

const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
const album = (extra = {}) => ({
  kind: 'album',
  trackIds: ['a', 'b'],
  ...extra,
});
const source = { platform: 'spotify', id: 'release-1' };
const fact = (
  value,
  provenance = { provider: 'spotify', sourceId: 'release-1' },
) => ({ value, provenance });
const info = (extra = {}) => ({
  revision: 0,
  observed: {},
  overrides: {},
  ...extra,
});

describe('release facts and validation', () => {
  it('does not infer a release type, date or count from album kind or members', () => {
    expect(resolveReleaseInfo(album())).toEqual({
      type: 'unknown',
      date: null,
      totalTrackCount: null,
      provenance: {
        type: 'unknown',
        date: 'unknown',
        totalTrackCount: 'unknown',
      },
      conflicts: [],
    });
    expect(createReleaseInfo(album())).toEqual(info());
  });

  it('resolves manual fields independently and distinguishes unknown/null from removed overrides', () => {
    const collection = album({
      source,
      releaseInfo: info({
        observed: {
          type: fact('single'),
          date: fact({ value: '2024', precision: 'year' }),
          totalTrackCount: fact(3),
        },
        overrides: { type: 'unknown', date: null },
      }),
    });
    expect(resolveReleaseInfo(collection)).toMatchObject({
      type: 'unknown',
      date: null,
      totalTrackCount: 3,
      provenance: {
        type: 'manual',
        date: 'manual',
        totalTrackCount: 'provider',
      },
    });
    const restored = updateReleaseInfo(collection, {
      expectedRevision: 0,
      remove: ['type', 'date'],
    });
    expect(resolveReleaseInfo(restored)).toMatchObject({
      type: 'single',
      date: { value: '2024', precision: 'year' },
    });
  });

  it.each([
    ['2024', 'year'],
    ['2024-02', 'month'],
    ['2024-02-29', 'day'],
    ['2000-02-29', 'day'],
    ['0099-12-31', 'day'],
  ])('accepts real dates with matching precision: %s', (value, precision) => {
    expect(
      validateReleaseInfo(
        info({ overrides: { date: { value, precision } } }),
        album(),
      ),
    ).toEqual(info({ overrides: { date: { value, precision } } }));
  });

  it.each([
    ['2023-02-29', 'day'],
    ['1900-02-29', 'day'],
    ['2024-04-31', 'day'],
    ['2024-00', 'month'],
    ['2024-13', 'month'],
    ['0000', 'year'],
    ['2024-2', 'month'],
    ['2024-02', 'year'],
    ['2024-02-01', 'month'],
    ['2024-01-01T00:00:00Z', 'day'],
  ])('rejects invalid or imprecise dates: %s', (value, precision) => {
    expect(() =>
      validateReleaseInfo(
        info({ overrides: { date: { value, precision } } }),
        album(),
      ),
    ).toThrow();
  });

  it('requires each provider fact to match the collection source exactly', () => {
    const releaseInfo = info({ observed: { type: fact('single') } });
    expect(validateReleaseInfo(releaseInfo, album({ source }))).toEqual(
      releaseInfo,
    );
    for (const collection of [
      album(),
      album({ source: { ...source, id: 'different' } }),
      album({ source: { ...source, platform: 'youtube' } }),
    ]) {
      expect(() => validateReleaseInfo(releaseInfo, collection)).toThrow();
    }
    expect(() =>
      validateReleaseInfo(
        info({ observed: { type: { value: 'single' } } }),
        album({ source }),
      ),
    ).toThrow();
    expect(() =>
      validateReleaseInfo(
        info({
          observed: {
            type: fact('single', {
              provider: 'spotify',
              sourceId: source.id,
              artworkMbid: 'guess',
            }),
          },
        }),
        album({ source }),
      ),
    ).toThrow();
  });

  it('hides contradictory provider counts without overwriting the stored fact', () => {
    const collection = album({
      source,
      releaseInfo: info({ observed: { totalTrackCount: fact(1) } }),
    });
    expect(resolveReleaseInfo(collection)).toMatchObject({
      totalTrackCount: null,
      conflicts: ['totalTrackCount'],
    });
    expect(collection.releaseInfo.observed.totalTrackCount.value).toBe(1);
    expect(() =>
      updateReleaseInfo(collection, {
        expectedRevision: 0,
        set: { totalTrackCount: 1 },
      }),
    ).toThrow();
    const hidden = updateReleaseInfo(collection, {
      expectedRevision: 0,
      set: { totalTrackCount: null },
    });
    expect(resolveReleaseInfo(hidden)).toMatchObject({
      totalTrackCount: null,
      conflicts: [],
    });
  });

  it.each([
    null,
    undefined,
    [],
    1,
    'single',
    {},
    info({ revision: -1 }),
    info({ revision: 1.5 }),
    info({ overrides: { type: 'compilation' } }),
    info({ overrides: { totalTrackCount: 0 } }),
    info({ overrides: { totalTrackCount: '3' } }),
    info({ futureField: { legitimate: true } }),
    info({ observed: { unknown: fact(1) } }),
  ])('fails closed on invalid or unrecognized persisted data', (value) => {
    expect(() => validateReleaseInfo(value, album({ source }))).toThrow();
  });
});

describe('release edits', () => {
  it('sets independent manual values, initializes private bindings, and preserves collection metadata', () => {
    const collection = album({
      name: '螺旋 🎵',
      description: 'keep',
      coverImage: 'cover.jpg',
      addedAt: { a: 'now' },
    });
    const changed = updateReleaseInfo(
      collection,
      {
        expectedRevision: 0,
        set: {
          type: 'single',
          date: { value: '2026', precision: 'year' },
          totalTrackCount: 2,
        },
        leadTrackId: 'b',
      },
      { bindings: { a: binding } },
    );
    expect(changed).toMatchObject({
      ...collection,
      releaseInfo: {
        revision: 1,
        overrides: { type: 'single', totalTrackCount: 2 },
        leadTrackId: 'b',
        localMemberBindings: { a: binding, b: null },
      },
    });
    expect(collection.releaseInfo).toBeUndefined();
    expect(JSON.stringify(resolveReleaseInfo(changed))).not.toContain(
      binding.value,
    );
    expect(changed.trackIds).toEqual(['a', 'b']);
  });

  it('initializes unresolved local bindings only on the first actual edit', () => {
    const collection = album();
    expect(updateReleaseInfo(collection, { expectedRevision: 0 })).toBe(
      collection,
    );
    const edited = updateReleaseInfo(collection, {
      expectedRevision: 0,
      set: { type: 'unknown' },
    });
    expect(edited.releaseInfo.localMemberBindings).toEqual({
      a: null,
      b: null,
    });
    expect(
      updateReleaseInfo(edited, {
        expectedRevision: 1,
        set: { type: 'unknown' },
      }),
    ).toBe(edited);
  });

  it('removes overrides and the lead marker without guessing replacements', () => {
    const collection = album({
      source,
      releaseInfo: info({
        overrides: { type: 'single', date: null },
        leadTrackId: 'b',
      }),
    });
    const changed = updateReleaseInfo(collection, {
      expectedRevision: 0,
      remove: ['date'],
      leadTrackId: null,
    });
    expect(changed.releaseInfo).toEqual(
      info({ revision: 1, overrides: { type: 'single' } }),
    );
    expect(
      updateReleaseInfo(changed, {
        expectedRevision: 1,
        remove: ['date'],
        leadTrackId: null,
      }),
    ).toBe(changed);
  });

  it.each([
    null,
    [],
    { expectedRevision: -1 },
    { expectedRevision: '0' },
    { expectedRevision: 0.5 },
    { expectedRevision: 0, set: { source: {} } },
    { expectedRevision: 0, binding },
    { expectedRevision: 0, leadTrackId: 'missing' },
    { expectedRevision: 0, set: null },
    { expectedRevision: 0, remove: ['observed'] },
    { expectedRevision: 0, remove: ['type'], set: { type: 'single' } },
  ])('rejects malformed and unauthorized intents', (intent) => {
    expect(() => updateReleaseInfo(album(), intent)).toThrow();
  });

  it('rejects stale revisions and edits to ordinary playlists', () => {
    const collection = album({ releaseInfo: info({ revision: 4 }) });
    expect(() =>
      updateReleaseInfo(collection, {
        expectedRevision: 3,
        set: { type: 'single' },
      }),
    ).toThrow(expect.objectContaining({ code: 'RELEASE_INFO_CONFLICT' }));
    expect(() =>
      updateReleaseInfo(album({ kind: 'playlist' }), { expectedRevision: 0 }),
    ).toThrow();
    expect(() =>
      updateReleaseInfo(
        album({ releaseInfo: info({ revision: Number.MAX_SAFE_INTEGER }) }),
        { expectedRevision: Number.MAX_SAFE_INTEGER, set: { type: 'single' } },
      ),
    ).toThrow();
  });
});

describe('membership, private bindings and source synchronization', () => {
  it('prunes stale private fields, preserves retained bindings and marks new members unresolved', () => {
    const previous = album({
      releaseInfo: info({
        leadTrackId: 'b',
        localMemberBindings: { a: binding, b: null },
      }),
    });
    const next = reconcileReleaseMembership(previous, ['a', 'c']);
    expect(next.releaseInfo).toEqual(
      info({ revision: 1, localMemberBindings: { a: binding, c: null } }),
    );
    expect(next.trackIds).toEqual(['a', 'c']);
    expect(reconcileReleaseMembership(next, ['a', 'c'])).toBe(next);
    expect(
      reconcileReleaseMembership(next, ['c', 'a']).releaseInfo.revision,
    ).toBe(2);
    expect(previous.releaseInfo.leadTrackId).toBe('b');
  });

  it('starts legacy album CAS on membership edits and supports explicit binding initialization/reconfirmation', () => {
    expect(reconcileReleaseMembership(album(), ['a'])).toEqual(
      album({ trackIds: ['a'], releaseInfo: info({ revision: 1 }) }),
    );
    const legacy = album({ releaseInfo: info() });
    expect(reconcileReleaseMembership(legacy, ['a', 'b'])).toBe(legacy);
    const bound = reconcileReleaseMembership(legacy, ['a', 'b'], {
      bindings: { a: binding },
    });
    expect(bound.releaseInfo.localMemberBindings).toEqual({
      a: binding,
      b: null,
    });
    expect(bound.releaseInfo.revision).toBe(1);
    expect(
      reconcileReleaseMembership(bound, ['a', 'b'], {
        bindings: { a: binding, b: null },
      }),
    ).toBe(bound);
  });

  it('updates observed fields independently while preserving manual decisions', () => {
    const collection = album({
      source,
      releaseInfo: info({
        overrides: { type: 'ep' },
        observed: { date: fact({ value: '2020', precision: 'year' }) },
      }),
    });
    const next = observeReleaseInfo(collection, {
      type: fact('single'),
      totalTrackCount: fact(2),
    });
    expect(next.releaseInfo).toMatchObject({
      revision: 1,
      overrides: { type: 'ep' },
      observed: {
        type: fact('single'),
        date: fact({ value: '2020', precision: 'year' }),
        totalTrackCount: fact(2),
      },
    });
    expect(observeReleaseInfo(next, { type: fact('single') })).toBe(next);
    expect(observeReleaseInfo(album({ source }), {})).toEqual(
      album({ source }),
    );
    expect(() =>
      observeReleaseInfo(collection, {
        type: fact('single', { provider: 'spotify', sourceId: 'wrong' }),
      }),
    ).toThrow();
    expect(() =>
      observeReleaseInfo(album(), { type: fact('single') }),
    ).toThrow();
    expect(() => observeReleaseInfo(collection, { date: null })).toThrow();
  });

  it.each([
    { '../escape': binding },
    { 'a/b': binding },
    { a: { ...binding, value: 'invalid' } },
    { a: { ...binding, kind: 'path' } },
    { absent: binding },
    JSON.parse('{"__proto__":null}'),
  ])('rejects unsafe, unknown-member and forged bindings', (bindings) => {
    expect(() => createReleaseInfo(album(), bindings)).toThrow();
  });

  it('rejects prototype keys, oversized/control IDs, unknown stored fields and source-owned local bindings', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(() =>
        validateReleaseInfo(
          JSON.parse(`{"revision":0,"observed":{},"overrides":{},"${key}":{}}`),
          album(),
        ),
      ).toThrow();
    }
    expect(() => createReleaseInfo(album({ trackIds: ['x\n'] }), {})).toThrow();
    expect(() =>
      createReleaseInfo(album({ trackIds: ['x'.repeat(256)] }), {}),
    ).toThrow();
    expect(() =>
      validateReleaseInfo(
        info({ localMemberBindings: { a: binding } }),
        album({ source }),
      ),
    ).toThrow();
    expect(() =>
      validateReleaseInfo(info({ leadTrackId: 'missing' }), album()),
    ).toThrow();
    expect(() => reconcileReleaseMembership(album(), ['a', 'a'])).toThrow();
    expect(() => reconcileReleaseMembership(album(), null)).toThrow();
  });

  it('handles large bounded collections and Unicode IDs without modifying member order', () => {
    const trackIds = Array.from({ length: 5000 }, (_, i) => `歌曲🎵-${i}`);
    const created = createReleaseInfo(album({ trackIds }), {});
    expect(Object.keys(created.localMemberBindings)).toHaveLength(5000);
    expect(
      resolveReleaseInfo(album({ trackIds, releaseInfo: created }))
        .totalTrackCount,
    ).toBeNull();
  });
});
