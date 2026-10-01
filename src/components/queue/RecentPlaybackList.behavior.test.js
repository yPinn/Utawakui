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
  it('renders explicit replay and menu targets for every history entry', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(RecentPlaybackList, {
            entries: [
              {
                key: 'first-track',
                track: {
                  id: 'first-track',
                  title: '第一首歌',
                  artist: '演出者一',
                },
              },
              {
                key: 'second-track',
                track: {
                  id: 'second-track',
                  title: '第二首歌',
                  artist: '演出者二',
                },
              },
            ],
            currentTrackId: 'first-track',
            playingTrackId: 'first-track',
            playerPlaying: true,
            openMenuKey: 'recent:second-track',
            selectedEntryKey: 'second-track',
          }),
      }),
    );

    expect(html).toContain('暫停：第一首歌');
    expect(html).toContain('播放：第二首歌');
    expect(html).toContain('lucide-pause');
    expect(html).toContain('lucide-play');
    expect(html).toContain('第一首歌的更多選項');
    expect(html).toContain('第二首歌的更多選項');
    expect(html.match(/aria-haspopup="menu"/gu)).toHaveLength(2);
    expect(html.match(/aria-expanded="true"/gu)).toHaveLength(1);
    expect(html.match(/aria-current="true"/gu)).toHaveLength(1);
    expect(html.match(/ui-track--active/gu)).toHaveLength(1);
    expect(html.match(/ui-track--interactive/gu)).toHaveLength(2);
    expect(html).toContain('draggable="false"');
  });

  it('reuses the Queue row recipe while explicitly omitting reorder and drop', () => {
    expect(source).toContain(
      "import QueueTrackButton from './QueueTrackButton.vue';",
    );
    expect(source).not.toContain('UiTrackRow');
    expect(source).not.toContain('RightDockTrackArtworkCue');
    expect(source).not.toContain('RightDockTrackMenuButton');
    expect(source).not.toContain('GripVertical');
    expect(source).toContain('selectedEntryKey');
    expect(source).toContain(':active="entry.key === selectedEntryKey"');
    expect(source).toContain(':draggable="false"');
    expect(source).toContain('@select="emit(\'selectEntry\', entry)"');
    expect(source).toContain('@activate="emit(\'activateEntry\', entry)"');
    expect(source).not.toContain('@drag-start');
    expect(source).not.toContain('@drag-over');
    expect(source).not.toContain('@drag-leave');
    expect(source).not.toContain('@drop');
    expect(source).not.toContain('@drag-end');
    expect(source).not.toContain('drop-position');
  });

  it('keeps replay explicit and leaves list-level history immutable', () => {
    expect(source).toContain('讀取最近播放…');
    expect(source).toContain('尚無最近播放紀錄');
    expect(source).toContain('最近播放未更新');
    expect(source).toContain(':message="error"');
    expect(source).toContain(':playing="isEntryPlaying(entry)"');
    expect(source).toContain(
      '@toggle-playback="emit(\'toggleEntryPlayback\', entry)"',
    );
    expect(source).not.toContain("'clear'");
    expect(source).not.toContain("emit('clear')");
    expect(source).not.toContain('清除最近播放紀錄');
  });

  it('forwards each normalized history identity to the shared track menu owner', () => {
    expect(source).toContain("'openTrackMenu'");
    expect(source).toContain("context: 'recent'");
    expect(source).toContain('key: `recent:${entry.key}`');
    expect(source).toContain('@open-menu="openTrackMenu(entry, $event)"');
    expect(source).toMatch(
      /:menu-open="openMenuKey === `recent:\$\{entry\.key\}`"/u,
    );
  });

  it('uses the same Right Dock hover and open-state classes as Queue rows', () => {
    expect(source).toContain('class="recent-playback__item"');
    expect(source).toContain('<QueueTrackButton');
    expect(source).not.toContain('recent-playback__artwork-cue');
    expect(source).not.toContain('recent-playback__menu');
  });

  it('constrains the complete Recent row chain to the Dock inline boundary', () => {
    expect(source).toMatch(
      /\.recent-playback\s*\{[^}]*min-inline-size:\s*0;/su,
    );
    expect(source).toMatch(
      /\.recent-playback__list\s*\{[^}]*min-inline-size:\s*0;/su,
    );
    expect(source).toMatch(
      /\.recent-playback__item\s*\{[^}]*inline-size:\s*100%;[^}]*min-inline-size:\s*0;[^}]*max-inline-size:\s*100%;[^}]*box-sizing:\s*border-box;/su,
    );
  });
});
