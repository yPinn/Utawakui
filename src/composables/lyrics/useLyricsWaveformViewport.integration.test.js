import { effectScope, nextTick, shallowRef } from 'vue';
import { expect, it, vi } from 'vitest';
import { useLyricsWaveform } from './useLyricsWaveform.js';
import { useLyricsWaveformViewport } from './useLyricsWaveformViewport.js';

it('opens at the linked late-song position without a competing tile-zero decode, and stops ahead work on hidden scope', async () => {
  const scope = effectScope(),
    active = shallowRef(true);
  const api = {
    readWaveform: vi.fn(async (intent) => ({
      status: 'ready',
      mediaRevision: 'a'.repeat(64),
      summary:
        intent.kind === 'overview'
          ? { durationSec: 120 }
          : { tile: intent.tileIndex },
    })),
    cancelWaveform: vi.fn(async () => {}),
  };
  const { owner } = scope.run(() => {
    const owner = useLyricsWaveform({
      trackId: 'one',
      sourceKey: 'main',
      api,
      notify: vi.fn(),
    });
    useLyricsWaveformViewport({
      waveform: owner,
      positionMs: shallowRef(75000),
      isPlaying: true,
      active,
    });
    return { owner };
  });
  await owner.setOpen(true);
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await nextTick();
  }
  const tiles = api.readWaveform.mock.calls
    .filter(([r]) => r.kind === 'detail')
    .map(([r]) => r.tileIndex);
  expect(tiles).toEqual([7, 8]);
  expect(owner.detail.value.tile).toBe(7);
  expect(owner.adjacentDetail.value.tile).toBe(8);
  active.value = false;
  scope.stop();
});
