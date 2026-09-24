import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ mounted: [], unmounted: [] }));

// onMounted/onUnmounted normally require a real component instance; mocking
// them to capture callbacks (same technique as useMediaSession.test.js) lets
// this composable run inside a plain effectScope instead of a full mount.
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return {
    ...actual,
    onMounted(callback) {
      lifecycle.mounted.push(callback);
    },
    onUnmounted(callback) {
      lifecycle.unmounted.push(callback);
    },
  };
});

import { useElapsedClock } from './useElapsedClock.js';

describe('useElapsedClock', () => {
  let scope;

  beforeEach(() => {
    lifecycle.mounted = [];
    lifecycle.unmounted = [];
  });

  afterEach(() => {
    scope?.stop();
    vi.useRealTimers();
  });

  it('starts at the source value with no source re-read needed', () => {
    const durationMs = ref(62_000);
    scope = effectScope();
    const elapsed = scope.run(() => useElapsedClock(() => durationMs.value));

    expect(elapsed.value).toBe(62_000);
  });

  it('ticks forward via a local 1s interval, purely from wall-clock time', () => {
    vi.useFakeTimers();
    const durationMs = ref(60_000);
    scope = effectScope();
    const elapsed = scope.run(() => useElapsedClock(() => durationMs.value));
    lifecycle.mounted.forEach((callback) => callback());

    vi.advanceTimersByTime(3_000);

    expect(elapsed.value).toBe(63_000);
  });

  it('re-baselines from a fresh snapshot instead of drifting from the old one', async () => {
    vi.useFakeTimers();
    const durationMs = ref(60_000);
    scope = effectScope();
    const elapsed = scope.run(() => useElapsedClock(() => durationMs.value));
    lifecycle.mounted.forEach((callback) => callback());
    vi.advanceTimersByTime(2_000);
    expect(elapsed.value).toBe(62_000);

    durationMs.value = 500_000; // e.g. reconnect refreshed the snapshot
    await nextTick();

    expect(elapsed.value).toBe(500_000);
    vi.advanceTimersByTime(1_000);
    expect(elapsed.value).toBe(501_000);
  });

  it('returns null while the source is null/non-finite, and resumes once it is not', async () => {
    const durationMs = ref(null);
    scope = effectScope();
    const elapsed = scope.run(() => useElapsedClock(() => durationMs.value));

    expect(elapsed.value).toBe(null);

    durationMs.value = 1_000;
    await nextTick();

    expect(elapsed.value).toBe(1_000);
  });

  it('clears its interval on unmount', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const durationMs = ref(1_000);
    scope = effectScope();
    scope.run(() => useElapsedClock(() => durationMs.value));
    lifecycle.mounted.forEach((callback) => callback());

    lifecycle.unmounted.forEach((callback) => callback());

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
