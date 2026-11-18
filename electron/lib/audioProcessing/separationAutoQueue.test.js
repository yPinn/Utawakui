import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createSeparationAutoQueue } = require('./separationAutoQueue');

function setup(overrides = {}) {
  const state = {
    config: { autoSeparateAfterImport: true },
    gate: true,
  };
  const separation = {
    enqueue: vi.fn(() => ({ itemIds: ['item-1'] })),
    wake: vi.fn(),
  };
  const queue = createSeparationAutoQueue({
    getConfig: () => state.config,
    isFeatureEnabled: () => state.gate,
    featureId: 'audio-processing-flow',
    getSeparation: () => separation,
    ...overrides,
  });
  return { state, separation, queue };
}

describe('separation auto queue', () => {
  it('admits nothing while the setting or gate is off', () => {
    for (const change of [
      (s) => (s.config = { autoSeparateAfterImport: false }),
      (s) => (s.gate = false),
    ]) {
      const { state, queue, separation } = setup();
      change(state);
      expect(queue.enqueue('track-1')).toBe(false);
      expect(separation.enqueue).not.toHaveBeenCalled();
    }
  });

  it('rejects unsafe track ids', () => {
    const { queue, separation } = setup();
    expect(queue.enqueue('../escape')).toBe(false);
    expect(separation.enqueue).not.toHaveBeenCalled();
  });

  it('adds each imported track to the visible queue right away', () => {
    const { queue, separation } = setup();
    expect(queue.enqueue('track-1')).toBe(true);
    expect(queue.enqueue('track-2')).toBe(true);
    expect(separation.enqueue.mock.calls).toEqual([
      [{ trackIds: ['track-1'] }],
      [{ trackIds: ['track-2'] }],
    ]);
  });

  it('skips tracks imported before the separation queue exists', () => {
    const { queue } = setup({ getSeparation: () => null });
    expect(queue.enqueue('track-1')).toBe(false);
  });

  it('wakes the queue on refresh and tolerates a missing queue', () => {
    const { queue, separation } = setup();
    queue.refresh();
    expect(separation.wake).toHaveBeenCalledOnce();
    const missing = setup({
      getSeparation: () => {
        throw new Error('not registered');
      },
    });
    expect(() => missing.queue.refresh()).not.toThrow();
  });

  it('validates its dependencies', () => {
    expect(() => createSeparationAutoQueue({})).toThrow(
      'invalid automatic separation queue dependencies',
    );
  });
});
