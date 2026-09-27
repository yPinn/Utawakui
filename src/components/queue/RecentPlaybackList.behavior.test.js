import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./RecentPlaybackList.vue', import.meta.url),
  'utf8',
);

describe('RecentPlaybackList', () => {
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
});
