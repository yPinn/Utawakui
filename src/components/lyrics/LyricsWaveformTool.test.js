import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nextTick, shallowRef } from 'vue';
import LyricsWaveformTool from './LyricsWaveformTool.vue';
import { mount } from '../ui/uiTestHost.js';
const state = vi.hoisted(() => ({ owner: null }));
vi.mock('../../composables/lyrics/useLyricsWaveform.js', () => ({
  useLyricsWaveform: () => state.owner,
}));
let app, vm;
beforeEach(() => {
  vi.stubGlobal('window', {
    innerWidth: 960,
    innerHeight: 850,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const tileIndex = shallowRef(0);
  state.owner = {
    open: shallowRef(true),
    overview: shallowRef({ durationSec: 21.3 }),
    detail: shallowRef({
      sampleRate: 100,
      frames: 2130,
      peaks: {
        startFrame: 0,
        endFrame: 1000,
        strideFrames: 1,
        min: new Float32Array(1000).fill(-0.5),
        max: new Float32Array(1000).fill(0.5),
        rms: new Float32Array(1000).fill(0.25),
      },
    }),
    adjacentDetail: shallowRef(null),
    status: shallowRef('ready'),
    tileIndex,
    clearing: shallowRef(false),
    reload: vi.fn(),
    clear: vi.fn(),
    selectWindow: vi.fn(async (tile) => {
      tileIndex.value = tile;
      await nextTick();
      return true;
    }),
  };
  const mounted = mount(
    { ...LyricsWaveformTool, render: () => null },
    { trackId: 'track', positionMs: 4000 },
  );
  app = mounted.app;
  vm = app._instance.subTree.component.setupState;
});
it('keeps help and maintenance behind the rightmost menu and rechecks disabled actions', async () => {
  expect(vm.showsHelp).toBe(false);
  state.owner.status.value = 'source-stale';
  expect(vm.canRetry).toBe(true);
  state.owner.status.value = 'ready';
  expect(vm.canRetry).toBe(false);
  vm.openMenu({ currentTarget: {} });
  expect(vm.menuOpen).toBe(true);
  vm.selectAction({ id: 'help' });
  expect(vm.showsHelp).toBe(true);
  expect(vm.menuOpen).toBe(false);
  vm.selectAction({ id: 'reload' });
  expect(state.owner.reload).toHaveBeenCalledOnce();
  state.owner.clearing.value = true;
  vm.selectAction({ id: 'reload' });
  vm.selectAction({ id: 'clear' });
  expect(state.owner.reload).toHaveBeenCalledOnce();
  expect(state.owner.clear).not.toHaveBeenCalled();
  state.owner.open.value = false;
  await nextTick();
  expect(vm.showsHelp).toBe(false);
});
it('clears stale signal during revalidation without invalid geometry or changing the viewport controls into a loading state', async () => {
  state.owner.status.value = 'loading';
  state.owner.detail.value = null;
  await nextTick();
  expect(vm.controlsUnavailable).toBe(false);
  expect(vm.noticeLabel).toBe('讀取波形…');
  state.owner.overview.value = null;
  app._instance.subTree.component.props.positionMs = 0;
  await nextTick();
  expect(vm.overviewBox).toEqual({ x: 0, width: 0 });
  expect(vm.overviewCursor).toBeNull();
  expect(vm.ticks).toEqual([]);
  expect(vm.detailPath).toBe('');
  expect(vm.controlsUnavailable).toBe(true);
  state.owner.status.value = 'source-stale';
  expect(vm.noticeLabel).toContain('請重新讀取');
  expect(vm.canRetry).toBe(true);
});
it('renders measured energy and the selected draft separately from saved timing without another read or transport intent', async () => {
  // Host updates go through the actual component vnode, as in the parent workspace.
  const instance = app._instance.subTree.component;
  instance.props.document = {
    lines: [
      { lineId: 'a', text: 'Current phrase', startMs: 3000, endMs: 5000 },
    ],
  };
  instance.props.focusLineId = 'a';
  instance.props.draftLine = { lineId: 'a', startMs: 3100, endMs: 5100 };
  await nextTick();
  expect(vm.detailEnergy).toContain('V40');
  expect(vm.lineFocus).toMatchObject({
    text: 'Current phrase',
    isDraft: true,
    changed: true,
  });
  expect(vm.focusRegions.map((r) => r.kind)).toEqual(['saved', 'draft']);
  expect(vm.hasFocusedRegion).toBe(true);
  expect(state.owner.selectWindow).not.toHaveBeenCalled();
  instance.props.draftLine = null;
  await nextTick();
  expect(vm.focusRegions).toHaveLength(1);
  expect(vm.lineFocus.isDraft).toBe(false);
  instance.props.sourceKey = 'another';
  instance.props.document = { lines: [] };
  await nextTick();
  expect(vm.lineFocus).toBeNull();
  expect(vm.hasFocusedRegion).toBe(false);
});
it('never dims the entire plot or invents a highlight when the selected end is unknown or outside the viewport', async () => {
  const instance = app._instance.subTree.component;
  instance.props.document = {
    lines: [{ lineId: 'a', text: 'Unknown', startMs: 3000, endMs: null }],
  };
  instance.props.focusLineId = 'a';
  await nextTick();
  expect(vm.hasFocusedRegion).toBe(false);
  expect(vm.focusedRange.width).toBe(0);
  instance.props.document = {
    lines: [{ lineId: 'a', text: 'Later', startMs: 18000, endMs: 20000 }],
  };
  await nextTick();
  expect(vm.hasFocusedRegion).toBe(false);
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});
it('offers handles only for an unlocked active draft and emits one intent without panning or changing saved timing', async () => {
  const instance = app._instance.subTree.component;
  const line = { lineId: 'a', text: 'Phrase', startMs: 3000, endMs: 6000 };
  const commits = vi.fn();
  instance.vnode.props.onSetBoundary = commits;
  instance.props.document = { lines: [line] };
  instance.props.focusLineId = 'a';
  instance.props.draftLine = line;
  instance.props.previewTiming = (kind, value) => ({
    ...line,
    [kind === 'start' ? 'startMs' : 'endMs']: value,
  });
  await nextTick();
  expect(vm.boundaryHandles).toEqual([]);
  instance.props.timingDisabled = false;
  await nextTick();
  expect(vm.boundaryHandles.map((h) => h.kind)).toEqual(['start', 'end']);
  const target = {
    closest: () => ({ getBoundingClientRect: () => ({ width: 500 }) }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  };
  const event = (x) => ({
    pointerId: 1,
    button: 0,
    clientX: x,
    currentTarget: target,
    preventDefault: vi.fn(),
  });
  vm.boundaryDrag.begin(event(100), 'start');
  vm.boundaryDrag.move(event(125));
  expect(vm.boundaryPreview.startMs).toBe(3500);
  expect(instance.props.draftLine.startMs).toBe(3000);
  const original = { ...vm.viewport };
  vm.boundaryDrag.finish(event(125));
  expect(commits).toHaveBeenCalledExactlyOnceWith({
    kind: 'start',
    value: 3500,
  });
  expect(vm.viewport).toEqual(original);
  expect(instance.props.document.lines[0].startMs).toBe(3000);
  vm.boundaryDrag.begin(event(100), 'start');
  vm.boundaryDrag.move(event(125));
  vm.resetPanelPosition(); // resize repositions the panel; a late release must not write timing
  vm.boundaryDrag.finish(event(125));
  expect(commits).toHaveBeenCalledOnce();
  vm.boundaryDrag.begin(event(100), 'start');
  vm.boundaryDrag.move(event(125));
  state.owner.overview.value = null; // media invalidation cancels the gesture synchronously
  vm.boundaryDrag.finish(event(125));
  expect(commits).toHaveBeenCalledOnce();
  expect(vm.boundaryPreview).toBeNull();
  expect(vm.boundaryHandles).toEqual([]);
});
it('moves a persistent reference panel by pointer or keyboard within the viewport and resets on closure', async () => {
  let left = 255,
    top = 286;
  const target = {
    closest: () => ({
      getBoundingClientRect: () => ({
        left,
        top,
        right: left + 384,
        bottom: top + 380,
      }),
    }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  };
  vm.beginPanelDrag({
    button: 0,
    pointerId: 1,
    clientX: 300,
    clientY: 300,
    currentTarget: target,
    preventDefault: vi.fn(),
  });
  vm.movePanel({
    pointerId: 1,
    clientX: 1000,
    clientY: -1000,
    currentTarget: target,
  });
  expect(vm.panelOffset).toEqual({ x: 313, y: -278 });
  vm.endPanelDrag({ pointerId: 1, currentTarget: target });
  expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
  left = 568;
  top = 8;
  vm.movePanelWithKey({
    key: 'ArrowLeft',
    currentTarget: target,
    preventDefault: vi.fn(),
  });
  expect(vm.panelOffset.x).toBe(303);
  state.owner.open.value = false;
  await nextTick();
  expect(vm.panelOffset).toEqual({ x: 0, y: 0 });
});
it('zooms to one second around the linked clock while keeping viewport requests bounded to the current tile', async () => {
  await vm.zoom(1);
  await vm.zoom(1);
  await vm.zoom(1);
  await vm.zoom(1);
  expect(vm.zoomIndex).toBe(3);
  expect(vm.viewport).toEqual({ fromMs: 3500, toMs: 4500 });
  expect(state.owner.selectWindow.mock.calls).toEqual([
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  await vm.navigate(1);
  expect(vm.viewport).toEqual({ fromMs: 4500, toMs: 5500 });
  expect(state.owner.selectWindow).toHaveBeenLastCalledWith(0, 0);
});
it('uses overview keys to reach both media ends while preserving zoom and clamping the short tail', async () => {
  vm.zoom(1);
  vm.zoom(1);
  vm.zoom(1);
  const key = (value) => ({
    key: value,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });
  await vm.moveOverviewWithKey(key('End'));
  expect(vm.viewport).toEqual({ fromMs: 20300, toMs: 21300 });
  await vm.navigate(1);
  expect(vm.viewport).toEqual({ fromMs: 20300, toMs: 21300 });
  expect(state.owner.selectWindow).toHaveBeenLastCalledWith(2, 2);
  await vm.moveOverviewWithKey(key('Home'));
  await vm.navigate(-1);
  expect(vm.viewport).toEqual({ fromMs: 0, toMs: 1000 });
});
it('resets the viewport on explicit closure and blocks navigation while clearing', async () => {
  vm.zoom(1);
  state.owner.selectWindow.mockClear();
  state.owner.clearing.value = true;
  vm.navigate(1);
  await vm.moveOverviewWithKey({
    key: 'End',
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });
  expect(state.owner.selectWindow).not.toHaveBeenCalled();
  state.owner.open.value = false;
  await nextTick();
  expect(vm.zoomIndex).toBe(0);
  expect(vm.viewport.fromMs).toBe(0);
});
