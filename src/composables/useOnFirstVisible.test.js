import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnFirstVisible } from './useOnFirstVisible.js';

afterEach(() => vi.unstubAllGlobals());

describe('first visible background read', () => {
  it('waits for visibility, runs once and disconnects on unmount', async () => {
    let notify;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback) {
          notify = callback;
        }
        disconnect = disconnect;
        observe = observe;
      },
    );
    const callback = vi.fn();
    const target = shallowRef(null);
    const scope = effectScope();
    scope.run(() => useOnFirstVisible(target, callback));
    target.value = {};
    await nextTick();
    expect(observe).toHaveBeenCalledWith(target.value);
    expect(callback).not.toHaveBeenCalled();
    notify([{ isIntersecting: false }]);
    expect(callback).not.toHaveBeenCalled();
    notify([{ isIntersecting: true }]);
    notify([{ isIntersecting: true }]);
    expect(callback).toHaveBeenCalledOnce();
    scope.stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('disconnects an unseen target when the section is closed', async () => {
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    const callback = vi.fn();
    const scope = effectScope();
    scope.run(() => useOnFirstVisible(shallowRef({}), callback));
    await nextTick();
    scope.stop();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();
  });

  it('falls back to loading when observation is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const callback = vi.fn();
    const scope = effectScope();
    scope.run(() => useOnFirstVisible(shallowRef({}), callback));
    expect(callback).toHaveBeenCalledOnce();
    scope.stop();
  });
});
