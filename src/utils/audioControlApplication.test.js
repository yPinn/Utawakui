import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioControlApplication } from './audioControlApplication.js';

afterEach(() => vi.useRealTimers());

describe('audio control application ownership', () => {
  it('rejects a truthy completion without confirmed required lanes', async () => {
    const applications = createAudioControlApplication({ publish: vi.fn() });
    await expect(applications.run({}, () => true)).resolves.toMatchObject({
      ok: false,
      status: 'failed',
      applied: null,
    });
  });

  it('invalidates a prior snapshot and prevents old lane callbacks from publishing', async () => {
    let latest;
    let lane;
    const applications = createAudioControlApplication({
      publish: (s) => (latest = s),
    });
    await applications.run({}, (job) => {
      lane = job.lane;
      job.lane('monitor', 'applied');
      job.lane('capture', 'applied');
      return true;
    });
    applications.invalidate('capture', 'failed');
    const invalidated = latest;
    lane('capture', 'applied');
    expect(latest).toBe(invalidated);
    expect(latest).toMatchObject({
      ok: false,
      status: 'invalidated',
      applied: null,
      lanes: { capture: 'failed' },
    });
  });
  it('settles a superseded request without waiting for its resource and ignores its late failure', async () => {
    const pending = Promise.withResolvers();
    let latest;
    const applications = createAudioControlApplication({
      publish: (s) => (latest = s),
    });
    const old = applications.run({ value: 1 }, async ({ isCurrent }) => {
      await pending.promise;
      expect(isCurrent()).toBe(false);
      throw new Error('late private failure');
    });
    const current = applications.run({ value: 2 }, ({ lane }) => {
      lane('monitor', 'applied');
      lane('capture', 'disabled');
      return true;
    });
    await expect(old).resolves.toMatchObject({
      ok: false,
      status: 'cancelled',
      applied: null,
    });
    await expect(current).resolves.toMatchObject({
      ok: true,
      applied: { value: 2 },
    });
    const settled = latest;
    pending.resolve();
    await vi.waitFor(() => expect(latest).toBe(settled));
  });

  it('cancels on demand without a late publication', async () => {
    const pending = Promise.withResolvers();
    const publish = vi.fn();
    const applications = createAudioControlApplication({ publish });
    const operation = applications.run({}, () => pending.promise);
    applications.cancel();
    await expect(operation).resolves.toMatchObject({
      status: 'cancelled',
      applied: null,
    });
    const count = publish.mock.calls.length;
    pending.resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(count);
  });

  it('bounds a stalled resource and rejects a late commit', async () => {
    vi.useFakeTimers();
    const pending = Promise.withResolvers();
    let live;
    let latest;
    const applications = createAudioControlApplication({
      publish: (s) => (latest = s),
    });
    const operation = applications.run({}, async ({ isCurrent }) => {
      live = isCurrent;
      await pending.promise;
      return true;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(operation).resolves.toMatchObject({
      ok: false,
      status: 'timeout',
      applied: null,
    });
    expect(live()).toBe(false);
    const settled = latest;
    pending.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(latest).toBe(settled);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not accept a result outside its caller scope', async () => {
    const pending = Promise.withResolvers();
    let current = true;
    const applications = createAudioControlApplication({ publish: vi.fn() });
    const operation = applications.run({}, () => pending.promise, {
      isCurrent: () => current,
    });
    current = false;
    pending.resolve(true);
    await expect(operation).resolves.toMatchObject({
      ok: false,
      status: 'cancelled',
    });
  });

  it('keeps per-lane evidence but never confirms partial or throwing applications', async () => {
    const applications = createAudioControlApplication({ publish: vi.fn() });
    await expect(
      applications.run({}, ({ lane }) => {
        lane('monitor', 'applied');
        lane('capture', 'failed');
        return false;
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'failed',
      applied: null,
      lanes: { monitor: 'applied', capture: 'failed' },
    });
    await expect(
      applications.run({}, () => {
        throw new Error('private');
      }),
    ).resolves.toMatchObject({ ok: false, status: 'failed', applied: null });
  });
});
