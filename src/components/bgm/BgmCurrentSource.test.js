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
        status: {
          label: '演唱中 · 曲後回復',
          accessibleLabel: '演唱曲目播放中，曲後恢復 BGM',
          tone: 'accent',
        },
        pickerExpanded: false,
        pickerControls: 'bgm-track-picker',
      }),
    );

    expect(html).toContain('目前 BGM');
    expect(html).toContain('Quiet Room');
    expect(html).not.toContain('Local Artist');
    expect(html).not.toContain('<input');
    expect(html).toContain('演唱中 · 曲後回復');
    expect(html).toContain('aria-label="演唱曲目播放中，曲後恢復 BGM"');
    expect(html).toContain('>更換<');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="bgm-track-picker"');
    expect(source).toContain('size="var(--ui-bgm-player-artwork-size)"');
    expect(source).toContain("emit('togglePicker')");
    expect(source).not.toContain('UiChip');
  });

  it('makes the unavailable source state explicit', async () => {
    const html = await renderToString(createSSRApp(BgmCurrentSource));

    expect(html).toContain('尚未選擇 BGM');
    expect(html).toContain('>選擇<');
    expect(html).not.toContain('從本機曲庫選擇背景音樂');
  });
});
