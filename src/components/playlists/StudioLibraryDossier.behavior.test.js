import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import StudioLibraryDossier from './StudioLibraryDossier.vue';
import StudioLibraryDossierHeader from './StudioLibraryDossierHeader.vue';
import StudioLibraryTrackTable from './StudioLibraryTrackTable.vue';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
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
  [UiChip, '../ui/UiChip.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiSearchBox, '../ui/UiSearchBox.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
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

describe('Studio Library native Controlled Dossier', () => {
  it('uses one distinctive base color across the dossier header and body', () => {
    expect(dossierSource).toContain(
      'background: var(--ui-color-folder-primary);',
    );
    expect(dossierSource).not.toContain('studio-dossier__sheet');
    expect(dossierSource).toMatch(
      /\.studio-dossier__body\s*\{[^}]*background:\s*transparent;/su,
    );
    expect(headerSource).toMatch(
      /\.studio-dossier-header\s*\{[^}]*background:\s*transparent;/su,
    );
  });

  it('uses shared notice and chip contracts for aligned icon-label groups', () => {
    const { app, root } = mountAlbum();
    const notices = findAll(root, (node) =>
      String(node.props.class || '')
        .split(/\s+/)
        .includes('ui-notice'),
    );
    const chips = findAll(root, (node) =>
      String(node.props.class || '')
        .split(/\s+/)
        .includes('ui-chip'),
    );

    expect(notices).toHaveLength(1);
    expect(notices[0].props.role).toBe('status');
    expect(textContent(notices[0])).toContain('遷移切面');
    expect(chips).toHaveLength(2);
    expect(chips.map((chip) => textContent(chip).trim())).toEqual([
      '本機專輯',
      '真實資料',
    ]);
    app.unmount();
  });

  it('renders a real album read-only and distinguishes current playback', () => {
    const { app, root } = mountAlbum();

    expect(textContent(root)).toContain('本機專輯');
    expect(textContent(root)).toContain('真實專輯');
    expect(textContent(root)).toContain('第一首歌');
    expect(textContent(root)).toContain('第二首歌');
    expect(textContent(root)).toContain('資料來自目前的本機曲庫');

    const list = findAll(root, (node) => node.props.role === 'list')[0];
    const rows = findAll(root, (node) => node.props.role === 'listitem');
    expect(list.props['aria-label']).toBe('真實專輯曲目');
    expect(rows).toHaveLength(2);
    expect(rows[1].props['aria-current']).toBe('true');
    expect(rows.every((row) => row.props.tabindex === undefined)).toBe(true);
    expect(findAll(root, (node) => node.props.role === 'button')).toHaveLength(
      0,
    );
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
});
