import { computed, effectScope, nextTick, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useTrackPreviewEligibility } from './useTrackPreviewEligibility.js';

const track = (id) => ({ id, url: `utawakui-media://track/${id}/audio.wav` });
const album = (id = 'album', hasSourceCatalog = false) => ({
  id,
  kind: 'album',
  trackIds: ['a', 'b', 'c'],
  resolvedRelease: { revision: 2 },
  releaseLibraryEpoch: 7,
  hasSourceCatalog,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = async () => {
  await Promise.resolve();
  await nextTick();
};
function harness({
  collection = album(),
  tracks = [track('c'), track('a')],
  resolveMembers = vi.fn(async () => tracks),
} = {}) {
  const scope = effectScope(),
    selected = shallowRef(collection),
    candidates = shallowRef(tracks),
    library = shallowRef(new Map());
  const api = scope.run(() =>
    useTrackPreviewEligibility({
      collection: computed(() => selected.value),
      candidates,
      libraryIdentity: library,
      resolveMembers,
    }),
  );
  const catalog = (
    availableCount,
    status = 'ready',
    target = selected.value,
    identity = library.value,
  ) =>
    api.acceptCatalog({
      collection: target,
      libraryIdentity: identity,
      availableCount,
      status,
    });
  return { scope, api, selected, candidates, library, catalog, resolveMembers };
}

describe('local preview eligibility', () => {
  it('keeps source-only, external and missing-url entries out of ordinary local previews', () => {
    const h = harness({
      collection: null,
      tracks: [
        track('a'),
        { id: 'remote', url: 'https://example.com/audio.mp3' },
        { id: 'slot' },
      ],
    });
    expect(h.api.eligibleTracks.value.map((t) => t.id)).toEqual(['a']);
    expect(h.api.canPreview.value).toBe(true);
    expect(h.resolveMembers).not.toHaveBeenCalled();
    h.scope.stop();
  });

  it('checks only the selected non-catalog album and preserves candidate order after fresh proof', async () => {
    const proof = deferred(),
      resolveMembers = vi.fn(() => proof.promise);
    const h = harness({ resolveMembers });
    expect(h.api.canPreview.value).toBe(false);
    expect(h.api.blockedReason.value).toContain('確認');
    expect(resolveMembers).toHaveBeenCalledOnce();
    proof.resolve([track('a'), track('c')]);
    await flush();
    expect(h.api.eligibleTracks.value.map((t) => t.id)).toEqual(['c', 'a']);
    expect(h.api.canPreview.value).toBe(true);
    expect(h.candidates.value.map((t) => t.id)).toEqual(['c', 'a']);
    h.scope.stop();
  });

  it('disables an album whose saved tracks all fail admission without hiding its display data', async () => {
    const h = harness({ resolveMembers: vi.fn(async () => []) });
    await flush();
    expect(h.api.canPreview.value).toBe(false);
    expect(h.api.blockedReason.value).toContain('沒有可用');
    expect(h.candidates.value).toHaveLength(2);
    h.scope.stop();
  });

  it('reuses the current Main catalog count including beyond the visible page instead of resolving it twice', () => {
    const h = harness({ collection: album('source', true) });
    expect(h.api.canPreview.value).toBe(false);
    h.catalog(1);
    expect(h.api.canPreview.value).toBe(true);
    expect(h.resolveMembers).not.toHaveBeenCalled();
    h.catalog(0);
    expect(h.api.canPreview.value).toBe(false);
    h.scope.stop();
  });

  it('rejects obsolete catalog scope, library identity and malformed counts', () => {
    const h = harness({ collection: album('source', true) });
    h.catalog(1, 'ready', album('another', true));
    h.catalog(1, 'ready', h.selected.value, new Map());
    h.catalog(-1);
    h.catalog(NaN);
    expect(h.api.canPreview.value).toBe(false);
    h.catalog(1);
    expect(h.api.canPreview.value).toBe(true);
    const oldLibrary = h.library.value;
    h.library.value = new Map();
    expect(h.api.canPreview.value).toBe(false);
    h.catalog(1, 'ready', h.selected.value, oldLibrary);
    expect(h.api.canPreview.value).toBe(false);
    h.catalog(1, 'error');
    expect(h.api.blockedReason.value).toContain('無法確認');
    h.scope.stop();
  });

  it('ignores a late proof after leaving and returning to the same album', async () => {
    const first = deferred(),
      last = deferred();
    const resolveMembers = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(last.promise);
    const h = harness({ resolveMembers });
    h.selected.value = null;
    h.selected.value = album();
    first.resolve([track('a')]);
    await flush();
    expect(h.api.canPreview.value).toBe(false);
    last.resolve([]);
    await flush();
    expect(h.api.canPreview.value).toBe(false);
    h.scope.stop();
  });

  it('lets a newer explicit action proof disable a previously available source album', () => {
    const h = harness({ collection: album('source', true) });
    h.catalog(2);
    expect(h.api.canPreview.value).toBe(true);
    h.api.confirm([]);
    expect(h.api.canPreview.value).toBe(false);
    expect(h.candidates.value).toHaveLength(2);
    h.scope.stop();
  });

  it('does not apply a late action proof to a newer revision or catalog snapshot', () => {
    const h = harness({ collection: album('source', true) });
    h.catalog(2);
    const oldScope = h.api.captureScope();
    h.selected.value = {
      ...h.selected.value,
      resolvedRelease: { revision: 3 },
    };
    expect(h.api.confirm([track('a')], oldScope)).toBe(false);
    expect(h.api.canPreview.value).toBe(false);
    h.catalog(1);
    const olderCatalog = h.api.captureScope();
    h.catalog(0);
    expect(h.api.confirm([track('a')], olderCatalog)).toBe(false);
    expect(h.api.canPreview.value).toBe(false);
    h.scope.stop();
  });

  it('keeps read errors and disposed pending work from enabling the entry', async () => {
    const h = harness({
      resolveMembers: vi.fn(async () => {
        throw Error('unavailable');
      }),
    });
    await flush();
    expect(h.api.canPreview.value).toBe(false);
    expect(h.api.blockedReason.value).toContain('無法確認');
    h.scope.stop();
    const proof = deferred(),
      other = harness({ resolveMembers: vi.fn(() => proof.promise) });
    other.scope.stop();
    proof.resolve([track('a')]);
    await flush();
    expect(other.api.canPreview.value).toBe(false);
  });
});
