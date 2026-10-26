import { h, nextTick, reactive, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BgmPlayer from './BgmPlayer.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
const fixture = vi.hoisted(() => ({
  session: null,
  plan: null,
  library: null,
  view: null,
  transport: null,
  picker: null,
  source: null,
}));
vi.mock('../../composables/useBgmSession.js', () => ({
  useBgmSession: () => fixture.session,
}));
vi.mock('../../composables/useBgmStandbyPlan.js', () => ({
  useBgmStandbyPlan: () => fixture.plan,
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => fixture.library,
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => fixture.view,
}));
vi.mock('./BgmPlayerTransport.vue', () => ({
  default: {
    props: [
      'compact',
      'variant',
      'phase',
      'audibleLane',
      'currentTrack',
      'isDimmed',
      'isMuted',
      'hasGuideVocal',
      'guideVocalOn',
      'dimDb',
      'volume',
      'currentTime',
      'duration',
    ],
    setup(props, { emit, slots }) {
      fixture.transport = { props, emit };
      return () => h('div', { class: 'transport-probe' }, slots.context?.());
    },
  },
}));
vi.mock('./BgmCurrentSource.vue', () => ({
  default: {
    props: ['track', 'playbackAction'],
    setup(props, { slots, emit }) {
      fixture.source = { props, emit };
      return () => h('div', { class: 'source-probe' }, slots.picker?.());
    },
  },
}));
vi.mock('../ui/UiPopover.vue', () => ({
  default: {
    props: ['open'],
    setup(props, { slots }) {
      return () =>
        h('div', [
          slots.trigger?.({ triggerProps: { ref: () => {} } }),
          props.open ? slots.default?.() : null,
        ]);
    },
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    setup(_, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.());
    },
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['icon', 'label'],
    setup(props, { attrs }) {
      return () => h('button', attrs, props.label);
    },
  },
}));
vi.mock('../ui/UiTooltip.vue', () => ({
  default: {
    props: ['text'],
    setup(_, { slots }) {
      return () => slots.trigger?.({ triggerProps: {} });
    },
  },
}));
async function togglePicker(root) {
  trigger(
    findAll(
      root,
      (n) =>
        n.type === 'button' &&
        String(n.props.class).includes('bgm-current-source__change'),
    )[0],
    'onClick',
  );
  await nextTick();
}
vi.mock('./BgmTrackPicker.vue', () => ({
  default: {
    props: ['searchQuery', 'searchResults', 'isLoading', 'isSaving', 'error'],
    setup(props, { emit }) {
      fixture.picker = { props, emit };
      return () => h('div', { class: 'picker-probe' });
    },
  },
}));
attachClientRender(BgmPlayer, './BgmPlayer.vue', import.meta.url);
beforeEach(() => {
  fixture.session = {
    state: reactive({ error: null }),
    handoffState: reactive({
      phase: 'idle',
      audibleLane: null,
      error: null,
      restorePending: false,
    }),
    deckState: reactive({
      error: null,
      isDimmed: false,
      usesSeparatedAudio: true,
      guideVocalOn: false,
      currentTime: 0,
      duration: 120,
    }),
    currentTrack: ref({ id: 'one', title: 'One' }),
    canToggleGuideVocal: ref(true),
    settings: reactive({ volume: 0.4, isMuted: false, dimDb: -12 }),
  };
  for (const name of [
    'initialize',
    'dispose',
    'playBgm',
    'pauseBgm',
    'emergencyCut',
    'seekBgm',
    'commitBgmPosition',
    'setDimmed',
    'setGuideVocalOn',
    'previewVolume',
    'setVolume',
    'setMuted',
  ])
    fixture.session[name] = vi.fn();
  fixture.plan = {
    state: reactive({
      plan: { currentTrackId: 'one' },
      isSaving: false,
      error: null,
      validationError: null,
    }),
    setTrack: vi.fn(async () => true),
  };
  fixture.library = {
    state: reactive({
      tracks: [
        { id: 'one', title: 'One' },
        { id: 'two', title: 'Two' },
      ],
      isLoading: false,
    }),
  };
  fixture.view = {
    activeView: ref('performance'),
    performanceTool: ref('session'),
    openPerformancePreparation: vi.fn(),
  };
  fixture.picker = null;
});
describe('session BGM composition and lifecycle', () => {
  it('hides on the history tab and closes search while preserving disclosure and audio ownership', async () => {
    const props = reactive({ variant: 'dock', active: true });
    const dock = mount(BgmPlayer, props);
    const transport = fixture.transport;
    const disclosure = findAll(
      dock.root,
      (n) =>
        n.type === 'button' &&
        String(n.props.class).includes('bgm-player__disclosure'),
    )[0];
    trigger(disclosure, 'onClick');
    await nextTick();
    await togglePicker(dock.root);
    props.active = false;
    await nextTick();
    expect(
      findAll(dock.root, (n) => String(n.props.class).includes('picker-probe')),
    ).toHaveLength(0);
    expect(
      findAll(dock.root, (n) => n.type === 'section')[0].style.display,
    ).toBe('none');
    props.active = true;
    await nextTick();
    expect(fixture.transport).toBe(transport);
    expect(transport.props.compact).toBe(false);
    expect(disclosure.props['aria-expanded']).toBe(true);
    for (const key of ['initialize', 'dispose', 'playBgm', 'pauseBgm'])
      expect(fixture.session[key]).not.toHaveBeenCalled();
    dock.app.unmount();
  });
  it('defaults only the Dock to compact and toggles the same transport without audio intents', async () => {
    const dock = mount(BgmPlayer, { variant: 'dock' });
    const transport = fixture.transport;
    const transportNode = findAll(dock.root, (n) =>
      String(n.props.class).includes('transport-probe'),
    )[0];
    const sourceNode = findAll(dock.root, (n) =>
      String(n.props.class).includes('source-probe'),
    )[0];
    expect(transport.props.compact).toBe(true);
    expect(sourceNode.style.display).not.toBe('none');
    const disclosure = findAll(
      dock.root,
      (n) =>
        n.type === 'button' &&
        String(n.props.class).includes('bgm-player__disclosure'),
    )[0];
    fixture.session.state.error = 'BGM 媒體無法讀取';
    await nextTick();
    expect(textContent(disclosure)).toContain('BGM 媒體無法讀取');
    expect(disclosure.props.intent).toBe('danger');
    expect(disclosure.props['aria-expanded']).toBe(false);
    trigger(disclosure, 'onClick');
    await nextTick();
    expect(fixture.transport).toBe(transport);
    expect(transport.props.compact).toBe(false);
    expect(disclosure.props['aria-expanded']).toBe(true);
    await togglePicker(dock.root);
    expect(
      findAll(dock.root, (n) => String(n.props.class).includes('picker-probe')),
    ).toHaveLength(1);
    trigger(disclosure, 'onClick');
    await nextTick();
    expect(transport.props.compact).toBe(true);
    expect(
      findAll(dock.root, (n) => String(n.props.class).includes('picker-probe')),
    ).toHaveLength(0);
    expect(findAll(dock.root, (n) => n === disclosure)).toHaveLength(1);
    expect(findAll(dock.root, (n) => n === transportNode)).toHaveLength(1);
    for (const key of [
      'initialize',
      'dispose',
      'playBgm',
      'pauseBgm',
      'emergencyCut',
    ])
      expect(fixture.session[key]).not.toHaveBeenCalled();
    dock.app.unmount();
    const page = mount(BgmPlayer);
    expect(
      findAll(page.root, (n) =>
        String(n.props.class).includes('transport-probe'),
      )[0].style.display,
    ).not.toBe('none');
    expect(
      findAll(page.root, (n) =>
        String(n.props.class).includes('bgm-player__disclosure'),
      ),
    ).toHaveLength(0);
    page.app.unmount();
  });
  it('routes artwork playback through the shared phase lock without bypassing performance handoff', async () => {
    const dock = mount(BgmPlayer, { variant: 'dock' });
    expect(fixture.source.props.playbackAction.label).toBe('播放 BGM');
    fixture.source.emit('activate');
    expect(fixture.session.playBgm).toHaveBeenCalledOnce();
    fixture.session.handoffState.phase = 'track-active';
    await nextTick();
    expect(fixture.source.props.playbackAction.disabled).toBe(true);
    fixture.source.emit('activate');
    expect(fixture.session.playBgm).toHaveBeenCalledOnce();
    fixture.session.handoffState.phase = 'bgm-playing';
    await nextTick();
    fixture.source.emit('activate');
    expect(fixture.session.pauseBgm).toHaveBeenCalledOnce();
    dock.app.unmount();
  });
  it('owns long operational errors in a separate status line without adding status to track identity', async () => {
    const page = mount(BgmPlayer);
    fixture.session.state.error = '很長的 BGM 操作錯誤，請重試。'.repeat(10);
    await nextTick();
    expect(fixture.source.props.track.id).toBe('one');
    expect(fixture.source.props).not.toHaveProperty('status');
    const status = findAll(page.root, (n) => n.props.role === 'status');
    expect(status).toHaveLength(1);
    expect(status[0].props['aria-label']).toContain(
      fixture.session.state.error,
    );
    page.app.unmount();
  });
  it('mounts and unmounts page and Dock projections without initializing, starting or disposing audio', async () => {
    const page = mount(BgmPlayer);
    const dock = mount(BgmPlayer, { variant: 'dock' });
    await nextTick();
    expect(
      findAll(dock.root, (n) => n.props['aria-label'] === '場間音樂快捷'),
    ).toHaveLength(1);
    fixture.session.handoffState.phase = 'bgm-playing';
    fixture.session.handoffState.audibleLane = 'bgm';
    fixture.view.activeView.value = 'library';
    await nextTick();
    expect(
      findAll(dock.root, (n) => n.props['aria-label'] === '場間音樂快捷'),
    ).toHaveLength(1);
    expect(fixture.transport.props.variant).toBe('dock');
    fixture.transport.emit('setDimmed', true);
    fixture.transport.emit('cut');
    expect(fixture.session.setDimmed).toHaveBeenCalledWith(true);
    expect(fixture.session.emergencyCut).toHaveBeenCalledOnce();
    page.app.unmount();
    dock.app.unmount();
    for (const key of ['initialize', 'dispose', 'playBgm', 'pauseBgm'])
      expect(fixture.session[key]).not.toHaveBeenCalled();
  });
  it('keeps the idle Dock available across pages with source selection and transport intents', async () => {
    const dock = mount(BgmPlayer, { variant: 'dock' });
    await nextTick();
    expect(fixture.source.props.track.id).toBe('one');
    await togglePicker(dock.root);
    expect(fixture.picker).not.toBeNull();
    fixture.view.activeView.value = 'library';
    await nextTick();
    fixture.transport.emit('play');
    fixture.transport.emit('pause');
    fixture.transport.emit('setGuideVocalOn', true);
    fixture.transport.emit('commitVolume', 0.3);
    expect(fixture.session.playBgm).toHaveBeenCalledOnce();
    expect(fixture.session.pauseBgm).toHaveBeenCalledOnce();
    expect(fixture.session.setGuideVocalOn).toHaveBeenCalledWith(true);
    expect(fixture.session.setVolume).toHaveBeenCalledWith(0.3);
    dock.app.unmount();
    expect(fixture.session.initialize).not.toHaveBeenCalled();
    expect(fixture.session.dispose).not.toHaveBeenCalled();
  });
  it('changes the standby source without playing and folds only after successful persistence', async () => {
    const page = mount(BgmPlayer);
    await togglePicker(page.root);
    fixture.picker.emit('update:searchQuery', 'two');
    await nextTick();
    expect(fixture.picker.props.searchResults.map((t) => t.id)).toEqual([
      'two',
    ]);
    fixture.plan.setTrack.mockResolvedValueOnce(false);
    fixture.picker.emit('select', 'two');
    await nextTick();
    await nextTick();
    expect(
      findAll(page.root, (n) => String(n.props.class).includes('picker-probe')),
    ).toHaveLength(1);
    fixture.picker.emit('select', 'two');
    await nextTick();
    await nextTick();
    expect(fixture.plan.setTrack).toHaveBeenLastCalledWith('two');
    expect(
      findAll(page.root, (n) => String(n.props.class).includes('picker-probe')),
    ).toHaveLength(0);
    expect(fixture.session.playBgm).not.toHaveBeenCalled();
    page.app.unmount();
  });
  it('keeps source, operational status and transport settings on the same controller without an OBS gate', async () => {
    const page = mount(BgmPlayer);
    await nextTick();
    expect(fixture.source.props.track.id).toBe('one');
    expect(fixture.transport.props.volume).toBe(0.4);
    fixture.transport.emit('play');
    fixture.transport.emit('pause');
    fixture.transport.emit('commitVolume', 0.2);
    expect(fixture.session.playBgm).toHaveBeenCalledOnce();
    expect(fixture.session.pauseBgm).toHaveBeenCalledOnce();
    expect(fixture.session.setVolume).toHaveBeenCalledWith(0.2);
    fixture.session.handoffState.phase = 'stopping-bgm';
    await nextTick();
    expect(fixture.transport.props.phase).toBe('stopping-bgm');
    page.app.unmount();
  });
});
