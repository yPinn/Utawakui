import { h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const deps = vi.hoisted(() => ({
  tracks: new Map(),
  playTrack: vi.fn(),
  enqueueTrack: vi.fn(),
  setCurrentTrack: vi.fn(),
  performanceAdd: vi.fn(),
  initialized: vi.fn(),
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({
    tracksById: { value: deps.tracks },
    initialize: deps.initialized,
  }),
}));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ playTrack: deps.playTrack }),
}));
vi.mock('../../composables/usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({
    enqueueTrack: deps.enqueueTrack,
    setCurrentTrack: deps.setCurrentTrack,
  }),
}));
vi.mock('../../composables/usePerformanceQueueActions.js', () => ({
  usePerformanceQueueActions: () => ({
    addTrack: deps.performanceAdd,
    state: { isSaving: false },
  }),
}));
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    props: ['open'],
    setup:
      (props, { slots }) =>
      () =>
        props.open
          ? h('div', { role: 'dialog' }, [slots.default?.(), slots.footer?.()])
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
vi.mock('../track/TrackIdentityRow.vue', () => ({
  default: {
    props: ['track'],
    setup:
      (props, { slots }) =>
      () =>
        h(
          'div',
          {
            'data-track-id': props.track.id,
            'data-thumbnail': props.track.thumbnailUrl,
          },
          [props.track.title, slots.trail?.()],
        ),
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    setup:
      (props, { slots, emit }) =>
      () =>
        h(
          'button',
          {
            disabled: props.disabled || props.loading,
            onClick: () => {
              if (!props.disabled && !props.loading) emit('click');
            },
          },
          slots.default?.(),
        ),
  },
}));

vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', {
          'aria-label': props.label,
          disabled: props.disabled || props.loading,
          onClick: () => {
            if (!props.disabled && !props.loading) emit('click');
          },
        }),
  },
}));

vi.mock('./WorkVersionTrackRow.vue', () => ({
  default: {
    props: ['track', 'versionLabel'],
    emits: ['play'],
    setup:
      (props, { emit }) =>
      () =>
        h('li', [
          props.track.title,
          props.versionLabel,
          h(
            'button',
            {
              'aria-label': `播放 ${props.track.title}`,
              onClick: () => emit('play', props.track),
            },
            '封面',
          ),
          h('button', { 'aria-label': `${props.track.title}的更多選項` }, '⋯'),
        ]),
  },
}));

vi.mock('./TrackMetadataFields.vue', () => ({
  default: { setup: () => () => h('div', '歌曲資訊') },
}));
vi.mock('../playback/context/TrackContextActions.vue', () => ({
  default: {
    props: ['canUnlinkWork'],
    emits: ['unlinkWork'],
    setup:
      (props, { emit }) =>
      () =>
        props.canUnlinkWork
          ? h('button', { onClick: () => emit('unlinkWork') }, '解除連結')
          : null,
  },
}));
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiField from '../ui/UiField.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiTabs from '../ui/UiTabs.vue';
import WorkLinkSearch from './WorkLinkSearch.vue';
import WorkVersionFields from './WorkVersionFields.vue';
import WorkVersionEditor from './WorkVersionEditor.vue';
import { useWorkOrganization } from '../../composables/useWorkOrganization.js';

for (const [component, path] of [
  [UiTextField, '../ui/UiTextField.vue'],
  [UiTextarea, '../ui/UiTextarea.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiDisclosure, '../ui/UiDisclosure.vue'],
  [UiTabs, '../ui/UiTabs.vue'],
  [WorkLinkSearch, './WorkLinkSearch.vue'],
  [WorkVersionFields, './WorkVersionFields.vue'],
  [WorkVersionEditor, './WorkVersionEditor.vue'],
])
  attachClientRender(component, path, import.meta.url);

const versionInfo = {
  arrangement: 'unspecified',
  performance: 'unspecified',
  vocal: 'unspecified',
  label: '',
  note: '',
};
const snapshot = (extra = {}) => ({
  status: 'ok',
  libraryEpoch: 1,
  revision: 1,
  trackId: 'a',
  bindingStatus: 'unlinked',
  work: null,
  relationship: 'unknown',
  versionInfo,
  relatedVersions: [],
  ...extra,
});
let bridge;
let mounted;
const owner = useWorkOrganization();
const buttons = () => findAll(mounted.root, (node) => node.type === 'button');
const button = (label) =>
  buttons().find(
    (node) =>
      textContent(node).trim() === label || node.props['aria-label'] === label,
  );
const field = (id) =>
  findAll(
    mounted.root,
    (node) =>
      node.props?.id === id &&
      ['input', 'select', 'textarea'].includes(node.type),
  )[0];
const submitSearch = () =>
  trigger(
    findAll(mounted.root, (node) => node.type === 'form')[0],
    'onSubmit',
    { preventDefault() {} },
  );
async function settle() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

beforeEach(async () => {
  deps.tracks.clear();
  vi.clearAllMocks();
  deps.tracks.set('a', {
    id: 'a',
    title: 'RASEN',
    artist: '9Lana',
    audioUrl: 'media:a',
  });
  deps.tracks.set('b', {
    id: 'b',
    title: 'Acoustic',
    artist: '9Lana',
    audioUrl: 'media:b',
  });
  bridge = {
    getWorkOrganization: vi.fn(() => Promise.resolve(snapshot())),
    searchWorkOrganization: vi.fn(() =>
      Promise.resolve({
        status: 'ok',
        libraryEpoch: 1,
        revision: 1,
        works: [{ id: 'w', title: 'RASEN', memberCount: 2 }],
        tracks: [
          { id: 'b', title: 'Acoustic', artist: '9Lana', workId: null },
          { id: 'c', title: 'RASEN', artist: 'Another singer', workId: 'w' },
        ],
      }),
    ),
    saveWorkOrganization: vi.fn(() =>
      Promise.resolve(snapshot({ revision: 2 })),
    ),
    renameWork: vi.fn(),
    onWorkOrganizationChanged: vi.fn(() => vi.fn()),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  mounted = mount(WorkVersionEditor);
  await owner.open(deps.tracks.get('a'));
  await settle();
});
afterEach(() => {
  mounted?.app.unmount();
  owner.dispose();
  vi.unstubAllGlobals();
});

describe('WorkVersionEditor mounted workflow', () => {
  it('hydrates search-result artwork from the current canonical library', async () => {
    deps.tracks.get('b').thumbnailUrl = 'utawakui-media://track/b/cover.jpg';
    await owner.search();
    await settle();
    const candidate = findAll(
      mounted.root,
      (node) => node.props?.['data-track-id'] === 'b',
    )[0];
    expect(candidate.props['data-thumbnail']).toBe(
      'utawakui-media://track/b/cover.jpg',
    );
  });
  it('keeps source-managed notices in the footer and out of the metadata layout', async () => {
    trigger(button('歌曲資訊'), 'onClick');
    await settle();
    const notices = findAll(
      mounted.root,
      (node) => node.props?.['aria-label'] === '歌曲整理提示',
    )[0];
    expect(textContent(notices)).toContain('歌曲資訊由來源管理');
    const panel = findAll(
      mounted.root,
      (node) => node.props?.id === 'song-editor-metadata-panel',
    )[0];
    expect(textContent(panel)).not.toContain('歌曲資訊由來源管理');
    expect(button('關閉')).toBeTruthy();
  });
  it.each([false, true])(
    'submits explicit defaults for untouched choices without inferring a classification (already linked=%s)',
    async (linked) => {
      bridge.getWorkOrganization.mockResolvedValueOnce(
        snapshot({
          work: linked ? { id: 'w', title: 'RASEN' } : null,
          versionInfo: {},
        }),
      );
      await owner.reload();
      await settle();
      for (const key of ['performance', 'arrangement', 'vocal'])
        expect(field(`work-version-${key}`).props.value).toBe('unspecified');
      expect(field('work-version-label').props.value).toBe('');
      expect(field('work-version-note').props.value).toBe('');
      expect(owner.isDirty.value).toBe(false);
      if (!linked) {
        trigger(button('連結 Acoustic（9Lana）'), 'onClick');
        await settle();
      } else {
        trigger(field('work-version-label'), 'onInput', {
          target: { value: '合作錄音版' },
        });
        await settle();
      }
      expect(field('work-relationship').props.value).toBe('unknown');
      trigger(button('儲存'), 'onClick');
      await settle();
      expect(bridge.saveWorkOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          relationship: 'unknown',
          versionInfo: {
            ...versionInfo,
            label: linked ? '合作錄音版' : '',
          },
        }),
      );
    },
  );
  it('retains saved classifications when the user leaves all choices untouched', async () => {
    const savedVersion = {
      ...versionInfo,
      performance: 'live',
      arrangement: 'acoustic',
      vocal: 'instrumental',
    };
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({
        work: { id: 'w', title: 'RASEN' },
        relationship: 'cover',
        versionInfo: savedVersion,
      }),
    );
    await owner.reload();
    await settle();
    trigger(field('work-version-note'), 'onInput', {
      target: { value: '僅修改備註' },
    });
    await settle();
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        relationship: 'cover',
        versionInfo: { ...savedVersion, note: '僅修改備註' },
      }),
    );
  });
  it('places the version name and singer category before ordered optional details', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({ work: { id: 'w', title: 'RASEN' } }),
    );
    await owner.reload();
    await settle();
    const order = findAll(
      mounted.root,
      (node) =>
        (['input', 'select', 'textarea'].includes(node.type) &&
          [
            'work-version-label',
            'work-relationship',
            'work-version-performance',
            'work-version-arrangement',
            'work-version-vocal',
            'work-version-note',
          ].includes(node.props.id)) ||
        (node.type === 'summary' && textContent(node).trim() === '更多設定'),
    ).map((node) => (node.type === 'summary' ? '更多設定' : node.props.id));
    expect(order).toEqual([
      'work-version-label',
      'work-relationship',
      '更多設定',
      'work-version-performance',
      'work-version-arrangement',
      'work-version-vocal',
      'work-version-note',
    ]);
    const labels = findAll(mounted.root, (node) => node.type === 'label').map(
      (node) => textContent(node).trim(),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        '版本名稱（選填）',
        '演唱類別',
        '錄製形式',
        '備註（選填）',
      ]),
    );
    expect(field('work-version-note').type).toBe('textarea');
    expect(field('work-version-note').props.rows).toBe(3);
  });
  it('uses plain labels while keeping original, demo and unspecified values unchanged', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({
        work: { id: 'w', title: 'RASEN' },
        relationship: 'original',
        versionInfo: { ...versionInfo, performance: 'demo' },
      }),
    );
    await owner.reload();
    await settle();
    const options = (id) =>
      findAll(field(id), (node) => node.type === 'option').map((node) => [
        node.props.value,
        textContent(node),
      ]);
    expect(options('work-relationship')).toEqual([
      ['unknown', '未設定'],
      ['original', '原唱'],
      ['cover', '翻唱'],
    ]);
    expect(options('work-version-performance')).toEqual([
      ['unspecified', '未設定'],
      ['studio', '錄音室'],
      ['live', '現場'],
      ['demo', 'Demo'],
    ]);
    expect(options('work-version-arrangement')[0]).toEqual([
      'unspecified',
      '未設定',
    ]);
    expect(options('work-version-vocal')[0]).toEqual(['unspecified', '未設定']);
    expect(field('work-relationship').props.value).toBe('original');
    expect(field('work-version-performance').props.value).toBe('demo');
    expect(owner.isDirty.value).toBe(false);
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
  });
  it('keeps original/Acoustic/Live independent and retains multiline notes through disclosure toggles', async () => {
    trigger(button('連結 Acoustic（9Lana）'), 'onClick');
    await settle();
    trigger(field('work-relationship'), 'onChange', {
      target: { value: 'original' },
    });
    trigger(field('work-version-performance'), 'onChange', {
      target: { value: 'live' },
    });
    trigger(field('work-version-arrangement'), 'onChange', {
      target: { value: 'acoustic' },
    });
    trigger(field('work-version-note'), 'onInput', {
      target: { value: '合作歌手：Guest\n台北場錄音' },
    });
    const details = () =>
      findAll(mounted.root, (node) => node.type === 'details')[0];
    for (const open of [true, false, true]) {
      trigger(details(), 'onToggle', { currentTarget: { open } });
      await settle();
    }
    expect(field('work-version-note').props.value).toBe(
      '合作歌手：Guest\n台北場錄音',
    );
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        relationship: 'original',
        versionInfo: {
          ...versionInfo,
          performance: 'live',
          arrangement: 'acoustic',
          note: '合作歌手：Guest\n台北場錄音',
        },
      }),
    );
  });
  it('calls an unnamed demo version Demo in related rows', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({
        work: { id: 'w', title: 'RASEN' },
        relatedVersions: [
          {
            trackId: 'b',
            relationship: 'cover',
            versionInfo: { ...versionInfo, performance: 'demo' },
          },
        ],
      }),
    );
    await owner.reload();
    await settle();
    expect(textContent(mounted.root)).toContain('Demo · 翻唱');
    expect(textContent(mounted.root)).not.toContain('試唱');
  });
  it('places settings on the left and song linking plus related versions on the right', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({ work: { id: 'w', title: 'RASEN' } }),
    );
    await owner.reload();
    await settle();
    const pane = (name) =>
      findAll(mounted.root, (node) =>
        String(node.props?.class || '').includes(
          `work-version-editor__${name}`,
        ),
      )[0];
    expect(textContent(pane('link-pane'))).toContain('連結曲目');
    expect(textContent(pane('link-pane'))).not.toContain('版本設定');
    expect(textContent(pane('link-pane'))).toContain('已連結版本');
    expect(textContent(pane('link-pane'))).not.toContain('演唱類別');
    expect(textContent(pane('version-pane'))).toContain('版本設定');
    expect(textContent(pane('version-pane'))).not.toContain('已連結版本');
    expect(textContent(mounted.root)).toContain('已連結版本');
    expect(textContent(pane('version-pane'))).not.toContain('搜尋歌名');
    expect(textContent(pane('version-pane'))).toContain('演唱類別');
    expect(textContent(mounted.root)).not.toContain('共同歌名');
    expect(textContent(pane('link-pane'))).not.toContain('管理連結');
    const layout = findAll(
      mounted.root,
      (node) => node.props?.class === 'work-version-editor__layout',
    )[0];
    const panes = layout.children.filter((node) => node.type === 'div');
    expect(panes[0]).toBe(pane('version-pane'));
    expect(panes[1]).toBe(pane('link-pane'));
  });
  it('starts with a simple version name and keeps optional controls collapsed', async () => {
    expect(bridge.searchWorkOrganization).toHaveBeenCalledWith({
      trackId: 'a',
      query: 'RASEN',
      limit: 30,
    });
    expect(field('work-search-query').props.value).toBe('RASEN');
    expect(button('搜尋')).toBeTruthy();
    expect(button('搜尋').props.type).toBe('submit');
    expect(button('連結 RASEN（Another singer）')).toBeTruthy();
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
    expect(field('work-version-label')).toBeTruthy();
    const details = findAll(mounted.root, (node) => node.type === 'details');
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((node) => !node.props.open)).toBe(true);
    expect(textContent(mounted.root)).not.toContain('這份錄音與作品的關係');
    expect(field('work-search-query')).toBeTruthy();
    expect(field('work-create-title')).toBeUndefined();
    expect(button('建立連結')).toBeUndefined();
  });
  it('only offers individual track links without a work group or standalone create action', async () => {
    expect(textContent(mounted.root)).not.toContain('已整理歌曲');
    expect(button('建立連結')).toBeUndefined();
    expect(button('連結 Acoustic（9Lana）')).toBeTruthy();
    expect(button('連結 RASEN（Another singer）')).toBeTruthy();
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
  });
  it('ignores form submission while a candidate search is already pending', async () => {
    let resolve;
    bridge.searchWorkOrganization.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    submitSearch();
    await settle();
    const count = bridge.searchWorkOrganization.mock.calls.length;
    submitSearch();
    await settle();
    expect(bridge.searchWorkOrganization).toHaveBeenCalledTimes(count);
    resolve({ status: 'ok', libraryEpoch: 1, works: [], tracks: [] });
    await settle();
  });
  it('hides candidate links after a search error or a changed query', async () => {
    trigger(field('work-search-query'), 'onInput', {
      target: { value: '新歌' },
    });
    await settle();
    bridge.searchWorkOrganization.mockResolvedValueOnce({ status: 'conflict' });
    submitSearch();
    await settle();
    expect(button('建立連結')).toBeUndefined();
    submitSearch();
    await settle();
    expect(button('建立連結')).toBeUndefined();
    trigger(field('work-search-query'), 'onInput', {
      target: { value: '另一首' },
    });
    await settle();
    expect(button('建立連結')).toBeUndefined();
    expect(button('連結 RASEN（Another singer）')).toBeUndefined();
  });
  it('links a selected recording without requiring an original recording in the library', async () => {
    trigger(button('連結 Acoustic（9Lana）'), 'onClick');
    await settle();
    expect(field('work-new-title')).toBeUndefined();
    trigger(field('work-relationship'), 'onChange', {
      target: { value: 'cover' },
    });
    await settle();
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { kind: 'track', targetTrackId: 'b' },
        relationship: 'cover',
      }),
    );
    expect(deps.playTrack).not.toHaveBeenCalled();
  });
  it('unlinks a work while retaining its independent version information', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({
        work: { id: 'w', title: 'RASEN' },
        versionInfo: { ...versionInfo, label: 'Live' },
        relationship: 'cover',
      }),
    );
    await owner.reload();
    await settle();
    trigger(button('解除連結'), 'onClick');
    await settle();
    expect(textContent(mounted.root)).toContain('保留版本資料');
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(bridge.saveWorkOrganization.mock.calls[0][0]).toMatchObject({
      selection: { kind: 'none' },
      versionInfo: { ...versionInfo, label: 'Live' },
      relationship: 'unknown',
    });
  });
  it('edits only the current version without a shared-name control or rename request', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({ work: { id: 'w', title: 'RASEN' } }),
    );
    await owner.reload();
    await settle();
    expect(field('work-rename-title')).toBeUndefined();
    expect(textContent(mounted.root)).not.toContain('共同歌名');
    trigger(field('work-version-label'), 'onInput', {
      target: { value: 'Acoustic feat. Guest' },
    });
    await settle();
    expect(button('更新歌名')).toBeUndefined();
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(bridge.renameWork).not.toHaveBeenCalled();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledOnce();
    expect(bridge.saveWorkOrganization.mock.calls[0][0]).toMatchObject({
      selection: { kind: 'keep' },
      versionInfo: { label: 'Acoustic feat. Guest' },
    });
  });
  it('requires an explicit confirmation before saving a changed source binding', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({ bindingStatus: 'changed' }),
    );
    await owner.reload();
    await settle();
    expect(textContent(mounted.root)).toContain('音源已變更');
    expect(button('儲存')).toBeUndefined();
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
    trigger(button('確認音源並儲存'), 'onClick');
    await settle();
    expect(bridge.saveWorkOrganization.mock.calls[0][0].reconfirm).toBe(true);
  });
  it('keeps pagination available even when a verified candidate page is empty', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({
        work: { id: 'w', title: 'RASEN' },
        hasMore: true,
        nextOffset: 100,
      }),
    );
    await owner.reload();
    await settle();
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({
        work: { id: 'w', title: 'RASEN' },
        hasMore: false,
        relatedVersions: [
          {
            trackId: 'b',
            relationship: 'cover',
            versionInfo: {
              ...versionInfo,
              arrangement: 'acoustic',
              performance: 'live',
            },
          },
        ],
      }),
    );
    trigger(button('載入更多'), 'onClick');
    await settle();
    expect(bridge.getWorkOrganization).toHaveBeenLastCalledWith({
      trackId: 'a',
      offset: 100,
      limit: 100,
    });
    expect(textContent(mounted.root)).toContain('Acoustic · 現場 · 翻唱');
    expect(button('載入更多')).toBeUndefined();
  });
  it('saves independent version dimensions without requiring a work or starting playback', async () => {
    trigger(field('work-version-arrangement'), 'onChange', {
      target: { value: 'acoustic' },
    });
    trigger(field('work-version-performance'), 'onChange', {
      target: { value: 'live' },
    });
    trigger(field('work-version-label'), 'onInput', {
      target: { value: 'Acoustic 🎵' },
    });
    await settle();
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { kind: 'keep' },
        versionInfo: {
          ...versionInfo,
          arrangement: 'acoustic',
          performance: 'live',
          label: 'Acoustic 🎵',
        },
      }),
    );
    expect(deps.playTrack).not.toHaveBeenCalled();
    expect(deps.enqueueTrack).not.toHaveBeenCalled();
  });
  it('selects a specific recording regardless of its existing work membership', async () => {
    trigger(field('work-search-query'), 'onInput', {
      target: { value: 'RASEN' },
    });
    submitSearch();
    await settle();
    expect(textContent(mounted.root)).not.toContain('已整理歌曲');
    expect(button('連結 Acoustic（9Lana）')).toBeTruthy();
    trigger(button('連結 RASEN（Another singer）'), 'onClick');
    await settle();
    trigger(field('work-relationship'), 'onChange', {
      target: { value: 'cover' },
    });
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { kind: 'track', targetTrackId: 'c' },
        relationship: 'cover',
      }),
    );
  });
  it('creates a shared work from an unlinked track and keeps the origin performer unchanged', async () => {
    submitSearch();
    await settle();
    trigger(button('連結 Acoustic（9Lana）'), 'onClick');
    await settle();
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(bridge.saveWorkOrganization.mock.calls[0][0].selection).toEqual({
      kind: 'track',
      targetTrackId: 'b',
    });
    expect(deps.tracks.get('a').artist).toBe('9Lana');
  });
  it('keeps conflict input visible and offers explicit recovery', async () => {
    bridge.saveWorkOrganization.mockResolvedValueOnce({ status: 'conflict' });
    trigger(field('work-version-label'), 'onInput', {
      target: { value: 'Draft' },
    });
    await settle();
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(field('work-version-label').props.value).toBe('Draft');
    expect(button('重新載入')).toBeTruthy();
    trigger(button('重新載入'), 'onClick');
    await settle();
    expect(field('work-version-label').props.value).toBe('');
  });
  it('resolves related versions from the canonical library and acts only on explicit controls', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({
        work: { id: 'w', title: 'RASEN' },
        relatedVersions: [{ trackId: 'b', relationship: 'cover', versionInfo }],
      }),
    );
    await owner.reload();
    await settle();
    expect(textContent(mounted.root)).toContain('Acoustic');
    expect(deps.playTrack).not.toHaveBeenCalled();
    trigger(button('播放 Acoustic'), 'onClick');
    await settle();
    expect(deps.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b' }),
    );
    expect(deps.setCurrentTrack).toHaveBeenCalledWith('b');
    expect(button('Acoustic的更多選項')).toBeTruthy();
    expect(button('加入一般佇列 Acoustic')).toBeUndefined();
    expect(button('加入演出待唱 Acoustic')).toBeUndefined();
  });
  it('uses a named version without repeating all its classifications in related rows', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({
        work: { id: 'w', title: 'RASEN' },
        relatedVersions: [
          {
            trackId: 'b',
            relationship: 'cover',
            versionInfo: {
              ...versionInfo,
              label: '翻唱 Acoustic Live',
              arrangement: 'acoustic',
              performance: 'live',
              vocal: 'vocal',
            },
          },
        ],
      }),
    );
    await owner.reload();
    await settle();
    const related = findAll(
      mounted.root,
      (node) => node.props?.['aria-labelledby'] === 'work-related-heading',
    )[0];
    expect(textContent(related)).toContain('翻唱 Acoustic Live');
    expect(textContent(related)).not.toContain('Acoustic · 現場');
    expect(textContent(related)).not.toContain('有人聲');
  });
});
