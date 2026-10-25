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
          {
            lineId: 'label',
            sourceLineIndex: 1,
            text: '（和聲）一起唱（啊啊）',
            outputLabelRanges: [{ sourceStart: 0, sourceEnd: 4 }],
          },
        ]),
        hiddenLineIds: shallowRef(['credit']),
        setHidden: vi.fn(),
        restore: vi.fn(),
      },
    }),
  };
});

describe('shared text processing controls', () => {
  it('shows exact candidate text safely, checked state and the reversible Output-only boundary', async () => {
    const html = await renderToString(
      createSSRApp({ render: () => h(LyricsTextProcessing) }),
    );
    expect(html).toContain('共用文字處理');
    expect(html).toContain('勾選項目只在 Output 隱藏');
    expect(html).toContain('原歌詞與時間不變');
    expect(html).toContain('&lt;script&gt;一起唱&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/\schecked(?:[\s=>])/u);
    expect(html).toContain('全部還原');
    expect(html).toContain('ui-btn--accent');
    expect(html).toContain('第 2 行 · 片段');
  });
});
