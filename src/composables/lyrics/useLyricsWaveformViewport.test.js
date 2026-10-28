import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useLyricsWaveformViewport } from './useLyricsWaveformViewport.js';
let scope;
afterEach(() => scope?.stop());
function setup(
  durationSec = 30,
  isPlaying = shallowRef(false),
  position = shallowRef(4000),
) {
  const waveform = {
    open: shallowRef(true),
    overview: shallowRef({ durationSec }),
    clearing: shallowRef(false),
    selectWindow: vi.fn(async () => true),
    cancelPrefetch: vi.fn(async () => {}),
  };
  scope = effectScope();
  const view = scope.run(() =>
    useLyricsWaveformViewport({ waveform, positionMs: position, isPlaying }),
  );
  const target = {
    getBoundingClientRect: () => ({ width: 300 }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  };
  const event = (x, extra = {}) => ({
    button: 0,
    pointerId: 1,
    clientX: x,
    currentTarget: target,
    preventDefault: vi.fn(),
    ...extra,
  });
  return { view, waveform, target, event, isPlaying, position };
}
it('pins the actual playback position while following, freezes on pause, and exits following on manual navigation', async () => {
  const f = setup(30, shallowRef(true));
  await nextTick();
  await f.view.zoom(1);
  await f.view.zoom(1);
  await f.view.zoom(1);
  f.position.value = 9500;
  await nextTick();
  expect(f.view.viewport.value).toEqual({ fromMs: 9000, toMs: 10000 });
  f.position.value = 9750;
  await nextTick();
  expect(f.view.viewport.value).toEqual({ fromMs: 9250, toMs: 10250 });
  f.isPlaying.value = false;
  f.position.value = 16000;
  await nextTick();
  expect(f.view.viewport.value.fromMs).toBe(9250);
  await f.view.navigate(-1);
  expect(f.view.following.value).toBe(false);
  f.isPlaying.value = true;
  f.position.value = 20000;
  await nextTick();
  expect(f.view.viewport.value.fromMs).toBe(8250);
  await f.view.setFollowing(true);
  expect(f.view.viewport.value.fromMs).toBe(19500);
});
it('requests ahead only while following active playback and suspends it for pause, manual navigation and hidden views', async () => {
  const isPlaying = shallowRef(true),
    active = shallowRef(true);
  const waveform = {
    open: shallowRef(true),
    overview: shallowRef({ durationSec: 30 }),
    clearing: shallowRef(false),
    selectWindow: vi.fn(async () => true),
    cancelPrefetch: vi.fn(async () => {}),
  };
  scope = effectScope();
  const view = scope.run(() =>
    useLyricsWaveformViewport({
      waveform,
      positionMs: shallowRef(1000),
      isPlaying,
      active,
    }),
  );
  await nextTick();
  expect(waveform.selectWindow).toHaveBeenLastCalledWith(0, 0, {
    prefetchNext: true,
  });
  isPlaying.value = false;
  await nextTick();
  expect(waveform.cancelPrefetch).toHaveBeenCalledOnce();
  isPlaying.value = true;
  await nextTick();
  active.value = false;
  await nextTick();
  expect(waveform.cancelPrefetch).toHaveBeenCalledTimes(2);
  const count = waveform.selectWindow.mock.calls.length;
  await view.navigate(1);
  expect(waveform.selectWindow).toHaveBeenCalledTimes(count);
  active.value = true;
  await nextTick();
  await view.setFollowing(true);
  await view.navigate(1);
  expect(waveform.selectWindow.mock.calls.at(-1)).toHaveLength(2);
});
it('does not repeatedly cancel or read the same tile pair while continuous following advances', async () => {
  const f = setup(30, shallowRef(true));
  await nextTick();
  f.waveform.selectWindow.mockClear();
  const pending = Promise.withResolvers();
  f.waveform.selectWindow.mockImplementation(() => pending.promise);
  for (let p = 6100; p < 8000; p += 40) {
    f.position.value = p;
    await nextTick();
  }
  expect(f.waveform.selectWindow).toHaveBeenCalledExactlyOnceWith(0, 1);
  pending.resolve(true);
  await nextTick();
  f.view.startDrag(f.event(0), 'detail');
  f.view.moveDrag(f.event(30));
  expect(f.view.following.value).toBe(false);
  const view = { ...f.view.viewport.value };
  f.position.value = 22000;
  await nextTick();
  expect(f.view.viewport.value).toEqual(view);
});
it('keeps EOF and paused positions visible without restarting playback and resets following for the next opening', async () => {
  const f = setup(30, shallowRef(true));
  await f.view.zoom(1);
  await f.view.zoom(1);
  await f.view.zoom(1);
  f.position.value = 30000;
  await nextTick();
  expect(f.view.viewport.value).toEqual({ fromMs: 29000, toMs: 30000 });
  await f.view.navigate(-1);
  f.isPlaying.value = false;
  await nextTick();
  expect(f.view.viewport.value.fromMs).toBe(28000);
  await f.view.setFollowing(true);
  expect(f.view.viewport.value.fromMs).toBe(29000);
  f.waveform.open.value = false;
  expect(f.view.following.value).toBe(true);
});
it('drags the overview window continuously across a tile boundary, preserving zoom and reading only on release', async () => {
  const f = setup();
  await f.view.zoom(1);
  await f.view.zoom(1);
  await f.view.zoom(1);
  f.waveform.selectWindow.mockClear();
  f.view.startDrag(f.event(0), 'overview');
  f.view.moveDrag(f.event(60));
  expect(f.view.viewport.value).toEqual({ fromMs: 9500, toMs: 10500 });
  expect(f.view.zoomIndex.value).toBe(3);
  expect(f.waveform.selectWindow).not.toHaveBeenCalled();
  await f.view.finishDrag(f.event(60));
  expect(f.waveform.selectWindow).toHaveBeenCalledExactlyOnceWith(0, 1);
  expect(f.target.releasePointerCapture).toHaveBeenCalledWith(1);
});
it('navigates the overview with keyboard equivalents, preserving zoom and guarding cleared or closed scopes', async () => {
  const f = setup(21.3);
  await f.view.zoom(1);
  await f.view.zoom(1);
  await f.view.zoom(1);
  const key = (value) => ({
    key: value,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });
  const end = key('End');
  await f.view.moveOverviewWithKey(end);
  expect(f.view.viewport.value).toEqual({ fromMs: 20300, toMs: 21300 });
  expect(f.view.following.value).toBe(false);
  expect(end.preventDefault).toHaveBeenCalledOnce();
  expect(end.stopPropagation).toHaveBeenCalledOnce();
  await f.view.moveOverviewWithKey(key('Home'));
  expect(f.view.viewport.value.fromMs).toBe(0);
  await f.view.moveOverviewWithKey(key('ArrowRight'));
  expect(f.view.viewport.value.fromMs).toBe(1000);
  await f.view.moveOverviewWithKey(key('PageUp'));
  expect(f.view.viewport.value.fromMs).toBe(6000);
  await f.view.moveOverviewWithKey(key('PageDown'));
  expect(f.view.viewport.value.fromMs).toBe(1000);
  expect(f.view.zoomIndex.value).toBe(3);
  const escape = key('Escape');
  expect(f.view.moveOverviewWithKey(escape)).toBe(false);
  expect(escape.preventDefault).not.toHaveBeenCalled();
  f.waveform.selectWindow.mockClear();
  f.waveform.clearing.value = true;
  await f.view.moveOverviewWithKey(key('End'));
  expect(f.waveform.selectWindow).not.toHaveBeenCalled();
  f.waveform.open.value = false;
  f.waveform.clearing.value = false;
  await f.view.moveOverviewWithKey(key('End'));
  expect(f.waveform.selectWindow).not.toHaveBeenCalled();
});
it('pans detail content in the grab direction and allows reversal during the same gesture', async () => {
  const f = setup();
  await f.view.zoom(1);
  await f.view.zoom(1);
  await f.view.zoom(1);
  f.waveform.selectWindow.mockClear();
  f.view.startDrag(f.event(100), 'detail');
  f.view.moveDrag(f.event(250));
  expect(f.view.viewport.value.fromMs).toBe(3000);
  f.view.moveDrag(f.event(-50));
  expect(f.view.viewport.value.fromMs).toBe(4000);
  await f.view.finishDrag(f.event(-50));
  expect(f.waveform.selectWindow).toHaveBeenCalledExactlyOnceWith(0, 0);
});
it('clamps both media edges including a partial final tile without changing the selected span', async () => {
  const f = setup(21.3);
  await f.view.zoom(1);
  await f.view.zoom(1);
  await f.view.zoom(1);
  f.view.startDrag(f.event(0), 'overview');
  f.view.moveDrag(f.event(9999));
  expect(f.view.viewport.value).toEqual({ fromMs: 20300, toMs: 21300 });
  await f.view.finishDrag(f.event(9999));
  expect(f.waveform.selectWindow).toHaveBeenLastCalledWith(2, 2);
  f.view.startDrag(f.event(0), 'overview');
  f.view.moveDrag(f.event(-9999));
  expect(f.view.viewport.value).toEqual({ fromMs: 0, toMs: 1000 });
});
it('cancels an uncommitted pan and ignores jitter, foreign pointers and secondary buttons', async () => {
  const f = setup();
  expect(f.view.startDrag(f.event(0, { button: 2 }), 'overview')).toBe(false);
  f.view.startDrag(f.event(0), 'overview');
  f.view.moveDrag(f.event(100, { pointerId: 2 }));
  expect(f.view.viewport.value.fromMs).toBe(0);
  f.view.moveDrag(f.event(50));
  f.view.cancelDrag(f.event(50));
  expect(f.view.viewport.value.fromMs).toBe(0);
  expect(f.waveform.selectWindow).not.toHaveBeenCalled();
  f.view.startDrag(f.event(0), 'overview');
  f.view.moveDrag(f.event(1));
  await f.view.finishDrag(f.event(1));
  expect(f.waveform.selectWindow).not.toHaveBeenCalled();
});
it('drops capture and prevents a release read after source invalidation or clearing', async () => {
  const f = setup();
  f.view.startDrag(f.event(0), 'overview');
  f.view.moveDrag(f.event(50));
  f.waveform.overview.value = null;
  await f.view.finishDrag(f.event(50));
  expect(f.view.isDragging.value).toBe(false);
  expect(f.waveform.selectWindow).not.toHaveBeenCalled();
  f.waveform.open.value = false;
  expect(f.view.viewport.value.fromMs).toBe(0);
  f.waveform.clearing.value = true;
  expect(f.view.startDrag(f.event(0), 'detail')).toBe(false);
});
