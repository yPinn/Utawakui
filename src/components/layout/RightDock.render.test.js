import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppRightDock from './AppRightDock.vue';
import AppRightDockHeader from './AppRightDockHeader.vue';
import StudioLibraryContextInspector from '../playlists/StudioLibraryContextInspector.vue';
import UiTextButton from '../ui/UiTextButton.vue';

function render(component, props = {}, slots = {}) {
  return renderToString(
    createSSRApp({ render: () => h(component, props, slots) }),
  );
}

describe('Right Dock compiled render contracts', () => {
  it('renders expanded and collapsed shell branches through the production compiler', async () => {
    const expanded = await render(
      AppRightDock,
      {
        expanded: true,
        label: '播放資訊',
        contentId: 'right-dock-content',
      },
      { default: () => 'Metadata content' },
    );
    const collapsed = await render(AppRightDock, {
      expanded: false,
      label: '播放資訊',
      expandLabel: '展開播放資訊',
      contentId: 'right-dock-content',
    });

    expect(expanded).toContain('app-right-dock--expanded');
    expect(expanded).toContain('Metadata content');
    expect(expanded).toContain('aria-expanded="true"');
    expect(collapsed).toContain('app-right-dock--collapsed');
    expect(collapsed).toContain('展開播放資訊');
    expect(collapsed).toContain('aria-expanded="false"');
  });

  it('renders shared header subtitle and title-only branches', async () => {
    const withSubtitle = await render(AppRightDockHeader, {
      title: '播放資訊',
      subtitle: '深夜練唱清單',
      closeLabel: '關閉播放資訊',
    });
    const titleOnly = await render(AppRightDockHeader, {
      title: '佇列',
      closeLabel: '關閉播放佇列',
    });

    expect(withSubtitle).toContain('深夜練唱清單');
    expect(titleOnly).not.toMatch(/<p(?:\s|>)/u);
  });

  it('renders populated, minimal, and empty metadata projections', async () => {
    const populated = await render(StudioLibraryContextInspector, {
      currentTrack: {
        id: 'current',
        title: '目前歌曲',
        artist: '演出者',
        album: '來源專輯',
        duration: 252,
        filename: 'current.flac',
      },
      queueSourceName: '深夜練唱清單',
      collection: {
        name: '深夜練唱清單',
        description: '睡前慢歌',
        coverUrl: '',
        canCollage: true,
        tracks: [],
      },
      upcomingTracks: Array.from({ length: 4 }, (_, index) => ({
        id: `next-${index}`,
        title: `下一首 ${index + 1}`,
        artist: '演出者',
        duration: 180,
      })),
    });
    const minimal = await render(StudioLibraryContextInspector, {
      currentTrack: {
        id: 'minimal',
        title: '無附加資料',
        artist: '',
        filename: 'minimal.bin',
      },
      collection: {
        name: '未命名集合',
        description: '',
        coverUrl: '',
        canCollage: false,
        tracks: [],
      },
      upcomingTracks: [],
    });
    const empty = await render(StudioLibraryContextInspector, {
      currentTrack: null,
      queueSourceName: '',
      collection: null,
      upcomingTracks: [],
    });

    expect(populated).toContain('睡前慢歌');
    expect(populated).toContain('4 首');
    expect(populated).toContain('下一首 3');
    expect(populated).not.toContain('下一首 4');
    expect(minimal).toContain('無附加資料');
    expect(minimal).not.toContain('睡前慢歌');
    expect(empty).toContain('目前沒有播放中的歌曲');
    expect(empty).toContain('佇列中沒有下一首');
  });

  it('renders both Text Action overflow recipes', async () => {
    const marquee = await render(UiTextButton, { text: 'Marquee default' });
    const ellipsis = await render(UiTextButton, {
      text: 'Static ellipsis',
      overflow: 'ellipsis',
    });

    expect(marquee).toContain('ui-marquee');
    expect(ellipsis).toContain('ui-text-btn__text');
    expect(ellipsis).not.toContain('ui-marquee');
  });
});
