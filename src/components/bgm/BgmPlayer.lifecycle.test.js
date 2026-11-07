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
vi.mock('../../composables/useArtistIndex.js', () => ({
  useArtistIndex: () => ({ state: { index: null } }),
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => fixture.view,
}));
vi.mock('./BgmPlayerTransport.vue', () => ({
  default: {
    props: [
      'compact',
      'standby',
      'folded',
      'animateFold',
      'liftTools',
      'toolsHost',
      'cutHost',
      'combinedTools',
      'footerId',
      'variant',
      'phase',
      'audibleLane',
      'currentTrack',
      'isDimmed',
      'isMuted',
      'statusVisible',
      'inlineStatus',
      'hasGuideVocal',
      'guideVocalOn',
      'dimDb',
      'volume',
      'currentTime',
      'duration',
      'seekDisabled',
    ],
    setup(props, { emit, slots }) {
      fixture.transport = { props, emit };
      return () =>
        h('div', { class: 'transport-probe' }, [
          props.statusVisible ? slots.status?.() : null,
          slots.context?.(),
        ]);
    },
  },
}));
vi.mock('./BgmCurrentSource.vue', () => ({
  default: {
    props: ['track', 'playbackAction', 'compactEmpty'],
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
vi.mock('../ui/UiFolderTabShape.vue', () => ({
  default: { render: () => h('svg') },
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
        /bgm-current-source__change|bgm-player__search-tab-button/u.test(
          String(n.props.class),
        ),
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
    isCurrentSourceLoaded: ref(true),
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
  it('keeps the selected mixer collapsed across playback and handoff phases', async () => {
    const dock = mount(BgmPlayer, { variant: 'dock' });
    const sourcePicker = findAll(dock.root, (node) =>
      String(node.props.class).includes('bgm-player__source-picker'),
    )[0];
    const transport = fixture.transport;
    try {
      await nextTick();
      expect(transport.props.standby).toBe(true);
      expect(transport.props.folded).toBe(true);
      expect(transport.props.compact).toBe(false);
      expect(sourcePicker.style.display).toBe('none');
      expect(textContent(dock.root)).not.toContain('場間音樂已回到待命');
      const arrow = findAll(dock.root, (node) =>
        String(node.props.class).includes('bgm-player__disclosure'),
      )[0];
      trigger(arrow, 'onClick');
      await nextTick();
      expect(transport.props.folded).toBe(false);
      expect(arrow.props['aria-expanded']).toBe(true);
      trigger(arrow, 'onClick');
      await nextTick();
      expect(transport.props.folded).toBe(true);

      for (const phase of ['bgm-playing', 'stopping-bgm', 'track-preroll']) {
        fixture.session.handoffState.phase = phase;
        await nextTick();
        expect(transport.props.standby).toBe(false);
        expect(transport.props.folded).toBe(true);
        expect(arrow.props['aria-expanded']).toBe(false);
        expect(sourcePicker.style.display).toBe('none');
      }

      fixture.session.handoffState.phase = 'idle';
      fixture.session.handoffState.restorePending = true;
      await nextTick();
      expect(transport.props.standby).toBe(false);
      fixture.session.handoffState.restorePending = false;
      await nextTick();
      expect(textContent(dock.root)).not.toContain('場間音樂已回到待命');
      expect(fixture.transport.props.statusVisible).toBe(false);
      fixture.session.state.error = '場間音樂媒體無法讀取';
      await nextTick();
      expect(transport.props.standby).toBe(false);
      expect(textContent(dock.root)).not.toContain('場間音樂已回到待命');
      fixture.session.state.error = null;
      await nextTick();
      expect(transport.props.standby).toBe(true);
      expect(fixture.transport).toBe(transport);
      expect(fixture.session.playBgm).not.toHaveBeenCalled();
    } finally {
      dock.app.unmount();
    }
  });

  it('lets the empty compact Dock choose directly and restores progress after selection', async () => {
    fixture.session.currentTrack.value = null;
    fixture.plan.state.plan.currentTrackId = null;
    fixture.plan.setTrack.mockImplementationOnce(async (trackId) => {
      fixture.plan.state.plan.currentTrackId = trackId;
      fixture.session.currentTrack.value = { id: trackId, title: 'Two' };
      return true;
    });
    const dock = mount(BgmPlayer, { variant: 'dock' });
    try {
      await nextTick();
      const sourcePicker = findAll(dock.root, (node) =>
        String(node.props.class).includes('bgm-player__source-picker'),
      )[0];
      const transport = findAll(dock.root, (node) =>
        String(node.props.class).includes('transport-probe'),
      )[0];
      const disclosure = findAll(dock.root, (node) =>
        String(node.props.class).includes('bgm-player__disclosure'),
      )[0];
      expect(fixture.source.props.compactEmpty).toBe(true);
      expect(transport.style.display).toBe('none');
      expect(disclosure.props['aria-expanded']).toBe(false);
      expect(textContent(sourcePicker)).toContain('選擇');
      await togglePicker(dock.root);
      expect(fixture.picker).not.toBeNull();
      fixture.picker.emit('select', 'two');
      await nextTick();
      await nextTick();
      expect(fixture.plan.setTrack).toHaveBeenCalledWith('two');
      expect(fixture.session.playBgm).not.toHaveBeenCalled();
      expect(fixture.source.props.compactEmpty).toBe(false);
      expect(transport.style.display).not.toBe('none');
      expect(findAll(dock.root, (node) => node === disclosure)).toHaveLength(1);
      expect(disclosure.props['aria-expanded']).toBe(false);
      expect(sourcePicker.style.display).toBe('none');
      expect(textContent(dock.root)).toContain('使用原曲');
      const [searchTab] = findAll(
        dock.root,
        (node) =>
          node.type === 'button' &&
          String(node.props.class).includes('bgm-player__search-tab-button'),
      );
      expect(searchTab.props['aria-expanded']).toBe(false);
    } finally {
      dock.app.unmount();
    }
  });

  it('keeps unresolved sources compact and reveals full controls for playback errors', async () => {
    fixture.session.currentTrack.value = null;
    const dock = mount(BgmPlayer, { variant: 'dock' });
    try {
      const transport = findAll(dock.root, (node) =>
        String(node.props.class).includes('transport-probe'),
      )[0];
      const disclosure = findAll(dock.root, (node) =>
        String(node.props.class).includes('bgm-player__disclosure'),
      )[0];
      expect(transport.style.display).not.toBe('none');
      expect(fixture.transport.props.compact).toBe(true);
      fixture.plan.state.plan.currentTrackId = null;
      fixture.session.state.error = '場間音樂媒體無法讀取';
      await nextTick();
      expect(fixture.source.props.compactEmpty).toBe(false);
      expect(transport.style.display).not.toBe('none');
      expect(fixture.transport.props.compact).toBe(false);
      expect(fixture.transport.props.standby).toBe(false);
      expect(disclosure.props['aria-expanded']).toBe(true);
      expect(disclosure.props['aria-disabled']).toBe(true);
      expect(textContent(dock.root)).toContain('場間音樂媒體無法讀取');
    } finally {
      dock.app.unmount();
    }
  });

  it('hides on the history tab and closes search while preserving audio ownership', async () => {
    const props = reactive({ variant: 'dock', active: true });
    const dock = mount(BgmPlayer, props);
    const transport = fixture.transport;
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
    expect(transport.props.standby).toBe(true);
    for (const key of ['initialize', 'dispose', 'playBgm', 'pauseBgm'])
      expect(fixture.session[key]).not.toHaveBeenCalled();
    dock.app.unmount();
  });
  it('keeps the empty Dock disclosure on the same transport without audio intents', async () => {
    fixture.session.currentTrack.value = null;
    fixture.plan.state.plan.currentTrackId = null;
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
    expect(fixture.source.props.playbackAction.label).toBe('播放場間音樂');
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
    fixture.session.state.error = '很長的場間音樂操作錯誤，請重試。'.repeat(10);
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
  it('reserves Dock hints for exceptional source and handoff states', async () => {
    const dock = mount(BgmPlayer, { variant: 'dock' });
    const { deckState, handoffState, isCurrentSourceLoaded, state } =
      fixture.session;
    const status = () =>
      findAll(dock.root, (node) =>
        String(node.props.class).includes('bgm-player__status'),
      )[0];
    try {
      for (const phase of ['idle', 'bgm-playing', 'manual-hold']) {
        handoffState.phase = phase;
        await nextTick();
        expect(status()).toBeUndefined();
      }
      deckState.guideVocalOn = true;
      await nextTick();
      expect(textContent(status())).toBe('含人聲');

      deckState.guideVocalOn = false;
      isCurrentSourceLoaded.value = false;
      deckState.usesSeparatedAudio = false;
      await nextTick();
      expect(status()).toBeUndefined();
      isCurrentSourceLoaded.value = true;
      await nextTick();
      expect(textContent(status())).toBe('使用原曲');

      deckState.usesSeparatedAudio = true;
      handoffState.phase = 'stopping-bgm';
      await nextTick();
      expect(status()).toBeUndefined();
      handoffState.restorePending = true;
      await nextTick();
      expect(textContent(status())).toBe('曲後恢復');

      handoffState.phase = 'track-active';
      handoffState.restorePending = true;
      await nextTick();
      expect(textContent(status())).toBe('曲後恢復');
      expect(status().props['aria-label']).toBe(
        '演唱曲目播放中，曲後恢復場間音樂',
      );

      state.error = '場間音樂媒體無法讀取';
      await nextTick();
      expect(textContent(status())).toBe('場間音樂媒體無法讀取');
    } finally {
      dock.app.unmount();
    }
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
  it.each([
    { expanded: false, stemsUrl: undefined, notice: '使用原曲' },
    {
      expanded: true,
      stemsUrl: 'utawakui-media://track/two/stems.wav',
      notice: '已更換場間音樂',
    },
  ])(
    'hands off the visible source and $notice notice after the drawer returns',
    async ({ expanded, stemsUrl, notice }) => {
      const dock = mount(BgmPlayer, { variant: 'dock' });
      const [arrow] = findAll(dock.root, (node) =>
        String(node.props.class).includes('bgm-player__disclosure'),
      );
      if (expanded) trigger(arrow, 'onClick');
      await nextTick();
      await togglePicker(dock.root);
      fixture.picker.emit('update:searchQuery', 'two');
      await nextTick();
      const [pickerRoot] = findAll(dock.root, (node) =>
        String(node.props.class).includes('picker-probe'),
      );
      const motion = Promise.withResolvers();
      pickerRoot.closest = () => ({
        getAnimations: () => [{ finished: motion.promise }],
      });
      fixture.plan.setTrack.mockImplementationOnce(async (id) => {
        fixture.plan.state.plan.currentTrackId = id;
        fixture.session.currentTrack.value = {
          id,
          title: 'Two',
          hasSeparation: true,
          stemsUrl,
        };
        fixture.session.deckState.duration = 240;
        return true;
      });

      fixture.picker.emit('select', 'two');
      await nextTick();
      await nextTick();
      expect(fixture.source.props.track.id).toBe('one');
      expect(fixture.transport.props.duration).toBe(120);
      expect(fixture.transport.props.seekDisabled).toBe(true);
      const [restingNotice] = findAll(dock.root, (node) =>
        String(node.props.class).includes('bgm-player__source-notice--resting'),
      );
      expect(textContent(restingNotice)).toBe('');
      expect(fixture.transport.props.folded).toBe(true);

      motion.resolve();
      await vi.waitFor(() => expect(fixture.source.props.track.id).toBe('two'));
      expect(fixture.transport.props.duration).toBe(240);
      expect(fixture.transport.props.seekDisabled).toBe(false);
      expect(fixture.transport.props.folded).toBe(true);
      expect(textContent(restingNotice)).toBe(notice);
      dock.app.unmount();
    },
  );
  it('keeps BGM tools independently foldable during playback and handoff', async () => {
    const dock = mount(BgmPlayer, { variant: 'dock' });
    const [arrow] = findAll(dock.root, (node) =>
      String(node.props.class).includes('bgm-player__disclosure'),
    );
    const handoff = fixture.session.handoffState;
    try {
      handoff.phase = 'bgm-playing';
      handoff.audibleLane = 'bgm';
      await nextTick();
      expect(arrow.props['aria-disabled']).not.toBe(true);
      expect(fixture.transport.props.folded).toBe(true);
      trigger(arrow, 'onClick');
      await nextTick();
      expect(fixture.transport.props.folded).toBe(false);
      trigger(arrow, 'onClick');
      await nextTick();
      expect(fixture.transport.props.folded).toBe(true);

      handoff.phase = 'stopping-bgm';
      await nextTick();
      expect(arrow.props['aria-disabled']).not.toBe(true);
      expect(fixture.transport.props.folded).toBe(true);

      handoff.phase = 'manual-hold';
      handoff.audibleLane = null;
      await nextTick();
      expect(arrow.props['aria-disabled']).not.toBe(true);
      expect(fixture.transport.props.folded).toBe(true);
      expect(fixture.transport.props.liftTools).toBe(true);
      expect(fixture.transport.props.animateFold).toBe(false);
      trigger(arrow, 'onClick');
      await nextTick();
      expect(fixture.transport.props.folded).toBe(false);

      handoff.phase = 'track-paused';
      handoff.restorePending = true;
      await nextTick();
      expect(arrow.props['aria-disabled']).not.toBe(true);
      expect(fixture.transport.props.folded).toBe(false);
      handoff.restorePending = false;
      handoff.audibleLane = 'preview';
      await nextTick();
      expect(arrow.props['aria-disabled']).not.toBe(true);
      expect(fixture.transport.props.folded).toBe(false);
    } finally {
      dock.app.unmount();
    }
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
