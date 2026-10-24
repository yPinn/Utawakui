import { computed, h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const deps = vi.hoisted(() => ({
  open: vi.fn(),
  play: vi.fn(),
  closePreview: vi.fn(),
  releaseCreate: vi.fn(),
  releaseOpen: vi.fn(),
  playlistMenu: vi.fn(),
  verification: null,
  retry: vi.fn(),
  jump: vi.fn(),
  verify: vi.fn(),
  setQueue: vi.fn(),
  playlistState: null,
  action: 'work-organization',
  admission: 0,
  startRevision: 0,
  tracks: [
    { id: 'a', title: 'RASEN', artist: '9Lana', sourceType: 'local-file' },
  ],
}));
vi.mock('../../composables/useSongEditor.js', () => ({
  useSongEditor: () => ({ open: deps.open }),
}));
vi.mock('../../composables/useReleaseOrganization.js', () => ({
  useReleaseOrganization: () => ({
    openCreate: deps.releaseCreate,
    open: deps.releaseOpen,
  }),
}));
vi.mock('../../composables/useAlbumNavigation.js', () => ({
  useAlbumNavigation: () => ({
    albumForTrack: () => null,
    canJumpToAlbum: () => false,
    jumpToPlaylist: deps.jump,
  }),
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({
    state: { tracks: deps.tracks, hasLoaded: true },
    tracksById: {
      value: new Map(deps.tracks.map((track) => [track.id, track])),
    },
    initialize: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({
    state: {},
    playTrack: deps.play,
    getPlaybackStartRequestRevision: () => deps.startRevision,
  }),
}));
vi.mock('../../composables/usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({
    state: { queuedTracks: [], tracks: [] },
    setQueue: deps.setQueue,
    currentTrack: { __v_isRef: true, value: deps.tracks[0] },
    queuedTracks: { __v_isRef: true, value: [] },
    sourceUpcomingTracks: { __v_isRef: true, value: [] },
  }),
}));
vi.mock('../../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({
    state: deps.playlistState,
    selectedPlaylist: computed(
      () =>
        deps.playlistState.playlists.find(
          (entry) => entry.id === deps.playlistState.selectedId,
        ) ?? null,
    ),
  }),
}));
vi.mock('../../composables/useTrackMetadataEditor.js', () => ({
  useTrackMetadataEditor: () => ({
    state: {},
    isOpen: { value: false },
    isDirty: { value: false },
    isArtworkDirty: { value: false },
  }),
}));
vi.mock('../../composables/usePerformanceQueueActions.js', () => ({
  usePerformanceQueueActions: () => ({ state: {} }),
}));
vi.mock('../../composables/useArtistIndex.js', () => ({
  useArtistIndex: () => ({ state: {}, ensureLoaded: vi.fn() }),
}));
vi.mock('../../composables/useArtistPhotoCandidates.js', () => ({
  useArtistPhotoCandidates: () => ({ state: { open: false }, close: vi.fn() }),
}));
vi.mock('../../composables/useBgmSession.js', () => ({
  useBgmSession: () => ({ handoffState: { sessionMode: 'inactive' } }),
}));
vi.mock('../../composables/useCollectionPlayback.js', () => ({
  useCollectionPlayback: () => ({
    isPlaying: () => false,
    isActiveSource: () => false,
  }),
  beginCollectionPlaybackRequest: () => ++deps.admission,
  isCurrentCollectionPlaybackRequest: (ticket) => ticket === deps.admission,
}));
vi.mock('../../composables/usePlaylistActions.js', () => ({
  usePlaylistActions: () => ({
    resolvePlaylistTracks: (playlist) =>
      (playlist?.trackIds ?? [])
        .map((id) => deps.tracks.find((track) => track.id === id))
        .filter(Boolean),
    resolvePlaylistTracksForAction: deps.verify,
    handlePlaylistMenuAction: deps.playlistMenu,
  }),
}));
vi.mock('../../composables/usePlaybackHistory.js', () => ({
  usePlaybackHistory: () => ({
    state: {},
    recentItems: { __v_isRef: true, value: [] },
    playCountOf: () => 0,
  }),
}));
vi.mock('../../composables/useRecentPlaybackActivation.js', () => ({
  useRecentPlaybackActivation: () => ({}),
}));
vi.mock('../../composables/useLibraryAlbumContext.js', () => ({
  useLibraryAlbumContext: () => ({
    albumEntries: { value: [] },
    albumSupportingContent: { __v_isRef: true, value: null },
    selectedReleaseVerification: computed(() => deps.verification),
    retrySelectedRelease: deps.retry,
  }),
}));
vi.mock('../../composables/useTrackPreview.js', () => ({
  useTrackPreview: () => ({ state: { tracks: [] }, close: deps.closePreview }),
}));
vi.mock('../../composables/useScrolledPast.js', () => ({
  useScrolledPast: () => ({ value: false }),
}));
vi.mock('../../composables/useAppRightDock.js', () => ({
  useAppRightDock: () => ({
    queueVariant: { value: 'queue' },
    arrangementTab: { value: 'pending' },
  }),
}));

// Feature shells stay small; the real consumer templates still own every event
// connection from their row/menu to the shared editor action.
vi.mock('../track/TrackActionMenu.vue', () => ({
  default: {
    props: ['open'],
    emits: ['select'],
    setup:
      (props, { emit }) =>
      () =>
        props.open
          ? h(
              'button',
              {
                onClick: () =>
                  emit('select', {
                    action: deps.action,
                    ...(deps.action === 'go-to-release'
                      ? { collectionId: 'release-target' }
                      : {}),
                  }),
              },
              '整理歌曲',
            )
          : null,
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    emits: ['click'],
    setup:
      (_, { emit }) =>
      () =>
        h(
          'button',
          {
            onClick: () =>
              emit('click', {
                type: 'click',
                preventDefault() {},
                stopPropagation() {},
              }),
          },
          '選項',
        ),
  },
}));
vi.mock('../track/TrackTable.vue', () => ({
  default: {
    props: ['loading', 'collectionKind', 'density'],
    emits: ['open-menu', 'activate-track'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'div',
          { 'data-kind': props.collectionKind },
          props.loading
            ? []
            : [
                h(
                  'button',
                  { onClick: () => emit('activate-track', deps.tracks[0]) },
                  '播放 A',
                ),
                h(
                  'button',
                  { onClick: () => emit('activate-track', deps.tracks[1]) },
                  '播放 B',
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      emit('open-menu', deps.tracks[0], {
                        type: 'click',
                        preventDefault() {},
                        stopPropagation() {},
                      }),
                  },
                  '曲目選項',
                ),
              ],
        ),
  },
}));
vi.mock('../queue/QueueSection.vue', () => ({
  default: {
    emits: ['open-track-menu'],
    setup:
      (_, { emit }) =>
      () =>
        h(
          'button',
          {
            onClick: () =>
              emit('open-track-menu', {
                track: deps.tracks[0],
                event: {
                  type: 'click',
                  preventDefault() {},
                  stopPropagation() {},
                },
              }),
          },
          '曲目選項',
        ),
  },
}));
vi.mock('../layout/AppRightDockPanel.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.default?.(), slots.identity?.(), slots.overlay?.()]),
  },
}));
vi.mock('../layout/AppFolderContentField.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}));
vi.mock('./LibraryCollectionHeader.vue', () => ({
  default: {
    props: ['fields'],
    emits: ['menuAction'],
    setup:
      (props, { emit }) =>
      () =>
        h('section', [
          h('span', props.fields.join(' / ')),
          h(
            'button',
            {
              onClick: () =>
                emit('menuAction', {
                  action: 'edit-release-info',
                  playlistId: 'single',
                }),
            },
            '發行資訊入口',
          ),
        ]),
  },
}));
vi.mock('../layout/AppFolderCompactBar.vue', () => ({
  default: { render: () => null },
}));

vi.mock('./LibraryArtistIdentityController.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../artists/ArtistPhotoCandidateModal.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../track/TrackPreviewOverlay.vue', () => ({
  default: {
    emits: ['menuSelect'],
    setup:
      (_, { emit }) =>
      () =>
        h(
          'button',
          {
            onClick: () =>
              emit(
                'menuSelect',
                { action: 'work-organization' },
                deps.tracks[0],
              ),
          },
          '試聽作品入口',
        ),
  },
}));
vi.mock('../bgm/BgmPlayer.vue', () => ({ default: { render: () => null } }));
vi.mock('../performance-session/PerformanceSessionDockContent.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../performance-session/PerformanceSessionSummary.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../queue/RecentPlaybackList.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../ui/UiTabs.vue', () => ({ default: { render: () => null } }));

import TrackContextActions from '../playback/context/TrackContextActions.vue';
import QueuePanel from '../queue/QueuePanel.vue';
import LibraryBrowseContent from './LibraryBrowseContent.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
for (const [component, path] of [
  [TrackContextActions, '../playback/context/TrackContextActions.vue'],
  [QueuePanel, '../queue/QueuePanel.vue'],
  [LibraryBrowseContent, './LibraryBrowseContent.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, path, import.meta.url);

let mounted;
beforeEach(() => {
  vi.clearAllMocks();
  deps.playlistState = reactive({
    playlists: [],
    libraryView: 'all',
    selectedId: null,
  });
  deps.tracks.splice(1);
  deps.action = 'work-organization';
  deps.startRevision = 0;
  deps.admission = 0;
  deps.verification = reactive({ state: 'ready' });
  deps.verify.mockResolvedValue(deps.tracks);
  vi.stubGlobal('window', {
    Utawakui: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  mounted?.app.unmount();
  vi.unstubAllGlobals();
});
function button(label) {
  return findAll(mounted.root, (node) => node.type === 'button').find((node) =>
    textContent(node).includes(label),
  );
}
async function settleEntries() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

describe('real feature entry event wiring', () => {
  it.each([true, false])(
    'guards inline menu navigation with modal close result %s',
    async (allowed) => {
      const beforeNavigate = vi.fn(async () => allowed);
      mounted = mount(TrackContextActions, {
        track: deps.tracks[0],
        trigger: 'inline',
        beforeNavigate,
      });
      deps.action = 'go-to-release';
      trigger(button('選項'), 'onClick');
      await settleEntries();
      trigger(button('整理歌曲'), 'onClick');
      await settleEntries();
      expect(beforeNavigate).toHaveBeenCalledOnce();
      if (allowed) {
        expect(deps.jump).toHaveBeenCalledWith('release-target');
        expect(beforeNavigate.mock.invocationCallOrder[0]).toBeLessThan(
          deps.jump.mock.invocationCallOrder[0],
        );
      } else expect(deps.jump).not.toHaveBeenCalled();
      expect(deps.play).not.toHaveBeenCalled();
    },
  );
  function selectSingle(ids = ['a'], totalTrackCount = 1) {
    deps.playlistState.playlists = [
      {
        id: 'single',
        kind: 'album',
        name: 'Release title',
        trackIds: ids,
        resolvedRelease: { type: 'single', totalTrackCount },
      },
    ];
    deps.playlistState.selectedId = 'single';
  }
  it('uses the same album table and fresh P3 admission for one-track Singles', async () => {
    selectSingle();
    mounted = mount(LibraryBrowseContent);
    expect(
      findAll(mounted.root, (node) => node.props['data-kind'] === 'album'),
    ).toHaveLength(1);
    trigger(button('播放 A'), 'onClick');
    await settleEntries();
    expect(deps.verify).toHaveBeenCalled();
    expect(deps.setQueue).toHaveBeenCalledWith(deps.tracks, 'a', {
      sourceId: 'single',
      sourceName: 'Release title',
    });
    expect(deps.play).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    );
    trigger(button('發行資訊入口'), 'onClick');
    await settleEntries();
    expect(deps.playlistMenu).toHaveBeenCalledWith({
      action: 'edit-release-info',
      playlistId: 'single',
    });
  });
  it('switches classification and official cardinality on the same collection UUID', async () => {
    selectSingle();
    mounted = mount(LibraryBrowseContent);
    const release = deps.playlistState.playlists[0];
    const table = findAll(
      mounted.root,
      (node) => node.props['data-kind'] === 'album',
    )[0];
    expect(button('播放 A')).toBeDefined();
    release.resolvedRelease.totalTrackCount = 3;
    await nextTick();
    expect(button('播放 A')).toBeDefined();
    release.resolvedRelease.type = 'ep';
    await nextTick();
    expect(button('播放 A')).toBeDefined();
    expect(
      findAll(mounted.root, (node) => node.props['data-kind'] === 'album')[0],
    ).toBe(table);
    release.resolvedRelease.type = 'single';
    release.resolvedRelease.totalTrackCount = 1;
    await nextTick();
    expect(button('播放 A')).toBeDefined();
    expect(button('發行資訊入口')).toBeDefined();
    expect(deps.play).not.toHaveBeenCalled();
  });
  it('keeps an official three-track Single in the table with only one admitted member', () => {
    selectSingle(['a'], 3);
    mounted = mount(LibraryBrowseContent);
    expect(button('播放 A')).toBeDefined();
    expect(textContent(mounted.root)).toContain('已收錄 1／3 首');
    expect(
      findAll(mounted.root, (node) => node.props['data-kind'] === 'album'),
    ).toHaveLength(1);
  });
  it('preserves admission guards across pending/error, supports retry and rejects stale table play', async () => {
    selectSingle();
    let finish;
    deps.verify.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mounted = mount(LibraryBrowseContent);
    trigger(button('播放 A'), 'onClick');
    await nextTick();
    deps.verification.state = 'pending';
    await nextTick();
    expect(button('播放 A')).toBeUndefined();
    deps.verification.state = 'error';
    await nextTick();
    trigger(button('重新確認'), 'onClick');
    expect(deps.retry).toHaveBeenCalledOnce();
    deps.playlistState.selectedId = null;
    await nextTick();
    finish(deps.tracks);
    await settleEntries();
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.setQueue).not.toHaveBeenCalled();
  });
  it.each([
    [TrackContextActions, { track: deps.tracks[0] }, '選項'],
    [QueuePanel, { active: true }, '曲目選項'],
    [LibraryBrowseContent, {}, '曲目選項'],
  ])(
    'creates local releases and navigates containing releases through a real consumer',
    async (component, props, triggerLabel) => {
      mounted = mount(component, props);
      deps.action = 'create-local-release';
      trigger(button(triggerLabel), 'onClick');
      await settleEntries();
      trigger(button('整理歌曲'), 'onClick');
      await settleEntries();
      expect(deps.releaseCreate).toHaveBeenCalledWith(deps.tracks[0]);
      deps.action = 'go-to-release';
      trigger(button(triggerLabel), 'onClick');
      await settleEntries();
      trigger(button('整理歌曲'), 'onClick');
      await settleEntries();
      expect(deps.jump).toHaveBeenCalledWith('release-target');
      expect(deps.play).not.toHaveBeenCalled();
    },
  );
  it.each(['navigate', 'newer-row', 'newer-start'])(
    'rejects an older asynchronous row admission after %s',
    async (kind) => {
      deps.tracks.push({
        id: 'b',
        title: 'Other',
        artist: '9Lana',
        sourceType: 'local-file',
      });
      deps.playlistState.playlists = [
        { id: 'r1', kind: 'album', name: 'First', trackIds: ['a', 'b'] },
        { id: 'r2', kind: 'album', name: 'Second', trackIds: ['b'] },
      ];
      deps.playlistState.selectedId = 'r1';
      let finish;
      deps.verify.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      mounted = mount(LibraryBrowseContent);
      trigger(button('播放 A'), 'onClick');
      await nextTick();
      if (kind === 'navigate') deps.playlistState.selectedId = 'r2';
      if (kind === 'newer-start') deps.startRevision += 1;
      if (kind === 'newer-row') {
        trigger(button('播放 B'), 'onClick');
        await Promise.resolve();
        await nextTick();
      }
      finish(deps.tracks);
      await Promise.resolve();
      await nextTick();
      if (kind === 'newer-row') {
        expect(deps.play.mock.calls.map(([track]) => track.id)).toEqual(['b']);
        expect(deps.setQueue.mock.calls[0][2]).toEqual({
          sourceId: 'r1',
          sourceName: 'First',
        });
      } else {
        expect(deps.play).not.toHaveBeenCalled();
        expect(deps.setQueue).not.toHaveBeenCalled();
      }
    },
  );
  it('closes preview before opening the same work editor', async () => {
    mounted = mount(LibraryBrowseContent);
    trigger(button('試聽作品入口'), 'onClick');
    await nextTick();
    expect(deps.closePreview).toHaveBeenCalledOnce();
    expect(deps.open).toHaveBeenCalledWith(deps.tracks[0]);
    expect(deps.closePreview.mock.invocationCallOrder[0]).toBeLessThan(
      deps.open.mock.invocationCallOrder[0],
    );
    expect(deps.play).not.toHaveBeenCalled();
  });
  it.each([
    [TrackContextActions, { track: deps.tracks[0] }, '選項'],
    [QueuePanel, { active: true }, '曲目選項'],
    [LibraryBrowseContent, {}, '曲目選項'],
  ])(
    'opens the shared editor from a mounted consumer',
    async (component, props, triggerLabel) => {
      mounted = mount(component, props);
      expect(deps.open).not.toHaveBeenCalled();
      trigger(button(triggerLabel), 'onClick');
      await nextTick();
      trigger(button('整理歌曲'), 'onClick');
      await nextTick();
      expect(deps.open).toHaveBeenCalledWith(deps.tracks[0]);
      expect(deps.play).not.toHaveBeenCalled();
    },
  );
});
