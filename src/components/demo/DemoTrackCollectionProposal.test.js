import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DemoTrackCollectionProposal from './DemoTrackCollectionProposal.vue';
import DemoTrackCollectionColumnChooser from './DemoTrackCollectionColumnChooser.vue';
import DemoTrackCollectionRow from './DemoTrackCollectionRow.vue';
import DemoTrackCollectionTable from './DemoTrackCollectionTable.vue';
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiField from '../ui/UiField.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [DemoTrackCollectionRow, './DemoTrackCollectionRow.vue'],
  [DemoTrackCollectionTable, './DemoTrackCollectionTable.vue'],
  [DemoTrackCollectionColumnChooser, './DemoTrackCollectionColumnChooser.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiCheckbox, '../ui/UiCheckbox.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiOverflowTooltip, '../ui/UiOverflowTooltip.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiPopover, '../ui/UiPopover.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

vi.stubGlobal('requestAnimationFrame', (callback) => {
  callback();
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('document', {});
const getComputedStyleMock = vi.fn(() => ({
  columnGap: '8px',
  direction: 'ltr',
  paddingInlineEnd: '12px',
  paddingInlineStart: '12px',
}));
vi.stubGlobal('getComputedStyle', getComputedStyleMock);
vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe(target) {
      this.callback([{ target, contentRect: { width: 1200 } }]);
    }

    disconnect() {}
  },
);

beforeEach(() => {
  getComputedStyleMock.mockImplementation(() => ({
    columnGap: '8px',
    direction: 'ltr',
    paddingInlineEnd: '12px',
    paddingInlineStart: '12px',
  }));
});

const proposalSource = readFileSync(
  new URL('./DemoTrackCollectionProposal.vue', import.meta.url),
  'utf8',
);
const tableSource = readFileSync(
  new URL('./DemoTrackCollectionTable.vue', import.meta.url),
  'utf8',
);
const rowSource = readFileSync(
  new URL('./DemoTrackCollectionRow.vue', import.meta.url),
  'utf8',
);
const columnChooserSource = readFileSync(
  new URL('./DemoTrackCollectionColumnChooser.vue', import.meta.url),
  'utf8',
);
const columnOwnerSource = readFileSync(
  new URL('../../composables/useTrackCollectionColumns.js', import.meta.url),
  'utf8',
);

const entries = [
  {
    track: {
      id: 'track-a',
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    },
    visibleIndex: 0,
    ordinalText: '1',
    releaseText: 'THE BOOK',
    releaseYearText: '2020',
    membershipText: '2026/10/12',
    usageText: '1,234',
    albumTitle: 'THE BOOK',
    separationReady: true,
    favorite: true,
  },
  {
    track: {
      id: 'track-b',
      title:
        '夏夜裡的多語版本／SummerLiveSessionFinalMixWithoutConvenientBreaks.wav',
      artist: '本機演出者／アーティスト',
      duration: 245,
    },
    visibleIndex: 1,
    ordinalText: '2-1',
    releaseText: '現場錄音集',
    releaseYearText: '',
    membershipText: '2026/10/10',
    usageText: '0',
    albumTitle: '現場錄音集',
  },
];

function classIncludes(node, className) {
  return String(node.props?.class ?? '')
    .split(/\s+/u)
    .includes(className);
}

function rowRoles(row) {
  return findAll(row, (node) => Boolean(node.props?.['data-track-column'])).map(
    (node) => node.props['data-track-column'],
  );
}

function mountTable(overrides = {}) {
  return mount(DemoTrackCollectionTable, {
    entries,
    collectionKind: 'playlist',
    sort: { key: null, direction: 'asc' },
    canReorderPlaylistTracks: true,
    selectedTrackId: 'track-a',
    currentTrackId: 'track-b',
    ...overrides,
  });
}

describe('F8 Track Collection proposal', () => {
  it('keeps the production-candidate column chooser intrinsic and token-owned', () => {
    expect(columnChooserSource).not.toMatch(
      /(?:min-|max-)?(?:inline-size|block-size|width|height):\s*\d/u,
    );
    expect(columnChooserSource).toContain('gap: var(--ui-space-1);');
  });

  it('renders a dedicated review surface with profile, state, viewport and intent controls', async () => {
    const html = await renderToString(
      createSSRApp(DemoTrackCollectionProposal),
    );
    const text = html.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');

    expect(text).toContain('集合性質');
    expect(text).toContain('檢視與互動');
    expect(text).not.toContain('Profiles 與互動');
    expect(text).toContain('全部曲目');
    expect(text).toContain('本機檔案');
    expect(text).toContain('播放清單');
    expect(text).toContain('專輯');
    expect(text).toContain('藝人');
    expect(text).toContain('狀態樣本');
    expect(text).toContain('Selected＋Current');
    expect(text).toContain('檢視寬度');
    expect(text).toContain('Minimum');
    expect(text).toContain('125% 字級壓力');
    expect(text).toContain('最近操作');
    expect(proposalSource).toContain('label="播放清單曲目順序可調整"');
    expect(proposalSource).not.toContain('label="自訂順序可調整"');
    expect(text).toContain('比較各檢視的欄位、排序與曲目狀態。');
    expect(text).toContain('所有曲目，預設顯示專輯與播放次數。');
    expect(text).toContain('點選播放中曲目，查看選取與播放狀態。');
    expect(text).not.toContain('row intent');
    expect(text).not.toContain('Selected＋Current共存');
    expect(text).not.toContain('匯入日期');
    expect(html).toContain('aria-live="polite"');
    expect(
      [
        ...html.matchAll(
          /class="demo-track-collection-row__ordinal-text"[^>]*>\s*([^<]+)\s*<\/span>/gu,
        ),
      ].map((match) => match[1].trim()),
    ).toEqual(['1', '2', '3', '4']);
  });

  it('keeps the proposal isolated from production state owners', () => {
    for (const owner of [
      'useLibrary',
      'usePlaylists',
      'usePlayer',
      'usePlaybackQueue',
      'LibraryBrowseContent',
      '../track/TrackTable.vue',
    ]) {
      expect(proposalSource).not.toContain(owner);
      expect(tableSource).not.toContain(owner);
    }
  });

  it('hosts the column chooser in the trailing thead utility lane instead of the proposal toolbar', () => {
    const { app, root } = mountTable();
    const actionsHeader = findAll(
      root,
      (node) => node.props?.['data-track-column'] === 'actions',
    )[0];
    const chooserTrigger = findAll(
      actionsHeader,
      (node) =>
        node.type === 'button' && textContent(node).includes('選擇顯示欄位'),
    );

    expect(chooserTrigger).toHaveLength(1);
    expect(tableSource).toContain('<DemoTrackCollectionColumnChooser');
    expect(proposalSource).not.toContain(
      'import DemoTrackCollectionColumnChooser',
    );
    expect(proposalSource).not.toContain('<DemoTrackCollectionColumnChooser');
    app.unmount();
  });

  it.each([
    ['library-all', true, true, ['release', 'usage']],
    ['library-local', true, true, ['release', 'usage']],
    ['playlist', true, true, []],
    ['album', false, true, ['usage']],
    ['artist', true, false, ['usage']],
  ])(
    'renders the %s profile through one canonical table contract',
    (collectionKind, hasArtwork, hasArtist, semanticRoles) => {
      const { app, root } = mountTable({ collectionKind });
      const header = findAll(root, (node) =>
        classIncludes(node, 'demo-track-collection-table__header'),
      )[0];
      const row = findAll(root, (node) =>
        classIncludes(node, 'demo-track-collection-row'),
      )[0];
      const roles = rowRoles(row);

      expect(rowRoles(header)).toEqual(roles);
      expect(roles).not.toContain('reorder');
      expect(
        findAll(row, (node) =>
          classIncludes(node, 'demo-track-collection-row__thumb'),
        ).length > 0,
      ).toBe(hasArtwork);
      expect(
        findAll(row, (node) =>
          classIncludes(node, 'demo-track-collection-row__artist'),
        ).length > 0,
      ).toBe(hasArtist);
      expect(textContent(header)).toContain('曲目');
      expect(
        roles.filter((role) =>
          ['release', 'releaseYear', 'membership', 'usage'].includes(role),
        ),
      ).toEqual(semanticRoles);
      app.unmount();
    },
  );

  it('emits field-specific sort keys only for row-sort-enabled profiles', () => {
    const onToggleSort = vi.fn();
    const playlist = mountTable({
      onToggleSort,
      columnPreferences: { visibleAdvanced: ['release', 'membership'] },
    });
    for (const [label, key] of [
      ['專輯排序', 'album'],
      ['新增日期排序', 'addedAt'],
    ]) {
      const button = findAll(
        playlist.root,
        (node) => node.type === 'button' && node.props['aria-label'] === label,
      )[0];
      trigger(button, 'onClick');
      expect(onToggleSort).toHaveBeenLastCalledWith(key);
    }
    playlist.app.unmount();

    const library = mountTable({
      collectionKind: 'library-all',
      onToggleSort,
    });
    const usage = findAll(
      library.root,
      (node) =>
        node.type === 'button' && node.props['aria-label'] === '播放次數排序',
    )[0];
    trigger(usage, 'onClick');
    expect(onToggleSort).toHaveBeenLastCalledWith('playCount');
    library.app.unmount();

    for (const collectionKind of ['album', 'artist']) {
      const fixed = mountTable({ collectionKind, onToggleSort });
      expect(
        findAll(fixed.root, (node) =>
          String(node.props?.['aria-label'] ?? '').endsWith('排序'),
        ),
      ).toHaveLength(0);
      fixed.app.unmount();
    }
  });

  it('keeps title plain while artist and album own their matching destinations', () => {
    const onSelectTrack = vi.fn();
    const onActivateTrack = vi.fn();
    const onNavigateAlbum = vi.fn();
    const onNavigateArtist = vi.fn();
    const onOpenMenu = vi.fn();
    const { app, root } = mountTable({
      onSelectTrack,
      onActivateTrack,
      onNavigateAlbum,
      onNavigateArtist,
      onOpenMenu,
      columnPreferences: { visibleAdvanced: ['release'] },
    });
    const row = findAll(root, (node) =>
      classIncludes(node, 'demo-track-collection-row'),
    )[0];
    const buttons = findAll(row, (node) => node.type === 'button');
    const action = buttons.find(
      (button) => button.props['aria-label'] === '選取：夜に駆ける',
    );
    const album = buttons.find(
      (button) => button.props['aria-label'] === '前往專輯：THE BOOK',
    );
    const artist = buttons.find(
      (button) => button.props['aria-label'] === '前往藝人：YOASOBI',
    );
    const menu = buttons.find((button) =>
      textContent(button).includes('更多：夜に駆ける'),
    );

    trigger(action, 'onClick', { stopPropagation: vi.fn() });
    trigger(action, 'onDblclick', { stopPropagation: vi.fn() });
    trigger(action, 'onKeydown', {
      key: ' ',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    trigger(action, 'onKeydown', {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    const title = findAll(row, (node) =>
      classIncludes(node, 'demo-track-collection-row__title'),
    )[0];
    expect(title.type).not.toBe('button');
    expect(textContent(album)).toContain('THE BOOK');

    trigger(album, 'onClick', { stopPropagation: vi.fn() });
    trigger(artist, 'onClick', { stopPropagation: vi.fn() });
    trigger(menu, 'onClick', { stopPropagation: vi.fn() });
    trigger(row, 'onContextmenu', {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onSelectTrack).toHaveBeenCalledTimes(2);
    expect(onActivateTrack).toHaveBeenCalledTimes(2);
    expect(onNavigateAlbum).toHaveBeenCalledOnce();
    expect(onNavigateArtist).toHaveBeenCalledOnce();
    expect(onOpenMenu).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('keeps separation readiness always visible while favorite remains progressively disclosed', () => {
    const { app, root } = mountTable();
    const firstRow = findAll(root, (node) =>
      classIncludes(node, 'demo-track-collection-row'),
    )[0];
    const durationCell = findAll(
      firstRow,
      (node) => node.props?.['data-track-column'] === 'duration',
    )[0];
    const statusCell = findAll(durationCell, (node) =>
      classIncludes(node, 'demo-track-collection-row__status'),
    )[0];
    const statuses = findAll(
      statusCell,
      (node) => node.props?.role === 'img' && node.props?.['aria-label'],
    );
    const favoriteStatus = statuses.find(
      (node) => node.props['aria-label'] === '已加入最愛',
    );
    const separationStatus = statuses.find(
      (node) => node.props['aria-label'] === '已有伴奏',
    );

    expect(statuses.map((node) => node.props['aria-label'])).toEqual([
      '已加入最愛',
      '已有伴奏',
    ]);
    expect(String(favoriteStatus.props.class)).toContain(
      'ui-status-icon--current',
    );
    expect(String(separationStatus.props.class)).toContain(
      'ui-status-icon--success',
    );
    expect(
      findAll(statusCell, (node) =>
        classIncludes(node, 'demo-track-collection-row__status-icon--favorite'),
      ),
    ).toHaveLength(1);
    expect(rowRoles(firstRow)).not.toContain('separation');
    expect(rowRoles(firstRow)).not.toContain('status');
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__status\s*\{[^}]*inline-size:\s*var\(--demo-track-collection-status-slot\);/su,
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__status\s*\{[^}]*pointer-events:\s*none;/su,
    );
    expect(rowSource).not.toMatch(
      /\.demo-track-collection-row__status\s*\{[^}]*opacity:\s*0;/su,
    );
    expect(rowSource).toContain(
      '.demo-track-collection-row__status-icon--favorite',
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__status-icon--favorite\s*\{[^}]*opacity:\s*0;/su,
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row--selected\s+\.demo-track-collection-row__status-icon--favorite/u,
    );
    app.unmount();
  });

  it('uses the playlist row as the drag source and keeps keyboard movement on its row action', () => {
    const onMoveTrack = vi.fn();
    const onDragStart = vi.fn();
    const { app, root } = mountTable({ onMoveTrack, onDragStart });
    const row = findAll(root, (node) =>
      classIncludes(node, 'demo-track-collection-row'),
    )[0];
    const action = findAll(
      row,
      (node) =>
        node.type === 'button' &&
        node.props['aria-label'] === '選取：夜に駆ける',
    )[0];
    const dragEvent = { dataTransfer: {} };

    expect(row.props.draggable).toBe(true);
    expect(rowRoles(row)).not.toContain('reorder');
    expect(textContent(row)).not.toContain('調整順序');
    expect(action.props['aria-description']).toContain('方向鍵調整順序');
    trigger(row, 'onDragstart', dragEvent);
    expect(onDragStart).toHaveBeenCalledWith(entries[0].track, dragEvent);
    trigger(action, 'onKeydown', {
      key: 'ArrowUp',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    trigger(action, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(onMoveTrack).toHaveBeenNthCalledWith(1, 'track-a', -1);
    expect(onMoveTrack).toHaveBeenNthCalledWith(2, 'track-a', 1);
    app.unmount();

    const hiddenDefaults = mountTable({
      columnPreferences: {
        hiddenDefaultColumns: ['release', 'membership'],
      },
    });
    const hiddenDefaultsRow = findAll(hiddenDefaults.root, (node) =>
      classIncludes(node, 'demo-track-collection-row'),
    )[0];
    expect(rowRoles(hiddenDefaultsRow)).not.toContain('release');
    expect(rowRoles(hiddenDefaultsRow)).not.toContain('membership');
    expect(hiddenDefaultsRow.props.draggable).toBe(true);
    hiddenDefaults.app.unmount();

    const disabledMove = vi.fn();
    const disabled = mountTable({
      canReorderPlaylistTracks: false,
      onMoveTrack: disabledMove,
    });
    const disabledRow = findAll(disabled.root, (node) =>
      classIncludes(node, 'demo-track-collection-row'),
    )[0];
    const disabledAction = findAll(
      disabledRow,
      (node) =>
        node.type === 'button' &&
        node.props['aria-label'] === '選取：夜に駆ける',
    )[0];
    expect(disabledRow.props.draggable).toBe(false);
    expect(disabledAction.props['aria-description']).not.toContain(
      '方向鍵調整順序',
    );
    trigger(disabledAction, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(disabledMove).not.toHaveBeenCalled();
    disabled.app.unmount();
  });

  it.each(['artist', 'album'])(
    'keeps the informational %s profile outside every drag and drop path',
    (collectionKind) => {
      const onDragStart = vi.fn();
      const onDragOver = vi.fn();
      const onDrop = vi.fn();
      const { app, root } = mountTable({
        collectionKind,
        canReorderPlaylistTracks: true,
        onDragStart,
        onDragOver,
        onDrop,
      });
      const row = findAll(root, (node) =>
        classIncludes(node, 'demo-track-collection-row'),
      )[0];

      expect(row.props.draggable).toBe(false);
      expect(
        findAll(row, (node) =>
          textContent(node).includes('調整順序：夜に駆ける'),
        ),
      ).toHaveLength(0);
      trigger(row, 'onDragstart', { dataTransfer: {} });
      trigger(row, 'onDragover', { preventDefault: vi.fn() });
      trigger(row, 'onDrop', { preventDefault: vi.fn() });
      expect(onDragStart).not.toHaveBeenCalled();
      expect(onDragOver).not.toHaveBeenCalled();
      expect(onDrop).not.toHaveBeenCalled();
      app.unmount();
    },
  );

  it('replaces ordinals with playback controls on interaction and keeps current playback explicit', () => {
    const onTogglePlayback = vi.fn();
    const { app, root } = mountTable({
      currentTrackId: 'track-b',
      playingTrackId: 'track-b',
      onTogglePlayback,
    });
    const play = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        textContent(node).includes('播放：夜に駆ける'),
    )[0];
    const pause = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        textContent(node).includes(
          '暫停：夏夜裡的多語版本／SummerLiveSessionFinalMixWithoutConvenientBreaks.wav',
        ),
    )[0];

    trigger(play, 'onClick', { stopPropagation: vi.fn() });
    trigger(pause, 'onClick', { stopPropagation: vi.fn() });
    expect(onTogglePlayback).toHaveBeenNthCalledWith(1, entries[0].track);
    expect(onTogglePlayback).toHaveBeenNthCalledWith(2, entries[1].track);
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__playback-control\s*\{[^}]*opacity:\s*0;/su,
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__ordinal-text\s*\{[^}]*pointer-events:\s*none;/su,
    );
    expect(rowSource).toContain(
      '.demo-track-collection-row:hover .demo-track-collection-row__playback-control',
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row:focus-within\s+\.demo-track-collection-row__playback-control/u,
    );
    app.unmount();
  });

  it('reveals the reserved ellipsis action only on row hover or keyboard focus', () => {
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__actions\s*\{[^}]*opacity:\s*0;/su,
    );
    expect(rowSource).toContain(
      '.demo-track-collection-row:hover .demo-track-collection-row__actions',
    );
    expect(rowSource).toContain(
      '.demo-track-collection-row:focus-within .demo-track-collection-row__actions',
    );
    expect(rowSource).toContain('@contextmenu.prevent');
    expect(rowSource).not.toContain(
      '.demo-track-collection-row--selected .demo-track-collection-row__actions',
    );
    expect(rowSource).toContain(`v-if="hasColumn('actions')"`);
  });

  it('centers the ordinal header, number and playback control in one shared slot', () => {
    const { app, root } = mountTable();
    const ordinalHeader = findAll(
      root,
      (node) =>
        node.props?.['data-track-column'] === 'ordinal' &&
        !classIncludes(node, 'demo-track-collection-row__ordinal'),
    )[0];
    const ordinalRow = findAll(root, (node) =>
      classIncludes(node, 'demo-track-collection-row__ordinal'),
    )[0];

    expect(ordinalHeader.props['data-column-align']).toBe('center');
    expect(ordinalRow.props['data-column-align']).toBe('center');
    expect(tableSource).toContain(
      ':data-column-align="column.headerAlign ?? column.align"',
    );
    expect(rowSource).toContain(
      `:data-column-align="columnAlignment('ordinal')"`,
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__ordinal-text,[\s\S]*?\.demo-track-collection-row__playback-control\s*\{[^}]*grid-area:\s*1\s*\/\s*1;/u,
    );
    expect(tableSource).toMatch(
      /column\.sortIndicatorPlacement === 'before'[\s\S]*?<span>\{\{ column\.label \}\}<\/span>[\s\S]*?column\.sortIndicatorPlacement !== 'before'/u,
    );
    expect(tableSource).toMatch(
      /\[data-column-align='end'\][^}]*text-align:\s*end;/su,
    );
    expect(rowSource).toMatch(
      /\[data-column-align='end'\][^}]*text-align:\s*end;/su,
    );
    app.unmount();
  });

  it('reorders semantic headers by pointer or keyboard for every profile', () => {
    const onUpdateColumnPreferences = vi.fn();
    const mounted = mountTable({
      onUpdateColumnPreferences,
      columnPreferences: { visibleAdvanced: ['release', 'membership'] },
    });
    const release = findAll(
      mounted.root,
      (node) => node.props?.['data-track-column'] === 'release',
    )[0];
    const membership = findAll(
      mounted.root,
      (node) => node.props?.['data-track-column'] === 'membership',
    )[0];
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    };

    expect(release.props.draggable).toBe(true);
    expect(release.props.tabindex).toBe(0);
    trigger(membership, 'onDragstart', { dataTransfer });
    trigger(release, 'onDragover', {
      clientX: 0,
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, width: 200 }),
      },
      dataTransfer,
      preventDefault: vi.fn(),
    });
    trigger(release, 'onDrop', {
      dataTransfer,
      preventDefault: vi.fn(),
    });
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership'],
      hiddenDefaultColumns: [],
      widths: {},
      columnOrder: ['membership', 'release', 'usage', 'releaseYear'],
    });

    onUpdateColumnPreferences.mockClear();
    trigger(release, 'onKeydown', {
      key: 'ArrowRight',
      altKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership'],
      hiddenDefaultColumns: [],
      widths: {},
      columnOrder: ['membership', 'release', 'usage', 'releaseYear'],
    });
    mounted.app.unmount();

    for (const collectionKind of ['artist', 'album']) {
      const editable = mountTable({
        collectionKind,
        columnPreferences: { visibleAdvanced: ['imported'] },
      });
      const header = findAll(editable.root, (node) =>
        classIncludes(node, 'demo-track-collection-table__header'),
      )[0];
      const semanticHeaders = findAll(header, (node) =>
        ['usage', 'imported'].includes(node.props?.['data-track-column']),
      );

      expect(semanticHeaders).toHaveLength(2);
      expect(
        semanticHeaders.every((node) => node.props.draggable === true),
      ).toBe(true);
      expect(semanticHeaders.every((node) => node.props.tabindex === 0)).toBe(
        true,
      );
      editable.app.unmount();
    }
  });

  it.each([
    ['library-all', true],
    ['library-local', true],
    ['playlist', true],
    ['album', false],
    ['artist', false],
  ])(
    'sets track-row sort controls for %s to %s',
    (collectionKind, canSortTrackRows) => {
      const { app, root } = mountTable({ collectionKind });
      const header = findAll(root, (node) =>
        classIncludes(node, 'demo-track-collection-table__header'),
      )[0];
      const rowSortButtons = findAll(
        header,
        (node) =>
          node.type === 'button' &&
          ['曲目排序', '時長排序'].includes(node.props?.['aria-label']),
      );

      expect(rowSortButtons.map((node) => node.props['aria-label'])).toEqual(
        canSortTrackRows ? ['曲目排序', '時長排序'] : [],
      );
      app.unmount();
    },
  );

  it('exposes bounded column separators and supports keyboard resizing', async () => {
    const onUpdateColumnPreferences = vi.fn();
    const { app, root } = mountTable({
      onUpdateColumnPreferences,
      columnPreferences: { visibleAdvanced: ['release', 'membership'] },
    });
    await nextTick();
    const separator = findAll(
      root,
      (node) =>
        node.props?.role === 'separator' &&
        node.props?.['data-resize-column'] === 'identity',
    )[0];

    expect(separator.props['aria-orientation']).toBe('vertical');
    expect(separator.props['aria-valuemin']).toBe(128);
    expect(separator.props['aria-valuenow']).toBe(422);
    expect(separator.props['aria-valuemax']).toBe(490);

    trigger(separator, 'onKeydown', {
      key: 'ArrowRight',
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership'],
      hiddenDefaultColumns: [],
      widths: { identity: 430, release: 275, membership: 195 },
    });

    trigger(separator, 'onKeydown', {
      key: 'ArrowLeft',
      shiftKey: true,
      preventDefault: vi.fn(),
    });
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership'],
      hiddenDefaultColumns: [],
      widths: { identity: 398, release: 275, membership: 195 },
    });

    trigger(separator, 'onKeydown', {
      key: 'Home',
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership'],
      hiddenDefaultColumns: [],
      widths: { identity: 128, release: 275, membership: 195 },
    });

    trigger(separator, 'onKeydown', {
      key: 'End',
      shiftKey: false,
      preventDefault: vi.fn(),
    });
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership'],
      hiddenDefaultColumns: [],
      widths: { identity: 490, release: 275, membership: 195 },
    });
    app.unmount();
  });

  it('commits pointer resize once, shows the full guide only while active, cancels without persistence and resets one width', async () => {
    const onUpdateColumnPreferences = vi.fn();
    const mounted = mountTable({
      columnPreferences: {
        visibleAdvanced: ['release', 'membership', 'releaseYear'],
        widths: { identity: 400 },
      },
      onUpdateColumnPreferences,
    });
    const separator = findAll(
      mounted.root,
      (node) => node.props?.['data-resize-column'] === 'identity',
    )[0];
    const listeners = new Map();
    const target = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name),
      getBoundingClientRect: () => ({ left: 0, right: 400 }),
    };

    expect(
      findAll(mounted.root, (node) =>
        classIncludes(node, 'demo-track-collection-table__resize-guide'),
      ),
    ).toHaveLength(0);

    trigger(separator, 'onPointerdown', {
      preventDefault: vi.fn(),
      currentTarget: target,
      clientX: 400,
      pointerId: 1,
    });
    listeners.get('pointermove')({ clientX: 432 });
    await nextTick();
    expect(
      findAll(mounted.root, (node) =>
        classIncludes(node, 'demo-track-collection-table__resize-guide'),
      ),
    ).toHaveLength(1);
    expect(
      findAll(mounted.root, (node) =>
        classIncludes(node, 'demo-track-collection-table--resizing'),
      ),
    ).toHaveLength(1);
    expect(onUpdateColumnPreferences).not.toHaveBeenCalled();
    listeners.get('pointerup')({});
    await nextTick();
    expect(
      findAll(mounted.root, (node) =>
        classIncludes(node, 'demo-track-collection-table__resize-guide'),
      ),
    ).toHaveLength(0);
    expect(onUpdateColumnPreferences).toHaveBeenCalledOnce();
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership', 'releaseYear'],
      hiddenDefaultColumns: [],
      widths: {
        identity: 432,
        release: 208,
        membership: 128,
        releaseYear: 96,
      },
    });

    onUpdateColumnPreferences.mockClear();
    trigger(separator, 'onPointerdown', {
      preventDefault: vi.fn(),
      currentTarget: target,
      clientX: 400,
      pointerId: 2,
    });
    listeners.get('pointermove')({ clientX: 448 });
    await nextTick();
    listeners.get('pointercancel')({});
    await nextTick();
    expect(
      findAll(mounted.root, (node) =>
        classIncludes(node, 'demo-track-collection-table__resize-guide'),
      ),
    ).toHaveLength(0);
    expect(onUpdateColumnPreferences).not.toHaveBeenCalled();

    trigger(separator, 'onDblclick', { preventDefault: vi.fn() });
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership', 'releaseYear'],
      hiddenDefaultColumns: [],
      widths: {},
    });
    mounted.app.unmount();
  });

  it('keeps resize topology and committed geometry stable until controlled preferences return', async () => {
    const onUpdateColumnPreferences = vi.fn();
    const mounted = mountTable({
      columnPreferences: {
        visibleAdvanced: ['release', 'membership', 'releaseYear'],
        widths: { identity: 400 },
      },
      onUpdateColumnPreferences,
    });
    const header = findAll(mounted.root, (node) =>
      classIncludes(node, 'demo-track-collection-table__header'),
    )[0];
    const row = findAll(mounted.root, (node) =>
      classIncludes(node, 'demo-track-collection-row'),
    )[0];
    const separator = findAll(
      mounted.root,
      (node) => node.props?.['data-resize-column'] === 'identity',
    )[0];
    const listeners = new Map();
    const target = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name),
      getBoundingClientRect: () => ({ left: 394, right: 406, width: 12 }),
    };
    const gridVariable = '--demo-track-collection-grid';
    const initialRoles = rowRoles(row);
    const initialTracks = header.props.style[gridVariable].match(
      /(?:minmax\(0, 1fr\)|\d+px)/gu,
    );

    trigger(separator, 'onPointerdown', {
      preventDefault: vi.fn(),
      currentTarget: target,
      clientX: 400,
      pointerId: 5,
    });
    listeners.get('pointermove')({ clientX: 432 });
    await nextTick();
    listeners.get('pointermove')({ clientX: 440 });
    await nextTick();

    const activeGrid = header.props.style[gridVariable];
    const activeTracks = activeGrid.match(/(?:minmax\(0, 1fr\)|\d+px)/gu);
    expect(rowRoles(row)).toEqual(initialRoles);
    expect(activeTracks[1]).toBe('440px');
    expect(activeTracks.filter((_, index) => index !== 1)).toEqual(
      initialTracks.filter((_, index) => index !== 1),
    );
    expect(onUpdateColumnPreferences).not.toHaveBeenCalled();

    listeners.get('pointerup')({});
    await nextTick();

    expect(header.props.style[gridVariable]).toBe(activeGrid);
    expect(rowRoles(row)).toEqual(initialRoles);
    expect(onUpdateColumnPreferences).toHaveBeenCalledOnce();
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership', 'releaseYear'],
      hiddenDefaultColumns: [],
      widths: {
        identity: 440,
        release: 208,
        membership: 128,
        releaseYear: 96,
      },
    });
    mounted.app.unmount();
  });

  it('reveals every short separator from the whole header row and keeps the full-height guide exclusive to dragging', () => {
    expect(tableSource).toMatch(
      /\.demo-track-collection-table__resize-handle\s*\{[^}]*inline-size:\s*var\(--ui-resize-handle-hit-size\);/su,
    );
    expect(tableSource).toMatch(
      /inset-inline-end:\s*calc\(\s*\(var\(--ui-resize-handle-hit-size\)\s*\+\s*var\(--ui-track-row-gap\)\)\s*\/\s*-2\s*\);/u,
    );
    expect(tableSource).not.toContain('inline-size: 12px');
    expect(tableSource).not.toContain('inset-inline-end: -6px');
    expect(tableSource).toContain(
      '.demo-track-collection-table__resize-handle:focus-visible',
    );
    expect(tableSource).toContain('.demo-track-collection-table__resize-guide');
    expect(tableSource).toContain('v-if="isResizing"');
    expect(tableSource).not.toContain('data-guide-state');
    expect(tableSource).toContain(
      '.demo-track-collection-table__resize-handle::before',
    );
    expect(tableSource).toMatch(
      /\.demo-track-collection-table__resize-handle::before\s*\{[^}]*inset-block:\s*var\(--ui-space-2\);[^}]*opacity:\s*0;/su,
    );
    expect(tableSource).toContain('.demo-track-collection-table__header:hover');
    expect(tableSource).toContain(
      '.demo-track-collection-table__header:focus-within',
    );
    expect(tableSource).toContain(
      ':not(.demo-track-collection-table--resizing)',
    );
    expect(tableSource).not.toContain(
      '.demo-track-collection-table__resize-handle:hover::before',
    );
    expect(tableSource).toMatch(
      /\.demo-track-collection-table:not\(\.demo-track-collection-table--resizing\)[^{]+\.demo-track-collection-table__header:hover[^{]+\.demo-track-collection-table__resize-handle::before,[^{]+\.demo-track-collection-table:not\(\.demo-track-collection-table--resizing\)[^{]+\.demo-track-collection-table__header:focus-within[^{]+\.demo-track-collection-table__resize-handle::before\s*\{[^}]*opacity:\s*1;/su,
    );
    expect(tableSource).not.toContain(
      '.demo-track-collection-table__header-cell--resizable',
    );
    expect(tableSource).toMatch(
      /\.demo-track-collection-table:not\(\.demo-track-collection-table--resizing\)[^{]+\.demo-track-collection-table__resize-handle:focus-visible::before\s*\{[^}]*inline-size:\s*var\(--ui-focus-width\);[^}]*background:\s*var\(--ui-color-focus\);/su,
    );
    expect(tableSource).toMatch(
      /\.demo-track-collection-table__header\s*>\s*\[data-track-column='duration'\][^{]+\.demo-track-collection-table__sort\s*\{[^}]*justify-content:\s*flex-end;/su,
    );
    expect(tableSource).not.toMatch(
      /\.demo-track-collection-table__header\s*>\s*:is\([^)]*\)[^{]+\.demo-track-collection-table__sort\s*\{/su,
    );
    expect(columnOwnerSource).not.toContain('resizeStartGuideX');
    expect(columnOwnerSource).not.toContain('hoverRole');
    expect(columnOwnerSource).not.toContain('focusRole');
    expect(columnOwnerSource).not.toContain('showGuide');
    expect(columnOwnerSource).not.toContain('hideGuide');
    expect(columnOwnerSource).toContain(
      'nextTick(() => positionGuide(resizeHandle.value))',
    );
    expect(columnOwnerSource).toContain('translate3d');
    expect(columnOwnerSource).toContain('getComputedStyle');
    expect(columnOwnerSource).toContain('columnGap');
    expect(columnOwnerSource).toContain('paddingInlineStart');
    expect(columnOwnerSource).toContain('paddingInlineEnd');
    expect(columnOwnerSource).not.toMatch(/columnGap:\s*8/u);
    expect(columnOwnerSource).not.toMatch(/inlinePadding:\s*24/u);
    expect(columnOwnerSource).not.toMatch(/columnGap:\s*0/u);
    expect(columnOwnerSource).not.toMatch(/inlinePadding:\s*0/u);
    expect(columnOwnerSource).toContain(
      'TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS',
    );
    expect(tableSource).toMatch(
      /\.demo-track-collection-table__resize-guide\s*\{[^}]*z-index:\s*var\(--ui-layer-indicator\);/su,
    );
    expect(tableSource).toMatch(
      /\.demo-track-collection-table__header\s*>\s*\[data-track-column\]\s*\{[^}]*align-self:\s*stretch;[^}]*justify-self:\s*stretch;/su,
    );
  });

  it('clamps pointer growth to flexible space without resizing neighboring columns', () => {
    const onUpdateColumnPreferences = vi.fn();
    const mounted = mountTable({
      columnPreferences: {
        visibleAdvanced: ['release', 'membership', 'releaseYear'],
        widths: { identity: 400, release: 220 },
      },
      onUpdateColumnPreferences,
    });
    const separator = findAll(
      mounted.root,
      (node) => node.props?.['data-resize-column'] === 'identity',
    )[0];
    const listeners = new Map();
    const target = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name),
      getBoundingClientRect: () => ({ left: 394, right: 406, width: 12 }),
    };

    trigger(separator, 'onPointerdown', {
      preventDefault: vi.fn(),
      currentTarget: target,
      clientX: 400,
      pointerId: 4,
    });
    listeners.get('pointermove')({ clientX: 900 });
    listeners.get('pointerup')({});

    expect(onUpdateColumnPreferences).toHaveBeenCalledOnce();
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release', 'membership', 'releaseYear'],
      hiddenDefaultColumns: [],
      widths: {
        identity: 508,
        release: 220,
        membership: 128,
        releaseYear: 96,
      },
    });
    mounted.app.unmount();
  });

  it('derives resize capacity from the rendered header gap and padding', async () => {
    getComputedStyleMock.mockImplementation(() => ({
      columnGap: '12px',
      direction: 'ltr',
      paddingInlineEnd: '20px',
      paddingInlineStart: '20px',
    }));
    const mounted = mountTable({
      columnPreferences: { visibleAdvanced: ['release', 'membership'] },
    });
    await nextTick();
    const separator = findAll(
      mounted.root,
      (node) => node.props?.['data-resize-column'] === 'identity',
    )[0];

    expect(separator.props['aria-valuemax']).toBe(466);
    mounted.app.unmount();
  });

  it('uses stable surface tokens without zebra paint competing with row states', () => {
    expect(tableSource).toMatch(
      /\.demo-track-collection-table__header\s*\{[^}]*background:\s*var\(--ui-folder-page-background,\s*var\(--ui-color-surface\)\);/su,
    );
    expect(tableSource).toMatch(
      /\.demo-track-collection-table__body\s*\{[^}]*background:\s*var\(--ui-color-surface\);/su,
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row\s*\{[^}]*background:\s*var\(--ui-color-surface\);/su,
    );
    expect(rowSource).toContain('background: var(--ui-color-surface-hover);');
    expect(rowSource).toContain(
      'background: var(--ui-track-row-selected-background);',
    );
    expect(rowSource).not.toContain(':nth-child(');
    expect(tableSource).not.toContain('var(--ui-color-surface-raised)');
  });

  it('uses one ResizeObserver-owned layout without changing row height', () => {
    expect(columnOwnerSource).toContain('useTemplateRef');
    expect(columnOwnerSource).toContain('ResizeObserver');
    expect(columnOwnerSource).toContain('resolveTrackCollectionLayout');
    expect(rowSource).toContain(':data-column-priority="column.priority"');
    expect(rowSource).toContain(`v-if="hasColumn('spacer')"`);
    expect(proposalSource).toContain(
      'demo-track-collection-proposal__viewport--minimum',
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row\s*\{[^}]*min-height:\s*var\(--ui-track-row-min-height\);/su,
    );
    expect(rowSource).not.toContain('height: auto');
  });

  it('keeps the specimen status and time as one right-aligned trailing group', () => {
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__duration\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--demo-track-collection-status-slot\)\s+auto;[^}]*gap:\s*var\(--ui-space-4\);[^}]*justify-content:\s*end;/su,
    );
    expect(rowSource).not.toMatch(
      /\.demo-track-collection-row__duration\s*\{[^}]*grid-template-columns:[^}]*minmax\(0,\s*1fr\)/su,
    );
  });

  it('keeps the row hit area active behind content while nested destinations stay independent', () => {
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__identity[^}]*pointer-events:\s*none;/su,
    );
    expect(rowSource).toContain(
      'demo-track-collection-row__semantic--destination',
    );
    expect(rowSource).toContain(
      'demo-track-collection-row__artist--destination',
    );
    expect(rowSource).toMatch(
      /\.demo-track-collection-row__semantic--destination,[^}]*pointer-events:\s*auto;/su,
    );
  });

  it('offers a local 125 percent type-pressure mode without changing global tokens', () => {
    expect(proposalSource).toContain(
      'demo-track-collection-proposal__viewport--type-scale',
    );
    expect(proposalSource).toContain(
      '--ui-type-body-compact-size: calc(var(--ui-font-size-sm) * 1.25)',
    );
    expect(proposalSource).not.toContain('document.documentElement');
  });
});
