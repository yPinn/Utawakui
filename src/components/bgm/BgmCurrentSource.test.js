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
  it('uses the shared overlay button for the accessible pause action', async () => {
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
    expect(html).toContain('暫停場間音樂');
    expect(html).toContain('ui-track-thumb');
    expect(html).toContain('ui-icon-btn--overlay');
    expect(html).toContain('ui-icon-btn--circle');
    expect(html).toContain('lucide-pause');
  });

  it('keeps the cover visible and hides the disabled action during fade-out', async () => {
    const html = await renderToString(
      createSSRApp(BgmCurrentSource, {
        track: { id: 'bgm-1', title: 'Quiet Room' },
        playbackAction: projectBgmPrimaryAction({
          phase: 'stopping-bgm',
          hasTrack: true,
        }),
      }),
    );
    expect(html).toContain('ui-track-thumb');
    const button = html.match(
      /<button[^>]*bgm-current-source__playback[^>]*>/u,
    )?.[0];
    expect(button).toContain('disabled');
    expect(button).toContain('display:none');
  });
});
