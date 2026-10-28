import { effectScope, nextTick, shallowRef } from 'vue';
import { expect, it, vi } from 'vitest';
import { useLyricsWaveform } from './useLyricsWaveform.js';
function fixture() {
  const trackId = shallowRef('a'),
    sourceKey = shallowRef('a/lyrics');
  const pending = [],
    notices = [];
  const api = {
    readWaveform: vi.fn(() => {
      const p = Promise.withResolvers();
      pending.push(p);
      return p.promise;
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
