import { effectScope, nextTick, ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useTrackVideoAsset } from './useTrackVideoAsset.js';

afterEach(() => vi.unstubAllGlobals());

it('keeps only the current track and drops late results when disabled', async () => {
  const calls = new Map();
  const unsubscribe = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      getTrackVideo: (id) => new Promise((resolve) => calls.set(id, resolve)),
      onTrackVideoChanged: () => unsubscribe,
    },
  });
  const scope = effectScope();
  const trackId = ref('old');
  const enabled = ref(true);
  const { asset, pending } = scope.run(() =>
    useTrackVideoAsset({ trackId, enabled }),
  );
  expect(pending.value).toBe(true);
  trackId.value = 'current';
  await nextTick();
  calls.get('old')({ video: { available: true, url: 'old' } });
  await Promise.resolve();
  expect(asset.value).toBeNull();
  calls.get('current')({ video: { available: true, url: 'current' } });
  await Promise.resolve();
  expect(asset.value?.url).toBe('current');
  trackId.value = 'disabled';
  await nextTick();
  enabled.value = false;
  await nextTick();
  calls.get('disabled')({ video: { available: true, url: 'disabled' } });
  await Promise.resolve();
  expect(asset.value).toBeNull();
  expect(pending.value).toBe(false);
  scope.stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
