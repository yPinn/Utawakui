import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createSeparationAutoQueue } = require('./separationAutoQueue');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides = {}) {
  const state = {
    config: { autoSeparateAfterImport: true },
    gate: true,
    ready: true,
    obsLive: false,
  };
  const waits = [];
  let nextItem = 0;
  const separation = {
    isReady: vi.fn(() => state.ready),
    enqueue: vi.fn(() => ({ itemIds: [`item-${++nextItem}`] })),
    waitForItem: vi.fn(() => {
      const wait = deferred();
      waits.push(wait);
      return wait.promise;
    }),
    remove: vi.fn(() => true),
  };
  const tasks = [];
  const retries = [];
  const queue = createSeparationAutoQueue({
    getConfig: () => state.config,
    isFeatureEnabled: () => state.gate,
    featureId: 'audio-processing-flow',
    getSeparation: () => separation,
    isObsLive: () => state.obsLive,
    logger: { warn: vi.fn() },
    scheduleTask: (task) => tasks.push(task),
    scheduleRetry: (task) => {
      const entry = { task, cancelled: false };
      retries.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    ...overrides,
  });
  // Drain tasks may stay parked on waitForItem, so run them without awaiting.
  async function flush() {
    for (let round = 0; round < 5; round += 1) {
      while (tasks.length) void tasks.shift()();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return { state, separation, queue, waits, retries, flush };
}

describe('separation auto queue', () => {
  it('admits nothing while the setting, gate or tools are off', () => {
    for (const change of [
      (s) => (s.config = { autoSeparateAfterImport: false }),
      (s) => (s.gate = false),
      (s) => (s.ready = false),
    ]) {
      const { state, queue, separation } = setup();
      change(state);
      expect(queue.enqueue('track-1')).toBe(false);
      expect(separation.enqueue).not.toHaveBeenCalled();
    }
  });

  it('rejects unsafe track ids', () => {
    const { queue } = setup();
    expect(queue.enqueue('../escape')).toBe(false);
  });

  it('hands one track at a time to the shared queue without regenerating', async () => {
    const { queue, separation, waits, flush } = setup();
    expect(queue.enqueue('track-1')).toBe(true);
    expect(queue.enqueue('track-2')).toBe(true);
    expect(queue.enqueue('track-1')).toBe(true);
    await flush();
    expect(separation.enqueue).toHaveBeenCalledTimes(1);
    expect(separation.enqueue).toHaveBeenLastCalledWith({
      trackIds: ['track-1'],
      regenerate: false,
    });
    waits[0].resolve({ status: 'completed' });
    await Promise.resolve();
    await flush();
    expect(separation.enqueue).toHaveBeenCalledTimes(2);
    expect(separation.enqueue).toHaveBeenLastCalledWith({
      trackIds: ['track-2'],
      regenerate: false,
    });
    expect(queue.getStatus()).toMatchObject({ running: true, pending: 0 });
  });

  it('continues after a failed or cancelled track', async () => {
    const { queue, separation, waits, flush } = setup();
    queue.enqueue('track-1');
    queue.enqueue('track-2');
    await flush();
    waits[0].reject(new Error('cancelled'));
    await Promise.resolve();
    await Promise.resolve();
    await flush();
    expect(separation.enqueue).toHaveBeenCalledTimes(2);
  });

  it('defers new work while OBS is live and resumes when it stops', async () => {
    const { state, queue, separation, retries, flush } = setup();
    state.obsLive = true;
    queue.enqueue('track-1');
    await flush();
    expect(separation.enqueue).not.toHaveBeenCalled();
    expect(queue.getStatus()).toMatchObject({
      pending: 1,
      waitingForObs: true,
    });

    state.obsLive = false;
    queue.refresh();
    expect(retries[0].cancelled).toBe(true);
    await flush();
    expect(separation.enqueue).toHaveBeenCalledTimes(1);
  });

  it('retries on its own timer while OBS stays live', async () => {
    const { state, queue, separation, retries, flush } = setup();
    state.obsLive = true;
    queue.enqueue('track-1');
    await flush();
    retries[0].task();
    await flush();
    expect(retries).toHaveLength(2);
    state.obsLive = false;
    retries[1].task();
    await flush();
    expect(separation.enqueue).toHaveBeenCalledTimes(1);
  });

  it('drops waiting work and withdraws the handed item when turned off', async () => {
    const { state, queue, separation, flush } = setup();
    queue.enqueue('track-1');
    queue.enqueue('track-2');
    await flush();
    state.config = { autoSeparateAfterImport: false };
    queue.refresh();
    expect(separation.remove).toHaveBeenCalledWith('item-1');
    expect(queue.getStatus().pending).toBe(0);
  });

  it('drops queued work when tools disappear before it starts', async () => {
    const { state, queue, separation, flush } = setup();
    state.obsLive = true;
    queue.enqueue('track-1');
    await flush();
    state.ready = false;
    state.obsLive = false;
    queue.refresh();
    await flush();
    expect(separation.enqueue).not.toHaveBeenCalled();
    expect(queue.getStatus().pending).toBe(0);
  });

  it('treats a throwing OBS probe as not live', async () => {
    const { queue, separation, flush } = setup({
      isObsLive: () => {
        throw new Error('adapter unavailable');
      },
    });
    queue.enqueue('track-1');
    await flush();
    expect(separation.enqueue).toHaveBeenCalledTimes(1);
  });

  it('validates its dependencies', () => {
    expect(() => createSeparationAutoQueue({})).toThrow(
      'invalid automatic separation queue dependencies',
    );
  });
});
