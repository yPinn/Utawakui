import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import SetlistPlaylistTable from './SetlistPlaylistTable.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [SetlistPlaylistTable, './SetlistPlaylistTable.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
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

const tracks = [
  {
    id: 'track-a',
    title: '第一首歌',
    artist: '演出者 A',
    duration: 181,
  },
  {
    id: 'track-b',
    title: '第二首歌',
    artist: '演出者 B',
    duration: 239,
  },
];

const entries = tracks.map((track, visibleIndex) => ({
  track,
  visibleIndex,
  addedAt: `2026-10-0${visibleIndex + 1}T00:00:00.000Z`,
}));

const source = readFileSync(
  new URL('./SetlistPlaylistTable.vue', import.meta.url),
  'utf8',
);

function classIncludes(node, className) {
  return String(node.props?.class ?? '')
    .split(/\s+/u)
    .includes(className);
}

function mountTable(overrides = {}) {
  return mount(SetlistPlaylistTable, {
    entries,
    sort: { key: null, direction: 'asc' },
    selectedTrackId: 'track-a',
    currentTrackId: 'track-b',
    jumpableTrackIds: new Set(['track-a']),
    ...overrides,
  });
}

describe('SetlistPlaylistTable selection and activation', () => {
  it('keeps selected and current as independent row states', () => {
    const { app, root } = mountTable();
    const rows = findAll(root, (node) => classIncludes(node, 'playlist-track'));
    const actions = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        String(node.props?.['aria-label'] ?? '').startsWith('選取：'),
    );

    expect(rows).toHaveLength(2);
    expect(classIncludes(rows[0], 'playlist-track--selected')).toBe(true);
    expect(classIncludes(rows[0], 'playlist-track--current')).toBe(false);
    expect(classIncludes(rows[1], 'playlist-track--selected')).toBe(false);
    expect(classIncludes(rows[1], 'playlist-track--current')).toBe(true);
    expect(rows[0].props['aria-current']).toBeUndefined();
    expect(rows[1].props['aria-current']).toBe('true');
    expect(actions[0].props['aria-pressed']).toBe(true);
    expect(actions[1].props['aria-pressed']).toBe(false);
    expect(actions[0].props['aria-description']).toBe(
      '單擊或空白鍵選取；雙擊或 Enter 播放',
    );
    app.unmount();
  });

  it('selects on click or Space and activates on double click or Enter', () => {
    const onSelectTrack = vi.fn();
    const onActivateTrack = vi.fn();
    const { app, root } = mountTable({ onSelectTrack, onActivateTrack });
    const action = findAll(
      root,
      (node) => node.props?.['aria-label'] === '選取：第一首歌',
    )[0];
    const preventSpace = vi.fn();
    const preventEnter = vi.fn();

    trigger(action, 'onClick', { stopPropagation: vi.fn() });
    expect(onSelectTrack).toHaveBeenCalledOnce();
    expect(onActivateTrack).not.toHaveBeenCalled();

    trigger(action, 'onDblclick', { stopPropagation: vi.fn() });
    expect(onActivateTrack).toHaveBeenCalledOnce();

    trigger(action, 'onKeydown', {
      key: ' ',
      preventDefault: preventSpace,
      stopPropagation: vi.fn(),
    });
    trigger(action, 'onKeydown', {
      key: 'Enter',
      preventDefault: preventEnter,
      stopPropagation: vi.fn(),
    });

    expect(onSelectTrack).toHaveBeenCalledTimes(2);
    expect(onActivateTrack).toHaveBeenCalledTimes(2);
    expect(preventSpace).toHaveBeenCalledOnce();
    expect(preventEnter).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('keeps the album-title destination outside row selection and playback', () => {
    const onSelectTrack = vi.fn();
    const onActivateTrack = vi.fn();
    const onTitleClick = vi.fn();
    const { app, root } = mountTable({
      onSelectTrack,
      onActivateTrack,
      onTitleClick,
    });
    const title = findAll(
      root,
      (node) => node.props?.['aria-label'] === '前往專輯：第一首歌',
    )[0];
    const stopPropagation = vi.fn();

    trigger(title, 'onClick', { stopPropagation });
    trigger(title, 'onDblclick', { stopPropagation });

    expect(onTitleClick).toHaveBeenCalledOnce();
    expect(onSelectTrack).not.toHaveBeenCalled();
    expect(onActivateTrack).not.toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('only lets real album and artist destinations intercept the row action hit area', () => {
    expect(source).toContain('playlist-track__title--destination');
    expect(source).toMatch(
      /\.playlist-track__title--destination,\s*\.playlist-track__subtitle :deep\(\.track-artist-credits__link\)\s*\{[^}]*pointer-events:\s*auto;/su,
    );
    expect(source).not.toMatch(
      /\.playlist-track__title\s*\{[^}]*pointer-events:\s*auto;/su,
    );
  });

  it('only lets an available drag handle intercept row selection', () => {
    expect(source).toContain("'playlist-track__drag--interactive': canDrag");
    expect(source).toMatch(
      /\.playlist-track__drag\s*\{[^}]*pointer-events:\s*none;/su,
    );
    expect(source).toMatch(
      /\.playlist-track__drag--interactive\s*\{[^}]*pointer-events:\s*auto;/su,
    );
  });

  it('removes the empty drag track from the album layout without changing row behavior', () => {
    expect(source).toContain("'playlist-table--album': isAlbum");
    expect(source).toContain(
      ":aria-label=\"label || (isAlbum ? '專輯曲目' : '播放清單曲目')\"",
    );
    expect(source).toMatch(
      /\.playlist-table--album \.playlist-table__head,[\s\S]*?\.playlist-table--album \.playlist-track\s*\{[^}]*grid-template-columns:\s*3ch minmax\(0, 2fr\) minmax\(120px, 1fr\) 64px;/u,
    );
    expect(source).toMatch(
      /\.playlist-table--album \.playlist-table__drag,[\s\S]*?\.playlist-table--album \.playlist-track__drag\s*\{[^}]*display:\s*none;/u,
    );
    expect(source).toContain("emit('selectTrack', track)");
    expect(source).toContain("emit('activateTrack', track)");
    expect(source).toContain("emit('toggleSort', column.key)");
  });

  it('omits the artist line entirely on artist pages, including collaborations', () => {
    const viewSource = readFileSync(
      new URL('../../views/SetlistView.vue', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(
      /<TrackArtistCredits\s+v-if="track\.artist && !hideArtist"\s+class="playlist-track__subtitle"\s+:track="track"\s*\/>/u,
    );
    expect(source).toContain('hideArtist: { type: Boolean, default: false }');
    expect(viewSource).toContain(':hide-artist="isArtistSelected"');
  });

  it('keeps thumbnails but hides the drag handle on read-only reference lists', () => {
    const { app, root } = mountTable({ readOnly: true, label: '藝人曲目' });
    const table = findAll(root, (node) =>
      classIncludes(node, 'playlist-table'),
    );
    const drags = findAll(root, (node) =>
      classIncludes(node, 'playlist-track__drag'),
    );
    const thumbs = findAll(root, (node) =>
      classIncludes(node, 'playlist-track__thumb'),
    );

    expect(table[0].props['aria-label']).toBe('藝人曲目');
    expect(drags).toHaveLength(2);
    expect(drags.every((node) => node.props.title === undefined)).toBe(true);
    expect(thumbs).toHaveLength(2);
    expect(source).toContain('v-if="!isAlbum && !readOnly"');
    app.unmount();

    const playlist = mountTable();
    const playlistDrags = findAll(playlist.root, (node) =>
      classIncludes(node, 'playlist-track__drag'),
    );
    expect(playlistDrags.every((node) => node.props.title === '拖曳排序')).toBe(
      true,
    );
    playlist.app.unmount();
  });
});
