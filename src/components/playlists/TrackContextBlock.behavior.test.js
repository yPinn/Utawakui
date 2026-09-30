import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import TrackContextBlock from './TrackContextBlock.vue';

const source = readFileSync(
  new URL('./TrackContextBlock.vue', import.meta.url),
  'utf8',
);

describe('TrackContextBlock', () => {
  it('provides one labelled content section without becoming a scroll owner', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            TrackContextBlock,
            { heading: '歌詞預覽', tone: 'accent' },
            { default: () => 'Current lyric line' },
          ),
      }),
    );

    expect(html).toContain('<section');
    expect(html).toContain('track-context-block--accent');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('歌詞預覽');
    expect(html).toContain('Current lyric line');
    expect(source).not.toMatch(/overflow(?:-y)?:\s*(?:auto|scroll)/u);
  });

  it('limits visual variants to semantic plain, raised, and accent tones', () => {
    expect(source).toContain("['plain', 'raised', 'accent']");
    expect(source).toContain('var(--ui-right-dock-content-inset)');
    expect(source).not.toMatch(/#[\da-f]{3,8}/iu);
  });
});
