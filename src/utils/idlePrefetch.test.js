import { describe, expect, it, vi } from 'vitest';
import { prefetchWhenIdle } from './idlePrefetch.js';

function createIdleQueue() {
  const callbacks = [];
  return {
    requestIdle: (callback) => callbacks.push(callback),
    async runNext() {
      callbacks.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    get size() {
      return callbacks.length;
    },
  };
}

describe('prefetchWhenIdle', () => {
  it('loads one chunk per idle period in order', async () => {
    const idle = createIdleQueue();
    const first = vi.fn().mockResolvedValue({});
    const second = vi.fn().mockResolvedValue({});
    prefetchWhenIdle([first, second], { requestIdle: idle.requestIdle });

    expect(first).not.toHaveBeenCalled();
    await idle.runNext();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    await idle.runNext();
    expect(second).toHaveBeenCalledOnce();
    await idle.runNext();
    expect(idle.size).toBe(0);
  });

  it('keeps going after a failed load', async () => {
    const idle = createIdleQueue();
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    const next = vi.fn().mockResolvedValue({});
    prefetchWhenIdle([failing, next], { requestIdle: idle.requestIdle });

    await idle.runNext();
    await idle.runNext();
    expect(next).toHaveBeenCalledOnce();
  });

  it('does nothing without requestIdleCallback', () => {
    const load = vi.fn();
    prefetchWhenIdle([load], { requestIdle: undefined });
    expect(load).not.toHaveBeenCalled();
  });
});
