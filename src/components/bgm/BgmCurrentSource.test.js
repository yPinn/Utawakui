import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';

import BgmCurrentSource from './BgmCurrentSource.vue';

const source = readFileSync(
  new URL('./BgmCurrentSource.vue', import.meta.url),
  'utf8',
);

describe('BgmCurrentSource', () => {
  it('shows the selected local source without exposing editable metadata', async () => {
    const html = await renderToString(
      createSSRApp(BgmCurrentSource, {
        track: { id: 'bgm-1', title: 'Quiet Room', artist: 'Local Artist' },
      }),
    );

    expect(html).toContain('目前 BGM');
    expect(html).toContain('Quiet Room');
    expect(html).not.toContain('Local Artist');
    expect(html).not.toContain('<input');
    expect(source).toContain('size="var(--ui-bgm-player-artwork-size)"');
  });

  it('makes the unavailable source state explicit', async () => {
    const html = await renderToString(createSSRApp(BgmCurrentSource));

    expect(html).toContain('尚未選擇 BGM');
    expect(html).not.toContain('從本機曲庫選擇背景音樂');
  });
});
