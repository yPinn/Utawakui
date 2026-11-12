import { h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Tools from './PerformanceSessionHistoryTools.vue';
import ArchiveList from './PerformanceSessionArchiveList.vue';
import ArchiveCalendar from './PerformanceSessionArchiveCalendar.vue';
import ArchiveCollage from './PerformanceSessionArchiveCollage.vue';
import ArchiveGroups from './PerformanceSessionArchiveGroups.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import AppFolderDossier from '../layout/AppFolderDossier.vue';
import CollectionActionRail from '../library/CollectionActionRail.vue';
import LibraryEntityDossier from '../library/LibraryEntityDossier.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import { useAppNotifications } from '../../composables/useAppNotifications.js';
import { usePerformanceStreamEndReminder } from '../../composables/usePerformanceStreamEndReminder.js';
const notifications = useAppNotifications();
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
const fixture = vi.hoisted(() => ({
  plan: null,
  playback: null,
  timeline: { open: vi.fn(), openForArrangement: vi.fn() },
  playlist: null,
  openArchive: vi.fn(),
  openLibrary: vi.fn(),
  openPreparation: vi.fn(),
  selectPlaylist: vi.fn(),
  initializePlaylists: vi.fn(),
  createPlaylist: vi.fn(),
  playlists: null,
  selectTab: vi.fn(),
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => ({
    activeView: { value: 'performance' },
    performanceArchiveId: { value: 'old' },
    openPerformanceArchive: fixture.openArchive,
    openLibraryContent: fixture.openLibrary,
    openPerformancePreparation: fixture.openPreparation,
    selectPerformanceSessionTab: fixture.selectTab,
  }),
}));
vi.mock('../../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({
    state: fixture.playlists,
    initialize: fixture.initializePlaylists,
    select: fixture.selectPlaylist,
    createFromPerformanceArchive: fixture.createPlaylist,
  }),
}));
vi.mock('../playlists/PlaylistSidebarRow.vue', () => ({
  default: {
    props: ['playlist', 'subtitle', 'coverTracks', 'active', 'playbackEnabled'],
    emits: ['select', 'contextmenu'],
    setup(props, { emit, slots }) {
      return () =>
        h('div', { 'data-playback-enabled': props.playbackEnabled }, [
          h(
            'button',
            { onClick: () => emit('select') },
            `選取 ${props.playlist.name}`,
          ),
          h('span', props.subtitle),
          slots.trailing?.(),
        ]);
    },
  },
}));
vi.mock('../../composables/usePerformanceSessionPlan.js', () => ({
  usePerformanceSessionPlan: () => fixture.plan,
}));
vi.mock('../../composables/usePerformanceSessionPlayback.js', () => ({
  usePerformanceSessionPlayback: () => fixture.playback,
}));
vi.mock('../../composables/useObsSessionExport.js', () => ({
  useObsSessionExport: () => fixture.timeline,
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({ state: { tracks: [] } }),
}));
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    props: ['open', 'title', 'closeDisabled'],
    emits: ['close'],
    setup(props, { emit, slots }) {
      return () =>
        props.open
          ? h(
              'section',
              { 'aria-label': props.title, 'data-locked': props.closeDisabled },
              [
                slots.default?.(),
                slots.footer?.(),
                h('button', { onClick: () => emit('close') }, 'Close modal'),
              ],
            )
          : null;
    },
  },
}));
vi.mock('../ui/UiTabs.vue', () => ({
  default: {
    props: ['items', 'activeId'],
    emits: ['update:activeId'],
    setup(props, { emit }) {
      return () =>
        h(
          'div',
          props.items.map(({ id, label }) =>
            h(
              'button',
              {
                onClick: () => emit('update:activeId', id),
              },
              label,
            ),
          ),
        );
    },
  },
}));
vi.mock('./PerformanceSessionArchive.vue', () => ({
  default: {
    props: { sessionId: String, embedded: Boolean, allowSavePlaylist: Boolean },
    setup(props) {
      return () =>
        h('article', {
          'data-session-id': props.sessionId,
          'data-allow-save': props.allowSavePlaylist,
        });
    },
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['icon', 'label'],
    setup(props, { attrs }) {
      return () =>
        h('button', { 'aria-label': props.label, ...attrs }, props.label);
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
vi.mock('../ui/UiTextButton.vue', () => ({
  default: {
    props: ['text', 'ariaLabel'],
    setup(props, { attrs }) {
      return () =>
        h('button', { 'aria-label': props.ariaLabel, ...attrs }, props.text);
    },
  },
}));
vi.mock('../ui/UiTextField.vue', () => ({
  default: {
    props: ['id', 'modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          id: props.id,
          value: props.modelValue,
          onInput: (event) => emit('update:modelValue', event.target.value),
        });
    },
  },
}));
vi.mock('../ui/UiTrackRow.vue', () => ({
  default: {
    props: ['title'],
    setup(props) {
      return () => h('li', props.title);
    },
  },
}));
vi.mock('../ui/UiActionMenu.vue', () => ({
  default: {
    props: ['open', 'content'],
    setup(props, { emit }) {
      return () =>
        props.open
          ? h(
              'menu',
              props.content.groups
                .flatMap((g) => g.items)
                .map((item) =>
                  h(
                    'button',
                    {
                      disabled: item.disabled,
                      onClick: () => emit('select', item.value),
                    },
                    item.label,
                  ),
                ),
            )
          : null;
    },
  },
}));
vi.mock('./PerformanceSessionPlaylistExportModal.vue', () => ({
  default: {
    props: ['open', 'sessionId', 'suggestedName'],
    setup(props) {
      fixture.playlist = props;
      return () => null;
    },
  },
}));
for (const [component, file] of [
  [Tools, './PerformanceSessionHistoryTools.vue'],
  [ArchiveList, './PerformanceSessionArchiveList.vue'],
  [ArchiveCalendar, './PerformanceSessionArchiveCalendar.vue'],
  [ArchiveCollage, './PerformanceSessionArchiveCollage.vue'],
  [ArchiveGroups, './PerformanceSessionArchiveGroups.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiSkeleton, '../ui/UiSkeleton.vue'],
  [AppRightDockSection, '../layout/AppRightDockSection.vue'],
  [AppFolderDossier, '../layout/AppFolderDossier.vue'],
  [CollectionActionRail, '../library/CollectionActionRail.vue'],
  [LibraryEntityDossier, '../library/LibraryEntityDossier.vue'],
  [UiPopover, '../ui/UiPopover.vue'],
  [UiPageHeader, '../ui/UiPageHeader.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiSearchBox, '../ui/UiSearchBox.vue'],
  [UiTooltip, '../ui/UiTooltip.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, file, import.meta.url);
const settle = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
const button = (root, text) =>
  findAll(root, (n) => n.type === 'button' && textContent(n) === text)[0];
async function click(root, text) {
  trigger(button(root, text), 'onClick', { currentTarget: {} });
  await settle();
}
beforeEach(() => {
  fixture.playlists = reactive({
    playlists: [
      { id: 'created', name: 'Saved playlist', performanceSessionId: 'linked' },
    ],
  });
  fixture.createPlaylist.mockResolvedValue({ playlistId: 'created' });
  fixture.plan = {
    state: reactive({
      plan: {
        sessionId: 'current',
        canArchive: true,
        sessionStartedAt: new Date(2026, 10, 6, 23, 30).toISOString(),
        items: [],
        archives: [
          {
            id: 'old',
            name: 'Older show',
            endedAt: '2026-10-20T12:00:00Z',
            completedCount: 2,
            itemCount: 3,
          },
        ],
      },
      isSaving: false,
      isInitialized: true,
    }),
    archiveSession: vi.fn(async () => true),
    initialize: vi.fn(),
    refresh: vi.fn(async () => false),
  };
  fixture.playback = {
    state: reactive({ busy: false }),
    stop: vi.fn(async () => true),
    currentItem: reactive({ value: null }),
  };
  vi.stubGlobal('window', {
    getComputedStyle: () => ({ direction: 'ltr', getPropertyValue: () => '' }),
    Utawakui: {
      getPerformanceSession: vi.fn(async (id) => ({
        ok: true,
        plan: {
          id,
          name: 'Older show',
          endedAt: '2026-10-20T12:00:00Z',
          items: [
            {
              itemId: 'one',
              displayTitle: 'Repeat 1',
              displayArtist: '',
              progress: 'completed',
            },
            {
              itemId: 'two',
              displayTitle: 'Repeat 2',
              displayArtist: '',
              progress: 'completed',
            },
          ],
        },
      })),
    },
  });
});
afterEach(() => {
  for (const item of notifications.items.value) notifications.clear(item.key);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe('performance history and archive entry points', () => {
  it('opens the linked playlist and falls back to the shared record if the playlist is removed', async () => {
    const view = mount(Tools);
    expect(textContent(view.root)).not.toContain('Older show');
    view.app.unmount();

    fixture.plan.state.plan.archives.push({
      id: 'recent',
      name: 'Recent show',
      endedAt: '2026-10-22T12:00:00Z',
    });
    fixture.plan.state.plan.archives.push({
      id: 'linked',
      name: 'Linked record',
      endedAt: '2026-10-23T12:00:00Z',
    });
    const index = mount(ArchiveList);
    const headings = findAll(index.root, (node) => node.type === 'h1');
    expect(headings.map(textContent)).toEqual(['場次紀錄']);
    expect(button(index.root, '選取 Linked record')).toBeDefined();
    await click(index.root, '清單');
    const list = findAll(
      index.root,
      (node) => node.props.id === 'performance-archive-list-panel',
    )[0];
    const labels = findAll(
      list,
      (node) => node.type === 'button' && textContent(node).startsWith('選取 '),
    ).map(textContent);
    expect(labels).toEqual([
      '選取 Linked record',
      '選取 Recent show',
      '選取 Older show',
    ]);
    expect(textContent(list)).toContain('儲存於');
    await click(index.root, '最近 OBS 紀錄');
    expect(fixture.timeline.open).toHaveBeenCalledWith();
    expect(fixture.timeline.openForArrangement).not.toHaveBeenCalled();
    await click(list, '選取 Linked record');
    expect(fixture.selectPlaylist).toHaveBeenCalledExactlyOnceWith('created');
    expect(fixture.openLibrary).toHaveBeenCalledTimes(1);
    expect(textContent(index.root)).not.toContain('Close modal');

    fixture.playlists.playlists = [];
    await click(list, '選取 Linked record');
    await vi.dynamicImportSettled();
    await settle();
    expect(
      findAll(index.root, (node) => node.props['data-session-id'] === 'linked'),
    ).toHaveLength(1);
    await click(index.root, 'Close modal');

    await click(list, '選取 Older show');
    await vi.dynamicImportSettled();
    await settle();
    const detail = findAll(
      index.root,
      (node) => node.props['data-session-id'] === 'old',
    )[0];
    expect(detail?.props['data-allow-save']).toBe(true);
    expect(fixture.plan.archiveSession).not.toHaveBeenCalled();
    index.app.unmount();
  });

  it('searches older months by name and restores the calendar after clearing', async () => {
    fixture.plan.state.plan.archives.push({
      id: 'recent',
      name: 'Recent show',
      endedAt: '2026-11-22T12:00:00Z',
    });
    const index = mount(ArchiveList);
    const input = () => findAll(index.root, (node) => node.type === 'input')[0];
    const results = () =>
      findAll(index.root, (node) => node.props['aria-live'] === 'polite')[0];

    trigger(input(), 'onInput', { target: { value: '  OLDER ' } });
    await settle();
    expect(button(results(), '選取 Older show')).toBeDefined();
    expect(button(results(), '選取 Recent show')).toBeUndefined();

    trigger(input(), 'onInput', { target: { value: 'nothing' } });
    await settle();
    expect(textContent(index.root)).toContain('沒有符合搜尋條件的場次紀錄。');

    trigger(input(), 'onInput', { target: { value: '' } });
    await settle();
    expect(button(index.root, '選取 Recent show')).toBeDefined();
    expect(button(index.root, '選取 Older show')).toBeUndefined();
    index.app.unmount();
  });

  it('waits for the initial playlist read before choosing a destination', async () => {
    let finishRead;
    fixture.initializePlaylists.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    fixture.playlists.playlists = [];
    fixture.playlists.isLoading = true;
    const index = mount(ArchiveList);
    await click(index.root, '選取 Older show');
    expect(fixture.selectPlaylist).not.toHaveBeenCalled();
    expect(textContent(index.root)).not.toContain('Close modal');

    fixture.playlists.playlists = [
      { id: 'found', performanceSessionId: 'old' },
    ];
    fixture.playlists.isLoading = false;
    finishRead();
    await settle();
    expect(fixture.selectPlaylist).toHaveBeenCalledExactlyOnceWith('found');
    expect(fixture.openLibrary).toHaveBeenCalledTimes(1);
    index.app.unmount();
  });

  it('offers later or the existing confirmation after a stream ends without archiving', async () => {
    let streamEnded;
    const unsubscribe = vi.fn();
    window.Utawakui.onObsStreamEnded = (callback) => {
      streamEnded = callback;
      return unsubscribe;
    };
    const view = mount({
      setup() {
        usePerformanceStreamEndReminder();
        return () => h(Tools);
      },
    });
    await streamEnded('obsolete');
    expect(notifications.items.value).toEqual([]);

    await streamEnded('current');
    const [reminder] = notifications.items.value;
    expect(reminder).toMatchObject({
      title: '直播已結束',
      actionLabel: '結束場次',
      actionVariant: 'accent',
      dismissLabel: '稍後',
    });
    notifications.dismiss(reminder.id);
    await settle();
    expect(fixture.openPreparation).not.toHaveBeenCalled();
    expect(button(view.root, '儲存')).toBeUndefined();

    await streamEnded('current');
    const [nextReminder] = notifications.items.value;
    fixture.playback.state.busy = true;
    await notifications.runAction(nextReminder.id);
    await settle();
    expect(fixture.openPreparation).toHaveBeenCalledExactlyOnceWith('history');
    expect(button(view.root, '儲存')).toBeUndefined();
    fixture.playback.state.busy = false;
    await settle();
    expect(button(view.root, '儲存')).toBeDefined();
    expect(fixture.playback.stop).not.toHaveBeenCalled();
    expect(fixture.plan.archiveSession).not.toHaveBeenCalled();

    await streamEnded('current');
    fixture.plan.state.plan.sessionId = 'new-session';
    await settle();
    expect(notifications.items.value).toEqual([]);
    view.app.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('only stops playback after confirming an explicit archive action', async () => {
    fixture.playback.currentItem.value = { itemId: 'one' };
    const view = mount(
      Tools,
      {},
      { default: () => h('p', 'Ongoing occurrence') },
    );
    expect(textContent(view.root)).toContain('Ongoing occurrence');
    await click(view.root, '結束場次');
    expect(fixture.playback.stop).not.toHaveBeenCalled();
    expect(textContent(view.root)).toContain('目前項目會停止，並記為中止');
    expect(button(view.root, '儲存').props.variant).toBe('accent');
    await click(view.root, '取消');
    expect(button(view.root, '儲存')).toBeUndefined();
    expect(fixture.playback.stop).not.toHaveBeenCalled();
    expect(fixture.plan.archiveSession).not.toHaveBeenCalled();
    await click(view.root, '結束場次');
    await click(view.root, '儲存');
    expect(fixture.playback.stop).toHaveBeenCalledOnce();
    expect(fixture.plan.archiveSession).toHaveBeenCalledWith(
      '261106 - 演出歌單',
      'current',
    );
    expect(fixture.selectTab).toHaveBeenCalledWith('pending');
    expect(fixture.createPlaylist).toHaveBeenCalledExactlyOnceWith('current');
    expect(notifications.items.value[0]).toMatchObject({
      title: '歌單已儲存',
      actionLabel: '查看歌單',
      lifecycle: 'transient',
    });
    view.app.unmount();
  });

  it('disables archive when there are no items or markers', async () => {
    fixture.plan.state.plan.canArchive = false;
    const view = mount(Tools);
    expect(button(view.root, '結束場次').props.disabled).toBe(true);
    await click(view.root, '結束場次');
    expect(button(view.root, '儲存')).toBeUndefined();
    expect(fixture.playback.stop).not.toHaveBeenCalled();
    view.app.unmount();
  });

  it('retains the dialog and selected session after stop or write failure', async () => {
    fixture.playback.stop.mockResolvedValueOnce(false);
    fixture.plan.archiveSession
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const view = mount(Tools);
    await click(view.root, '結束場次');
    await click(view.root, '儲存');
    expect(fixture.plan.archiveSession).not.toHaveBeenCalled();
    expect(textContent(view.root)).toContain('尚未停止');
    await click(view.root, '儲存');
    expect(textContent(view.root)).toContain('原安排仍保留');
    await click(view.root, '儲存');
    expect(fixture.plan.archiveSession.mock.calls).toEqual([
      ['261106 - 演出歌單', 'current'],
      ['261106 - 演出歌單', 'current'],
    ]);
    view.app.unmount();
  });

  it('targets the current session explicitly from both history export entries', async () => {
    const view = mount(Tools);
    await click(view.root, '目前場次操作');
    await click(view.root, '另存歌單');
    expect(fixture.playlist.open).toBe(true);
    expect(fixture.playlist.sessionId).toBe('current');
    await click(view.root, '目前場次操作');
    await click(view.root, '匯出時間點');
    expect(fixture.timeline.openForArrangement).toHaveBeenCalledWith('current');
    view.app.unmount();
  });
});
