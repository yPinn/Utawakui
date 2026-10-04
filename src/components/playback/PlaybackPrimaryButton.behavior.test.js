import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PlaybackPrimaryButton from './PlaybackPrimaryButton.vue';

const source = readFileSync(
  new URL('./PlaybackPrimaryButton.vue', import.meta.url),
  'utf8',
);

describe('PlaybackPrimaryButton', () => {
  it('owns the single circular large accent transport recipe', () => {
    expect(source).toContain('shape="circle"');
    expect(source).toContain('size="lg"');
    expect(source).toContain('variant="accent"');
    expect(source).toContain(':icon="playing ? Pause : Play"');
  });

  it('projects play and pause labels without owning playback state', async () => {
    const playHtml = await renderToString(
      createSSRApp({
        render: () => h(PlaybackPrimaryButton, { playing: false }),
      }),
    );
    const pauseHtml = await renderToString(
      createSSRApp({
        render: () => h(PlaybackPrimaryButton, { playing: true }),
      }),
    );

    expect(playHtml).toContain('播放');
    expect(pauseHtml).toContain('暫停');
    expect(source).not.toContain('usePlayer');
    expect(source).not.toContain('usePlaybackQueue');
  });
});
