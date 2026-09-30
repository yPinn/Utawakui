import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import StudioLibraryDossier from './StudioLibraryDossier.vue';
import StudioLibraryDossierHeader from './StudioLibraryDossierHeader.vue';
import StudioLibraryTrackTable from './StudioLibraryTrackTable.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [StudioLibraryDossier, './StudioLibraryDossier.vue'],
  [StudioLibraryDossierHeader, './StudioLibraryDossierHeader.vue'],
  [StudioLibraryTrackTable, './StudioLibraryTrackTable.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiSearchBox, '../ui/UiSearchBox.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const tracks = [
  {
    id: 'track-a',
    title: '第一首歌',
    artist: '真實演出者',
    duration: 181,
    filename: '01-first.flac',
  },
  {
    id: 'track-b',
    title: '第二首歌',
    artist: '另一位演出者',
    duration: 239,
    filename: '02-second.wav',
  },
];

const dossierSource = readFileSync(
  new URL('./StudioLibraryDossier.vue', import.meta.url),
  'utf8',
);
const headerSource = readFileSync(
  new URL('./StudioLibraryDossierHeader.vue', import.meta.url),
  'utf8',
);
const trackTableSource = readFileSync(
  new URL('./StudioLibraryTrackTable.vue', import.meta.url),
  'utf8',
);

function mountAlbum(overrides = {}) {
  return mount(StudioLibraryDossier, {
    collectionType: 'album',
    kindLabel: '本機專輯',
    title: '真實專輯',
    summary: '真實演出者 · 2024 · 2 首曲目 · 7 分',
    description: '從本機曲庫讀取的專輯。',
    tracks,
    currentTrackId: 'track-b',
    ...overrides,
  });
}

function mountPlaylist(overrides = {}) {
  return mount(StudioLibraryDossier, {
    collectionType: 'playlist',
    kindLabel: '本機播放清單',
    title: '練唱順序',
    summary: '2 首曲目 · 7 分',
    description: '使用者建立的播放清單。',
    tracks,
    currentTrackId: 'track-b',
    ...overrides,
  });
}

function classIncludes(node, className) {
  return String(node.props?.class || '')
    .split(/\s+/)
    .includes(className);
}

describe('Studio Library native Controlled Dossier', () => {
  it('keeps folder color at the perimeter and neutral surfaces behind content', () => {
    expect(dossierSource).toContain(
      'background: var(--ui-color-folder-primary);',
    );
    expect(dossierSource).not.toContain('studio-dossier__sheet');
    expect(dossierSource).toMatch(
      /\.studio-dossier__body\s*\{[^}]*background:\s*var\(--ui-color-surface\);/su,
    );
    expect(headerSource).toMatch(
      /\.studio-dossier-header\s*\{[^}]*background:\s*var\(--ui-color-surface\);/su,
    );
  });

  it('keeps review annotations and success semantics outside product-like content', () => {
    const { app, root } = mountAlbum();
    const chips = findAll(root, (node) =>
      String(node.props.class || '')
        .split(/\s+/)
        .includes('ui-chip'),
    );

    expect(chips).toHaveLength(1);
    expect(textContent(chips[0]).trim()).toBe('本機專輯');
    expect(textContent(root)).not.toMatch(/唯讀接入|遷移切面|真實資料/u);
    expect(dossierSource).not.toContain('<UiNotice');
    expect(headerSource).not.toContain('tone="success"');
    expect(headerSource).not.toContain('background=');
    app.unmount();
  });

  it('renders a source-backed album with playable rows and distinguishes current playback', () => {
    const { app, root } = mountAlbum();

    expect(textContent(root)).toContain('本機專輯');
    expect(textContent(root)).toContain('真實專輯');
    expect(textContent(root)).toContain('第一首歌');
    expect(textContent(root)).toContain('第二首歌');
    const list = findAll(root, (node) => node.props.role === 'list')[0];
    const rows = findAll(root, (node) => node.props.role === 'listitem');
    expect(list.props['aria-label']).toBe('真實專輯曲目');
    expect(rows).toHaveLength(2);
    expect(rows[1].props['aria-current']).toBe('true');
    expect(rows.every((row) => row.props.tabindex === undefined)).toBe(true);
    const rowActions = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        String(node.props?.['aria-label'] || '').startsWith('選取：'),
    );
    expect(rowActions).toHaveLength(2);
    expect(rowActions.every((button) => button.props.type === 'button')).toBe(
      true,
    );
    expect(rowActions.every((button) => button.props.onKeydown)).toBe(true);
    app.unmount();
  });

  it('composes the shared Button for a retry without redrawing an action control', () => {
    const onRetry = vi.fn();
    const { app, root } = mountAlbum({
      errorMessage: '暫時無法讀取',
      onRetry,
    });
    const button = findAll(root, (node) => node.type === 'button')[0];

    expect(String(button.props.class)).toContain('ui-btn');
    expect(textContent(button)).toContain('重新整理');
    trigger(button, 'onClick');
    expect(onRetry).toHaveBeenCalledOnce();
    expect(dossierSource).not.toMatch(/<button[\s>]/u);
    app.unmount();
  });

  it('does not remap shared semantic text and border aliases from folder color', () => {
    expect(dossierSource).not.toMatch(/--ui-color-text-muted\s*:/u);
    expect(dossierSource).not.toMatch(/--ui-color-text-subtle\s*:/u);
    expect(dossierSource).not.toMatch(/--ui-color-border\s*:/u);
  });

  it('treats track identity as CTA chrome while leaving document data selectable', () => {
    expect(dossierSource).not.toMatch(
      /\.studio-dossier\s*\{[^}]*user-select:\s*none;/su,
    );
    expect(headerSource).toMatch(
      /\.studio-dossier-header__kind\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(headerSource).toMatch(
      /\.studio-dossier-header__title,[\s\S]*?\.studio-dossier-header__description\s*\{[^}]*user-select:\s*text;/u,
    );
    expect(trackTableSource).toMatch(
      /\.studio-track-table__header\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(trackTableSource).toMatch(
      /\.studio-track-row\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(trackTableSource).not.toMatch(
      /\.studio-track-row__copy\s*\{[^}]*user-select:\s*text;/su,
    );
    expect(trackTableSource).not.toContain('::selection');
    expect(trackTableSource).toMatch(
      /\.studio-track-row__index,[\s\S]*?\.studio-track-row__identity,[\s\S]*?pointer-events:\s*none;/u,
    );
    expect(dossierSource).toMatch(
      /\.studio-dossier__state\s+(?:strong|span),?[\s\S]*?user-select:\s*text;/u,
    );
    expect(dossierSource).toMatch(
      /\.studio-dossier__retry\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(dossierSource).toMatch(
      /\.studio-dossier__toolbar\s+:deep\(\.ui-search-box__input\)\s*\{[^}]*user-select:\s*text;/su,
    );
  });

  it('uses compact type roles and keeps selected separate from current', () => {
    expect(trackTableSource).toMatch(
      /\.studio-track-row__copy strong\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(trackTableSource).toMatch(
      /\.studio-track-row__copy small\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(trackTableSource).not.toMatch(
      /\.studio-track-row--current\s*\{[^}]*background:/su,
    );
    expect(trackTableSource).not.toContain('--ui-color-current-soft');
    expect(trackTableSource).toMatch(
      /\.studio-track-row--selected\s*\{[^}]*background:\s*var\(--ui-playlist-row-selected-background\);[^}]*box-shadow:/su,
    );
    expect(trackTableSource).toMatch(
      /\.studio-track-row--current \.studio-track-row__index,[\s\S]*?\.studio-track-row--current \.studio-track-row__copy strong\s*\{[^}]*color:\s*var\(--ui-color-current\);/u,
    );

    const { app, root } = mountAlbum({ selectedTrackId: 'track-a' });
    const rows = findAll(root, (node) => node.props.role === 'listitem');
    const actions = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        String(node.props?.['aria-label'] || '').startsWith('選取：'),
    );
    expect(classIncludes(rows[0], 'studio-track-row--selected')).toBe(true);
    expect(classIncludes(rows[0], 'studio-track-row--current')).toBe(false);
    expect(classIncludes(rows[1], 'studio-track-row--selected')).toBe(false);
    expect(classIncludes(rows[1], 'studio-track-row--current')).toBe(true);
    expect(actions[0].props['aria-pressed']).toBe(true);
    expect(actions[1].props['aria-pressed']).toBe(false);
    app.unmount();
  });

  it('filters locally without changing the supplied collection', async () => {
    const { app, root } = mountAlbum();
    const input = findAll(root, (node) => node.type === 'input')[0];

    trigger(input, 'onInput', { target: { value: '另一位' } });
    await nextTick();

    expect(textContent(root)).not.toContain('第一首歌');
    expect(textContent(root)).toContain('第二首歌');
    expect(tracks).toHaveLength(2);
    app.unmount();
  });

  it('sorts playlist rows locally through the shared playlist sort contract', async () => {
    const unsortedTracks = [
      { ...tracks[0], title: 'B track' },
      { ...tracks[1], title: 'A track' },
    ];
    const { app, root } = mountPlaylist({ tracks: unsortedTracks });
    const titleSort = findAll(
      root,
      (node) => node.props?.['aria-label'] === '曲目排序',
    )[0];

    expect(titleSort).toBeDefined();
    trigger(titleSort, 'onClick');
    await nextTick();

    const sortedText = textContent(root);
    expect(sortedText.indexOf('A track')).toBeLessThan(
      sortedText.indexOf('B track'),
    );
    expect(titleSort.props['aria-label']).toBe('曲目升冪排序');
    expect(unsortedTracks.map((track) => track.title)).toEqual([
      'B track',
      'A track',
    ]);
    app.unmount();
  });

  it('selects on one click and activates on double click with the visible queue order', async () => {
    const unsortedTracks = [
      { ...tracks[0], title: 'B track' },
      { ...tracks[1], title: 'A track' },
    ];
    const onSelectTrack = vi.fn();
    const onActivateTrack = vi.fn();
    const { app, root } = mountPlaylist({
      tracks: unsortedTracks,
      onSelectTrack,
      onActivateTrack,
    });
    const titleSort = findAll(
      root,
      (node) => node.props?.['aria-label'] === '曲目排序',
    )[0];

    trigger(titleSort, 'onClick');
    await nextTick();

    const firstVisibleAction = findAll(
      root,
      (node) => node.props?.['aria-label'] === '選取：A track',
    )[0];
    trigger(firstVisibleAction, 'onClick', { stopPropagation: vi.fn() });

    expect(onSelectTrack).toHaveBeenCalledOnce();
    expect(onSelectTrack.mock.calls[0][0].id).toBe('track-b');
    expect(onActivateTrack).not.toHaveBeenCalled();

    trigger(firstVisibleAction, 'onDblclick', {
      stopPropagation: vi.fn(),
    });
    expect(onActivateTrack).toHaveBeenCalledOnce();
    expect(onActivateTrack.mock.calls[0][0].id).toBe('track-b');
    expect(onActivateTrack.mock.calls[0][1].map(({ id }) => id)).toEqual([
      'track-b',
      'track-a',
    ]);
    app.unmount();
  });

  it('provides Space selection and Enter activation without selectable identity text', () => {
    const onSelectTrack = vi.fn();
    const onActivateTrack = vi.fn();
    const { app, root } = mountPlaylist({
      onSelectTrack,
      onActivateTrack,
    });
    const action = findAll(
      root,
      (node) => node.props?.['aria-label'] === '選取：第一首歌',
    )[0];
    const preventSpace = vi.fn();
    const preventEnter = vi.fn();

    trigger(action, 'onKeydown', {
      key: ' ',
      preventDefault: preventSpace,
      stopPropagation: vi.fn(),
    });
    expect(onSelectTrack).toHaveBeenCalledOnce();
    expect(onActivateTrack).not.toHaveBeenCalled();

    trigger(action, 'onKeydown', {
      key: 'Enter',
      preventDefault: preventEnter,
      stopPropagation: vi.fn(),
    });
    expect(onActivateTrack).toHaveBeenCalledOnce();
    expect(onActivateTrack.mock.calls[0][0].id).toBe('track-a');
    expect(preventSpace).toHaveBeenCalledOnce();
    expect(preventEnter).toHaveBeenCalledOnce();
    expect(trackTableSource).not.toContain('activateFromRowContent');
    app.unmount();
  });

  it('reorders a playlist directly from its handle and reveals reset only after a change', async () => {
    const sourceTracks = [...tracks];
    const onSelectTrack = vi.fn();
    const onActivateTrack = vi.fn();
    const { app, root } = mountPlaylist({
      tracks: sourceTracks,
      onSelectTrack,
      onActivateTrack,
    });
    const firstHandle = findAll(
      root,
      (node) =>
        node.type === 'button' && textContent(node) === '調整順序：第一首歌',
    )[0];

    expect(firstHandle).toBeDefined();
    expect(firstHandle.props.disabled).toBe(false);
    expect(textContent(root)).not.toContain('編輯順序');
    expect(textContent(root)).not.toContain('還原順序');
    trigger(firstHandle, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await nextTick();

    const reorderedText = textContent(root);
    expect(reorderedText.indexOf('第二首歌')).toBeLessThan(
      reorderedText.indexOf('第一首歌'),
    );
    expect(reorderedText).toContain('還原順序');
    expect(sourceTracks.map((track) => track.id)).toEqual([
      'track-a',
      'track-b',
    ]);
    expect(onSelectTrack).not.toHaveBeenCalled();
    expect(onActivateTrack).not.toHaveBeenCalled();
    expect(dossierSource).not.toMatch(
      /usePlaylists|window\.Utawakui|setTracks/u,
    );
    app.unmount();
  });

  it('keeps playlist handles present but disabled while sorted or filtered', async () => {
    const { app, root } = mountPlaylist();
    const titleSort = findAll(
      root,
      (node) => node.props?.['aria-label'] === '曲目排序',
    )[0];
    const input = findAll(root, (node) => node.type === 'input')[0];

    trigger(titleSort, 'onClick');
    await nextTick();
    let handles = findAll(
      root,
      (node) =>
        node.type === 'button' && textContent(node).startsWith('調整順序：'),
    );
    expect(handles).toHaveLength(2);
    expect(handles.every((handle) => handle.props.disabled)).toBe(true);

    trigger(titleSort, 'onClick');
    trigger(titleSort, 'onClick');
    trigger(input, 'onInput', { target: { value: '第一首' } });
    await nextTick();
    handles = findAll(
      root,
      (node) =>
        node.type === 'button' && textContent(node).startsWith('調整順序：'),
    );
    expect(handles).toHaveLength(1);
    expect(handles[0].props.disabled).toBe(true);
    app.unmount();
  });

  it('keeps source-backed albums out of playlist order editing', () => {
    const { app, root } = mountAlbum();

    expect(textContent(root)).not.toContain('編輯順序');
    expect(
      findAll(
        root,
        (node) =>
          node.type === 'button' && textContent(node).startsWith('調整順序：'),
      ),
    ).toHaveLength(0);
    app.unmount();
  });

  it('shows explicit empty and search-empty states', async () => {
    const empty = mountAlbum({ tracks: [] });
    expect(textContent(empty.root)).toContain('這個專輯還沒有曲目');
    empty.app.unmount();

    const filtered = mountAlbum();
    const input = findAll(filtered.root, (node) => node.type === 'input')[0];
    trigger(input, 'onInput', { target: { value: '不存在' } });
    await nextTick();
    expect(textContent(filtered.root)).toContain('找不到符合條件的曲目');
    filtered.app.unmount();
  });

  it('preserves multilingual identity text inside bounded row lanes', () => {
    const title =
      '深夜歌回長標題 — Midnight Session عنوان تجريبي かな 한글無斷點測試';
    const artist = '演出者 Artist アーティスト 아티스트 الفنان';
    const { app, root } = mountAlbum({
      tracks: [
        {
          id: 'multilingual-track',
          title,
          artist,
          duration: 367,
          filename: `${'very-long-unbroken-'.repeat(8)}source.flac`,
        },
      ],
    });

    expect(textContent(root)).toContain(title);
    expect(textContent(root)).toContain(artist);
    expect(trackTableSource).toMatch(
      /\.studio-track-row__copy strong,[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/u,
    );
    expect(trackTableSource).toContain('@container dossier (max-width: 45rem)');
    expect(trackTableSource).toContain('@container dossier (max-width: 34rem)');
    app.unmount();
  });
});
