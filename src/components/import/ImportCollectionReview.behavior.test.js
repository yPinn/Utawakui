import { h, nextTick, reactive, computed } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import { getPlaylistImportStats } from '../../utils/importPlaylist.js';
import UiHint from '../ui/UiHint.vue';
import PreparationReviewLayout from '../preparation/PreparationReviewLayout.vue';

const fixture = vi.hoisted(() => ({}));
vi.mock('../../composables/useImportSession.js', () => ({
  useImportSession: () => fixture.session,
}));
vi.mock('../ui/UiScrollLayout.vue', () => ({
  default: {
    setup: (_, { slots, expose }) => {
      expose({ scrollTo: (...args) => fixture.scrollTo(...args) });
      return () => h('div', { 'data-scroll': true }, slots.default?.());
    },
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'disabled'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', {
          'aria-label': props.label,
          disabled: props.disabled,
          onClick: () => emit('click'),
        }),
  },
}));
vi.mock('./ImportCollectionSelectionList.vue', () => ({
  default: {
    props: ['tracks'],
    setup: (props) => () =>
      h('div', { id: 'selection' }, props.tracks.map((t) => t.title).join('|')),
  },
}));
vi.mock('./ImportCollectionExecutionList.vue', () => ({
  default: { setup: () => () => h('div', { id: 'execution' }, '執行佇列') },
}));
import Review from './ImportCollectionReview.vue';
attachClientRender(Review, './ImportCollectionReview.vue', import.meta.url);
attachClientRender(UiHint, '../ui/UiHint.vue', import.meta.url);
attachClientRender(
  PreparationReviewLayout,
  '../preparation/PreparationReviewLayout.vue',
  import.meta.url,
);
const action = (root, label) =>
  findAll(root, (node) => node.props['aria-label'] === label)[0];
const has = (root, id) =>
  findAll(root, (node) => node.props.id === id).length > 0;

beforeEach(() => {
  fixture.scrollTo = vi.fn();
  const state = reactive({
    collectionKind: 'album',
    playlistTitle: '測試專輯',
    isImporting: false,
    playlistTracks: [
      { id: 'one', title: '第一首', status: 'pending', selected: true },
      { id: 'two', title: '尚未選取', status: 'pending', selected: false },
      {
        id: 'local',
        title: '原有曲目',
        status: 'pending',
        alreadyDownloaded: true,
        selected: true,
      },
    ],
  });
  fixture.session = {
    state,
    playlistStats: computed(() => getPlaylistImportStats(state.playlistTracks)),
    dominantFailureCode: computed(() => null),
    allSelected: computed(() => false),
    setTrackSelected: vi.fn(),
    toggleSelectAll: vi.fn(),
    cancelTrackDownload: vi.fn(),
    canRetryFailed: computed(() => true),
    retryFailedTracks: vi.fn(),
  };
});

describe('Import collection review lifecycle', () => {
  it('keeps only source and total above the list, leaving selection counts to the footer', () => {
    const mounted = mount(Review);
    expect(textContent(mounted.root)).toContain('測試專輯');
    expect(textContent(mounted.root)).toContain('測試專輯 · 3 首');
    expect(textContent(mounted.root)).not.toContain('專輯 · 3 首已選取');
    expect(textContent(mounted.root)).not.toContain('已選取');
    expect(has(mounted.root, 'selection')).toBe(true);
    mounted.app.unmount();
  });

  it('can return to selection after execution without changing unselected songs', async () => {
    const mounted = mount(Review);
    const state = fixture.session.state;
    state.isImporting = true;
    state.playlistTracks[0].status = 'downloading';
    await nextTick();
    expect(has(mounted.root, 'execution')).toBe(true);
    expect(action(mounted.root, '返回選取曲目')).toBeUndefined();
    state.playlistTracks[0].status = 'done';
    state.isImporting = false;
    await nextTick();
    trigger(action(mounted.root, '返回選取曲目'), 'onClick');
    await nextTick();
    expect(has(mounted.root, 'selection')).toBe(true);
    expect(textContent(mounted.root)).toContain('尚未選取');
    expect(fixture.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    expect(state.playlistTracks[1].selected).toBe(false);
    trigger(action(mounted.root, '檢視下載進度'), 'onClick');
    await nextTick();
    expect(has(mounted.root, 'execution')).toBe(true);
    mounted.app.unmount();
  });

  it('forces execution for a new batch and resets the view when the source changes', async () => {
    const state = fixture.session.state;
    state.playlistTracks[0].status = 'error';
    const mounted = mount(Review);
    trigger(action(mounted.root, '返回選取曲目'), 'onClick');
    await nextTick();
    state.isImporting = true;
    await nextTick();
    expect(has(mounted.root, 'execution')).toBe(true);
    state.isImporting = false;
    state.playlistTracks = [
      { id: 'new', title: '新來源', selected: true, status: 'pending' },
    ];
    await nextTick();
    expect(has(mounted.root, 'selection')).toBe(true);
    expect(action(mounted.root, '檢視下載進度')).toBeUndefined();
    mounted.app.unmount();
  });
});
