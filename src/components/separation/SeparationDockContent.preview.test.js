import { h, nextTick, shallowReactive, shallowRef } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const fixture = vi.hoisted(() => ({}));
vi.mock('../../composables/useSeparationPreparation.js', () => ({
  useSeparationPreparation: () => fixture.preparation,
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({ tracksById: shallowRef(new Map()) }),
}));
vi.mock('../../composables/useArtistIndex.js', () => ({
  useArtistIndex: () => ({ ensureLoaded: vi.fn() }),
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => ({ openSettings: vi.fn() }),
}));
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    props: ['open', 'size', 'maxBlockSize', 'bodyMode', 'selectable'],
    setup:
      (props, { slots, emit }) =>
      () =>
        props.open
          ? h(
              'dialog',
              {
                'data-size': props.size,
                'data-cap': props.maxBlockSize,
                'data-body': props.bodyMode,
                'data-selectable': props.selectable,
              },
              [
                h('button', {
                  id: 'close-preview',
                  onClick: () => emit('close'),
                }),
                slots.default?.(),
              ],
            )
          : null,
  },
}));
vi.mock('../ui/UiScrollLayout.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', {
          'aria-label': props.label,
          onClick: () => emit('click'),
        }),
  },
}));
vi.mock('../ui/UiCombobox.vue', () => ({
  default: { setup: () => () => h('select') },
}));
vi.mock('../ui/UiSelect.vue', () => ({
  default: { setup: () => () => h('select') },
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('p', slots.default?.()),
  },
}));
vi.mock('./SeparationToolbarList.vue', () => ({
  default: { setup: () => () => h('section', { id: 'queue' }) },
}));
vi.mock('./SeparationPreparationList.vue', () => ({
  default: {
    props: ['unpreparedTracks', 'preparedTracks'],
    setup:
      (props, { emit }) =>
      () =>
        h('section', { id: 'preview-list' }, [
          ...props.unpreparedTracks.map((track) => h('span', track.title)),
          ...props.preparedTracks.map((track) => h('span', track.title)),
          h('button', {
            id: 'start-one',
            onClick: () => emit('startTrack', props.unpreparedTracks[0].id),
          }),
          h('button', {
            id: 'restart',
            onClick: () => emit('restartPrepared'),
          }),
          h('button', {
            id: 'navigate',
            onClick: () => emit('navigate', { kind: 'artist', id: 'artist' }),
          }),
        ]),
  },
}));
import SeparationDockContent from './SeparationDockContent.vue';
import PreparationReviewLayout from '../preparation/PreparationReviewLayout.vue';
import LibraryEntityDossier from '../library/LibraryEntityDossier.vue';
import AppFolderDossier from '../layout/AppFolderDossier.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
for (const [component, file] of [
  [LibraryEntityDossier, '../library/LibraryEntityDossier.vue'],
  [AppFolderDossier, '../layout/AppFolderDossier.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
])
  attachClientRender(component, file, import.meta.url);
attachClientRender(
  PreparationReviewLayout,
  '../preparation/PreparationReviewLayout.vue',
  import.meta.url,
);
attachClientRender(
  SeparationDockContent,
  './SeparationDockContent.vue',
  import.meta.url,
);
const node = (root, id) => findAll(root, (n) => n.props.id === id)[0];
const dialogs = (root) => findAll(root, (n) => n.type === 'dialog');
function open(root) {
  trigger(
    findAll(root, (n) => n.props['aria-label'] === '預覽處理曲目')[0],
    'onClick',
  );
}

beforeEach(() => {
  const tracks = Array.from({ length: 20 }, (_, id) => ({
    id: String(id),
    title: `Song ${id}`,
  }));
  fixture.preparation = {
    selectedMode: shallowRef('general'),
    modeOptions: shallowRef([]),
    selectedSourceId: shallowRef('source'),
    selectedCollection: shallowRef(null),
    sourceOptions: shallowRef([
      { label: '歌單', options: [{ value: 'source', label: '我的歌單' }] },
    ]),
    sourceTracks: shallowRef(tracks),
    unpreparedTracks: shallowRef(tracks.slice(0, 15)),
    preparedTracks: shallowRef(tracks.slice(15)),
    planHint: shallowRef('15 首'),
    isBusy: shallowRef(false),
    isStarting: shallowRef(false),
    startUnpreparedTracks: vi.fn(),
    startUnpreparedTrack: vi.fn(),
    restartPreparedTracks: vi.fn(),
  };
});
function setup(onNavigate = vi.fn()) {
  const props = shallowReactive({
    active: true,
    separationController: {
      queue: shallowRef({ items: [{ status: 'pending', trackId: 'queued' }] }),
    },
    onNavigate,
  });
  return { ...mount(SeparationDockContent, props), props };
}
describe('accompaniment source preview', () => {
  it('uses the shared bounded workspace and keeps only source, total, and a complete storage estimate', async () => {
    fixture.preparation.unpreparedTracks.value = [
      { id: 'one', title: 'One', duration: 180 },
    ];
    const { root, app } = setup();
    open(root);
    await nextTick();
    const dialog = dialogs(root)[0];
    expect(dialog.props['data-size']).toBe('wide');
    expect(dialog.props['data-cap']).toBe('medium');
    expect(dialog.props['data-body']).toBe('workspace');
    expect(dialog.props['data-selectable']).toBe(false);
    expect(textContent(dialog)).toContain('我的歌單');
    expect(textContent(dialog)).toContain('20 首曲目');
    expect(textContent(dialog)).toContain('最多新增約 61 MB');
    expect(textContent(dialog)).not.toContain('1 首 · 最多新增');
    fixture.preparation.unpreparedTracks.value = [
      { id: 'one', duration: 180 },
      { id: 'unknown' },
    ];
    await nextTick();
    expect(textContent(dialogs(root)[0])).not.toContain('最多新增');
    app.unmount();
  });
  it('uses the canonical album identity instead of the combined selector label', async () => {
    fixture.preparation.selectedCollection.value = {
      id: 'album',
      kind: 'album',
      name: '海螺記',
      coverUrl: 'utawakui-media://covers/album',
      description: '專輯簡介',
      resolvedRelease: {
        type: 'album',
        date: { value: '2024', precision: 'year' },
      },
    };
    fixture.preparation.sourceOptions.value = [
      { value: 'source', label: '海螺記 · 163braces' },
    ];
    fixture.preparation.sourceTracks.value = [
      { id: 'song', title: '歌', artist: '163braces', duration: 180 },
    ];
    const { root, app } = setup();
    open(root);
    await nextTick();
    const dialog = dialogs(root)[0];
    expect(textContent(dialog)).toContain('海螺記');
    expect(textContent(dialog)).toContain('163braces');
    expect(textContent(dialog)).not.toContain('海螺記 · 163braces');
    expect(textContent(dialog)).toContain('2024');
    expect(textContent(dialog)).toContain('1 首曲目，3 分');
    expect(textContent(dialog)).toContain('專輯簡介');
    expect(
      findAll(
        dialog,
        (node) => node.props.src === 'utawakui-media://covers/album',
      ),
    ).toHaveLength(1);
    fixture.preparation.selectedSourceId.value = 'playback-order';
    fixture.preparation.selectedCollection.value = null;
    fixture.preparation.sourceOptions.value = [
      { value: 'playback-order', label: '目前播放順序' },
    ];
    await nextTick();
    expect(dialogs(root)).toHaveLength(0);
    open(root);
    await nextTick();
    expect(textContent(dialogs(root)[0])).toContain('目前播放順序');
    expect(textContent(dialogs(root)[0])).not.toContain('專輯簡介');
    expect(textContent(dialogs(root)[0])).not.toContain('163braces');
    app.unmount();
  });
  it('adds the requested preview track without closing the modal or invoking batch start', async () => {
    const { root, app } = setup();
    open(root);
    await nextTick();
    trigger(node(root, 'start-one'), 'onClick');
    expect(
      fixture.preparation.startUnpreparedTrack,
    ).toHaveBeenCalledExactlyOnceWith('0');
    expect(fixture.preparation.startUnpreparedTracks).not.toHaveBeenCalled();
    expect(dialogs(root)).toHaveLength(1);
    app.unmount();
  });
  it('updates concise source status as work completes, without repeating the active progress', async () => {
    const { root, app, props } = setup();
    fixture.preparation.sourceTracks.value = [{ id: 'new' }, { id: 'work' }];
    props.separationController.queue.value = {
      items: [{ trackId: 'work', recipeId: 'general', status: 'running' }],
    };
    await nextTick();
    const summary = () =>
      findAll(root, (n) => n.props['aria-label'] === '目前來源處理狀態')[0];
    expect(textContent(summary())).toBe('待處理 1');
    props.separationController.queue.value = {
      items: [{ trackId: 'work', recipeId: 'general', status: 'completed' }],
    };
    await nextTick();
    expect(textContent(summary())).toBe('待處理 1已完成 1');
    fixture.preparation.sourceTracks.value = [{ id: 'other' }];
    await nextTick();
    expect(textContent(summary())).toBe('待處理 1');
    app.unmount();
  });
  it('keeps the queue visible and renders all source preview rows only inside the modal', async () => {
    const { root, app } = setup();
    expect(node(root, 'queue')).toBeTruthy();
    expect(node(root, 'preview-list')).toBeUndefined();
    open(root);
    await nextTick();
    expect(dialogs(root)).toHaveLength(1);
    expect(
      findAll(node(root, 'preview-list'), (n) => n.type === 'span'),
    ).toHaveLength(20);
    trigger(node(root, 'close-preview'), 'onClick');
    await nextTick();
    expect(dialogs(root)).toHaveLength(0);
    trigger(
      findAll(root, (n) => n.props['aria-label'] === '加入處理佇列')[0],
      'onClick',
    );
    expect(fixture.preparation.startUnpreparedTracks).toHaveBeenCalledOnce();
    app.unmount();
  });
  it('forwards restart and closes before forwarding navigation', async () => {
    const navigate = vi.fn();
    const { root, app } = setup(navigate);
    open(root);
    await nextTick();
    trigger(node(root, 'restart'), 'onClick');
    expect(fixture.preparation.restartPreparedTracks).toHaveBeenCalledOnce();
    trigger(node(root, 'navigate'), 'onClick');
    await nextTick();
    expect(navigate).toHaveBeenCalledWith({ kind: 'artist', id: 'artist' });
    expect(dialogs(root)).toHaveLength(0);
    app.unmount();
  });
  it('closes when leaving the tab or changing the selected source', async () => {
    const { root, app, props } = setup();
    open(root);
    await nextTick();
    props.active = false;
    await nextTick();
    expect(dialogs(root)).toHaveLength(0);
    props.active = true;
    await nextTick();
    open(root);
    await nextTick();
    fixture.preparation.selectedSourceId.value = 'other';
    await nextTick();
    expect(dialogs(root)).toHaveLength(0);
    app.unmount();
  });
});
