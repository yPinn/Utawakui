import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  INSPECTOR_WIDTH_MAX,
  INSPECTOR_WIDTH_MIN,
  useStudioLibraryInspectorWidth,
} from '../../composables/useStudioLibraryInspectorWidth.js';
import StudioLibraryContextInspector from './StudioLibraryContextInspector.vue';
import AppRightDockHeader from '../layout/AppRightDockHeader.vue';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [StudioLibraryContextInspector, './StudioLibraryContextInspector.vue'],
  [AppRightDockHeader, '../layout/AppRightDockHeader.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const currentTrack = {
  id: 'track-1',
  title: '目前播放的歌曲',
  artist: '真實演出者',
  album: '來源專輯',
  duration: 252,
  filename: '01-current.flac',
  thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
};

const upcomingTracks = [
  {
    id: 'track-2',
    title: '下一首歌曲',
    artist: '演出者二',
    duration: 181,
    filename: '02-next.wav',
  },
  {
    id: 'track-3',
    title: 'その次の曲',
    artist: '演出者三',
    duration: 239,
    filename: '03-after.webm',
  },
];

function mountInspector(overrides = {}) {
  const onClose = vi.fn();
  const mounted = mount(StudioLibraryContextInspector, {
    currentTrack,
    queueSourceName: '深夜練唱清單',
    upcomingTracks,
    onClose,
    ...overrides,
  });
  return { ...mounted, onClose };
}

describe('Studio Library Context Inspector', () => {
  it('shows current-track metadata from the playback context without repeating playlist facts', () => {
    const { app, root, onClose } = mountInspector();
    const section = findAll(root, (node) => node.type === 'section')[0];
    const close = findAll(
      root,
      (node) => node.props['aria-label'] === '關閉播放資訊',
    )[0];
    const artwork = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'studio-context-inspector__current-artwork',
      ),
    )[0];
    const renderedArtwork = findAll(
      root,
      (node) =>
        node.type === 'span' &&
        String(node.props?.class ?? '').includes('ui-track-thumb'),
    )[0];
    const currentStatus = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-status-icon'),
    )[0];

    expect(section.props['aria-label']).toBe('播放資訊');
    expect(textContent(root)).toContain('深夜練唱清單');
    expect(textContent(root)).toContain('目前播放的歌曲');
    expect(textContent(root)).toContain('真實演出者');
    expect(textContent(root)).toContain('來源專輯');
    expect(textContent(root)).toContain('4:12');
    expect(textContent(root)).toContain('本機 FLAC');
    expect(textContent(root)).not.toMatch(
      /檔案摘要|曲目\s*12 首|總長|集合類型/u,
    );
    expect(artwork).toBeTruthy();
    expect(renderedArtwork.props.style).toMatchObject({
      width: 'var(--ui-track-artwork-size-preview)',
      height: 'var(--ui-track-artwork-size-preview)',
    });
    expect(String(close.props.class)).toContain('ui-icon-btn');
    expect(String(close.props.class)).toContain('app-right-dock-header__close');
    expect(currentStatus.props['aria-hidden']).toBe('true');
    expect(currentStatus.props['aria-label']).toBeUndefined();
    trigger(close, 'onClick');
    expect(onClose).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('projects the upcoming queue in playback order without adding queue-management controls', () => {
    const { app, root } = mountInspector();
    const text = textContent(root);
    const firstIndex = text.indexOf('下一首歌曲');
    const secondIndex = text.indexOf('その次の曲');
    const queueList = findAll(
      root,
      (node) => node.props?.['aria-label'] === '接下來的播放佇列',
    )[0];
    const buttons = findAll(root, (node) => node.type === 'button');

    expect(queueList).toBeDefined();
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(text).toContain('接下來');
    expect(text).toContain('2 首');
    // Duration merges into the artist line instead of a separate column —
    // no per-item index number either, since position is already implied
    // by list order in this glance panel, not a reorderable track table.
    expect(text).toContain('演出者二 · 3:01');
    expect(text).toContain('演出者三 · 3:59');
    // The content layer owns only its close action. Shared fold/resize chrome
    // belongs to AppRightDock, and queue rows remain read-only here.
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props['aria-label']).toBe('關閉播放資訊');
    app.unmount();
  });

  it('bounds the metadata preview while preserving the full queue count', () => {
    const longQueue = Array.from({ length: 1000 }, (_, index) => ({
      id: `track-${index + 10}`,
      title: `Queue track ${index + 1}`,
      artist: '演出者',
      duration: 180,
      thumbnailUrl: `utawakui-media://track/${index + 10}/thumbnail.jpg`,
    }));
    const { app, root } = mountInspector({ upcomingTracks: longQueue });
    const items = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'studio-context-inspector__queue-item',
      ),
    );
    const lazyImages = findAll(
      root,
      (node) => node.type === 'img' && node.props.loading === 'lazy',
    );
    const text = textContent(root);

    expect(items).toHaveLength(3);
    expect(lazyImages).toHaveLength(3);
    expect(lazyImages.every((image) => image.props.decoding === 'async')).toBe(
      true,
    );
    expect(text).toContain('1000 首');
    expect(text).toContain('Queue track 1');
    expect(text).toContain('Queue track 3');
    expect(text).not.toContain('Queue track 4');
    app.unmount();
  });

  it('shows independent empty states when playback or the upcoming queue is absent', () => {
    const { app, root } = mount(StudioLibraryContextInspector, {
      currentTrack: null,
      queueSourceName: '',
      upcomingTracks: [],
    });

    expect(textContent(root)).toContain('目前沒有播放中的歌曲');
    expect(textContent(root)).toContain('佇列中沒有下一首');
    expect(textContent(root)).not.toContain('集合資料');
    app.unmount();
  });

  it('keeps queue chrome protected while current and upcoming metadata remain selectable', () => {
    const source = readFileSync(
      new URL('./StudioLibraryContextInspector.vue', import.meta.url),
      'utf8',
    );
    const headerSource = readFileSync(
      new URL('../layout/AppRightDockHeader.vue', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(
      /\.studio-context-inspector__section-heading\s+:deep\(\.ui-chip\)\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(source).not.toMatch(
      /\.studio-context-inspector\s*\{[^}]*user-select:\s*none;/su,
    );
    expect(headerSource).toMatch(
      /\.app-right-dock-header p\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/su,
    );
    expect(source).toMatch(
      /\.studio-context-inspector__current-copy,[\s\S]*?\.studio-context-inspector__queue-copy\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/u,
    );
    expect(source).toMatch(
      /\.studio-context-inspector__section\s+:deep\(\.ui-hint\)\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/su,
    );
    expect(headerSource).toMatch(
      /\.app-right-dock-header h2\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(source).toMatch(
      /\.studio-context-inspector__section h3,[\s\S]*?\.studio-context-inspector__section dt\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/u,
    );
    // UiCollageThumb is the collection-level cover (matches the same
    // component SetlistPlaylistHeader.vue/StudioLibraryDossierHeader.vue use
    // for "what does this playlist look like"); per-track artwork in the
    // current-track and queue sections stays UiTrackThumb — a single track
    // is never rendered as a collage of itself.
    expect(source).toContain('UiCollageThumb');
    expect(source).toContain('UiTrackThumb');
    // Queue items are a thumbnail + stacked title/artist tile (matching the
    // current-track pattern), not a table row — no dedicated index or
    // duration column competing with the flexible title/artist column.
    expect(source).not.toContain('queue-index');
    expect(source).not.toContain('queue-duration');
  });

  it('shows the source playlist as a cover, name, and description card', () => {
    const { app, root } = mountInspector({
      collection: {
        name: '深夜練唱清單',
        description: '睡前放鬆用的慢歌',
        coverUrl: 'utawakui-media://playlist/list-1/cover.jpg',
        canCollage: true,
        tracks: [],
      },
    });
    const heading = findAll(
      root,
      (node) => node.props?.id === 'studio-context-collection-heading',
    )[0];
    const cover = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-collage-thumb'),
    )[0];

    expect(textContent(heading)).toBe('深夜練唱清單');
    expect(textContent(root)).toContain('睡前放鬆用的慢歌');
    // Panel opens at the max of its 224–280 draggable range, so the cover
    // opens at its own range's max (120px) too.
    expect(cover.props.style).toMatchObject({
      width: '120px',
      height: '120px',
    });
    app.unmount();
  });

  it("scales the collection cover with the panel's own draggable width", () => {
    const inspectorWidth = useStudioLibraryInspectorWidth();
    const originalWidth = inspectorWidth.width.value;
    const collection = {
      name: '深夜練唱清單',
      description: '',
      coverUrl: '',
      canCollage: true,
      tracks: [],
    };

    inspectorWidth.width.value = INSPECTOR_WIDTH_MIN;
    const atMin = mountInspector({ collection });
    const coverAtMin = findAll(atMin.root, (node) =>
      String(node.props?.class ?? '').includes('ui-collage-thumb'),
    )[0];
    expect(coverAtMin.props.style).toMatchObject({
      width: '88px',
      height: '88px',
    });
    atMin.app.unmount();

    inspectorWidth.width.value = INSPECTOR_WIDTH_MAX;
    const atMax = mountInspector({ collection });
    const coverAtMax = findAll(atMax.root, (node) =>
      String(node.props?.class ?? '').includes('ui-collage-thumb'),
    )[0];
    expect(coverAtMax.props.style).toMatchObject({
      width: '120px',
      height: '120px',
    });
    atMax.app.unmount();

    inspectorWidth.width.value = originalWidth;
  });

  it('passes canCollage through to the cover (album sources never collage)', () => {
    const { app, root } = mountInspector({
      collection: {
        name: 'AIR·艾熱',
        description: '',
        coverUrl: '',
        canCollage: false,
        tracks: [
          {
            id: 'track-1',
            thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
          },
        ],
      },
    });
    const cover = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-collage-thumb'),
    )[0];

    // canCollage:false + no coverUrl falls back to a single-track image, not
    // a 4-tile grid — confirmed indirectly here by the absence of the
    // folder-empty class collage mode uses when it has no artwork at all.
    expect(String(cover.props.class)).not.toContain('ui-collage-thumb--folder');
    app.unmount();
  });

  it('omits the collection card entirely when playing from the general library view', () => {
    const { app, root } = mountInspector({ collection: null });
    const heading = findAll(
      root,
      (node) => node.props?.id === 'studio-context-collection-heading',
    )[0];

    expect(heading).toBeUndefined();
    app.unmount();
  });

  it('renders as feature content while AppRightDock owns the aside surface', () => {
    const { app, root } = mountInspector();
    const section = findAll(
      root,
      (node) =>
        node.type === 'section' && node.props['aria-label'] === '播放資訊',
    )[0];

    expect(section).toBeTruthy();
    expect(String(section.props.class)).toContain('studio-context-inspector');
    expect(String(section.props.class)).not.toContain('ui-surface');
    app.unmount();
  });
});
