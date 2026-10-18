import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeferredLoading } from './useDeferredLoading.js';

const scopes = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});

function setup(loading = true) {
  const scope = effectScope();
  scopes.push(scope);
  const pending = ref(loading);
  const identity = ref('collection-a');
  const hasContent = ref(false);
  const presentation = scope.run(() =>
    useDeferredLoading(() => pending.value, { identity, hasContent }),
  );
  return { ...presentation, pending, identity, hasContent, scope };
}

describe('useDeferredLoading handoff', () => {
  it('never reveals or animates a fast read', async () => {
    const state = setup();
    expect(state.skeletonVisible.value).toBe(false);
    vi.advanceTimersByTime(100);
    state.pending.value = false;
    state.hasContent.value = true;
    await nextTick();
    vi.advanceTimersByTime(500);
    expect(state.skeletonVisible.value).toBe(false);
    expect(state.revealContent.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reveals slow reads and hands off immediately to one content animation', async () => {
    const state = setup(false);
    state.pending.value = true;
    await nextTick();
    vi.advanceTimersByTime(179);
    expect(state.skeletonVisible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(state.skeletonVisible.value).toBe(true);
    state.pending.value = false;
    state.hasContent.value = true;
    await nextTick();
    expect(state.skeletonVisible.value).toBe(false);
    expect(state.revealContent.value).toBe(true);
    state.finishReveal();
    expect(state.revealContent.value).toBe(false);
    await nextTick();
    expect(state.revealContent.value).toBe(false);
  });

  it('does not replay a fade during background refresh with existing content', async () => {
    const state = setup(false);
    state.hasContent.value = true;
    await nextTick();
    vi.advanceTimersByTime(500);
    expect(state.skeletonVisible.value).toBe(false);
    expect(state.revealContent.value).toBe(false);
  });

  it('does not animate empty results or failures, including later unrelated content', async () => {
    const state = setup();
    vi.advanceTimersByTime(180);
    state.pending.value = false;
    await nextTick();
    expect(state.revealContent.value).toBe(false);
    state.hasContent.value = true;
    await nextTick();
    expect(state.revealContent.value).toBe(false);
  });

  it('does not animate another destination with the previous skeleton', async () => {
    const state = setup();
    vi.advanceTimersByTime(180);
    state.identity.value = 'collection-b';
    state.pending.value = false;
    state.hasContent.value = true;
    await nextTick();
    expect(state.revealContent.value).toBe(false);
    expect(state.skeletonVisible.value).toBe(false);
  });

  it('restarts the delay for a changed destination and cancels a previous handoff', async () => {
    const state = setup();
    vi.advanceTimersByTime(120);
    state.identity.value = 'collection-b';
    await nextTick();
    vi.advanceTimersByTime(100);
    expect(state.skeletonVisible.value).toBe(false);
    vi.advanceTimersByTime(80);
    expect(state.skeletonVisible.value).toBe(true);
    state.hasContent.value = true;
    state.pending.value = false;
    await nextTick();
    expect(state.revealContent.value).toBe(true);
    state.identity.value = 'collection-c';
    await nextTick();
    expect(state.revealContent.value).toBe(false);
  });

  it('starts a fresh delay for retry and clears pending work on disposal', async () => {
    const state = setup();
    vi.advanceTimersByTime(120);
    state.pending.value = false;
    await nextTick();
    state.pending.value = true;
    await nextTick();
    vi.advanceTimersByTime(100);
    expect(state.skeletonVisible.value).toBe(false);
    state.scope.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(500);
    expect(state.skeletonVisible.value).toBe(false);
  });
});
