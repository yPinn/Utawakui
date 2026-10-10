import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrolledPast } from './useScrolledPast.js';

afterEach(() => vi.unstubAllGlobals());

function stubObserver() {
  const instances = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.disconnect = vi.fn();
        instances.push(this);
      }
      observe(element) {
        this.element = element;
      }
    },
  );
  return instances;
}

function entry({ isIntersecting, bottom, rootTop = 100 }) {
  return {
    isIntersecting,
    boundingClientRect: { bottom },
    rootBounds: { top: rootTop },
  };
}

describe('useScrolledPast', () => {
  it('observes the target inside its Folder scroll viewport', async () => {
    const observers = stubObserver();
    const viewport = { id: 'viewport' };
    const target = shallowRef(null);
    const scope = effectScope();
    scope.run(() => useScrolledPast(target));

    target.value = { closest: () => viewport };
    await nextTick();

    expect(observers).toHaveLength(1);
    expect(observers[0].options.root).toBe(viewport);
    expect(observers[0].element).toBe(target.value);
    scope.stop();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('turns true only once the target is fully above the viewport top', async () => {
    const observers = stubObserver();
    const target = shallowRef(null);
    const scope = effectScope();
    const scrolledPast = scope.run(() => useScrolledPast(target));
    target.value = { closest: () => null };
    await nextTick();

    observers[0].callback([entry({ isIntersecting: true, bottom: 300 })]);
    expect(scrolledPast.value).toBe(false);
    observers[0].callback([entry({ isIntersecting: false, bottom: 90 })]);
    expect(scrolledPast.value).toBe(true);
    // Leaving below the viewport (e.g. a short page) is not "scrolled past".
    observers[0].callback([entry({ isIntersecting: false, bottom: 900 })]);
    expect(scrolledPast.value).toBe(false);
    scope.stop();
  });
});
