import { describe, expect, it, vi } from 'vitest';
import { createReleaseDownloadBatches } from './releaseDownloadBatches.js';

const input = { collectionId: 'album', libraryEpoch: 1, expectedRevision: 3 };
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function harness(keys = ['slot-1', 'slot-2', 'slot-3']) {
  let epoch = 1;
  const held = new Set();
  const gate = vi.fn();
  const getPlan = vi.fn(async () => ({ slotKeys: keys }));
  const prepare = vi.fn((value) => ({
    ...value,
    videoId: value.slotKey,
    identity: value.slotKey,
  }));
  const validate = vi.fn();
  const download = vi.fn(async (target, beforeStart) => {
    await beforeStart();
    held.add(target.videoId);
  });
  const attach = vi.fn(async () => ({ status: 'ok' }));
  const changed = vi.fn();
  const api = createReleaseDownloadBatches({
    getScope: () => ({ epoch }),
    getPlan,
    prepare,
    validate,
    hasAudio: async (target) => held.has(target.videoId),
    download,
    attach,
    requireProvider: gate,
    isPending: () => false,
    onChanged: changed,
  });
  const call = (operation, extra = {}) =>
    api.execute({ ...input, operation, ...extra });
  const settled = async () => {
    await vi.waitFor(() => expect(api.snapshot(input)?.active).toBe(false));
    return api.snapshot(input);
  };
  return {
    api,
    call,
    settled,
    gate,
    held,
    getPlan,
    prepare,
    validate,
    download,
    attach,
    changed,
    setEpoch: (value) => {
      epoch = value;
    },
  };
}
describe('release download batches', () => {
  it('contains attachment and plan failures with optional observers omitted', async () => {
    const api = createReleaseDownloadBatches({
      getScope: () => ({ epoch: 1 }),
      getPlan: async () => ({ slotKeys: ['slot-1'] }),
      prepare: (value) => ({ ...value, videoId: 'one' }),
      validate: () => {},
      hasAudio: async () => true,
      requireProvider: () => {},
      download: async () => {},
      attach: async () => {
        throw Error('private binding');
      },
    });
    await api.execute({ ...input, operation: 'start' });
    await vi.waitFor(() => expect(api.snapshot(input).active).toBe(false));
    expect(api.snapshot(input).unlinked).toBe(1);
    api.dispose();
    const h = harness();
    h.getPlan.mockRejectedValue(Error('private filesystem'));
    expect(await h.call('status')).toEqual({ status: 'unavailable' });
  });
  it('delivers completed state across its own revision conflict and never turns retry into an unrequested fresh batch', async () => {
    const h = harness(['slot-1']);
    expect(await h.call('retry')).toEqual({ status: 'unavailable' });
    await h.call('start');
    await h.settled();
    h.getPlan.mockRejectedValue(
      Object.assign(Error('changed'), { code: 'RELEASE_INFO_CONFLICT' }),
    );
    expect((await h.call('status')).snapshot).toMatchObject({
      active: false,
      succeeded: 1,
    });
    expect((await h.call('stop')).snapshot.phase).toBe('complete');
    h.setEpoch(2);
    expect(await h.call('stop')).toEqual({ status: 'stale' });
    h.api.dispose();
    expect(await h.call('status')).toEqual({ status: 'stale' });
  });
  it('skips jobs already owned by imports and retains a bounded result without starting them', async () => {
    const h = harness(['slot-1']);
    h.held.add('slot-1');
    await h.call('start');
    expect((await h.settled()).succeeded).toBe(1);
    expect(h.download).not.toHaveBeenCalled();
  });
  it('honors stop during plan preparation and shares duplicate admission', async () => {
    const h = harness();
    const plan = deferred();
    h.getPlan.mockReturnValue(plan.promise);
    const first = h.call('start');
    const second = h.call('start');
    await h.call('stop');
    plan.resolve({ slotKeys: ['slot-1', 'slot-2'] });
    expect((await first).snapshot.batchId).toBe(
      (await second).snapshot.batchId,
    );
    expect(await h.settled()).toMatchObject({ cancelled: 2, phase: 'stopped' });
    expect(h.download).not.toHaveBeenCalled();
    expect(h.getPlan).toHaveBeenCalledOnce();
  });
  it('uses the complete Main plan, prepares against one revision and runs at most two workers', async () => {
    const h = harness(Array.from({ length: 101 }, (_, i) => `slot-${i + 1}`));
    const wait = deferred();
    h.download.mockImplementation(async (target, beforeStart) => {
      await beforeStart();
      await wait.promise;
      h.held.add(target.videoId);
    });
    const start = await h.call('start');
    expect(start.snapshot.total).toBe(101);
    await vi.waitFor(() => expect(h.download).toHaveBeenCalledTimes(2));
    expect(
      h.prepare.mock.calls.every(([value]) => value.expectedRevision === 3),
    ).toBe(true);
    expect((await h.call('start')).snapshot.batchId).toBe(
      start.snapshot.batchId,
    );
    wait.resolve();
    expect((await h.settled()).succeeded).toBe(101);
    expect(h.changed).toHaveBeenCalledOnce();
  });
  it('stops only work that has not started, including a job waiting in the shared queue', async () => {
    const h = harness();
    const wait = deferred();
    h.download.mockImplementation(async (target, beforeStart) => {
      if (target.slotKey === 'slot-1') {
        await beforeStart();
        await wait.promise;
      } else {
        await wait.promise;
        await beforeStart();
      }
      h.held.add(target.videoId);
    });
    await h.call('start');
    await vi.waitFor(() => expect(h.download).toHaveBeenCalledTimes(2));
    await h.call('stop');
    wait.resolve();
    expect(await h.settled()).toMatchObject({
      succeeded: 1,
      cancelled: 2,
      phase: 'stopped',
    });
    expect(h.attach).toHaveBeenCalledOnce();
  });
  it('continues past failures and retries only failed/unlinked work, reusing installed audio', async () => {
    const h = harness();
    h.download.mockImplementationOnce(async () => {
      throw Error('private path');
    });
    h.attach.mockResolvedValueOnce({ status: 'downloaded-unlinked' });
    await h.call('start');
    expect(await h.settled()).toMatchObject({
      failed: 1,
      unlinked: 1,
      succeeded: 1,
    });
    h.download.mockClear();
    h.attach.mockResolvedValue({ status: 'ok' });
    await h.call('retry');
    expect(await h.settled()).toMatchObject({
      total: 2,
      succeeded: 2,
      failed: 0,
      unlinked: 0,
    });
    expect(h.download).toHaveBeenCalledOnce();
    expect(JSON.stringify(h.api.snapshot(input))).not.toContain('private');
  });
  it('deduplicates source audio but attaches each occurrence independently', async () => {
    const h = harness(['slot-1', 'slot-2']);
    h.prepare.mockImplementation((value) => ({
      ...value,
      videoId: 'same',
      identity: value.slotKey,
    }));
    await h.call('start');
    expect((await h.settled()).succeeded).toBe(2);
    expect(h.download).toHaveBeenCalledOnce();
    expect(h.attach).toHaveBeenCalledTimes(2);
  });
  it('fails closed on scope change, invalid intent and disabled gate', async () => {
    const h = harness();
    expect(await h.call('start', { url: 'https://untrusted.invalid' })).toEqual(
      { status: 'invalid-intent' },
    );
    expect(h.getPlan).not.toHaveBeenCalled();
    h.gate.mockImplementation(() => {
      throw Error('disabled');
    });
    expect(await h.call('start')).toEqual({ status: 'disabled' });
    h.gate.mockReset();
    h.setEpoch(2);
    expect(await h.call('start')).toEqual({ status: 'stale' });
    expect(h.download).not.toHaveBeenCalled();
  });
});
