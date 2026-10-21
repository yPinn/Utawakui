import { h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Tools from './PerformanceSessionHistoryTools.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
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
  timeline: { openForArrangement: vi.fn() },
  playlist: null,
  openArchive: vi.fn(),
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => ({
    activeView: { value: 'performance' },
    performanceArchiveId: { value: 'old' },
    openPerformanceArchive: fixture.openArchive,
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
    setup(props, { slots }) {
      return () =>
        props.open
          ? h(
              'section',
              { 'aria-label': props.title, 'data-locked': props.closeDisabled },
              [slots.default?.(), slots.footer?.()],
            )
          : null;
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
                    { onClick: () => emit('select', item.value) },
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
  [UiHint, '../ui/UiHint.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiSkeleton, '../ui/UiSkeleton.vue'],
  [AppRightDockSection, '../layout/AppRightDockSection.vue'],
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
  fixture.plan = {
    state: reactive({
      plan: {
        sessionId: 'current',
        items: [],
        archives: [
          {
            id: 'old',
            name: 'Older show',
            endedAt: '2026-10-20T12:00:00Z',
            completedCount: 2,
          },
        ],
      },
      isSaving: false,
    }),
    archiveSession: vi.fn(async () => true),
  };
  fixture.playback = {
    state: reactive({ busy: false }),
    stop: vi.fn(async () => true),
  };
  vi.stubGlobal('window', {
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe('shared performance history actions', () => {
  it('places inline status beside current-session actions and outside the track rows', () => {
    const view = mount(
      Tools,
      { dock: true },
      {
        'current-status': () => h('span', { role: 'status' }, 'LIVEREC'),
        default: () => h('p', 'Current track'),
      },
    );
    const header = findAll(
      view.root,
      (n) => n.type === 'header' && textContent(n).includes('目前場次'),
    )[0];
    expect(textContent(header)).toContain('LIVEREC');
    expect(textContent(header)).toContain('目前場次操作');
    expect(textContent(header)).not.toContain('Current track');
    view.app.unmount();
  });
  it('keeps ongoing rows and archived collections separate; only explicit confirmation stops and archives the selected current session', async () => {
    const view = mount(
      Tools,
      { dock: true },
      { default: () => h('p', 'Ongoing occurrence') },
    );
    expect(textContent(view.root)).toContain('Ongoing occurrence');
    expect(textContent(view.root)).toContain('已封存場次');
    expect(textContent(view.root)).toContain('2026/10/20');
    expect(textContent(view.root)).not.toContain('演出歌單');
    expect(findAll(view.root, (n) => n.type === 'h3').map(textContent)).toEqual(
      ['目前場次', '已封存場次'],
    );
    expect(findAll(view.root, (n) => n.props.role === 'tabpanel')).toHaveLength(
      1,
    );
    await click(view.root, '目前場次操作');
    await click(view.root, '結束並封存場次');
    expect(fixture.playback.stop).not.toHaveBeenCalled();
    expect(textContent(view.root)).toContain('會停止目前演出');
    await click(view.root, '結束並封存');
    expect(fixture.playback.stop).toHaveBeenCalledOnce();
    expect(fixture.plan.archiveSession).toHaveBeenCalledWith(
      '演出場次',
      'current',
    );
    expect(
      findAll(view.root, (n) => n.props['aria-label'] === '結束並封存場次'),
    ).toHaveLength(0);
    view.app.unmount();
  });
  it('retains the dialog and original session id after stop or write failure, allowing an idempotent retry', async () => {
    fixture.playback.stop.mockResolvedValueOnce(false);
    fixture.plan.archiveSession
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const view = mount(Tools, { dock: true });
    await click(view.root, '目前場次操作');
    await click(view.root, '結束並封存場次');
    await click(view.root, '結束並封存');
    expect(fixture.plan.archiveSession).not.toHaveBeenCalled();
    expect(textContent(view.root)).toContain('尚未停止');
    await click(view.root, '結束並封存');
    expect(textContent(view.root)).toContain('原安排仍保留');
    await click(view.root, '結束並封存');
    expect(fixture.plan.archiveSession.mock.calls).toEqual([
      ['演出場次', 'current'],
      ['演出場次', 'current'],
    ]);
    view.app.unmount();
  });
  it('targets the chosen archive for both export entries and main-area navigation without loading a modal', async () => {
    const view = mount(Tools, {});
    await click(view.root, '場次操作：Older show');
    await click(view.root, '另存演出歌單');
    expect(fixture.playlist.open).toBe(true);
    expect(fixture.playlist.sessionId).toBe('old');
    await click(view.root, '場次操作：Older show');
    await click(view.root, '匯出場次時間軸');
    expect(fixture.timeline.openForArrangement).toHaveBeenCalledWith('old');
    await click(view.root, '選取 Older show');
    expect(fixture.openArchive).toHaveBeenCalledWith('old');
    expect(window.Utawakui.getPerformanceSession).not.toHaveBeenCalled();
    expect(
      findAll(view.root, (n) => n.props['data-playback-enabled'] === false),
    ).toHaveLength(1);
    expect(fixture.plan.archiveSession).not.toHaveBeenCalled();
    view.app.unmount();
  });
});
