import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';

import BgmCurrentSource from './BgmCurrentSource.vue';
import { projectBgmPrimaryAction } from './bgmPresentation.js';

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

    expect(html).toContain('目前場間音樂');
    expect(html).toContain('Quiet Room');
    expect(html).toContain('Local Artist');
    expect(html).not.toContain('<input');
    expect(source).not.toContain('status');
    expect(html).not.toContain('role="status"');
    expect(source).toContain('<PlaybackTrackIdentity');
    expect(source).toContain('artwork-size="var(--ui-track-row-thumb-size)"');
    expect(source).not.toContain('<slot');
    expect(source).not.toContain('UiChip');
  });

  it('makes the unavailable source state explicit', async () => {
    const html = await renderToString(createSSRApp(BgmCurrentSource));

    expect(html).toContain('尚未選擇場間音樂');
    expect(html).not.toContain('從本機曲庫選擇背景音樂');
  });
  it('reuses the artwork overlay and accessible play action while retaining canonical metadata', async () => {
    const html = await renderToString(
      createSSRApp(BgmCurrentSource, {
        track: { id: 'bgm-1', title: 'Quiet Room', artist: 'Local Artist' },
        playbackAction: projectBgmPrimaryAction({
          phase: 'bgm-playing',
          hasTrack: true,
        }),
      }),
    );
    expect(html).toContain('Quiet Room');
    expect(html).toContain('Local Artist');
    expect(html).toContain('bgm-current-source__playback');
    expect(html).toContain('暫停 BGM');
    expect(html).toContain('ui-artwork-reveal');
    expect(html).toContain('ui-artwork-overlay');
    expect(html).toContain('ui-track-artwork-button');
    expect(html).toContain('right-dock-track__artwork-cue');
    expect(html).toContain('lucide-pause');
    expect(source).not.toContain('UiIconButton');
    expect(source).toContain('<RightDockTrackArtworkCue');
  });
});
