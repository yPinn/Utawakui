import { effectScope, nextTick, shallowRef, watch } from 'vue';
import { expect, it, vi } from 'vitest';
import { useLyricsWaveform } from './useLyricsWaveform.js';
function fixture() {
  const trackId = shallowRef('a'),
    sourceKey = shallowRef('a/lyrics');
  const pending = [],
    notices = [];
  const api = {
    onLibraryUpdated: vi.fn((listener) => {
      api.libraryUpdated = listener;
      return vi.fn();
    }),
    readWaveform: vi.fn(() => {
      const p = Promise.withResolvers();
      pending.push(p);
      return p.promise.then((result) =>
        result?.status === 'ready'
          ? { mediaRevision: 'a'.repeat(64), ...result }
          : result,
      );
    }),
    cancelWaveform: vi.fn(async () => ({ status: 'done' })),
    clearWaveform: vi.fn(async () => ({ status: 'done' })),
  };
  const scope = effectScope();
  const owner = scope.run(() =>
    useLyricsWaveform({
      trackId,
      sourceKey,
      api,
      notify: (notice) => notices.push(notice),
    }),
  );
  return { owner, api, pending, scope, trackId, sourceKey, notices };
}
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await nextTick();
};
async function openedFixture() {
  const f = fixture(),
    opening = f.owner.setOpen(true);
  await tick();
  f.pending[0].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await tick();
  f.pending[1].resolve({
    status: 'ready',
    summary: { durationSec: 30, tile: 0 },
  });
  await opening;
  return f;
}
it('preloads only the free adjacent slot and promotes an in-flight next tile without cancelling or fetching it twice', async () => {
  const f = await openedFixture();
  await f.owner.selectWindow(0, 0, { prefetchNext: true });
  await tick();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(3);
  expect(f.api.readWaveform.mock.calls[2][0]).toMatchObject({
    kind: 'detail',
    tileIndex: 1,
  });
  expect(f.owner.status.value).toBe('ready');
  const promoted = f.owner.selectWindow(0, 1);
  await tick();
  await f.owner.cancelPrefetch(); // It is required now; suspension must not abort it.
  expect(f.api.cancelWaveform).not.toHaveBeenCalled();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(3);
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  await promoted;
  expect(f.owner.detail.value.tile).toBe(0);
  expect(f.owner.adjacentDetail.value.tile).toBe(1);
  f.scope.stop();
});
it('retries a failed speculative read once it becomes required, and ignores speculative source A→B→A replies', async () => {
  const f = await openedFixture();
  await f.owner.selectWindow(0, 0, { prefetchNext: true });
  await tick();
  const needed = f.owner.selectWindow(0, 1);
  await tick();
  f.pending[2].resolve({ status: 'busy' });
  await vi.waitFor(() => expect(f.pending).toHaveLength(4));
  f.pending[3].resolve({ status: 'ready', summary: { tile: 1 } });
  expect(await needed).toBe(true);
  expect(f.owner.adjacentDetail.value.tile).toBe(1);
  expect(f.notices).toEqual([]);
  await f.owner.selectWindow(1, 1, { prefetchNext: true });
  await tick();
  f.sourceKey.value = 'b';
  f.sourceKey.value = 'a/lyrics';
  f.pending[4].resolve({ status: 'ready', summary: { tile: 2 } });
  await tick();
  expect(f.owner.open.value).toBe(false);
  expect(f.owner.adjacentDetail.value).toBeNull();
  f.scope.stop();
});
it('also joins an already required detail when a sliding window drops only the previous tile', async () => {
  const f = await openedFixture();
  const crossing = f.owner.selectWindow(0, 1);
  await tick();
  const shifted = f.owner.selectWindow(1, 1);
  await tick();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(3);
  expect(f.api.cancelWaveform).not.toHaveBeenCalled();
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  await Promise.all([crossing, shifted]);
  expect(f.owner.detail.value.tile).toBe(1);
  expect(f.owner.adjacentDetail.value).toBeNull();
  f.scope.stop();
});
it('cancels speculative work on demand changes and never installs a late result after suspension or clear', async () => {
  const f = await openedFixture();
  await f.owner.selectWindow(0, 0, { prefetchNext: true });
  await tick();
  await f.owner.cancelPrefetch();
  expect(f.api.cancelWaveform).toHaveBeenCalledOnce();
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  await tick();
  expect(f.owner.detail.value.tile).toBe(0);
  expect(f.owner.adjacentDetail.value).toBeNull();
  expect(f.notices).toEqual([]);
  await f.owner.selectWindow(0, 0, { prefetchNext: true });
  await tick();
  await f.owner.clear();
  f.pending[3].resolve({ status: 'ready', summary: { tile: 1 } });
  await tick();
  expect(f.owner.overview.value).toBeNull();
  expect(f.owner.adjacentDetail.value).toBeNull();
  expect(f.owner.status.value).toBe('idle');
  f.scope.stop();
});
it('keeps an optional busy failure quiet but invalidates every resident summary on explicit stale evidence', async () => {
  const f = await openedFixture();
  await f.owner.selectWindow(0, 0, { prefetchNext: true });
  await tick();
  f.pending[2].resolve({ status: 'busy' });
  await tick();
  expect(f.owner.status.value).toBe('ready');
  expect(f.owner.detail.value.tile).toBe(0);
  expect(f.notices).toEqual([]);
  const read = f.owner.selectWindow(0, 1);
  await tick();
  f.pending[3].resolve({ status: 'source-stale' });
  await read;
  expect(f.owner.overview.value).toBeNull();
  expect(f.owner.detail.value).toBeNull();
  expect(f.owner.status.value).toBe('source-stale');
  f.scope.stop();
});
it('never reads beyond EOF or a third tile, and invalidates speculative media mismatches', async () => {
  const f = await openedFixture();
  const tail = f.owner.selectWindow(2, 2, { prefetchNext: true });
  await tick();
  f.pending[2].resolve({ status: 'ready', summary: { tile: 2 } });
  await tail;
  await tick();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(3);
  const visible = f.owner.selectWindow(0, 1, { prefetchNext: true });
  await tick();
  f.pending[3].resolve({ status: 'ready', summary: { tile: 0 } });
  await tick();
  f.pending[4].resolve({ status: 'ready', summary: { tile: 1 } });
  await visible;
  await tick();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(5);
  await f.owner.selectWindow(1, 1, { prefetchNext: true });
  await tick();
  f.pending[5].resolve({
    status: 'ready',
    mediaRevision: 'b'.repeat(64),
    summary: { tile: 2 },
  });
  await tick();
  expect(f.owner.status.value).toBe('source-stale');
  expect(f.owner.overview.value).toBeNull();
  f.scope.stop();
});
it('does not resurrect ahead work when it is suspended during library revalidation', async () => {
  const f = await openedFixture();
  await f.owner.selectWindow(0, 0, { prefetchNext: true });
  await tick();
  const read = f.owner.reload();
  await tick();
  await f.owner.cancelPrefetch();
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  f.pending[3].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await tick();
  f.pending[4].resolve({ status: 'ready', summary: { tile: 0 } });
  await read;
  await tick();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(5);
  expect(f.owner.adjacentDetail.value).toBeNull();
  f.scope.stop();
});
it('retains at most two adjacent visible tiles, reuses either resident tile and does not refetch for local pans', async () => {
  const f = await openedFixture();
  const crossing = f.owner.selectWindow(0, 1);
  await tick();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(3);
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  await crossing;
  expect(f.owner.detail.value.tile).toBe(0);
  expect(f.owner.adjacentDetail.value.tile).toBe(1);
  await f.owner.selectWindow(0, 1);
  expect(f.api.readWaveform).toHaveBeenCalledTimes(3);
  const next = f.owner.selectWindow(1, 2);
  await tick();
  expect(f.owner.detail.value.tile).toBe(1);
  f.pending[3].resolve({ status: 'ready', summary: { tile: 2 } });
  await next;
  expect(f.owner.adjacentDetail.value.tile).toBe(2);
  await f.owner.selectWindow(2, 2);
  expect(f.owner.detail.value.tile).toBe(2);
  expect(f.owner.adjacentDetail.value).toBeNull();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(4);
  expect(await f.owner.selectWindow(0, 2)).toBe(false);
  f.scope.stop();
});
it('cancels an older cross-tile viewport and never installs its late response', async () => {
  const f = await openedFixture();
  const old = f.owner.selectWindow(0, 1);
  await tick();
  const latest = f.owner.selectWindow(2, 2);
  await tick();
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  f.pending[3].resolve({ status: 'ready', summary: { tile: 2 } });
  await Promise.all([old, latest]);
  expect(f.owner.detail.value.tile).toBe(2);
  expect(f.owner.adjacentDetail.value).toBeNull();
  expect(f.owner.tileIndex.value).toBe(2);
  f.scope.stop();
});
it('never combines a resident tile with different media evidence even when duration and sample format match', async () => {
  const f = await openedFixture();
  const crossing = f.owner.selectWindow(0, 1);
  await tick();
  f.pending[2].resolve({
    status: 'ready',
    mediaRevision: 'b'.repeat(64),
    summary: { durationSec: 30, tile: 1 },
  });
  expect(await crossing).toBe(false);
  expect(f.owner.open.value).toBe(true);
  expect(f.owner.status.value).toBe('source-stale');
  expect(f.owner.overview.value).toBeNull();
  expect(f.owner.detail.value).toBeNull();
  expect(f.owner.adjacentDetail.value).toBeNull();
  expect(f.notices).toEqual([]);
  f.scope.stop();
});
it('revalidates both tiles of the visible window on explicit reload', async () => {
  const f = await openedFixture();
  const crossing = f.owner.selectWindow(1, 2);
  await tick();
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  await tick();
  f.pending[3].resolve({ status: 'ready', summary: { tile: 2 } });
  await crossing;
  const reload = f.owner.reload();
  await tick();
  f.pending[4].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await tick();
  f.pending[5].resolve({ status: 'ready', summary: { tile: 1 } });
  await tick();
  f.pending[6].resolve({ status: 'ready', summary: { tile: 2 } });
  await reload;
  expect(
    f.api.readWaveform.mock.calls
      .slice(-3)
      .map(([intent]) => [intent.kind, intent.tileIndex]),
  ).toEqual([
    ['overview', 0],
    ['detail', 1],
    ['detail', 2],
  ]);
  expect(f.owner.detail.value.tile).toBe(1);
  expect(f.owner.adjacentDetail.value.tile).toBe(2);
  f.scope.stop();
});
it('clears both visible tiles and ignores an adjacent read that completes after clear', async () => {
  const f = await openedFixture();
  const crossing = f.owner.selectWindow(0, 1);
  await tick();
  await f.owner.clear();
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  await crossing;
  expect(f.owner.detail.value).toBeNull();
  expect(f.owner.adjacentDetail.value).toBeNull();
  expect(f.owner.status.value).toBe('idle');
  f.api.libraryUpdated();
  await tick();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(3);
  f.scope.stop();
});
it('does not install an adjacent tile after source A→B→A invalidation', async () => {
  const f = await openedFixture();
  const crossing = f.owner.selectWindow(0, 1);
  await tick();
  f.sourceKey.value = 'b';
  f.sourceKey.value = 'a/lyrics';
  f.pending[2].resolve({ status: 'ready', summary: { tile: 1 } });
  await crossing;
  expect(f.owner.open.value).toBe(false);
  expect(f.owner.detail.value).toBeNull();
  expect(f.owner.adjacentDetail.value).toBeNull();
  f.scope.stop();
});
it('does not start detail after closure between overview publication and its continuation', async () => {
  const f = fixture();
  const stop = watch(
    f.owner.overview,
    (value) => {
      if (value) void f.owner.setOpen(false);
    },
    { flush: 'sync' },
  );
  const opening = f.owner.setOpen(true);
  await tick();
  f.pending[0].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await expect(opening).resolves.toBeUndefined();
  expect(f.api.readWaveform).toHaveBeenCalledOnce();
  expect(f.owner.open.value).toBe(false);
  stop();
  f.scope.stop();
});
it('revalidates only the open reference panel on library updates and ignores late data', async () => {
  const f = fixture();
  const opening = f.owner.setOpen(true);
  await tick();
  f.api.libraryUpdated();
  f.pending[0].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await opening;
  await tick();
  expect(f.owner.open.value).toBe(true);
  expect(f.owner.overview.value).toBeNull();
  expect(f.owner.detail.value).toBeNull();
  expect(f.owner.status.value).toBe('loading');
  expect(f.api.readWaveform).toHaveBeenCalledTimes(2);
  f.pending[1].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await tick();
  f.pending[2].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await tick();
  expect(f.owner.detail.value.durationSec).toBe(30);
  expect(f.notices).toEqual([]);
  f.scope.stop();
});
it('is demand driven, cancels on close and ignores late success after source A→B→A', async () => {
  const f = fixture();
  expect(f.api.readWaveform).not.toHaveBeenCalled();
  const opening = f.owner.setOpen(true);
  await tick();
  f.sourceKey.value = 'b';
  f.sourceKey.value = 'a/lyrics';
  f.pending[0].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await opening;
  await tick();
  expect(f.owner.overview.value).toBeNull();
  expect(f.owner.open.value).toBe(false);
  expect(f.api.cancelWaveform).toHaveBeenCalledOnce();
  f.scope.stop();
});
it('keeps only visible summaries, clears without regenerating or success notices, and disposes requests', async () => {
  const f = fixture();
  const opening = f.owner.setOpen(true);
  await tick();
  f.pending[0].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await tick();
  f.pending[1].resolve({ status: 'ready', summary: { durationSec: 30 } });
  await opening;
  expect(f.owner.overview.value.durationSec).toBe(30);
  await f.owner.clear();
  expect(f.owner.overview.value).toBeNull();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(2);
  f.api.libraryUpdated();
  await tick();
  expect(f.api.readWaveform).toHaveBeenCalledTimes(2);
  expect(f.notices).toEqual([]);
  const read = f.owner.reload();
  await tick();
  f.scope.stop();
  f.pending[2].resolve({ status: 'unavailable' });
  await read;
  expect(f.notices).toEqual([]);
});
it('shows gate requirements locally and sends only current operational failure to shared notification', async () => {
  const f = fixture();
  const opening = f.owner.setOpen(true);
  await tick();
  f.pending[0].resolve({ status: 'gate-disabled' });
  await opening;
  expect(f.owner.status.value).toBe('gate-disabled');
  expect(f.notices).toEqual([]);
  const read = f.owner.reload();
  await tick();
  f.pending[1].resolve({ status: 'unavailable', diagnosticRecorded: true });
  await read;
  expect(f.notices).toHaveLength(1);
  expect(f.notices[0].message).not.toContain('path');
  f.scope.stop();
});
