import { h, nextTick, reactive, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BgmPlayer from './BgmPlayer.vue';
import { attachClientRender, findAll, mount } from '../ui/uiTestHost.js';
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
      'variant',
      'phase',
      'audibleLane',
      'currentTrack',
      'isDimmed',
      'isMuted',
      'dimDb',
      'volume',
      'currentTime',
      'duration',
    ],
    setup(props, { emit }) {
      fixture.transport = { props, emit };
      return () => h('div', { class: 'transport-probe' });
    },
  },
}));
vi.mock('./BgmCurrentSource.vue', () => ({
  default: {
    props: ['track', 'status', 'pickerExpanded', 'pickerControls'],
    setup(props, { emit }) {
      fixture.source = { props, emit };
      return () => h('div', { class: 'source-probe' });
    },
  },
}));
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
      currentTime: 0,
      duration: 120,
    }),
    currentTrack: ref({ id: 'one', title: 'One' }),
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
    fixture.source.emit('togglePicker');
    await nextTick();
    expect(fixture.picker).not.toBeNull();
    fixture.view.activeView.value = 'library';
    await nextTick();
    fixture.transport.emit('play');
    fixture.transport.emit('pause');
    fixture.transport.emit('commitVolume', 0.3);
    expect(fixture.session.playBgm).toHaveBeenCalledOnce();
    expect(fixture.session.pauseBgm).toHaveBeenCalledOnce();
    expect(fixture.session.setVolume).toHaveBeenCalledWith(0.3);
    dock.app.unmount();
    expect(fixture.session.initialize).not.toHaveBeenCalled();
    expect(fixture.session.dispose).not.toHaveBeenCalled();
  });
  it('changes the standby source without playing and folds only after successful persistence', async () => {
    const page = mount(BgmPlayer);
    fixture.source.emit('togglePicker');
    await nextTick();
    fixture.picker.emit('update:searchQuery', 'two');
    await nextTick();
    expect(fixture.picker.props.searchResults.map((t) => t.id)).toEqual([
      'two',
    ]);
    fixture.plan.setTrack.mockResolvedValueOnce(false);
    fixture.picker.emit('select', 'two');
    await nextTick();
    await nextTick();
    expect(fixture.source.props.pickerExpanded).toBe(true);
    fixture.picker.emit('select', 'two');
    await nextTick();
    await nextTick();
    expect(fixture.plan.setTrack).toHaveBeenLastCalledWith('two');
    expect(fixture.source.props.pickerExpanded).toBe(false);
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
