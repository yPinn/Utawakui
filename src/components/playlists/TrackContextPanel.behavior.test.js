import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import TrackContextPanel from './TrackContextPanel.vue';
import TrackContextActions from './TrackContextActions.vue';
import TrackArtistPreview from './TrackArtistPreview.vue';
import TrackContextHero from './TrackContextHero.vue';
import TrackLyricsPreview from './TrackLyricsPreview.vue';
import TrackQueuePreview from './TrackQueuePreview.vue';
import AppRightDockHeader from '../layout/AppRightDockHeader.vue';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiChip from '../ui/UiChip.vue';
import UiButton from '../ui/UiButton.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiArtworkOverlay from '../ui/UiArtworkOverlay.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
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
  [TrackContextPanel, './TrackContextPanel.vue'],
  [TrackContextActions, './TrackContextActions.vue'],
  [TrackArtistPreview, './TrackArtistPreview.vue'],
  [TrackContextHero, './TrackContextHero.vue'],
  [TrackLyricsPreview, './TrackLyricsPreview.vue'],
  [TrackQueuePreview, './TrackQueuePreview.vue'],
  [AppRightDockHeader, '../layout/AppRightDockHeader.vue'],
  [AppRightDockPanel, '../layout/AppRightDockPanel.vue'],
  [AppRightDockSection, '../layout/AppRightDockSection.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiArtworkOverlay, '../ui/UiArtworkOverlay.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiScrollLayout, '../ui/UiScrollLayout.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiTrackRow, '../ui/UiTrackRow.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
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

const lyricsPreview = {
  sourceLabel: '手動匯入 / 演出修訂版',
  lines: [
    { id: 'line-1', text: '正在播放的歌詞', active: true },
    { id: 'line-2', text: '接下來的一行', active: false },
  ],
};

const artistSummary = {
  artistId: 'artist-1234567890abcdef',
  name: '真實演出者',
  photoUrl: 'utawakui-media://artist/artist-1234567890abcdef/photo.jpg',
  trackCount: 4,
  albumCount: 2,
  tracks: [currentTrack],
};

const readiness = [
  { id: 'lyrics', label: '歌詞可用', tone: 'success' },
  { id: 'separation', label: '尚無分離素材', tone: 'muted' },
];

function mountPanel(overrides = {}) {
  const onClose = vi.fn();
  const onNavigateSource = vi.fn();
  const onOpenArtist = vi.fn();
  const onOpenLyrics = vi.fn();
  const onOpenQueue = vi.fn();
  const mounted = mount(TrackContextPanel, {
    currentTrack,
    queueSourceName: '深夜練唱清單',
    sourceNavigable: true,
    sourceLinkLabel: '前往播放清單：深夜練唱清單',
    upcomingTracks,
    lyricsPreview,
    artistSummary,
    readiness,
    onClose,
    onNavigateSource,
    onOpenArtist,
    onOpenLyrics,
    onOpenQueue,
    ...overrides,
  });
  return {
    ...mounted,
    onClose,
    onNavigateSource,
    onOpenArtist,
    onOpenLyrics,
    onOpenQueue,
  };
}

describe('TrackContextPanel', () => {
  it('delegates Dock frame geometry to the shared panel and section primitives', () => {
    const source = readFileSync(
      new URL('./TrackContextPanel.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      "import AppRightDockPanel from '../layout/AppRightDockPanel.vue';",
    );
    expect(source).toContain(
      "import AppRightDockSection from '../layout/AppRightDockSection.vue';",
    );
    expect(source).not.toContain('AppRightDockHeader');
    expect(source).not.toContain('UiScrollRegion');
    expect(source).not.toContain('TrackContextBlock');
    expect(source).not.toContain('useStudioLibraryInspectorWidth');
    expect(source).not.toContain('--ui-right-dock-');
  });

  it('lets the shared section body own subgroup spacing instead of stacking child margins', () => {
    const source = readFileSync(
      new URL('./TrackContextPanel.vue', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(
      /\.studio-context-inspector__(?:lyrics-source|collection-cover|readiness)\s*\{[^}]*margin-(?:top|bottom):/su,
    );
  });

  it('prevents accidental selection across passive playback copy', () => {
    const passiveCopySources = [
      './TrackContextPanel.vue',
      './TrackContextHero.vue',
      './TrackLyricsPreview.vue',
      './TrackArtistPreview.vue',
      './TrackQueuePreview.vue',
    ].map((path) => [
      path,
      readFileSync(new URL(path, import.meta.url), 'utf8'),
    ]);

    for (const [path, source] of passiveCopySources) {
      expect(source, path).not.toContain('user-select: text;');
      expect(source, path).toContain('-webkit-user-select: none;');
      expect(source, path).toMatch(/\n\s*user-select:\s*none;/u);
    }
  });

  it('uses the feature Hero for the current identity and Track Row only for queue previews', () => {
    const source = readFileSync(
      new URL('./TrackContextPanel.vue', import.meta.url),
      'utf8',
    );
    const queueSource = readFileSync(
      new URL('./TrackQueuePreview.vue', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('<UiTrackRow');
    expect(queueSource.match(/<UiTrackRow/gu)).toHaveLength(1);
    expect(source).toContain('<TrackQueuePreview');
    expect(source).toContain('<TrackContextHero');
    expect(source).toContain('<TrackContextActions');
    expect(source).toContain(':track="currentTrack"');
    expect(source).not.toMatch(/:tracks="\[currentTrack\]"/u);
    expect(source).toContain('UiCollageThumb');
  });

  it('renders the current identity as an artwork-led Hero with explicit source and More targets', () => {
    const { app, root, onClose, onNavigateSource } = mountPanel();
    const panel = findAll(
      root,
      (node) =>
        node.type === 'section' && node.props['aria-label'] === '播放資訊',
    )[0];
    const hero = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('track-context-hero'),
    )[0];
    const currentThumb = findAll(hero, (node) =>
      String(node.props?.class ?? '').includes('ui-track-thumb'),
    )[0];
    const sourceLink = findAll(
      hero,
      (node) => node.type === 'button' && textContent(node) === '深夜練唱清單',
    )[0];
    const moreAction = findAll(
      hero,
      (node) => node.type === 'button' && textContent(node) === '歌曲選項',
    )[0];
    const close = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '關閉播放資訊',
    )[0];

    expect(panel).toBeTruthy();
    expect(textContent(root)).toContain('深夜練唱清單');
    expect(textContent(root)).toContain('目前播放的歌曲');
    expect(textContent(root)).toContain('真實演出者');
    expect(textContent(root)).toContain('來源專輯');
    expect(textContent(root)).toContain('4:12');
    expect(textContent(root)).toContain('本機 FLAC');
    expect(moreAction).toBeTruthy();
    expect(currentThumb.props.style).toMatchObject({
      width: '100%',
      height: '100%',
    });
    trigger(sourceLink, 'onClick', { stopPropagation: vi.fn() });
    expect(onNavigateSource).toHaveBeenCalledOnce();
    trigger(close, 'onClick');
    expect(onClose).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('renders lyrics as a contained destination with one explicit workspace CTA', () => {
    const { app, root, onOpenLyrics } = mountPanel();
    const lyricsSection = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('track-lyrics-preview'),
    )[0];
    const openLyrics = findAll(
      lyricsSection,
      (node) =>
        node.type === 'button' && textContent(node).includes('開啟歌詞'),
    )[0];

    expect(lyricsSection).toBeTruthy();
    expect(lyricsSection.props.class).toContain(
      'app-right-dock-section--contained',
    );
    expect(textContent(lyricsSection)).toContain('歌詞預覽');
    expect(textContent(lyricsSection)).toContain('正在播放的歌詞');
    expect(textContent(lyricsSection)).toContain('接下來的一行');
    expect(textContent(lyricsSection)).toContain('手動匯入 / 演出修訂版');
    expect(openLyrics.props.class).toContain('ui-btn--secondary');
    trigger(openLyrics, 'onClick');
    expect(onOpenLyrics).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('wraps every non-Hero playback group in contained blocks without dividers', () => {
    const { app, root } = mountPanel({
      collection: {
        name: '深夜練唱清單',
        description: '睡前放鬆用的慢歌',
        coverUrl: '',
        canCollage: true,
        tracks: [],
      },
    });
    const sections = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('app-right-dock-section '),
    );
    const dividers = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'app-right-dock-section__divider',
      ),
    );

    expect(sections).toHaveLength(5);
    expect(
      sections.every((section) =>
        String(section.props.class).includes(
          'app-right-dock-section--contained',
        ),
      ),
    ).toBe(true);
    expect(dividers).toHaveLength(0);
    app.unmount();
  });

  it('renders truthful local artist context with an explicit artist destination', () => {
    const { app, root, onOpenArtist } = mountPanel();
    const artistSection = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('track-artist-preview'),
    )[0];
    const artistCta = findAll(
      artistSection,
      (node) =>
        node.type === 'button' && textContent(node).includes('前往藝人'),
    )[0];
    const photo = findAll(
      artistSection,
      (node) =>
        node.type === 'img' &&
        node.props.src ===
          'utawakui-media://artist/artist-1234567890abcdef/photo.jpg',
    )[0];

    expect(textContent(artistSection)).toContain('藝人');
    expect(textContent(artistSection)).toContain('真實演出者');
    expect(textContent(artistSection)).toContain('本機收錄 4 首 · 2 張專輯');
    expect(photo).toBeTruthy();
    expect(artistCta.props.class).toContain('ui-btn--ghost');
    trigger(artistCta, 'onClick');
    expect(onOpenArtist).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('projects a bounded read-only queue in playback order', () => {
    const longQueue = Array.from({ length: 1000 }, (_, index) => ({
      id: `track-${index + 10}`,
      title: `Queue track ${index + 1}`,
      artist: '演出者',
      duration: 180,
      thumbnailUrl: `utawakui-media://track/${index + 10}/thumbnail.jpg`,
    }));
    const { app, root, onOpenQueue } = mountPanel({
      upcomingTracks: longQueue,
    });
    const items = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'studio-context-inspector__queue-item',
      ),
    );
    const lazyImages = findAll(
      root,
      (node) => node.type === 'img' && node.props.loading === 'lazy',
    );
    const queueButtons = items.flatMap((item) =>
      findAll(item, (node) => node.type === 'button'),
    );
    const queueList = findAll(
      root,
      (node) =>
        node.type === 'ol' && node.props['aria-label']?.includes('共 1000 首'),
    )[0];
    const openQueue = findAll(
      root,
      (node) =>
        node.type === 'button' && textContent(node).includes('開啟佇列'),
    )[0];
    const text = textContent(root);

    expect(items).toHaveLength(3);
    expect(lazyImages).toHaveLength(3);
    expect(queueList).toBeTruthy();
    expect(text).toContain('Queue track 1');
    expect(text).toContain('Queue track 3');
    expect(text).not.toContain('Queue track 4');
    expect(queueButtons).toHaveLength(0);
    trigger(openQueue, 'onClick');
    expect(onOpenQueue).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('omits unavailable optional sections and keeps one truthful empty state', () => {
    const { app, root } = mount(TrackContextPanel, {
      currentTrack: null,
      queueSourceName: '',
      upcomingTracks: [],
    });

    expect(textContent(root)).toContain('目前沒有播放中的歌曲');
    expect(textContent(root)).not.toContain('歌詞預覽');
    expect(textContent(root)).not.toContain('接下來');
    expect(textContent(root)).not.toContain('播放來源');
    expect(
      findAll(root, (node) =>
        String(node.props?.class ?? '').includes(
          'app-right-dock-section--contained',
        ),
      ),
    ).toHaveLength(1);
    app.unmount();
  });

  it('orders truthful sections by playback priority', () => {
    const { app, root } = mountPanel({
      collection: {
        name: '深夜練唱清單',
        description: '睡前放鬆用的慢歌',
        coverUrl: '',
        canCollage: true,
        tracks: [],
      },
    });
    const headings = findAll(root, (node) => node.type === 'h3').map(
      textContent,
    );

    expect(headings).toEqual([
      '歌詞預覽',
      '藝人',
      '接下來',
      '曲目資訊',
      '播放來源',
    ]);
    app.unmount();
  });

  it('shows projected lyric, local artist, and readiness data without unsupported claims', () => {
    const { app, root } = mountPanel();
    const text = textContent(root);

    expect(text).toContain('正在播放的歌詞');
    expect(text).toContain('接下來的一行');
    expect(text).toContain('手動匯入 / 演出修訂版');
    expect(text).toContain('本機收錄 4 首 · 2 張專輯');
    expect(text).toContain('歌詞可用');
    expect(text).toContain('尚無分離素材');
    expect(text).not.toMatch(/追蹤|粉絲|Biography|Follow|製作人|作曲/u);
    app.unmount();
  });

  it('keeps the collection identity fixed and passes through collage policy', () => {
    const { app, root } = mountPanel({
      collection: {
        name: '深夜練唱清單',
        description: '睡前放鬆用的慢歌',
        coverUrl: 'utawakui-media://playlist/list-1/cover.jpg',
        canCollage: true,
        tracks: [],
      },
    });
    const cover = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'studio-context-inspector__collection-cover',
      ),
    )[0];

    expect(textContent(root)).toContain('睡前放鬆用的慢歌');
    expect(cover.props.style).toMatchObject({
      width: '120px',
      height: '120px',
    });
    app.unmount();
  });

  it('does not render a collection section for the general library context', () => {
    const { app, root } = mountPanel({ collection: null });
    const headings = findAll(root, (node) => node.type === 'h3').map(
      textContent,
    );

    expect(headings).not.toContain('播放來源');
    app.unmount();
  });
});
