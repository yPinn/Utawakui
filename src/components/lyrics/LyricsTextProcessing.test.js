import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import LyricsTextProcessing from './LyricsTextProcessing.vue';

vi.mock('../../composables/useLyrics.js', async () => {
  const { shallowRef } = await import('vue');
  return {
    useLyrics: () => ({
      selectedSource: shallowRef({ filename: 'source.lrc' }),
      state: { isLoadingLyrics: false },
      lyricsTextProcessing: {
        candidates: shallowRef([
          {
            lineId: 'credit',
            sourceLineIndex: 0,
            text: '作詞：<script>一起唱</script>',
          },
        ]),
        hiddenLineIds: shallowRef([]),
        setHidden: vi.fn(),
        restore: vi.fn(),
      },
    }),
  };
});

describe('shared text processing controls', () => {
  it('shows exact candidate text safely, starts unchecked and names the Output-only boundary', async () => {
    const html = await renderToString(
      createSSRApp({ render: () => h(LyricsTextProcessing) }),
    );
    expect(html).toContain('共用文字處理');
    expect(html).toContain('預設保留所有文字');
    expect(html).toContain('原歌詞與校時不變');
    expect(html).toContain('&lt;script&gt;一起唱&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toMatch(/\schecked(?:[\s=>])/u);
  });
});
