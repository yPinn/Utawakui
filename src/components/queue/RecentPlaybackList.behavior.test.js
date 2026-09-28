import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import RecentPlaybackList from './RecentPlaybackList.vue';

const source = readFileSync(
  new URL('./RecentPlaybackList.vue', import.meta.url),
  'utf8',
);

describe('RecentPlaybackList', () => {
  it('renders a separate menu button for every normalized history entry', async () => {
    const firstTrack = {
      id: 'first-track',
      title: '第一首歌',
      artist: '演出者一',
    };
    const secondTrack = {
      id: 'second-track',
      title: '第二首歌',
      artist: '演出者二',
    };
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(RecentPlaybackList, {
            entries: [
              { key: 'first-track', track: firstTrack },
              { key: 'second-track', track: secondTrack },
            ],
            openMenuKey: 'recent:second-track',
          }),
      }),
    );

    expect(html).toContain('第一首歌的更多選項');
    expect(html).toContain('第二首歌的更多選項');
    expect(html.match(/aria-haspopup="menu"/gu)).toHaveLength(2);
    expect(html.match(/aria-expanded="true"/gu)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/gu)).toHaveLength(1);
  });

  it('uses the standard button primitive for the standalone clear action', () => {
    expect(source).toContain("import UiButton from '../ui/UiButton.vue';");
    expect(source).toContain('<UiButton');
    expect(source).toMatch(/<UiButton[^>]*>\s*清除\s*<\/UiButton>/su);
    expect(source).not.toContain('UiTextButton');
  });

  it('reuses the standard queue track adapter while keeping duplicate events distinct', () => {
    expect(source).toContain(
      "import QueueTrackButton from './QueueTrackButton.vue';",
    );
    expect(source).toContain('v-for="entry in entries"');
    expect(source).toContain(':key="entry.key"');
    expect(source).toContain(':track="entry.track"');
    expect(source).toContain(':current="entry.track.id === currentTrackId"');
    expect(source).not.toContain('UiTrackThumb');
    expect(source).not.toContain('duration');
  });

  it('exposes empty, selection, activation, and clear states', () => {
    expect(source).toContain('讀取最近播放…');
    expect(source).toContain('尚無最近播放紀錄');
    expect(source).toContain('最近播放未更新');
    expect(source).toContain(':message="error"');
    expect(source).toContain('@select="emit(\'selectEntry\', entry)"');
    expect(source).toContain('@activate="emit(\'activateEntry\', entry)"');
    expect(source).toContain('aria-label="清除最近播放紀錄"');
    expect(source).toContain('@click="emit(\'clear\')"');
  });

  it('forwards each normalized history identity to the shared track menu owner', () => {
    expect(source).toContain("'openTrackMenu'");
    expect(source).toContain("context: 'recent'");
    expect(source).toContain('key: `recent:${entry.key}`');
    expect(source).toContain('@open-menu="openTrackMenu(entry, $event)"');
    expect(source).toContain(
      ':menu-open="openMenuKey === `recent:${entry.key}`"',
    );
  });
});
