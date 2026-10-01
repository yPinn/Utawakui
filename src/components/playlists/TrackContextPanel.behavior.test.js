import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import TrackContextPanel from './TrackContextPanel.vue';
import AppRightDockHeader from '../layout/AppRightDockHeader.vue';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
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
  [AppRightDockHeader, '../layout/AppRightDockHeader.vue'],
  [AppRightDockPanel, '../layout/AppRightDockPanel.vue'],
  [AppRightDockSection, '../layout/AppRightDockSection.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
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
  name: '真實演出者',
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
  const mounted = mount(TrackContextPanel, {
    currentTrack,
    queueSourceName: '深夜練唱清單',
    upcomingTracks,
    lyricsPreview,
    artistSummary,
    readiness,
    onClose,
    ...overrides,
  });
  return { ...mounted, onClose };
}

describe('TrackContextPanel', () => {
  it('delegates Dock frame geometry and uses the shared flat section recipe', () => {
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

  it('uses Track Row for single-track identities and Collage Thumb only for grouped identities', () => {
    const source = readFileSync(
      new URL('./TrackContextPanel.vue', import.meta.url),
      'utf8',
    );

    expect(source.match(/<UiTrackRow/gu)).toHaveLength(2);
    expect(source).toMatch(
      /heading="目前播放"[\s\S]*?<UiTrackRow[\s\S]*?:track="currentTrack"/u,
    );
    expect(source).not.toMatch(/:tracks="\[currentTrack\]"/u);
    expect(source).toContain('UiCollageThumb');
  });

  it('renders current metadata through the fixed 52/40 Dock row recipe', () => {
    const { app, root, onClose } = mountPanel();
    const panel = findAll(
      root,
      (node) =>
        node.type === 'section' && node.props['aria-label'] === '播放資訊',
    )[0];
    const currentRow = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-track--current'),
    )[0];
    const currentThumb = findAll(currentRow, (node) =>
      String(node.props?.class ?? '').includes('ui-track-thumb'),
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
    expect(currentThumb.props.style).toMatchObject({
      width: 'var(--ui-track-row-thumb-size)',
      height: 'var(--ui-track-row-thumb-size)',
    });
    trigger(close, 'onClick');
    expect(onClose).toHaveBeenCalledOnce();
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
    const { app, root } = mountPanel({ upcomingTracks: longQueue });
    const items = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'studio-context-inspector__queue-item',
      ),
    );
    const lazyImages = findAll(
      root,
      (node) => node.type === 'img' && node.props.loading === 'lazy',
    );
    const buttons = findAll(root, (node) => node.type === 'button');
    const text = textContent(root);

    expect(items).toHaveLength(3);
    expect(lazyImages).toHaveLength(3);
    expect(text).toContain('1000 首');
    expect(text).toContain('Queue track 1');
    expect(text).toContain('Queue track 3');
    expect(text).not.toContain('Queue track 4');
    expect(buttons).toHaveLength(1);
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
      '目前播放',
      '歌詞預覽',
      '播放來源',
      '本機藝人',
      '接下來',
      '曲目資訊',
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
