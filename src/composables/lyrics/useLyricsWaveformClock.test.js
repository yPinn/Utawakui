import { effectScope, shallowRef } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useLyricsWaveformClock } from './useLyricsWaveformClock.js';
let scope;
afterEach(() => scope?.stop());
function fixture() {
  const open = shallowRef(true),
    trackId = shallowRef('one'),
    position = shallowRef(1000),
    playing = shallowRef(true);
  let sample = { trackId: 'one', positionMs: 1234, phase: 'playing' };
  const frames = new Map();
  let nativeVisibility;
  const unsubscribeVisibility = vi.fn();
  const events = new Map(),
    document = {
      hidden: false,
      addEventListener: (name, fn) => events.set(name, fn),
      removeEventListener: (name) => events.delete(name),
    };
  let id = 0;
  const requestAnimationFrame = vi.fn((fn) => {
      frames.set(++id, fn);
      return id;
    }),
    cancelAnimationFrame = vi.fn((key) => frames.delete(key));
  scope = effectScope();
  const clock = scope.run(() =>
    useLyricsWaveformClock({
      open,
      trackId,
      positionMs: position,
      isPlaying: playing,
      sample: () => sample,
      frames: {
        requestAnimationFrame,
        cancelAnimationFrame,
        document,
        Utawakui: {
          onMainWindowVisibilityChanged: (callback) => {
            nativeVisibility = callback;
            callback(true);
            return unsubscribeVisibility;
          },
        },
      },
    }),
  );
  const frame = (time) => {
    const [key, fn] = frames.entries().next().value;
    frames.delete(key);
    fn(time);
  };
  return {
    clock,
    open,
    trackId,
    position,
    playing,
    frames,
    frame,
    setSample: (value) => {
      sample = value;
    },
    requestAnimationFrame,
    cancelAnimationFrame,
    document,
    events,
    nativeVisibility: (value) => nativeVisibility(value),
    unsubscribeVisibility,
  };
}
it('samples the existing media clock without rate extrapolation and stops scheduling while paused or closed', () => {
  const f = fixture();
  expect(f.clock.position.value).toBe(1234);
  f.setSample({ trackId: 'one', positionMs: 1800, phase: 'playing', rate: 2 });
  f.frame(100);
  expect(f.clock.position.value).toBe(1800);
  expect(f.frames.size).toBe(1);
  f.playing.value = false;
  expect(f.frames.size).toBe(0);
  expect(f.clock.position.value).toBe(1800);
  f.open.value = false;
  expect(f.clock.position.value).toBeNull();
  expect(f.frames.size).toBe(0);
});
it('never shows another track clock, and resamples actual position after an animation gap', () => {
  const f = fixture();
  f.trackId.value = 'two';
  expect(f.clock.position.value).toBeNull();
  f.setSample({ trackId: 'two', positionMs: 26000, phase: 'playing' });
  f.frame(90000);
  expect(f.clock.position.value).toBe(26000);
  scope.stop();
  expect(f.frames.size).toBe(0);
});
it('holds the hidden view without scheduling frames and reads the actual clock on return', () => {
  const f = fixture();
  f.document.hidden = true;
  f.events.get('visibilitychange')();
  f.setSample({ trackId: 'one', positionMs: 22000, phase: 'playing' });
  f.position.value = 22000;
  expect(f.clock.position.value).toBe(1234);
  expect(f.frames.size).toBe(0);
  f.document.hidden = false;
  f.events.get('visibilitychange')();
  expect(f.clock.position.value).toBe(22000);
  expect(f.frames.size).toBe(1);
  scope.stop();
  expect(f.events.size).toBe(0);
});
it('honors native minimization even when background playback keeps document visibility true', () => {
  const f = fixture();
  f.nativeVisibility(false);
  expect(f.clock.active.value).toBe(false);
  f.setSample({ trackId: 'one', positionMs: 25000, phase: 'playing' });
  f.position.value = 25000;
  expect(f.document.hidden).toBe(false);
  expect(f.clock.position.value).toBe(1234);
  expect(f.frames.size).toBe(0);
  f.nativeVisibility(true);
  expect(f.clock.active.value).toBe(true);
  expect(f.clock.position.value).toBe(25000);
  expect(f.frames.size).toBe(1);
  scope.stop();
  expect(f.unsubscribeVisibility).toHaveBeenCalledOnce();
});
