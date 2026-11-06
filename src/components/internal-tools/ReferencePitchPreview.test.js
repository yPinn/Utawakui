import { h, nextTick, reactive } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { Search, ZoomIn, ZoomOut } from '../../icons/index.js';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import Preview from './ReferencePitchPreview.vue';
import {
  pitchAt,
  pitchCursor,
  pitchPage,
  pitchPlot,
  pitchSpan,
  pitchTimeTicks,
} from './referencePitchPlot.js';

const { player } = vi.hoisted(() => ({
  player: { state: null, samplePlaybackClock: undefined },
}));
vi.mock('../../composables/usePlayer.js', () => ({ usePlayer: () => player }));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('button', slots.default?.()),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'icon'],
    setup: (props) => () =>
      h('button', { 'aria-label': props.label, 'data-icon': props.icon }),
  },
}));
attachClientRender(Preview, './ReferencePitchPreview.vue', import.meta.url);

afterEach(() => {
  player.samplePlaybackClock = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('draws a gap in the source clock and fits the final partial page', () => {
  const pitches = Float32Array.of(220, 220, 0, 330, 330);
  expect(pitchAt(pitches, 0.016, 0.032)).toBe(null);
  expect(pitchAt(pitches, 0.016, 0.032, 2.25)).toBe(null);
  expect(pitchAt(pitches, 0.016, 0, 2.25)).toBe(59.25);
  const original = pitchPlot(pitches, 0.016, 0, 8);
  const shifted = pitchPlot(pitches, 0.016, 0, 8, 2.25);
  expect(original.path.match(/M/g)).toHaveLength(2);
  expect(shifted.path.match(/M/g)).toHaveLength(2);
  expect(shifted.path.match(/[ML][\d.]+,/g)).toEqual(
    original.path.match(/[ML][\d.]+,/g),
  );
  expect(shifted.path).not.toBe(original.path);
  expect(pitchPage(17, 17)).toBe(16);
  expect(pitchCursor(17, 16, pitchSpan(16, 17))).toBe(320);
  expect(pitchCursor(8.5, 8, 8)).toBe(20);
});

it('marks only a single-frame excursion and keeps gaps and sustained notes', () => {
  const step = 0.016;
  const pitches = Float32Array.of(
    440,
    440,
    440,
    110,
    440,
    440,
    440,
    0,
    330,
    330,
    330,
    330,
    330,
    0,
    220,
    220,
    440,
    440,
    440,
    440,
    440,
    0,
    200,
  );
  const original = pitches.slice();
  const plot = pitchPlot(pitches, step, 0, 8);
  expect(plot.markers).toEqual([{ time: 3 * step, midi: 45, x: 1.92, y: 177 }]);
  expect(plot.path.match(/[ML]/g)).toHaveLength(19);
  expect(plot.path.match(/M/g)).toHaveLength(6);
  const withoutSpike = pitches.slice();
  withoutSpike[3] = 0;
  expect(plot.grid).toEqual(pitchPlot(withoutSpike, step, 0, 8).grid);
  expect(pitchAt(pitches, step, 3 * step)).toBe(45);
  expect(pitches).toEqual(original);
  expect(pitchPlot(pitches, step, 3 * step, step).markers).toHaveLength(1);
  expect(
    pitchPlot(Float32Array.of(440, 440, 220, 0, 440), step, 0, 8).markers,
  ).toHaveLength(0);
});

it('limits a local reversal to 15 cents and keeps a rising contour', () => {
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const reversal = [69, 69.6, 69].map(hz);
  const rise = [69, 69.6, 69.7].map(hz);
  expect(pitchPlot(reversal, 0.016, 0, 8).path).toContain('L0.64,128.25');
  expect(pitchPlot(rise, 0.016, 0, 8).path).toContain('L0.64,126.00');
  expect(pitchAt(reversal, 0.016, 0.016)).toBeCloseTo(69.6);
});

it('loads a saved curve by source and projects the applied pitch at each zoom', async () => {
  const replies = [];
  const api = {
    analyzeReferencePitch: vi.fn(
      () => new Promise((resolve) => replies.push(resolve)),
    ),
    cancelReferencePitch: vi.fn(async () => {}),
  };
  vi.stubGlobal('window', { Utawakui: api });
  player.state = reactive({
    track: { id: 'one', url: 'one', usesSeparatedAudio: true },
    playbackRevision: 1,
    duration: 10,
    currentTime: 1,
    audioControlApplication: {
      applied: { transposeSemitones: -2, pitchCents: -25 },
    },
  });
  const view = mount(Preview);
  const byType = (type) => findAll(view.root, (node) => node.type === type);
  const cursor = () =>
    byType('line').find(
      (line) => line.props.class === 'reference-pitch__cursor',
    );
  expect(api.analyzeReferencePitch).toHaveBeenCalledWith(
    'one',
    expect.any(String),
    true,
  );
  player.state.track = { id: 'two', url: 'two', usesSeparatedAudio: true };
  const response = {
    status: 'ready',
    durationSeconds: 10,
    stepSeconds: 0.016,
    completedAtMs: 0,
    pitches: new Float32Array(625).fill(330),
  };
  response.pitches[3] = 165;
  await nextTick();
  replies[0](response);
  await nextTick();
  expect(api.cancelReferencePitch).toHaveBeenCalledOnce();
  expect(byType('svg')).toHaveLength(0);

  replies[1]({ status: 'cache-miss' });
  await Promise.resolve();
  await nextTick();
  trigger(byType('button')[0], 'onClick');
  expect(api.analyzeReferencePitch).toHaveBeenLastCalledWith(
    'two',
    expect.any(String),
    false,
  );
  replies[2](response);
  await Promise.resolve();
  await nextTick();
  expect(cursor().props.x1).toBe(72);
  expect(
    findAll(view.root, (node) => node.props.class === 'reference-pitch__spike'),
  ).toHaveLength(1);
  expect(byType('input')).toHaveLength(0);
  expect(byType('button')).toHaveLength(1);
  expect(byType('button')[0].props['data-icon']).toBe(Search);
  expect(byType('button')[0].props['aria-label']).toBe(
    '目前顯示 8 秒，切換為 16 秒',
  );
  const readNote = () =>
    findAll(
      view.root,
      (node) => node.props.class === 'reference-pitch__note',
    )[0]
      ?.children.map((node) => node.text)
      .join('');
  expect(readNote()).toBe('D4 −23 音分');
  player.state.transposeSemitones = 3;
  player.state.pitchCents = 25;
  player.state.audioControlApplication = { status: 'deferred' };
  await nextTick();
  expect(readNote()).toBe('G4 +27 音分');
  expect(cursor().props.x1).toBe(72);
  player.state.isPlaying = true;
  await nextTick();
  expect(byType('svg')).toHaveLength(0);
  player.state.audioControlApplication = {
    status: 'failed',
    lanes: { monitor: 'applied', capture: 'failed' },
    requested: { transposeSemitones: 3, pitchCents: 25 },
  };
  await nextTick();
  expect(readNote()).toBe('G4 +27 音分');
  trigger(byType('button')[0], 'onClick');
  await nextTick();
  expect(cursor().props.x1).toBe(64);
  expect(player.state.currentTime).toBe(1);
  expect(byType('button')[0].props['aria-label']).toBe(
    '目前顯示 16 秒，切換為 4 秒',
  );
  expect(byType('button')[0].props['data-icon']).toBe(ZoomOut);
  player.state.currentTime = 9;
  await nextTick();
  expect(cursor().props.x1).toBe(320);
  trigger(byType('button')[0], 'onClick');
  await nextTick();
  expect(cursor().props.x1).toBe(192);
  expect(byType('button')[0].props['aria-label']).toBe(
    '目前顯示 4 秒，切換為 8 秒',
  );
  expect(byType('button')[0].props['data-icon']).toBe(ZoomIn);
  player.state.currentTime = 5;
  await nextTick();
  expect(cursor().props.x1).toBe(112);
  trigger(byType('button')[0], 'onClick');
  await nextTick();
  expect(cursor().props.x1).toBe(232);
  expect(player.state.currentTime).toBe(5);
  expect(byType('button')[0].props['aria-label']).toBe(
    '目前顯示 8 秒，切換為 16 秒',
  );
  expect(api.analyzeReferencePitch).toHaveBeenCalledTimes(3);
  view.app.unmount();
});

it('follows real media frames between timeupdate events and snaps on seek', async () => {
  const frames = new Map();
  let frameId = 0;
  let positionMs = 7900;
  player.samplePlaybackClock = () => ({ trackId: 'one', positionMs });
  player.state = reactive({
    track: { id: 'one', url: 'one', usesSeparatedAudio: true },
    playbackRevision: 1,
    playbackPhase: 'playing',
    isPlaying: true,
    duration: 20,
    currentTime: 7.9,
    audioControlApplication: {
      applied: { transposeSemitones: 0, pitchCents: 0 },
    },
  });
  vi.stubGlobal('window', {
    Utawakui: {
      analyzeReferencePitch: vi.fn(async () => ({
        status: 'ready',
        durationSeconds: 20,
        stepSeconds: 0.016,
        completedAtMs: 0,
        pitches: new Float32Array(1250).fill(330),
      })),
    },
    requestAnimationFrame(fn) {
      frames.set(++frameId, fn);
      return frameId;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  });
  const view = mount(Preview);
  const cursorX = () =>
    findAll(
      view.root,
      (node) => node.props.class === 'reference-pitch__cursor',
    )[0].props.x1;
  const advance = async (time, mediaPositionMs) => {
    positionMs = mediaPositionMs;
    const [id, draw] = frames.entries().next().value;
    frames.delete(id);
    draw(time);
    await nextTick();
  };
  await Promise.resolve();
  await nextTick();
  expect(cursorX()).toBeCloseTo(348);
  await advance(16, 7950);
  expect(cursorX()).toBeCloseTo(350);
  await advance(32, 8200);
  expect(cursorX()).toBeCloseTo(40);
  expect(player.state.currentTime).toBe(7.9);
  positionMs = 8250;
  player.state.playbackPhase = 'paused';
  await nextTick();
  expect(cursorX()).toBeCloseTo(42);
  expect(frames.size).toBe(0);
  positionMs = 3500;
  player.state.currentTime = 3.5;
  player.state.playbackPhase = 'seeking';
  await nextTick();
  expect(cursorX()).toBeCloseTo(172);
  expect(frames.size).toBe(0);
  player.state.playbackPhase = 'playing';
  await nextTick();
  expect(frames.size).toBe(1);
  view.app.unmount();
  expect(frames.size).toBe(0);
});

it('keeps five readable time ticks at each full-page scale', () => {
  for (const scale of [4, 8, 16]) {
    const start = pitchPage(19, 44, scale);
    const span = pitchSpan(start, 44, scale);
    expect(pitchTimeTicks(start, span, scale).map((tick) => tick.time)).toEqual(
      Array.from({ length: 5 }, (_, i) => start + (i * scale) / 4),
    );
  }
  expect(pitchTimeTicks(16, 3.1, 8).map((tick) => tick.time)).toEqual([
    16, 19.1,
  ]);
});
